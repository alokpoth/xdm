const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const DownloadTask = require('./DownloadTask');
const videoDownloader = require('./VideoDownloader');

class DownloadManager {
  constructor(options = {}) {
    this.storageDir = options.storageDir || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.xdm');
    this.storageFile = path.join(this.storageDir, 'state.json');
    this.settingsFile = path.join(this.storageDir, 'settings.json');
    
    // Default settings
    this.settings = {
      defaultSaveDir: path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Downloads'),
      maxConcurrentDownloads: 3,
      defaultConnections: 16, // 16 parallel threads per file for maximum bandwidth saturation
      autoStart: true,
      soundNotification: true,
      speedLimit: 0, // 0 = unlimited turbo
      categoriesDir: true // sub-folders by category
    };

    this.tasks = new Map(); // id -> DownloadTask
    this.subscribers = new Set(); // WebSocket clients

    this.ensureStorage();
    this.loadSettings();
    this.loadState();

    // Auto schedule queue check
    setInterval(() => this.processQueue(), 2000);

    // Broadcast telemetry loop
    setInterval(() => this.broadcastTelemetry(), 400);
  }

  ensureStorage() {
    if (!fs.existsSync(this.storageDir)) {
      try {
        fs.mkdirSync(this.storageDir, { recursive: true });
      } catch (e) {}
    }
  }

  loadSettings() {
    try {
      if (fs.existsSync(this.settingsFile)) {
        const raw = fs.readFileSync(this.settingsFile, 'utf-8');
        this.settings = { ...this.settings, ...JSON.parse(raw) };
      }
    } catch (e) {}
  }

  saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    try {
      fs.writeFileSync(this.settingsFile, JSON.stringify(this.settings, null, 2), 'utf-8');
    } catch (e) {}
  }

  loadState() {
    try {
      if (fs.existsSync(this.storageFile)) {
        const raw = fs.readFileSync(this.storageFile, 'utf-8');
        const list = JSON.parse(raw);
        for (const item of list) {
          // If was downloading when closed, mark as paused
          if (item.status === 'downloading' || item.status === 'probing') {
            item.status = 'paused';
          }
          const task = new DownloadTask({
            ...item,
            onProgress: () => this.broadcastTelemetry()
          });
          this.tasks.set(task.id, task);
        }
      }
    } catch (e) {}
  }

  saveState() {
    try {
      this.ensureStorage();
      const list = Array.from(this.tasks.values()).map(t => t.toJSON());
      fs.writeFileSync(this.storageFile, JSON.stringify(list, null, 2), 'utf-8');
    } catch (e) {}
  }

  subscribe(ws) {
    this.subscribers.add(ws);
    // Send immediate initial state
    ws.send(JSON.stringify({
      type: 'INIT',
      payload: {
        downloads: this.getAllDownloads(),
        settings: this.settings,
        stats: this.getGlobalStats()
      }
    }));

    ws.on('close', () => {
      this.subscribers.delete(ws);
    });
  }

  broadcast(message) {
    const raw = JSON.stringify(message);
    for (const ws of this.subscribers) {
      try {
        if (ws.readyState === 1) { // OPEN
          ws.send(raw);
        }
      } catch (e) {}
    }
  }

  broadcastTelemetry() {
    if (this.subscribers.size === 0) return;
    this.broadcast({
      type: 'TELEMETRY',
      payload: {
        downloads: this.getAllDownloads(),
        stats: this.getGlobalStats()
      }
    });
  }

  getGlobalStats() {
    let totalSpeed = 0;
    let activeDownloads = 0;
    let totalDownloaded = 0;
    let totalSize = 0;

    for (const task of this.tasks.values()) {
      if (task.status === 'downloading') {
        totalSpeed += task.speed;
        activeDownloads++;
      }
      totalDownloaded += task.downloadedBytes;
      totalSize += task.totalBytes;
    }

    return {
      totalSpeed, // B/s
      activeDownloads,
      totalDownloads: this.tasks.size,
      totalDownloaded,
      totalSize
    };
  }

  getAllDownloads() {
    return Array.from(this.tasks.values())
      .map(t => t.toJSON())
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async probeUrl(url) {
    const tempTask = new DownloadTask({
      url,
      saveDir: this.settings.defaultSaveDir
    });
    const info = await tempTask.probeUrl();
    return info;
  }

  async getVideoInfo(url) {
    return await videoDownloader.getVideoInfo(url);
  }

  async addVideoDownload(options) {
    let saveDir = options.saveDir || this.settings.defaultSaveDir;
    const isAudio = options.formatId && options.formatId.includes('audio');
    const cat = isAudio ? 'Audio' : 'Video';
    
    if (this.settings.categoriesDir) {
      saveDir = path.join(saveDir, cat);
    }
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }

    const taskId = 'xdm_vid_' + Date.now();
    const task = new DownloadTask({
      id: taskId,
      url: options.url,
      fileName: options.title ? `${options.title}.${isAudio ? 'mp3' : 'mp4'}` : `video_${Date.now()}.${isAudio ? 'mp3' : 'mp4'}`,
      saveDir,
      category: isAudio ? 'audio' : 'video',
      connections: 16
    });

    task.status = 'downloading';
    task.log(`Starting video stream download (${options.formatId || 'best'})...`);
    this.tasks.set(task.id, task);
    this.saveState();
    this.broadcastTelemetry();

    const safeTitlePrefix = (options.title || task.fileName.replace(/\.[^/.]+$/, ''))
      .replace(/[<>:"/\\|?*]+/g, '_')
      .substring(0, 50);

    const child = videoDownloader.downloadVideo({
      url: options.url,
      formatId: options.formatId || 'best',
      saveDir,
      title: options.title || task.fileName.replace(/\.[^/.]+$/, '')
    }, (progressData) => {
      task.progress = progressData.progress || task.progress;
      task.downloadedBytes = progressData.downloadedBytes || task.downloadedBytes;
      if (progressData.totalBytes > 0) task.totalBytes = progressData.totalBytes;
      this.broadcastTelemetry();
    }, (logMsg, type) => {
      task.log(logMsg, type || 'info');
    });

    child.on('close', (code) => {
      if (code === 0) {
        task.status = 'completed';
        task.progress = 100;
        task.speed = 0;
        task.eta = 0;
        task.completedAt = Date.now();
        // Check actual output file on disk to get real file path and size
        try {
          const files = fs.readdirSync(saveDir);
          const matched = files.find(f => f.startsWith(safeTitlePrefix));
          if (matched) {
            const actualPath = path.join(saveDir, matched);
            const stat = fs.statSync(actualPath);
            task.filePath = actualPath;
            task.fileName = matched;
            task.totalBytes = stat.size;
            task.downloadedBytes = stat.size;
          }
        } catch (e) {}
        if (!task.totalBytes || task.totalBytes <= 0) {
          task.totalBytes = task.downloadedBytes > 0 ? task.downloadedBytes : 1;
          task.downloadedBytes = task.totalBytes;
        }
        task.log('Video download completed successfully with merged audio!', 'success');
      } else {
        task.status = 'error';
        task.log(`Video download process exited with code ${code}`, 'error');
      }
      this.saveState();
      this.broadcastTelemetry();
    });

    return task.toJSON();
  }

  async addDownload(options) {
    const isVideoSite = /youtube\.com|youtu\.be|facebook\.com|fb\.watch|instagram\.com|tiktok\.com|twitter\.com|x\.com|vimeo\.com/i.test(options.url);

    if (isVideoSite) {
      // Automatic video stream extraction for video sites!
      try {
        const info = await this.getVideoInfo(options.url);
        return await this.addVideoDownload({
          url: options.url,
          formatId: options.formatId || 'best',
          title: options.fileName || info.title,
          saveDir: options.saveDir
        });
      } catch (e) {
        // Fall back to direct download task if video info fails
      }
    }

    let saveDir = options.saveDir || this.settings.defaultSaveDir;
    
    // Auto-categorize into subfolders if enabled
    if (this.settings.categoriesDir && options.category && options.category !== 'others') {
      const catName = options.category.charAt(0).toUpperCase() + options.category.slice(1);
      saveDir = path.join(saveDir, catName);
    }

    const task = new DownloadTask({
      url: options.url,
      fileName: options.fileName,
      saveDir,
      connections: options.connections || this.settings.defaultConnections,
      onProgress: () => this.broadcastTelemetry()
    });

    this.tasks.set(task.id, task);
    this.saveState();

    if (options.autoStart ?? this.settings.autoStart) {
      await task.start();
    }

    this.saveState();
    return task.toJSON();
  }

  pauseDownload(id) {
    const task = this.tasks.get(id);
    if (task) {
      task.pause();
      this.saveState();
      this.processQueue();
      return true;
    }
    return false;
  }

  resumeDownload(id) {
    const task = this.tasks.get(id);
    if (task) {
      task.resume();
      this.saveState();
      return true;
    }
    return false;
  }

  restartDownload(id) {
    const task = this.tasks.get(id);
    if (task) {
      task.restart();
      this.saveState();
      return true;
    }
    return false;
  }

  deleteDownload(id, deleteFile = false) {
    const task = this.tasks.get(id);
    if (task) {
      task.cancel(deleteFile);
      this.tasks.delete(id);
      this.saveState();
      this.processQueue();
      return true;
    }
    return false;
  }

  pauseAll() {
    for (const task of this.tasks.values()) {
      if (task.status === 'downloading') {
        task.pause();
      }
    }
    this.saveState();
  }

  resumeAll() {
    for (const task of this.tasks.values()) {
      if (task.status === 'paused' || task.status === 'queued') {
        task.resume();
      }
    }
    this.saveState();
  }

  clearFinished() {
    for (const [id, task] of this.tasks.entries()) {
      if (task.status === 'completed' || task.status === 'error') {
        this.tasks.delete(id);
      }
    }
    this.saveState();
  }

  processQueue() {
    let running = 0;
    for (const task of this.tasks.values()) {
      if (task.status === 'downloading') running++;
    }

    if (running < this.settings.maxConcurrentDownloads) {
      for (const task of this.tasks.values()) {
        if (task.status === 'queued') {
          task.start();
          running++;
          if (running >= this.settings.maxConcurrentDownloads) break;
        }
      }
    }
  }

  openFile(id) {
    const task = this.tasks.get(id);
    if (!task || !task.filePath || !fs.existsSync(task.filePath)) {
      throw new Error('File not found on disk');
    }

    // Windows native open
    if (process.platform === 'win32') {
      exec(`start "" "${task.filePath}"`);
    } else if (process.platform === 'darwin') {
      exec(`open "${task.filePath}"`);
    } else {
      exec(`xdg-open "${task.filePath}"`);
    }
  }

  openFolder(id) {
    const task = this.tasks.get(id);
    if (!task || !task.filePath) {
      throw new Error('Task has no target file path');
    }

    if (process.platform === 'win32') {
      // Highlight file in Windows Explorer
      if (fs.existsSync(task.filePath)) {
        exec(`explorer.exe /select,"${task.filePath}"`);
      } else if (fs.existsSync(task.saveDir)) {
        exec(`explorer.exe "${task.saveDir}"`);
      }
    } else if (process.platform === 'darwin') {
      exec(`open -R "${task.filePath}"`);
    } else {
      exec(`xdg-open "${task.saveDir}"`);
    }
  }
}

module.exports = DownloadManager;
