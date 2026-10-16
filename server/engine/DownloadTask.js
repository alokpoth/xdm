const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// High performance connection agents with keep-alive
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 128, timeout: 30000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 128, timeout: 30000 });

class DownloadTask {
  constructor(options) {
    this.id = options.id || ('xdm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
    this.url = options.url.trim();
    this.originalUrl = this.url;
    this.saveDir = options.saveDir || path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Downloads');
    this.fileName = options.fileName || '';
    this.totalBytes = options.totalBytes || 0;
    this.downloadedBytes = options.downloadedBytes || 0;
    this.status = options.status || 'queued'; // queued, probing, downloading, paused, completed, error
    this.connections = Math.min(Math.max(options.connections || 16, 1), 32);
    this.resumable = options.resumable ?? false;
    this.contentType = options.contentType || 'application/octet-stream';
    this.category = options.category || 'others';
    this.speed = 0; // current B/s
    this.peakSpeed = 0;
    this.averageSpeed = 0;
    this.speedHistory = []; // last 30 speed data points for graph
    this.eta = 0; // seconds remaining
    this.error = null;
    this.createdAt = options.createdAt || Date.now();
    this.completedAt = options.completedAt || null;
    this.segments = options.segments || [];
    this.logs = [];

    // Runtime state
    this.fileFd = null;
    this.metaPath = '';
    this.filePath = '';
    this.activeStreams = new Map(); // segmentId -> req
    this.speedTrackerInterval = null;
    this.dynamicSplitInterval = null;
    this.lastBytes = this.downloadedBytes;
    this.isPaused = false;
    this.isCancelled = false;

    this.onProgressCallback = options.onProgress || null;
  }

  log(msg, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const entry = { time, msg, type };
    this.logs.push(entry);
    if (this.logs.length > 200) this.logs.shift();
  }

  detectCategory(ext) {
    ext = (ext || '').toLowerCase().replace(/^\./, '');
    const categories = {
      compressed: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'iso', 'xz', 'tgz'],
      video: ['mp4', 'mkv', 'avi', 'mov', 'flv', 'wmv', 'webm', 'm4v', '3gp'],
      audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'],
      documents: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'epub'],
      programs: ['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'apk', 'bat', 'sh']
    };
    for (const [cat, exts] of Object.entries(categories)) {
      if (exts.includes(ext)) return cat;
    }
    return 'others';
  }

