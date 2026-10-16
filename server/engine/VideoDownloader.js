const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

class VideoDownloader {
  constructor() {
    this.pythonCmd = 'python';
  }

  // Extract metadata and formats for any video (YouTube, Facebook, Instagram, Twitter, etc.)
  async getVideoInfo(url) {
    return new Promise((resolve, reject) => {
      const args = [
        '-m', 'yt_dlp',
        '--dump-json',
        '--no-playlist',
        '--no-warnings',
        url.trim()
      ];

      const child = spawn(this.pythonCmd, args);
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      child.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
        }

        try {
          const data = JSON.parse(stdout);
          
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

          // Extract standard video heights: 1080p, 720p, 480p, 360p
          const seenHeights = new Set();
          if (data.formats && Array.isArray(data.formats)) {
            // Sort by quality
            const videoFormats = data.formats.filter(f => f.vcodec !== 'none' && f.height);
            videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0));

            for (const f of videoFormats) {
              const h = f.height;
              if (h && [2160, 1440, 1080, 720, 480, 360].includes(h) && !seenHeights.has(h)) {
                seenHeights.add(h);
                formats.push({
                  id: `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]`,
                  label: `${h}p (${f.ext || 'mp4'})`,
                  resolution: `${h}p`,
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
            label: 'Audio Only (MP3/M4A)',
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

    const safeTitle = (title || 'video')
      .replace(/[<>:"/\\|?*]+/g, '_')
      .substring(0, 100);

    const outTemplate = path.join(saveDir, `${safeTitle}.%(ext)s`);

    const args = [
      '-m', 'yt_dlp',
      '--newline',
      '--no-playlist',
      '--concurrent-fragments', '16', // 16 parallel threads for turbo video segment download!
      '--progress-template', 'DOWNLOAD_PROGRESS:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes_estimate)s',
      '-o', outTemplate
    ];

    if (formatId && formatId !== 'best') {
      args.push('-f', formatId);
      if (formatId.includes('audio')) {
        args.push('--extract-audio', '--audio-format', 'mp3');
      }
    }

    args.push(url);

    const child = spawn(this.pythonCmd, args);

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

            if (onProgress) {
              onProgress({
                progress,
                speedStr,
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
