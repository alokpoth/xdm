const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

class VideoDownloader {
  constructor() {
    this._cachedYtDlp = null;
    this._cachedNode = null;
    this._cachedFfmpeg = null;
  }

  getNodePath() {
    if (this._cachedNode !== undefined) {
      if (this._cachedNode === null || fs.existsSync(this._cachedNode)) {
        return this._cachedNode;
      }
    }
    const candidates = [
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Program Files (x86)\\nodejs\\node.exe',
      path.join(process.env.APPDATA || '', 'npm/node.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs/node/node.exe')
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(c)) {
        this._cachedNode = c;
        return c;
      }
    }
    try {
      const cmd = process.platform === 'win32' ? 'where.exe node' : 'which node';
      const resolved = require('child_process').execSync(cmd, {
        timeout: 2000,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      }).toString().split(/\r?\n/)[0]?.trim();
      if (resolved && fs.existsSync(resolved)) {
        this._cachedNode = resolved;
        return resolved;
      }
    } catch (e) {}
    this._cachedNode = null;
    return null;
  }

  getFfmpegPath() {
    if (this._cachedFfmpeg && fs.existsSync(this._cachedFfmpeg)) {
      return this._cachedFfmpeg;
    }

    const localFfmpeg = path.resolve(__dirname, '../bin/ffmpeg.exe');
    if (fs.existsSync(localFfmpeg)) {
      this._cachedFfmpeg = localFfmpeg;
      return localFfmpeg;
    }

    if (process.resourcesPath) {
      const resourcesFfmpeg = path.resolve(process.resourcesPath, 'server/bin/ffmpeg.exe');
      if (fs.existsSync(resourcesFfmpeg)) {
        this._cachedFfmpeg = resourcesFfmpeg;
        return resourcesFfmpeg;
      }
    }

    try {
      const pythonFfmpeg = require('child_process').execSync('python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"', {
        timeout: 2000,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      }).toString().trim();
      if (pythonFfmpeg && fs.existsSync(pythonFfmpeg)) {
        this._cachedFfmpeg = pythonFfmpeg;
        return pythonFfmpeg;
      }
    } catch (e) {}

    return 'ffmpeg';
  }

  getYtDlpExecution() {
    // 1. Check local server/bin/yt-dlp.exe
    const localBin = path.resolve(__dirname, '../bin/yt-dlp.exe');
    if (fs.existsSync(localBin)) {
      return { cmd: localBin, baseArgs: [] };
    }

    // 2. Check Electron extraResources
    if (process.resourcesPath) {
      const resBin = path.resolve(process.resourcesPath, 'server/bin/yt-dlp.exe');
      if (fs.existsSync(resBin)) {
        return { cmd: resBin, baseArgs: [] };
      }
    }

    // 3. Check Python scripts directory
    const pyScript = path.join(process.env.LOCALAPPDATA || '', 'Programs/Python/Python313/Scripts/yt-dlp.exe');
    if (fs.existsSync(pyScript)) {
      return { cmd: pyScript, baseArgs: [] };
    }

    // 4. Fallback to python -m yt_dlp
    return { cmd: 'python', baseArgs: ['-m', 'yt_dlp'] };
  }

  // Extract metadata and formats for any video (YouTube, Facebook, Instagram, Twitter, etc.)
  async getVideoInfo(url) {
    return new Promise((resolve, reject) => {
      const execInfo = this.getYtDlpExecution();
      const nodePath = this.getNodePath();
      const ffmpegPath = this.getFfmpegPath();

      const args = [
        ...execInfo.baseArgs,
        '--dump-json',
        '--no-playlist',
        '--no-warnings'
      ];

      if (nodePath) {
        args.push('--js-runtimes', `node:${nodePath}`);
      }
      if (ffmpegPath && ffmpegPath !== 'ffmpeg') {
        args.push('--ffmpeg-location', ffmpegPath);
      }

      // Prepend '--' so flags starting with '-' in URL are never parsed as options
      args.push('--', url.trim());

      const child = spawn(execInfo.cmd, args, { windowsHide: true });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const timeoutTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { child.kill(); } catch (e) {}
        reject(new Error('Video info request timed out after 45 seconds'));
      }, 45000);
      if (timeoutTimer.unref) timeoutTimer.unref();

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutTimer);
        reject(new Error('Video engine runtime failed to spawn: ' + err.message));
      });

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutTimer);
        if (code !== 0) {
          return reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
        }

        try {
          const firstBrace = stdout.indexOf('{');
          const lastBrace = stdout.lastIndexOf('}');
          if (firstBrace === -1 || lastBrace === -1) {
            throw new Error('Valid JSON metadata was not returned by video engine: ' + (stderr.trim() || stdout.trim()));
          }
          const data = JSON.parse(stdout.substring(firstBrace, lastBrace + 1));
          
          // Parse formats into clean user-friendly choices
          const formats = [];
          
          // Best combined / standard options
          formats.push({
            id: 'best',
            label: 'Best Available (Auto Max Quality)',
            resolution: 'Highest',
            ext: data.ext || 'mp4',
            hasAudio: true,
            hasVideo: true
          });

          // Extract standard video heights: 4K 2160p 60fps, 2K 1440p, 1080p, 720p, 480p, 360p
          const seenHeights = new Set();
          if (data.formats && Array.isArray(data.formats)) {
            // Sort by quality and fps
            const videoFormats = data.formats.filter(f => f.vcodec !== 'none' && f.height);
            videoFormats.sort((a, b) => {
              if ((b.height || 0) !== (a.height || 0)) {
                return (b.height || 0) - (a.height || 0);
              }
              return (b.fps || 0) - (a.fps || 0);
            });

            for (const f of videoFormats) {
              const h = f.height;
              if (h && [2160, 1440, 1080, 720, 480, 360].includes(h) && !seenHeights.has(h)) {
                seenHeights.add(h);
                const isHighFps = f.fps && f.fps >= 50;
                let qualityLabel = `${h}p`;
                if (h >= 2160) qualityLabel = `4K ${isHighFps ? '60fps ' : ''}Ultra HD (2160p)`;
                else if (h >= 1440) qualityLabel = `2K ${isHighFps ? '60fps ' : ''}QHD (1440p)`;
                else if (h >= 1080) qualityLabel = `1080p ${isHighFps ? '60fps ' : ''}FHD`;
                else if (h >= 720) qualityLabel = `720p ${isHighFps ? '60fps ' : ''}HD`;
                else if (h >= 480) qualityLabel = `480p SD`;
                else if (h >= 360) qualityLabel = `360p`;

                const formatSelector = isHighFps
                  ? `bestvideo[height<=${h}][fps>=50]+bestaudio/bestvideo[height<=${h}]+bestaudio/best`
                  : `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]`;

                formats.push({
                  id: formatSelector,
                  label: qualityLabel,
                  resolution: `${h}p`,
                  fps: f.fps || 30,
                  ext: 'mp4',
                  filesize: f.filesize || f.filesize_approx || 0,
                  hasAudio: true,
                  hasVideo: true
                });
              }
            }
          }

          // Audio-only option
          formats.push({
            id: 'bestaudio/best',
            label: 'Audio Only (MP3 320kbps)',
            resolution: 'Audio',
            ext: 'mp3',
            hasAudio: true,
            hasVideo: false
          });

          resolve({
            id: data.id,
            url: data.webpage_url || url,
            title: data.title || 'Video Download',
            thumbnail: data.thumbnail,
            duration: data.duration,
            durationString: data.duration_string,
            uploader: data.uploader || data.channel,
            viewCount: data.view_count,
            formats
          });
        } catch (err) {
          reject(new Error('Failed to parse video info: ' + err.message));
        }
      });
    });
  }

  // Download video with multi-threading fragments
  downloadVideo(options, onProgress, onLog) {
    const { url, formatId, saveDir, title } = options;

    let cleanTitle = (title || 'video').replace(/[<>:"/\\|?*]+/g, '_').trim();
    cleanTitle = cleanTitle.replace(/[.\s]+$/, '');
    const safeTitle = (cleanTitle || 'video').substring(0, 120);

    if (saveDir && !fs.existsSync(saveDir)) {
      try { fs.mkdirSync(saveDir, { recursive: true }); } catch (e) {}
    }

    const outTemplate = path.join(saveDir, `${safeTitle}.%(ext)s`);
    const ffmpegPath = this.getFfmpegPath();
    const fragments = String(Math.min(Math.max(options.connections || 64, 1), 64));
    const execInfo = this.getYtDlpExecution();
    const nodePath = this.getNodePath();

    const args = [
      ...execInfo.baseArgs,
      '--newline',
      '--no-playlist',
      '--concurrent-fragments', fragments, // User selected or up to 64 parallel threads for turbo video segment download!
      '--progress-template', 'DOWNLOAD_PROGRESS:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes_estimate)s',
      '-o', outTemplate
    ];

    if (nodePath) {
      args.push('--js-runtimes', `node:${nodePath}`);
    }

    if (ffmpegPath && ffmpegPath !== 'ffmpeg') {
      args.push('--ffmpeg-location', ffmpegPath);
    }

    // Format selection with seamless fallback so downloads NEVER fail if a specific resolution is missing
    // Sanitize formatId to avoid option injection into -f while preserving valid yt-dlp selector characters
    let cleanFormatId = String(formatId || 'best').replace(/[^a-zA-Z0-9_\-+*/[\]<>=,:]/g, '');
    if (cleanFormatId.startsWith('-')) cleanFormatId = 'best';
    const isAudioOnly = !/video|height/i.test(cleanFormatId) && /audio|mp3|m4a|aac|flac|wav|opus/i.test(cleanFormatId);

    let robustFormat = '';
    if (!cleanFormatId || cleanFormatId === 'best') {
      robustFormat = 'bestvideo*+bestaudio/best';
    } else if (isAudioOnly) {
      robustFormat = 'bestaudio/best';
    } else {
      robustFormat = `${cleanFormatId}/bestvideo*+bestaudio/best`;
    }

    if (isAudioOnly) {
      args.push('-f', robustFormat, '--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0');
    } else {
      args.push('-f', robustFormat, '--merge-output-format', 'mp4');
    }

    // Prepend '--' so flags starting with '-' in URL are never parsed as options
    args.push('--', url);

    const child = spawn(execInfo.cmd, args, { windowsHide: true });

    child.on('error', (err) => {
      if (onLog) onLog(`Video process spawn error: ${err.message}`, 'error');
    });

    const parseSpeedBytes = (str) => {
      if (!str) return 0;
      const match = str.match(/([\d.]+)\s*([KMGTP]?i?B)\/s/i);
      if (!match) return 0;
      const val = parseFloat(match[1]);
      const unit = match[2].toUpperCase();
      if (unit.startsWith('K')) return Math.round(val * 1024);
      if (unit.startsWith('M')) return Math.round(val * 1024 * 1024);
      if (unit.startsWith('G')) return Math.round(val * 1024 * 1024 * 1024);
      return Math.round(val);
    };

    child.stdout.on('data', (data) => {
      const text = data.toString();
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.includes('DOWNLOAD_PROGRESS:')) {
          const parts = line.replace('DOWNLOAD_PROGRESS:', '').trim().split('|');
          if (parts.length >= 5) {
            const pctStr = parts[0].replace('%', '').trim();
            const progress = parseFloat(pctStr) || 0;
            const speedStr = parts[1].trim();
            const etaStr = parts[2].trim();
            const downloadedBytes = parseInt(parts[3], 10) || 0;
            const totalBytes = parseInt(parts[4], 10) || 0;
            const speedBytes = parseSpeedBytes(speedStr);

            if (onProgress) {
              onProgress({
                progress,
                speedStr,
                speedBytes,
                etaStr,
                downloadedBytes,
                totalBytes
              });
            }
          }
        } else if (line.trim()) {
          if (onLog) onLog(line.trim());
        }
      }
    });

    child.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg && onLog) onLog(msg, 'warn');
    });

    return child;
  }
}

module.exports = new VideoDownloader();