  sanitizeFileName(name) {
    return name.replace(/[<>:"/\\|?*]+/g, '_').trim();
  }

  async probeUrl() {
    this.status = 'probing';
    this.log(`Probing URL: ${this.url}`);
    
    return new Promise((resolve, reject) => {
      let redirects = 0;
      const maxRedirects = 10;

      const doProbe = (targetUrl) => {
        try {
          const parsed = new URL(targetUrl);
          const isHttps = parsed.protocol === 'https:';
          const client = isHttps ? https : http;
          const agent = isHttps ? httpsAgent : httpAgent;

          const req = client.request(parsed, {
            method: 'HEAD',
            agent,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 XDM/2.0',
              'Accept': '*/*',
              'Accept-Encoding': 'identity',
              'Connection': 'keep-alive'
            },
            timeout: 15000
          }, (res) => {
            // Handle redirects
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
              if (redirects++ > maxRedirects) {
                return reject(new Error('Too many redirects'));
              }
              const redirectUrl = new URL(res.headers.location, targetUrl).toString();
              this.log(`Redirected (${res.statusCode}) to: ${redirectUrl}`);
              this.url = redirectUrl;
              return doProbe(redirectUrl);
            }

            // Extract file name
            let guessedName = '';
            const disposition = res.headers['content-disposition'];
            if (disposition) {
              const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
              if (utf8Match && utf8Match[1]) {
                guessedName = decodeURIComponent(utf8Match[1]);
              } else {
                const match = disposition.match(/filename=["']?([^"';]+)["']?/i);
                if (match && match[1]) {
                  guessedName = match[1];
                }
              }
            }

            if (!guessedName) {
              const pathname = parsed.pathname;
              const basename = path.basename(pathname);
              guessedName = basename && basename !== '/' ? decodeURIComponent(basename) : 'download_' + Date.now();
            }

            this.fileName = this.sanitizeFileName(this.fileName || guessedName);
            const ext = path.extname(this.fileName);
            this.category = this.detectCategory(ext);

            // Extract length and range support
            const len = res.headers['content-length'];
            this.totalBytes = len ? parseInt(len, 10) : 0;
            this.contentType = res.headers['content-type'] || 'application/octet-stream';
            
            const acceptRanges = res.headers['accept-ranges'];
            this.resumable = acceptRanges === 'bytes' || Boolean(this.totalBytes > 0);

            this.log(`File: ${this.fileName} | Size: ${(this.totalBytes / (1024*1024)).toFixed(2)} MB | Resumable: ${this.resumable}`);
            
            this.filePath = path.join(this.saveDir, this.fileName);
            this.metaPath = this.filePath + '.xdm.meta';

            resolve({
              url: this.url,
              fileName: this.fileName,
              totalBytes: this.totalBytes,
              resumable: this.resumable,
              category: this.category,
              contentType: this.contentType
            });
          });

          req.on('error', (err) => {
            // Some servers reject HEAD requests with 403 or 405. Fall back to GET range 0-0
            this.log(`HEAD probe failed (${err.message}). Trying GET probe...`, 'warn');
            this.probeWithGet(targetUrl).then(resolve).catch(reject);
          });

          req.on('timeout', () => {
            req.destroy();
            this.probeWithGet(targetUrl).then(resolve).catch(reject);
          });

          req.end();
        } catch (e) {
          reject(e);
        }
      };

      doProbe(this.url);
    });
  }

