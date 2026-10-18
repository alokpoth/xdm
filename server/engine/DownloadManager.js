const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const DownloadTask = require('./DownloadTask');
const videoDownloader = require('./VideoDownloader');
const LicenseManager = require('./LicenseManager');

class DownloadManager {
  constructor(options = {}) {
    this.storageDir = options.storageDir || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.xdm');
    this.storageFile = path.join(this.storageDir, 'state.json');
    this.settingsFile = path.join(this.storageDir, 'settings.json');
    
    // Default settings
    this.settings = {
      defaultSaveDir: path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Downloads'),
      maxConcurrentDownloads: 3,
      defaultConnections: 32, // 32 parallel threads per file for 10x faster IDM bandwidth saturation
      autoStart: true,
      soundNotification: true,
      speedLimit: 0, // 0 = unlimited turbo
      categoriesDir: true // sub-folders by category
    };

    this.tasks = new Map(); // id -> DownloadTask
    this.subscribers = new Set(); // WebSocket clients

    this.licenseManager = options.licenseManager || new LicenseManager({ storageDir: this.storageDir });
    this.licenseManager.onStatusChange = (status) => {
      this.broadcast({
        type: 'LICENSE_UPDATE',
        payload: status
      });
      this.broadcastTelemetry(true);
    };

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
          const isVid = Boolean(item.isVideoStream || (item.id && item.id.startsWith('xdm_vid_')));
          const task = new DownloadTask({
            ...item,
            isVideoStream: isVid,
            formatId: item.formatId || 'best',
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
      const tempFile = this.storageFile + '.tmp';
      fs.writeFileSync(tempFile, JSON.stringify(list, null, 2), 'utf-8');
      fs.renameSync(tempFile, this.storageFile);
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
        stats: this.getGlobalStats(),
        license: this.licenseManager ? this.licenseManager.getStatus() : null
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

  broadcastTelemetry(force = false) {
    if (this.subscribers.size === 0) return;

    let hasActive = false;
    for (const task of this.tasks.values()) {
      if (task.status === 'downloading' || task.status === 'probing') {
        hasActive = true;
        break;
      }
    }

    const now = Date.now();
    // When idle with no active downloads, throttle updates to once every 2.5s to preserve CPU and RAM
    if (!hasActive && !force && this._lastIdleBroadcast && (now - this._lastIdleBroadcast < 2500)) {
      return;
    }
    this._lastIdleBroadcast = now;

    this.broadcast({
      type: 'TELEMETRY',
      payload: {
        downloads: this.getAllDownloads(),
        stats: this.getGlobalStats(),
        license: this.licenseManager ? this.licenseManager.getStatus() : null
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
    const isVideoSite = /youtube\.com|youtu\.be|facebook\.com|fb\.watch|instagram\.com|tiktok\.com|twitter\.com|x\.com|vimeo\.com/i.test(url);
    if (isVideoSite) {
      try {
        const videoInfo = await this.getVideoInfo(url);
        if (videoInfo) {
          const rawTitle = videoInfo.title || 'Video';
          const cleanTitle = rawTitle.replace(/[<>:"/\\|?*]+/g, '_').trim();
          const finalName = /xdm\s+by\s+zihan/i.test(cleanTitle) ? `${cleanTitle}.mp4` : `${cleanTitle} XDM by Zihan.mp4`;
          return {
            url,
            isVideo: true,
            videoInfo,
            fileName: finalName,
            totalBytes: 0,
            resumable: true,
            category: 'video',
            contentType: 'video/mp4'
          };
        }
      } catch (e) {
        // Fall back to direct probe if video metadata fails
      }
    }

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

  startVideoDownloadStream(task) {
    if (task.childProcess) {
      try { task.childProcess.kill(); } catch (e) {}
      task.childProcess = null;
    }

    task.status = 'downloading';
    task.error = null;
    task.log(`Starting video stream download (${task.formatId || 'best'}) with ${task.connections || 32} parallel streams...`);
    this.saveState();
    this.broadcastTelemetry();

    const safeTitlePrefix = (task.fileName.replace(/\.[^/.]+$/, ''))
      .replace(/[<>:"/\\|?*]+/g, '_')
      .substring(0, 50);

    const child = videoDownloader.downloadVideo({
      url: task.url,
      formatId: task.formatId || 'best',
      saveDir: task.saveDir,
      connections: task.connections || this.settings.defaultConnections || 32,
      title: task.fileName.replace(/\.[^/.]+$/, '')
    }, (progressData) => {
      task.progress = progressData.progress || task.progress;
      task.downloadedBytes = progressData.downloadedBytes || task.downloadedBytes;
      if (progressData.totalBytes > 0) task.totalBytes = progressData.totalBytes;
      if (progressData.speedBytes > 0) {
        task.speed = progressData.speedBytes;
        if (task.speed > task.peakSpeed) task.peakSpeed = task.speed;
      }
      this.broadcastTelemetry();
    }, (logMsg, type) => {
      task.log(logMsg, type || 'info');
    });

    task.childProcess = child;

    child.on('close', (code) => {
      task.childProcess = null;
      if (code === 0) {
        task.status = 'completed';
        task.progress = 100;
        task.speed = 0;
        task.eta = 0;
        task.completedAt = Date.now();
        task.error = null;
        try {
          const files = fs.readdirSync(task.saveDir);
          const matched = files.find(f => f.startsWith(safeTitlePrefix));
          if (matched) {
            const actualPath = path.join(task.saveDir, matched);
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
        if (task.status !== 'paused' && task.status !== 'cancelled') {
          task.status = 'error';
          task.error = `Video download process exited with code ${code}`;
          task.log(`Video download process exited with code ${code}`, 'error');
        }
      }
      this.saveState();
      this.broadcastTelemetry();
    });
  }

  async addVideoDownload(options) {
    let saveDir = options.saveDir || this.settings.defaultSaveDir;
    const isAudio = !/video|height/i.test(options.formatId || '') && (/audio|mp3|m4a|aac|flac|wav|opus/i.test(options.formatId || '') || options.category === 'audio');
    const cat = isAudio ? 'Audio' : 'Video';
    
    if (this.settings.categoriesDir) {
      saveDir = path.join(saveDir, cat);
    }
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }

    const taskId = 'xdm_vid_' + Date.now();
    let chosenConnections = options.connections || this.settings.defaultConnections || 32;
    if (!this.licenseManager || !this.licenseManager.license.isPro) {
      chosenConnections = Math.min(chosenConnections, 8); // Free tier capped to 8 streams
    }
    const baseTitle = options.title || `video_${Date.now()}`;
    const cleanExt = isAudio ? '.mp3' : '.mp4';
    const finalName = baseTitle.toLowerCase().endsWith(cleanExt) ? baseTitle : `${baseTitle}${cleanExt}`;

    const task = new DownloadTask({
      id: taskId,
      url: options.url,
      fileName: finalName,
      saveDir,
      category: isAudio ? 'audio' : 'video',
      connections: chosenConnections,
      isVideoStream: true,
      formatId: options.formatId || 'best'
    });

    this.tasks.set(task.id, task);
    this.startVideoDownloadStream(task);
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
          connections: options.connections || this.settings.defaultConnections || 32,
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

    let chosenConnections = options.connections || this.settings.defaultConnections || 32;
    if (!this.licenseManager || !this.licenseManager.license.isPro) {
      chosenConnections = Math.min(chosenConnections, 8); // Free tier capped to 8 streams
    }

    const task = new DownloadTask({
      url: options.url,
      fileName: options.fileName,
      saveDir,
      connections: chosenConnections,
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
      if (task.childProcess || task.isVideoStream || (task.id && task.id.startsWith('xdm_vid_'))) {
        task.status = 'paused';
        if (task.childProcess) {
          try { task.childProcess.kill(); } catch (e) {}
          task.childProcess = null;
        }
        task.speed = 0;
        task.eta = 0;
        task.log('Video download paused', 'info');
        this.saveState();
        this.broadcastTelemetry();
        return true;
      }
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
      if (task.isVideoStream || (task.id && task.id.startsWith('xdm_vid_'))) {
        this.startVideoDownloadStream(task);
        return true;
      }
      task.resume();
      this.saveState();
      return true;
    }
    return false;
  }

  restartDownload(id) {
    const task = this.tasks.get(id);
    if (task) {
      if (task.childProcess) {
        try { task.childProcess.kill(); } catch (e) {}
        task.childProcess = null;
      }
      if (task.isVideoStream || (task.id && task.id.startsWith('xdm_vid_'))) {
        task.progress = 0;
        task.downloadedBytes = 0;
        task.speed = 0;
        task.eta = 0;
        task.error = null;
        task.log('Video download restarted');
        this.startVideoDownloadStream(task);
        return true;
      }
      task.restart();
      this.saveState();
      return true;
    }
    return false;
  }

  deleteDownload(id, deleteFile = false) {
    const task = this.tasks.get(id);
    if (task) {
      if (task.childProcess) {
        try { task.childProcess.kill(); } catch (e) {}
        task.childProcess = null;
      }
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
      if (task.childProcess) {
        try { task.childProcess.kill(); } catch (e) {}
        task.childProcess = null;
      }
      if (task.status === 'downloading') {
        task.pause();
      }
    }
    this.saveState();
  }

  resumeAll() {
    for (const task of this.tasks.values()) {
      if (task.status === 'paused' || task.status === 'queued') {
        if (task.isVideoStream || (task.id && task.id.startsWith('xdm_vid_'))) {
          this.startVideoDownloadStream(task);
        } else {
          task.resume();
        }
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
          if (task.isVideoStream || (task.id && task.id.startsWith('xdm_vid_'))) {
            this.startVideoDownloadStream(task);
          } else {
            task.start();
          }
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
      spawn('cmd.exe', ['/c', 'start', '', task.filePath], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [task.filePath], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [task.filePath], { detached: true, stdio: 'ignore' }).unref();
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
        spawn('explorer.exe', [`/select,${task.filePath}`], { detached: true, stdio: 'ignore' }).unref();
      } else if (fs.existsSync(task.saveDir)) {
        spawn('explorer.exe', [task.saveDir], { detached: true, stdio: 'ignore' }).unref();
      }
    } else if (process.platform === 'darwin') {
      spawn('open', ['-R', task.filePath], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [task.saveDir], { detached: true, stdio: 'ignore' }).unref();
    }
  }
}

module.exports = DownloadManager;
