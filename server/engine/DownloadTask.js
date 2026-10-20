const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// High performance connection agents with keep-alive & socket pooling
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 2048, maxFreeSockets: 512, timeout: 60000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 2048, maxFreeSockets: 512, timeout: 60000 });

function formatXdmFileName(originalName) {
  if (!originalName || typeof originalName !== 'string') {
    return `download_${Date.now()}`;
  }
  // 1. Strip any directory path components (both forward and backward slashes)
  let clean = path.basename(originalName.replace(/\\/g, '/')).trim();
  // 2. Remove illegal characters for Windows and Unix filesystems
  clean = clean.replace(/[<>:"/\\|?*]+/g, '_').trim();
  // 3. Remove leading/trailing dots and spaces
  clean = clean.replace(/^[\.\s]+/, '').replace(/[\.\s]+$/, '');
  // 4. Remove consecutive dots that might represent directory traversal
  clean = clean.replace(/\.{2,}/g, '_');
  if (!clean) clean = `download_${Date.now()}`;

  // Guard against Windows DOS reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9) with or without extensions
  const DOS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
  if (DOS_RESERVED.test(clean)) {
    clean = `file_${clean}`;
  }

  const ext = path.extname(clean);
  let base = clean.slice(0, clean.length - ext.length).trim();
  if (!base) base = `file_${Date.now()}`;

  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(base)) {
    base = `file_${base}`;
  }

  // Prevent Windows MAX_PATH overflows by clamping base length to 120 chars
  if (base.length > 120) {
    base = base.substring(0, 120).trim();
  }

  return `${base}${ext}`;
}

class DownloadTask {
  constructor(options) {
    this.id = options.id || ('xdm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
    this.url = options.url.trim();
    this.originalUrl = this.url;
    this.saveDir = options.saveDir || path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Downloads');
    this.fileName = options.fileName ? formatXdmFileName(options.fileName) : '';
    this.totalBytes = options.totalBytes || 0;
    this.downloadedBytes = options.downloadedBytes || 0;
    this.status = options.status || 'queued'; // queued, probing, downloading, paused, completed, error
    this.connections = Math.min(Math.max(options.connections || 64, 1), 64);
    this.resumable = options.resumable ?? false;
    this.contentType = options.contentType || 'application/octet-stream';
    this.category = options.category || 'others';
    this.speed = 0; // current B/s
    this.peakSpeed = 0;
    this.averageSpeed = 0;
    this.speedHistory = []; // last 30 speed data points for graph
    this.eta = 0; // seconds remaining
    this.error = options.error || options.errorMessage || null;
    this.errorMessage = this.error;
    this.createdAt = options.createdAt || Date.now();
    this.completedAt = options.completedAt || null;
    this.segments = options.segments || [];
    this.isVideoStream = options.isVideoStream || (this.id && this.id.startsWith('xdm_vid_')) || false;
    this.formatId = options.formatId || 'best';
    this.logs = [];

    // Runtime state
    this.fileFd = null;
    this.filePath = options.filePath || (this.fileName ? path.join(this.saveDir, this.fileName) : '');
    this.metaPath = this.filePath ? this.filePath + '.xdm.meta' : '';
    this.activeStreams = new Map(); // segmentId -> req
    this.speedTrackerInterval = null;
    this.dynamicSplitInterval = null;
    this.staggerTimers = [];
    this.pendingWrites = 0;
    this.isPro = Boolean(options.isPro);
    if (!this.isPro) {
      this.connections = Math.min(this.connections, 4);
    }
    this.speedLimit = this.isPro ? (options.speedLimit || 0) : 0;
    this._bytesInWindow = 0;
    this._windowStart = Date.now();
    this._isThrottled = false;
    this._throttleTimer = null;
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
    return formatXdmFileName(name);
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
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return reject(new Error(`Invalid protocol '${parsed.protocol}'. Only http: and https: are allowed.`));
          }
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

            let baseSanitized = this.sanitizeFileName(this.fileName || guessedName);
            let ext = path.extname(baseSanitized);

            // Extract length and range support
            const len = res.headers['content-length'];
            this.totalBytes = len ? parseInt(len, 10) : 0;
            this.contentType = res.headers['content-type'] || 'application/octet-stream';

            // Auto-append appropriate media extension if missing from URL
            if (!ext || ext === '.') {
              if (this.contentType.includes('video/mp4') || this.url.includes('.mp4') || this.url.includes('cdninstagram') || this.url.includes('fbcdn')) {
                baseSanitized += '.mp4';
                ext = '.mp4';
              } else if (this.contentType.includes('video/webm') || this.url.includes('.webm')) {
                baseSanitized += '.webm';
                ext = '.webm';
              } else if (this.contentType.includes('audio/mp3') || this.contentType.includes('audio/mpeg')) {
                baseSanitized += '.mp3';
                ext = '.mp3';
              }
            }

            this.fileName = path.basename(baseSanitized);
            this.category = this.detectCategory(ext);
            
            const acceptRanges = res.headers['accept-ranges'];
            this.resumable = acceptRanges === 'bytes';

            this.log(`File: ${this.fileName} | Size: ${(this.totalBytes / (1024*1024)).toFixed(2)} MB | Resumable: ${this.resumable}`);
            
            const resolvedSaveDir = path.resolve(this.saveDir);
            const targetPath = path.resolve(resolvedSaveDir, this.fileName);
            if (!targetPath.startsWith(resolvedSaveDir)) {
              this.fileName = `safe_${Date.now()}_${path.extname(this.fileName)}`;
              this.filePath = path.join(resolvedSaveDir, this.fileName);
            } else {
              this.filePath = targetPath;
            }
            this.metaPath = this.filePath + '.xdm.meta';

            try { res.destroy(); } catch (e) {}

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
            try { req.destroy(); } catch (e) {}
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
      let redirects = 0;
      const maxRedirects = 10;

      const doProbeGet = (currentUrl) => {
        try {
          const parsed = new URL(currentUrl);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return reject(new Error(`Invalid protocol '${parsed.protocol}'. Only http: and https: are allowed.`));
          }
          const isHttps = parsed.protocol === 'https:';
          const client = isHttps ? https : http;
          const agent = isHttps ? httpsAgent : httpAgent;

          const req = client.request(parsed, {
            method: 'GET',
            agent,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Range': 'bytes=0-0',
              'Accept-Encoding': 'identity',
              'Connection': 'close'
            },
            timeout: 15000
          }, (res) => {
            // Handle redirects
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
              try { res.destroy(); } catch (e) {}
              if (redirects++ > maxRedirects) {
                return reject(new Error('Too many redirects in probe'));
              }
              const redirectUrl = new URL(res.headers.location, currentUrl).toString();
              this.url = redirectUrl;
              return doProbeGet(redirectUrl);
            }

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
            this.fileName = path.basename(this.sanitizeFileName(this.fileName || guessedName));
            this.totalBytes = totalBytes;
            this.resumable = resumable;

            const resolvedSaveDir = path.resolve(this.saveDir);
            const targetPath = path.resolve(resolvedSaveDir, this.fileName);
            if (!targetPath.startsWith(resolvedSaveDir)) {
              this.fileName = `safe_${Date.now()}_${path.extname(this.fileName)}`;
              this.filePath = path.join(resolvedSaveDir, this.fileName);
            } else {
              this.filePath = targetPath;
            }
            this.metaPath = this.filePath + '.xdm.meta';
            this.category = this.detectCategory(path.extname(this.fileName));

            try { res.destroy(); } catch (e) {}
            resolve({
              url: this.url,
              fileName: this.fileName,
              totalBytes: this.totalBytes,
              resumable: this.resumable,
              category: this.category,
              contentType: res.headers['content-type'] || 'application/octet-stream'
            });
          });

          req.on('timeout', () => {
            try { req.destroy(); } catch (e) {}
            reject(new Error('GET probe timed out'));
          });

          req.on('error', reject);
          req.end();
        } catch (err) {
          reject(err);
        }
      };

      doProbeGet(targetUrl);
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
      const tmpPath = this.metaPath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.metaPath);
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
    this.error = null;
    this.errorMessage = null;

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
      this.lastBytes = this.downloadedBytes;
      this.startSpeedTracker();
      this.startDynamicSplitter();

      this.log(`Download started with ${this.segments.length} parallel connection threads`);

      // Clear existing stagger timers
      if (this.staggerTimers) {
        this.staggerTimers.forEach(t => clearTimeout(t));
      }
      this.staggerTimers = [];

      // Launch segments with a rapid stagger (15ms) to achieve instant bandwidth saturation
      this.segments.forEach((seg, i) => {
        if (seg.current <= seg.end && seg.status !== 'completed') {
          const timer = setTimeout(() => {
            if (!this.isPaused && !this.isCancelled && this.status === 'downloading') {
              this.downloadSegment(seg);
            }
          }, i * 15);
          this.staggerTimers.push(timer);
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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 XDM/1.0',
      'Accept': '*/*',
      'Accept-Encoding': 'identity',
      'Connection': 'keep-alive'
    };

    if (this.resumable && this.totalBytes > 0) {
      headers['Range'] = `bytes=${seg.current}-${seg.end}`;
    }

    const req = client.request(parsed, {
      method: 'GET',
      agent,
      headers,
      timeout: 30000
    }, (res) => {
      // Check if server returned 200 OK
      if (res.statusCode === 200) {
        if (seg.id > 0) {
          // Secondary segment receives full file stream: cancel immediately
          seg.status = 'completed';
          this.activeStreams.delete(seg.id);
          try { req.destroy(); } catch (e) {}
          return;
        }

        // Segment 0 handles download
        if (this.resumable && this.connections > 1) {
          this.resumable = false;
          this.connections = 1;
          this.log('Server does not support partial ranges (returned HTTP 200). Switched to high-speed single connection.', 'warn');

          // Cancel all other streams immediately
          for (const [id, activeReq] of this.activeStreams.entries()) {
            if (id !== seg.id) {
              try { activeReq.destroy(); } catch (e) {}
              this.activeStreams.delete(id);
            }
          }
          for (const s of this.segments) {
            if (s.id !== 0) s.status = 'completed';
          }

          // Reset segment 0 and truncate file to prevent corruption
          seg.start = 0;
          seg.current = 0;
          seg.downloaded = 0;
          seg.end = this.totalBytes > 0 ? this.totalBytes - 1 : Infinity;
          this.downloadedBytes = 0;

          if (this.fileFd) {
            try { fs.ftruncateSync(this.fileFd, 0); } catch (e) {}
          }
        }
      } else if (res.statusCode !== 206) {
        if (res.statusCode >= 400 && res.statusCode < 500 && res.statusCode !== 408 && res.statusCode !== 429) {
          seg.status = 'error';
          this.log(`Segment #${seg.id} fatal HTTP client error: ${res.statusCode}`, 'error');
          this.pause();
          this.status = 'error';
          this.error = `HTTP ${res.statusCode} Error: Server rejected request`;
          this.errorMessage = this.error;
          if (this.onProgressCallback) this.onProgressCallback(this);
          return;
        }
        seg.status = 'error';
        this.log(`Segment #${seg.id} HTTP error: ${res.statusCode}`, 'warn');
        this.retrySegment(seg);
        return;
      }

      req._res = res;
      seg.status = 'downloading';

      res.on('data', (chunk) => {
        if (this.isPaused || this.isCancelled) {
          try { req.destroy(); } catch (e) {}
          return;
        }

        const remainingInSeg = (seg.end - seg.current) + 1;
        const bytesToWrite = this.resumable && this.totalBytes > 0 
          ? Math.min(chunk.length, remainingInSeg) 
          : chunk.length;

        if (bytesToWrite <= 0) {
          seg.status = 'completed';
          seg.speed = 0;
          this.activeStreams.delete(seg.id);
          try { req.destroy(); } catch (e) {}
          this.checkAllCompleted();
          return;
        }

        const writeOffset = seg.current;
        seg.current += bytesToWrite;
        seg.downloaded += bytesToWrite;
        this.downloadedBytes += bytesToWrite;

        if (this.totalBytes > 0 && this.downloadedBytes > this.totalBytes) {
          this.downloadedBytes = this.totalBytes;
        }

        // Speed Limiter Rate-Limiting Backpressure
        if (this.speedLimit > 0) {
          const now = Date.now();
          if (now - this._windowStart >= 1000) {
            this._bytesInWindow = 0;
            this._windowStart = now;
          }
          this._bytesInWindow += bytesToWrite;
          if (this._bytesInWindow >= this.speedLimit && !this._isThrottled) {
            this._isThrottled = true;
            const remainingMs = Math.max(25, 1000 - (now - this._windowStart));
            for (const activeReq of this.activeStreams.values()) {
              if (activeReq && activeReq._res) {
                try { activeReq._res.pause(); } catch (e) {}
              }
            }
            if (this._throttleTimer) clearTimeout(this._throttleTimer);
            this._throttleTimer = setTimeout(() => {
              this._isThrottled = false;
              this._bytesInWindow = 0;
              this._windowStart = Date.now();
              if (!this.isPaused && !this.isCancelled) {
                for (const activeReq of this.activeStreams.values()) {
                  if (activeReq && activeReq._res) {
                    try { activeReq._res.resume(); } catch (e) {}
                  }
                }
              }
            }, remainingMs);
          }
        }

        // Non-blocking asynchronous file write with safe sub-array slice
        if (this.fileFd) {
          this.pendingWrites = (this.pendingWrites || 0) + 1;
          const writeBuf = Buffer.from(chunk.subarray(0, bytesToWrite));
          fs.write(this.fileFd, writeBuf, 0, bytesToWrite, writeOffset, (writeErr) => {
            this.pendingWrites = Math.max(0, (this.pendingWrites || 1) - 1);
            if (writeErr && writeErr.code !== 'EBADF') {
              this.log(`Disk write error on segment #${seg.id}: ${writeErr.message}`, 'error');
              if (writeErr.code === 'ENOSPC' || writeErr.code === 'EACCES' || writeErr.code === 'EIO') {
                this.pause();
                this.status = 'error';
                this.error = `Disk write error (${writeErr.code}): ${writeErr.message}`;
                this.errorMessage = this.error;
                if (this.onProgressCallback) this.onProgressCallback(this);
              }
            }
          });
        }

        if (seg.current > seg.end && this.resumable && this.totalBytes > 0) {
          seg.status = 'completed';
          seg.speed = 0;
          this.activeStreams.delete(seg.id);
          try { req.destroy(); } catch (e) {}
          this.checkAllCompleted();
        }
      });

      res.on('end', () => {
        this.activeStreams.delete(seg.id);
        if (seg.current > seg.end || seg.status === 'completed' || (!this.resumable && this.totalBytes === 0)) {
          seg.status = 'completed';
          seg.speed = 0;
          this.saveMeta();
          this.checkAllCompleted();
        } else {
          // Premature end
          if (!this.isPaused && !this.isCancelled && seg.status !== 'completed') {
            this.retrySegment(seg);
          }
        }
      });

      res.on('error', (err) => {
        this.activeStreams.delete(seg.id);
        if (seg.status === 'completed' || seg.current > seg.end) return;
        if (!this.isPaused && !this.isCancelled) {
          this.log(`Segment #${seg.id} stream error: ${err.message}`, 'warn');
          this.retrySegment(seg);
        }
      });
    });

    // Optimize socket for immediate packet transfer (disable Nagle algorithm)
    req.on('socket', (sock) => {
      try {
        sock.setNoDelay(true);
        sock.setKeepAlive(true, 30000);
      } catch (e) {}
    });

    req.on('error', (err) => {
      this.activeStreams.delete(seg.id);
      if (seg.status === 'completed' || seg.current > seg.end) return;
      if (!this.isPaused && !this.isCancelled) {
        this.log(`Segment #${seg.id} connection error: ${err.message}`, 'warn');
        this.retrySegment(seg);
      }
    });

    req.on('timeout', () => {
      this.activeStreams.delete(seg.id);
      try { req.destroy(new Error('Connection timed out')); } catch (e) {}
    });

    this.activeStreams.set(seg.id, req);
    req.end();
  }

  retrySegment(seg) {
    if (this.isPaused || this.isCancelled) return;
    if (seg._retryTimer) clearTimeout(seg._retryTimer);
    seg.retryCount = (seg.retryCount || 0) + 1;
    if (seg.retryCount > 10) {
      seg.status = 'error';
      this.log(`Segment #${seg.id} exceeded maximum retries (10).`, 'error');
      const anyActive = this.segments.some(s => s.status === 'downloading' || s.status === 'connecting' || s.status === 'retrying');
      if (!anyActive) {
        this.status = 'error';
        this.error = `Download failed: connection dropped repeatedly.`;
        this.errorMessage = this.error;
        if (this.onProgressCallback) this.onProgressCallback(this);
      }
      return;
    }
    seg.status = 'retrying';
    seg._retryTimer = setTimeout(() => {
      seg._retryTimer = null;
      if (!this.isPaused && !this.isCancelled && seg.current <= seg.end) {
        this.downloadSegment(seg);
      }
    }, 2000);
  }

  // IDM's Key Feature: Dynamic Segment Subdivision (Work-Stealing)
  // When connections complete early or one segment is lagging, split large unfinished chunks!
  startDynamicSplitter() {
    if (!this.resumable || this.totalBytes <= 0 || !this.isPro) return;

    this.dynamicSplitInterval = setInterval(() => {
      if (this.status !== 'downloading' || this.isPaused) return;

      // Check for available connection slots
      const activeCount = Array.from(this.activeStreams.values()).length;
      if (activeCount >= this.connections) return; // All channels occupied

      // Find the segment with the largest remaining byte count > 2MB
      let maxRemaining = 0;
      let targetSegment = null;

      for (const seg of this.segments) {
        if (seg.status === 'downloading') {
          const remaining = seg.end - seg.current;
          if (remaining > maxRemaining && remaining > 2 * 1024 * 1024) {
            maxRemaining = remaining;
            targetSegment = seg;
          }
        }
      }

      if (targetSegment) {
        // Split this segment in two!
        const remaining = targetSegment.end - targetSegment.current;
        if (remaining <= 2 * 1024 * 1024) return;
        const half = Math.floor(remaining / 2);
        const originalEnd = targetSegment.end;

        const newStart = targetSegment.current + half;
        if (newStart <= targetSegment.current + 65536 || newStart >= originalEnd) return;

        targetSegment.end = newStart - 1;

        const maxId = this.segments.reduce((max, s) => Math.max(max, s.id), -1);
        const newSegId = maxId + 1;
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
        // Ensure segments always stay sorted in linear byte order so UI never jumps
        this.segments.sort((a, b) => a.start - b.start);
        this.log(`Dynamic Turbo Slicing: Segment #${targetSegment.id} subdivided. Thread #${newSegId} assigned ${((originalEnd - newStart + 1) / (1024*1024)).toFixed(2)} MB to saturate full device bandwidth!`);

        this.downloadSegment(newSegment);
        this.saveMeta();
      }
    }, 600);
  }

  startSpeedTracker() {
    let lastTick = Date.now();
    let lastBytesSample = this.downloadedBytes;

    this.speedTrackerInterval = setInterval(() => {
      if (this.status !== 'downloading') {
        this.speed = 0;
        return;
      }

      const now = Date.now();
      const timeDelta = (now - lastTick) / 1000;
      if (timeDelta <= 0.05) return;
      lastTick = now;

      const currentDownloaded = this.downloadedBytes;
      const bytesInWindow = Math.max(0, currentDownloaded - lastBytesSample);
      lastBytesSample = currentDownloaded;

      const instantSpeed = Math.round(bytesInWindow / timeDelta);
      // Fluid responsive moving average
      this.speed = this.speed > 0 ? Math.round(this.speed * 0.35 + instantSpeed * 0.65) : instantSpeed;
      if (this.speed > this.peakSpeed) this.peakSpeed = this.speed;

      this.speedHistory.push({
        time: now,
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
          seg.speed = Math.round(segDelta / timeDelta);
        } else {
          seg.speed = 0;
        }
      }

      if (this.onProgressCallback) {
        this.onProgressCallback(this);
      }
    }, 300);
  }

  checkAllCompleted() {
    if (this.status === 'completed') return;

    let allDone = true;
    for (const seg of this.segments) {
      if (seg.current <= seg.end && seg.status !== 'completed') {
        allDone = false;
        break;
      }
    }

    if (allDone) {
      // Wait for any pending async disk writes to finish flushing
      if ((this.pendingWrites || 0) > 0) {
        setTimeout(() => this.checkAllCompleted(), 40);
        return;
      }

      this.status = 'completed';
      this.completedAt = Date.now();
      this.speed = 0;
      this.eta = 0;
      this.downloadedBytes = this.totalBytes || this.downloadedBytes;
      this.progress = 100;
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
    this.isPaused = false;
    this.isCancelled = false;
    this.error = null;
    this.errorMessage = null;
    this.log('Resuming download...');
    this.start();
  }

  restart() {
    this.isPaused = false;
    this.isCancelled = false;
    this.error = null;
    this.errorMessage = null;
    this.status = 'queued';
    this.cleanup();
    this.downloadedBytes = 0;
    this.progress = 0;
    this.lastReportedProgress = 0;
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
    this.isPaused = true;
    this.status = 'cancelled';
    this.cleanup();

    if (deleteFile) {
      try {
        if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
        if (fs.existsSync(this.metaPath)) fs.unlinkSync(this.metaPath);
      } catch (e) {}
    }
  }

  setSpeedLimit(limit) {
    if (!this.isPro) {
      this.speedLimit = 0;
      return;
    }
    this.speedLimit = Math.max(0, limit || 0);
    if (this.speedLimit === 0 && this._isThrottled) {
      this._isThrottled = false;
      if (this._throttleTimer) {
        clearTimeout(this._throttleTimer);
        this._throttleTimer = null;
      }
      for (const activeReq of this.activeStreams.values()) {
        if (activeReq && activeReq._res) {
          try { activeReq._res.resume(); } catch (e) {}
        }
      }
    }
  }

  cleanup() {
    if (this._throttleTimer) {
      clearTimeout(this._throttleTimer);
      this._throttleTimer = null;
    }
    this._isThrottled = false;
    if (this.speedTrackerInterval) {
      clearInterval(this.speedTrackerInterval);
      this.speedTrackerInterval = null;
    }
    if (this.dynamicSplitInterval) {
      clearInterval(this.dynamicSplitInterval);
      this.dynamicSplitInterval = null;
    }
    if (this.staggerTimers) {
      this.staggerTimers.forEach(t => clearTimeout(t));
      this.staggerTimers = [];
    }
    if (this.segments) {
      for (const seg of this.segments) {
        if (seg._retryTimer) {
          clearTimeout(seg._retryTimer);
          seg._retryTimer = null;
        }
      }
    }
    if (this.childProcess) {
      try { this.childProcess.kill(); } catch (e) {}
      this.childProcess = null;
    }
    for (const [id, req] of this.activeStreams.entries()) {
      try { req.destroy(); } catch (e) {}
    }
    this.activeStreams.clear();

    const fdToClose = this.fileFd;
    this.fileFd = null;
    if (fdToClose) {
      const tryClose = () => {
        if (this.pendingWrites > 0) {
          setTimeout(tryClose, 25);
        } else {
          try { fs.closeSync(fdToClose); } catch (e) {}
        }
      };
      tryClose();
    }
  }

  toJSON() {
    let progress = this.progress || 0;
    if (this.status === 'completed') {
      progress = 100;
      this.lastReportedProgress = 100;
      if (this.totalBytes <= 0 && this.downloadedBytes > 0) {
        this.totalBytes = this.downloadedBytes;
      } else if (this.totalBytes > 0 && (!this.downloadedBytes || this.downloadedBytes === 0)) {
        this.downloadedBytes = this.totalBytes;
      }
    } else if (this.totalBytes > 0) {
      const calc = Math.min(100, Math.round((this.downloadedBytes / this.totalBytes) * 1000) / 10);
      progress = Math.max(this.lastReportedProgress || 0, calc);
      this.lastReportedProgress = progress;
    }

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
      isVideoStream: this.isVideoStream,
      formatId: this.formatId,
      createdAt: this.createdAt,
      completedAt: this.completedAt,
      error: this.error || this.errorMessage || null,
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

DownloadTask.formatXdmFileName = formatXdmFileName;
DownloadTask.prototype.formatXdmFileName = formatXdmFileName;

module.exports = DownloadTask;