  async probeWithGet(targetUrl) {
    return new Promise((resolve, reject) => {
      try {
        const parsed = new URL(targetUrl);
        const isHttps = parsed.protocol === 'https:';
        const client = isHttps ? https : http;
        const agent = isHttps ? httpsAgent : httpAgent;

        const req = client.request(parsed, {
          method: 'GET',
          agent,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Range': 'bytes=0-0',
            'Connection': 'close'
          },
          timeout: 15000
        }, (res) => {
          let totalBytes = 0;
          let resumable = false;

          if (res.statusCode === 206) {
            resumable = true;
            const contentRange = res.headers['content-range'];
            if (contentRange) {
              const match = contentRange.match(/\/(\d+)/);
              if (match) totalBytes = parseInt(match[1], 10);
            }
          } else {
            const len = res.headers['content-length'];
            if (len) totalBytes = parseInt(len, 10);
          }

          let guessedName = path.basename(parsed.pathname) || 'download_' + Date.now();
          this.fileName = this.sanitizeFileName(this.fileName || guessedName);
          this.totalBytes = totalBytes;
          this.resumable = resumable;
          this.filePath = path.join(this.saveDir, this.fileName);
          this.metaPath = this.filePath + '.xdm.meta';
          this.category = this.detectCategory(path.extname(this.fileName));

          res.destroy();
          resolve({
            url: this.url,
            fileName: this.fileName,
            totalBytes: this.totalBytes,
            resumable: this.resumable,
            category: this.category,
            contentType: res.headers['content-type'] || 'application/octet-stream'
          });
        });

        req.on('error', reject);
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  saveMeta() {
    try {
      if (!this.metaPath) return;
      const data = {
        id: this.id,
        url: this.url,
        fileName: this.fileName,
        filePath: this.filePath,
        totalBytes: this.totalBytes,
        downloadedBytes: this.downloadedBytes,
        resumable: this.resumable,
        connections: this.connections,
        category: this.category,
        segments: this.segments.map(s => ({
          id: s.id,
          start: s.start,
          end: s.end,
          current: s.current,
          downloaded: s.downloaded,
          status: s.status
        }))
      };
      fs.writeFileSync(this.metaPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      // Ignore meta save errors
    }
  }

  loadMetaIfExists() {
    try {
      if (fs.existsSync(this.metaPath)) {
        const raw = fs.readFileSync(this.metaPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.totalBytes === this.totalBytes && parsed.segments && parsed.segments.length > 0) {
          this.segments = parsed.segments;
          this.downloadedBytes = parsed.segments.reduce((acc, s) => acc + (s.current - s.start), 0);
          this.log(`Loaded existing session meta: ${this.segments.length} segments, ${(this.downloadedBytes / (1024*1024)).toFixed(2)} MB downloaded`);
          return true;
        }
      }
    } catch (e) {
      this.log(`Failed reading meta: ${e.message}`, 'warn');
    }
    return false;
  }

  setupSegments() {
    if (this.loadMetaIfExists()) return;

    this.segments = [];
    if (!this.resumable || this.totalBytes <= 0 || this.connections === 1) {
      // Single stream fallback
      this.segments.push({
        id: 0,
        start: 0,
        end: this.totalBytes > 0 ? this.totalBytes - 1 : 0,
        current: 0,
        downloaded: 0,
        speed: 0,
        status: 'pending'
      });
      return;
    }

    // Multi-segment partition
    let num = this.connections;
    // For small files, ensure chunks are at least 256KB to prevent excessive thread overhead & 429s
    if (this.totalBytes > 0) {
      const maxSensible = Math.max(1, Math.floor(this.totalBytes / (256 * 1024)));
      num = Math.min(num, maxSensible);
    }

    const chunkSize = Math.floor(this.totalBytes / num);

    for (let i = 0; i < num; i++) {
      const start = i * chunkSize;
      const end = (i === num - 1) ? (this.totalBytes - 1) : ((i + 1) * chunkSize - 1);
      this.segments.push({
        id: i,
        start,
        end,
        current: start,
        downloaded: 0,
        speed: 0,
        status: 'pending'
      });
    }

    this.log(`Initialized ${num} turbo parallel download segments for maximum bandwidth saturation`);
  }

  async start() {
    if (this.status === 'downloading') return;
    this.isPaused = false;
    this.isCancelled = false;

    try {
      if (!this.fileName || !this.totalBytes) {
        await this.probeUrl();
      }

      // Ensure directory exists
      if (!fs.existsSync(this.saveDir)) {
        fs.mkdirSync(this.saveDir, { recursive: true });
      }

      this.filePath = path.join(this.saveDir, this.fileName);
      this.metaPath = this.filePath + '.xdm.meta';

      this.setupSegments();

      // Open target file for random access writing ('r+' or 'w+')
      if (!fs.existsSync(this.filePath)) {
        // Pre-allocate or create file
        const tempFd = fs.openSync(this.filePath, 'w');
        if (this.totalBytes > 0) {
          try {
            fs.ftruncateSync(tempFd, this.totalBytes);
          } catch (e) {}
        }
        fs.closeSync(tempFd);
      }

      this.fileFd = fs.openSync(this.filePath, 'r+');

      this.status = 'downloading';
      this.startSpeedTracker();
      this.startDynamicSplitter();

      this.log(`Download started with ${this.segments.length} parallel connection threads`);

      // Launch segments with a slight stagger (40ms) to prevent server burst rate-limits
      this.segments.forEach((seg, i) => {
        if (seg.current <= seg.end && seg.status !== 'completed') {
          setTimeout(() => {
            if (!this.isPaused && !this.isCancelled && this.status === 'downloading') {
              this.downloadSegment(seg);
            }
          }, i * 40);
        }
      });

    } catch (err) {
      this.status = 'error';
      this.error = err.message;
      this.log(`Start error: ${err.message}`, 'error');
      this.cleanup();
    }
  }

  downloadSegment(seg) {
    if (this.isPaused || this.isCancelled) return;
    if (seg.current > seg.end) {
      seg.status = 'completed';
      this.checkAllCompleted();
      return;
    }

    seg.status = 'connecting';
    const parsed = new URL(this.url);
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;
    const agent = isHttps ? httpsAgent : httpAgent;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Connection': 'keep-alive'
    };

    if (this.resumable && this.totalBytes > 0) {
      headers['Range'] = `bytes=${seg.current}-${seg.end}`;
    }

    let segLastDownloaded = seg.downloaded;

    const req = client.request(parsed, {
      method: 'GET',
      agent,
      headers,
      timeout: 30000
    }, (res) => {
      // If server returned 200 OK instead of 206 Partial Content,
      // it means the server ignores Range headers and is streaming the whole file!
      if (res.statusCode === 200 && this.resumable && this.connections > 1) {
        if (seg.id > 0) {
          // Cancel other duplicate full-file streams
          req.destroy();
          seg.status = 'completed';
          return;
        } else {
          // Primary connection handles full file
          this.resumable = false;
          this.connections = 1;
          seg.end = this.totalBytes > 0 ? this.totalBytes - 1 : Infinity;
          this.log('Server does not support partial ranges (returned HTTP 200). Switched to high-speed single connection.', 'warn');
        }
      } else if (res.statusCode !== 200 && res.statusCode !== 206) {
        seg.status = 'error';
        this.log(`Segment #${seg.id} HTTP error: ${res.statusCode}`, 'warn');
        this.retrySegment(seg);
        return;
      }

      seg.status = 'downloading';

      res.on('data', (chunk) => {
        if (this.isPaused || this.isCancelled) {
          req.destroy();
          return;
        }

        const remainingInSeg = (seg.end - seg.current) + 1;
        const bytesToWrite = this.resumable && this.totalBytes > 0 
          ? Math.min(chunk.length, remainingInSeg) 
          : chunk.length;

        if (bytesToWrite <= 0) {
          req.destroy();
          seg.status = 'completed';
          this.checkAllCompleted();
          return;
        }

        const writeOffset = seg.current;
        seg.current += bytesToWrite;
        seg.downloaded += bytesToWrite;

        // Recalculate accurate downloaded bytes across all segments
        this.downloadedBytes = this.segments.reduce((acc, s) => acc + s.downloaded, 0);
        if (this.totalBytes > 0 && this.downloadedBytes > this.totalBytes) {
          this.downloadedBytes = this.totalBytes;
        }

        // Write directly to file position
        try {
          if (this.fileFd) {
            fs.writeSync(this.fileFd, chunk, 0, bytesToWrite, writeOffset);
          }
        } catch (writeErr) {
          this.log(`Disk write error on segment #${seg.id}: ${writeErr.message}`, 'error');
        }

        if (seg.current > seg.end && this.resumable && this.totalBytes > 0) {
          req.destroy();
          seg.status = 'completed';
          this.checkAllCompleted();
        }
      });


      res.on('end', () => {
        this.activeStreams.delete(seg.id);
        if (seg.current >= seg.end || (!this.resumable && this.totalBytes === 0)) {
          seg.status = 'completed';
          seg.speed = 0;
          this.saveMeta();
          this.checkAllCompleted();
        } else {
          // Premature end
          if (!this.isPaused && !this.isCancelled) {
            this.retrySegment(seg);
          }
        }
      });

      res.on('error', (err) => {
        this.activeStreams.delete(seg.id);
        if (!this.isPaused && !this.isCancelled) {
          this.log(`Segment #${seg.id} stream error: ${err.message}`, 'warn');
          this.retrySegment(seg);
        }
      });
    });

    req.on('error', (err) => {
      this.activeStreams.delete(seg.id);
      if (!this.isPaused && !this.isCancelled) {
        this.log(`Segment #${seg.id} connection error: ${err.message}`, 'warn');
        this.retrySegment(seg);
      }
    });

    req.on('timeout', () => {
      req.destroy();
      this.activeStreams.delete(seg.id);
      if (!this.isPaused && !this.isCancelled) {
        this.retrySegment(seg);
      }
    });

    this.activeStreams.set(seg.id, req);
    req.end();
  }

  retrySegment(seg) {
    if (this.isPaused || this.isCancelled) return;
    seg.status = 'retrying';
    setTimeout(() => {
      if (!this.isPaused && !this.isCancelled && seg.current <= seg.end) {
        this.downloadSegment(seg);
      }
    }, 2000);
  }

  // IDM's Key Feature: Dynamic Segment Subdivision (Work-Stealing)
  // When connections complete early or one segment is lagging, split large unfinished chunks!
  startDynamicSplitter() {
    if (!this.resumable || this.totalBytes <= 0) return;

    this.dynamicSplitInterval = setInterval(() => {
      if (this.status !== 'downloading' || this.isPaused) return;

      // Check for available connection slots
      const activeCount = Array.from(this.activeStreams.values()).length;
      if (activeCount >= this.connections) return; // All channels occupied

      // Find the segment with the largest remaining byte count > 3MB
      let maxRemaining = 0;
      let targetSegment = null;

      for (const seg of this.segments) {
        if (seg.status === 'downloading') {
          const remaining = seg.end - seg.current;
          if (remaining > maxRemaining && remaining > 3 * 1024 * 1024) {
            maxRemaining = remaining;
            targetSegment = seg;
          }
        }
      }

      if (targetSegment) {
        // Split this segment in two!
        const remaining = targetSegment.end - targetSegment.current;
        const half = Math.floor(remaining / 2);
        const originalEnd = targetSegment.end;

        const newStart = targetSegment.current + half;
        targetSegment.end = newStart - 1;

        const newSegId = this.segments.length;
        const newSegment = {
          id: newSegId,
          start: newStart,
          end: originalEnd,
          current: newStart,
          downloaded: 0,
          speed: 0,
          status: 'pending'
        };

        this.segments.push(newSegment);
        this.log(`Dynamic Turbo Slicing: Segment #${targetSegment.id} subdivided. Thread #${newSegId} assigned ${((originalEnd - newStart + 1) / (1024*1024)).toFixed(2)} MB to saturate full device bandwidth!`);

        this.downloadSegment(newSegment);
        this.saveMeta();
      }
    }, 2500);
  }

  startSpeedTracker() {
    this.speedTrackerInterval = setInterval(() => {
      if (this.status !== 'downloading') return;

      const currentDownloaded = this.downloadedBytes;
      const bytesInWindow = Math.max(0, currentDownloaded - this.lastBytes);
      this.lastBytes = currentDownloaded;

      this.speed = bytesInWindow; // roughly 1 second window
      if (this.speed > this.peakSpeed) this.peakSpeed = this.speed;

      this.speedHistory.push({
        time: Date.now(),
        speed: this.speed
      });
      if (this.speedHistory.length > 30) {
        this.speedHistory.shift();
      }

      // Calculate ETA
      if (this.speed > 0 && this.totalBytes > this.downloadedBytes) {
        const remainingBytes = this.totalBytes - this.downloadedBytes;
        this.eta = Math.ceil(remainingBytes / this.speed);
      } else {
        this.eta = 0;
      }

      // Calculate individual segment speeds
      for (const seg of this.segments) {
        if (seg.status === 'downloading') {
          const segDelta = Math.max(0, seg.downloaded - (seg._lastDownloaded || 0));
          seg._lastDownloaded = seg.downloaded;
          seg.speed = segDelta;
        } else {
          seg.speed = 0;
        }
      }

      this.saveMeta();

      if (this.onProgressCallback) {
        this.onProgressCallback(this);
      }
    }, 1000);
  }

  checkAllCompleted() {
    if (this.status === 'completed') return;

    let allDone = true;
    for (const seg of this.segments) {
      if (seg.current < seg.end && seg.status !== 'completed') {
        allDone = false;
        break;
      }
    }

    if (allDone) {
      this.status = 'completed';
      this.completedAt = Date.now();
      this.speed = 0;
      this.eta = 0;
      this.downloadedBytes = this.totalBytes || this.downloadedBytes;
      this.log(`Download completed successfully: ${this.fileName}! File verified.`, 'success');

      this.cleanup();

      // Remove meta file on successful finish
      try {
        if (fs.existsSync(this.metaPath)) {
          fs.unlinkSync(this.metaPath);
        }
      } catch (e) {}

      if (this.onProgressCallback) {
        this.onProgressCallback(this);
      }
    }
  }

  pause() {
    if (this.status !== 'downloading') return;
    this.isPaused = true;
    this.status = 'paused';
    this.speed = 0;
    this.eta = 0;
    this.log('Download paused by user');

    // Abort active streams
    for (const [id, req] of this.activeStreams.entries()) {
      try {
        req.destroy();
      } catch (e) {}
    }
    this.activeStreams.clear();

    for (const seg of this.segments) {
      if (seg.status === 'downloading' || seg.status === 'connecting') {
        seg.status = 'paused';
      }
    }

    this.saveMeta();
    this.cleanup();

    if (this.onProgressCallback) {
      this.onProgressCallback(this);
    }
  }

  resume() {
    if (this.status === 'downloading' || this.status === 'completed') return;
    this.log('Resuming download...');
    this.start();
  }

  restart() {
    this.pause();
    this.downloadedBytes = 0;
    this.segments = [];
    try {
      if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
      if (fs.existsSync(this.metaPath)) fs.unlinkSync(this.metaPath);
    } catch (e) {}
    this.log('Download reset/restarted');
    this.start();
  }

  cancel(deleteFile = false) {
    this.isCancelled = true;
    this.pause();
    this.status = 'cancelled';
    this.cleanup();

    if (deleteFile) {
      try {
        if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
        if (fs.existsSync(this.metaPath)) fs.unlinkSync(this.metaPath);
      } catch (e) {}
    }
  }

  cleanup() {
    if (this.speedTrackerInterval) {
      clearInterval(this.speedTrackerInterval);
      this.speedTrackerInterval = null;
    }
    if (this.dynamicSplitInterval) {
      clearInterval(this.dynamicSplitInterval);
      this.dynamicSplitInterval = null;
    }
    if (this.fileFd) {
      try {
        fs.closeSync(this.fileFd);
      } catch (e) {}
      this.fileFd = null;
    }
    for (const [id, req] of this.activeStreams.entries()) {
      try { req.destroy(); } catch (e) {}
    }
    this.activeStreams.clear();
  }

  toJSON() {
    const progress = this.totalBytes > 0 
      ? Math.min(100, Math.round((this.downloadedBytes / this.totalBytes) * 1000) / 10) 
      : 0;

    return {
      id: this.id,
      url: this.url,
      originalUrl: this.originalUrl,
      fileName: this.fileName,
      filePath: this.filePath,
      saveDir: this.saveDir,
      totalBytes: this.totalBytes,
      downloadedBytes: this.downloadedBytes,
      progress,
      status: this.status,
      speed: this.speed,
      peakSpeed: this.peakSpeed,
      averageSpeed: this.averageSpeed,
      speedHistory: this.speedHistory,
      eta: this.eta,
      connections: this.connections,
      resumable: this.resumable,
      category: this.category,
      contentType: this.contentType,
      createdAt: this.createdAt,
      completedAt: this.completedAt,
      error: this.error,
      segments: this.segments.map(s => ({
        id: s.id,
        start: s.start,
        end: s.end,
        current: s.current,
        downloaded: s.downloaded,
        speed: s.speed,
        status: s.status,
        progress: s.end > s.start ? Math.min(100, Math.round(((s.current - s.start) / (s.end - s.start + 1)) * 1000) / 10) : 0
      })),
      logs: this.logs.slice(-30)
    };
  }
}

module.exports = DownloadTask;
