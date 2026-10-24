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
    
    // Default settings: Commercial Free Tier (PRO unlocks 64 threads & 10 concurrent)
    this.settings = {
      defaultSaveDir: path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Downloads'),
      maxConcurrentDownloads: 1, // Free default: 1 task at a time (PRO unlocks up to 10)
      defaultConnections: 4, // Free default: 4 threads (PRO unlocks up to 64 threads)
      autoStart: true,
      soundNotification: true,
      speedLimit: 0, // 0 = unlimited turbo (in KB/s)
      categoriesDir: true, // sub-folders by category
      clipboardMonitoring: true,
      windowsNotifications: true,
      schedulerEnabled: false,
      scheduleStartTime: '01:00',
      scheduleStopTime: '06:00',
      shutdownOnCompletion: false
    };

    this.tasks = new Map(); // id -> DownloadTask
    this.subscribers = new Set(); // WebSocket clients
    this._shutdownScheduled = false;
    this._hadActiveDownloadsBefore = false;
    this._scheduledStartDone = false;
    this._scheduledStopDone = false;
    this._lastCheckedMinute = '';

    this.licenseManager = options.licenseManager || new LicenseManager({ storageDir: this.storageDir, downloadManager: this });
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
    this._queueInterval = setInterval(() => this.processQueue(), 2000);
    if (this._queueInterval.unref) this._queueInterval.unref();

    // Auto check scheduler & auto-shutdown every 2.5s
    this._schedulerInterval = setInterval(() => {
      this.checkScheduler();
      this.checkAutoShutdown();
    }, 2500);
    if (this._schedulerInterval.unref) this._schedulerInterval.unref();

    // Broadcast telemetry loop
    this._telemetryInterval = setInterval(() => this.broadcastTelemetry(), 400);
    if (this._telemetryInterval.unref) this._telemetryInterval.unref();
  }

  destroy() {
    if (this._queueInterval) clearInterval(this._queueInterval);
    if (this._schedulerInterval) clearInterval(this._schedulerInterval);
    if (this._telemetryInterval) clearInterval(this._telemetryInterval);
    if (this.licenseManager && typeof this.licenseManager.destroy === 'function') {
      this.licenseManager.destroy();
    }
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
    if (!this.isProVerified()) {
      newSettings.speedLimit = 0;
      newSettings.schedulerEnabled = false;
      newSettings.shutdownOnCompletion = false;
      newSettings.clipboardMonitoring = false;
      newSettings.windowsNotifications = false;
      if (newSettings.defaultConnections && newSettings.defaultConnections > 4) {
        newSettings.defaultConnections = 4;
      }
      if (newSettings.maxConcurrentDownloads && newSettings.maxConcurrentDownloads > 1) {
        newSettings.maxConcurrentDownloads = 1;
      }
    } else {
      if (newSettings.defaultConnections !== undefined) {
        newSettings.defaultConnections = Math.min(Math.max(parseInt(newSettings.defaultConnections, 10) || 64, 1), 64);
      }
      if (newSettings.maxConcurrentDownloads !== undefined) {
        newSettings.maxConcurrentDownloads = Math.min(Math.max(parseInt(newSettings.maxConcurrentDownloads, 10) || 3, 1), 10);
      }
    }

    this.settings = { ...this.settings, ...newSettings };
    try {
      this.ensureStorage();
      const tmpFile = this.settingsFile + '.tmp';
      fs.writeFileSync(tmpFile, JSON.stringify(this.settings, null, 2), 'utf-8');
      fs.renameSync(tmpFile, this.settingsFile);
    } catch (e) {}

    // Broadcast updated settings to all UI windows immediately
    this.broadcast({
      type: 'SETTINGS_UPDATE',
      payload: this.settings
    });

    // Instantly apply speed limit to all active tasks
    if (newSettings.speedLimit !== undefined) {
      const limitInBytes = (this.settings.speedLimit || 0) * 1024;
      for (const task of this.tasks.values()) {
        if (task && typeof task.setSpeedLimit === 'function') {
          task.setSpeedLimit(limitInBytes);
        }
      }
    }
  }

  loadState() {
    try {
      if (fs.existsSync(this.storageFile)) {
        const raw = fs.readFileSync(this.storageFile, 'utf-8');
        const list = JSON.parse(raw);
        const isPro = this.isProVerified();
        for (const item of list) {
          // If was downloading when closed, mark as paused
          if (item.status === 'downloading' || item.status === 'probing') {
            item.status = 'paused';
          }
          const isVid = Boolean(item.isVideoStream || (item.id && item.id.startsWith('xdm_vid_')));
          const task = new DownloadTask({
            ...item,
            isPro,
            speedLimit: (this.settings.speedLimit || 0) * 1024,
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
    // When actively downloading, throttle broadcast to 150ms to eliminate UI lag & websocket congestion
    if (hasActive && !force && this._lastActiveBroadcast && (now - this._lastActiveBroadcast < 150)) {
      return;
    }
    this._lastActiveBroadcast = now;

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
    if (this.isBanned()) {
      throw new Error('This device is permanently banned by administrator. URL probing is disabled.');
    }
    const isVideoSite = /youtube\.com|youtu\.be|facebook\.com|fb\.watch|instagram\.com|tiktok\.com|twitter\.com|x\.com|vimeo\.com/i.test(url);
    if (isVideoSite) {
      try {
        const videoInfo = await this.getVideoInfo(url);
        if (videoInfo) {
          const rawTitle = videoInfo.title || 'Video';
          const cleanTitle = rawTitle.replace(/[<>:"/\\|?*]+/g, '_').trim();
          const finalName = `${cleanTitle}.mp4`;
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
    task.log(`Starting video stream download (${task.formatId || 'best'}) with ${task.connections || 64} parallel streams...`);
    this.saveState();
    this.broadcastTelemetry();

    const safeTitlePrefix = (task.fileName.replace(/\.[^/.]+$/, ''))
      .replace(/[<>:"/\\|?*]+/g, '_')
      .substring(0, 50);

    const child = videoDownloader.downloadVideo({
      url: task.url,
      formatId: task.formatId || 'best',
      saveDir: task.saveDir,
      connections: task.connections || this.settings.defaultConnections || 64,
      title: task.fileName.replace(/\.[^/.]+$/, '')
    }, (progressData) => {
      task.progress = progressData.progress || task.progress;
      task.downloadedBytes = progressData.downloadedBytes || task.downloadedBytes;
      if (progressData.totalBytes > 0) task.totalBytes = progressData.totalBytes;
      if (progressData.speedBytes > 0) {
        task.speed = progressData.speedBytes;
        if (task.speed > task.peakSpeed) task.peakSpeed = task.speed;
        task.speedHistory = task.speedHistory || [];
        task.speedHistory.push({ time: Date.now(), speed: task.speed });
        if (task.speedHistory.length > 30) task.speedHistory.shift();
      }
      if (task.speed > 0 && task.totalBytes > task.downloadedBytes) {
        task.eta = Math.ceil((task.totalBytes - task.downloadedBytes) / task.speed);
      } else {
        task.eta = 0;
      }
      this.broadcastTelemetry();
    }, (logMsg, type) => {
      task.log(logMsg, type || 'info');
    });

    task.childProcess = child;

    child.on('error', (err) => {
      task.childProcess = null;
      if (task.status !== 'paused' && task.status !== 'cancelled') {
        task.status = 'error';
        task.error = `Video download process error: ${err.message}`;
        task.log(`Video download process error: ${err.message}`, 'error');
        this.saveState();
        this.broadcastTelemetry();
      }
    });

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
          const matchedFiles = files.filter(f => f.startsWith(safeTitlePrefix) && !f.endsWith('.part') && !f.endsWith('.ytdl'));
          matchedFiles.sort((a, b) => {
            try {
              return fs.statSync(path.join(task.saveDir, b)).mtimeMs - fs.statSync(path.join(task.saveDir, a)).mtimeMs;
            } catch (e) { return 0; }
          });
          const matched = matchedFiles[0];
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
      this.processQueue();
    });
  }

  isBanned() {
    return Boolean(this.licenseManager && this.licenseManager.isBanned());
  }

  // Cryptographic Defense-in-Depth: Validate token signature directly rather than trusting boolean flag alone
  isProVerified() {
    if (!this.licenseManager) return false;
    if (this.licenseManager.isBanned()) return false;
    if (this.licenseManager.isPro()) return true;
    try {
      if (this.licenseManager.licenseFile && fs.existsSync(this.licenseManager.licenseFile)) {
        const raw = JSON.parse(fs.readFileSync(this.licenseManager.licenseFile, 'utf-8'));
        if (raw && raw.token) {
          const check = this.licenseManager.verifyTokenSignature(raw.token);
          if (check.valid && (check.payload.edition === 'pro' || check.payload.edition === 'admin' || check.payload.edition === 'trial' || check.payload.features?.maxStreams === 64)) {
            return true;
          }
        }
      }
    } catch (e) {}
    return Boolean(this.licenseManager && (this.licenseManager.isPro() || this.licenseManager.license?.status === 'pro' || this.licenseManager.license?.status === 'grace' || this.licenseManager.license?.status === 'active' || this.licenseManager.license?.edition === 'pro'));
  }

  async addVideoDownload(options) {
    if (this.isBanned()) {
      throw new Error('This device is permanently banned by administrator. Video download engine is disabled.');
    }
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
    let chosenConnections = options.connections || this.settings.defaultConnections || 64;
    let chosenFormat = options.formatId || 'best';
    const isPro = this.isProVerified();

    if (!isPro) {
      chosenConnections = Math.min(chosenConnections, 4); // Free tier strictly capped to 4 streams
      // If user requested 1080p, 1440p, 4k, or 8k, free tier is capped to 720p HD!
      if (/1080|1440|2160|4k|8k|ultra/i.test(chosenFormat) || (!isAudio && chosenFormat === 'best')) {
        chosenFormat = 'bestvideo[height<=720]+bestaudio/best[height<=720]/best';
      }
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
      isPro,
      isVideoStream: true,
      formatId: chosenFormat,
      onProgress: (t) => {
        this.broadcastTelemetry();
        if (t && (t.status === 'completed' || t.status === 'error')) {
          this.processQueue();
        }
      }
    });

    this.tasks.set(task.id, task);
    this.saveState();

    const autoStart = options.autoStart ?? this.settings.autoStart ?? true;
    let running = 0;
    for (const t of this.tasks.values()) {
      if (t.status === 'downloading') running++;
    }
    const maxLimit = isPro ? (this.settings.maxConcurrentDownloads || 3) : 1;

    if (autoStart && running < maxLimit) {
      this.startVideoDownloadStream(task);
    } else {
      task.status = 'queued';
      if (running >= maxLimit) {
        task.log(`Task placed in queue (concurrency limit: ${maxLimit})`);
      }
    }
    this.saveState();
    return task.toJSON();
  }

  async addDownload(options) {
    if (this.isBanned()) {
      throw new Error('This device is permanently banned by administrator. Downloading is disabled.');
    }
    const isVideoSite = /youtube\.com|youtu\.be|facebook\.com|fb\.watch|instagram\.com|tiktok\.com|twitter\.com|x\.com|vimeo\.com/i.test(options.url);

    if (isVideoSite) {
      // Automatic video stream extraction for video sites!
      try {
        const info = await this.getVideoInfo(options.url);
        return await this.addVideoDownload({
          url: options.url,
          formatId: options.formatId || 'best',
          title: options.fileName || info.title,
          connections: options.connections || this.settings.defaultConnections || 64,
          saveDir: options.saveDir,
          category: options.category
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

    const isPro = this.isProVerified();
    let chosenConnections = options.connections || (isPro ? (this.settings.defaultConnections || 64) : 4);
    if (!isPro) {
      chosenConnections = Math.min(chosenConnections, 4); // Free tier strictly capped to 4 streams
    }

    const task = new DownloadTask({
      url: options.url,
      fileName: options.fileName,
      saveDir,
      isPro,
      connections: chosenConnections,
      speedLimit: isPro ? (this.settings.speedLimit || 0) * 1024 : 0,
      category: options.category || 'others',
      formatId: options.formatId || 'best',
      onProgress: (t) => {
        this.broadcastTelemetry();
        if (t && (t.status === 'completed' || t.status === 'error')) {
          this.processQueue();
        }
      }
    });

    this.tasks.set(task.id, task);
    this.saveState();

    const autoStart = options.autoStart ?? this.settings.autoStart ?? true;
    let running = 0;
    for (const t of this.tasks.values()) {
      if (t.status === 'downloading') running++;
    }
    const maxLimit = isPro ? (this.settings.maxConcurrentDownloads || 3) : 1;

    if (autoStart && running < maxLimit) {
      await task.start();
    } else {
      task.status = 'queued';
      if (running >= maxLimit) {
        task.log(`Task placed in queue (concurrency limit: ${maxLimit})`);
      }
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
    if (this.isBanned()) return false;
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
    if (this.isBanned()) return;
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
    if (this.isBanned()) {
      for (const task of this.tasks.values()) {
        if (task.status === 'downloading' || task.status === 'probing') {
          task.pause();
        }
      }
      return;
    }
    let running = 0;
    for (const task of this.tasks.values()) {
      if (task.status === 'downloading') running++;
    }

    // Free edition is strictly capped at 1 active download at a time! (PRO allows up to 10)
    const maxLimit = this.isProVerified() 
      ? (this.settings.maxConcurrentDownloads || 3) 
      : 1;

    if (running < maxLimit) {
      for (const task of this.tasks.values()) {
        if (task.status === 'queued') {
          if (task.isVideoStream || (task.id && task.id.startsWith('xdm_vid_'))) {
            this.startVideoDownloadStream(task);
          } else {
            task.start();
          }
          running++;
          if (running >= maxLimit) break;
        }
      }
    }
  }

  openFile(id) {
    const task = this.tasks.get(id);
    if (!task || !task.filePath || !fs.existsSync(task.filePath)) {
      throw new Error('File not found on disk');
    }

    // Windows native open with default registered application
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', '""', task.filePath], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
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

  checkScheduler() {
    if (!this.isProVerified() || !this.settings.schedulerEnabled) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const currentHHMM = `${hh}:${mm}`;

    if (this.settings.scheduleStartTime && currentHHMM === this.settings.scheduleStartTime && !this._scheduledStartDone) {
      this._scheduledStartDone = true;
      this.resumeAll();
      this.broadcast({
        type: 'NOTIFICATION',
        payload: { title: 'Scheduler Active', message: `Resumed downloads at scheduled time (${currentHHMM})` }
      });
    }

    if (this.settings.scheduleStopTime && currentHHMM === this.settings.scheduleStopTime && !this._scheduledStopDone) {
      this._scheduledStopDone = true;
      this.pauseAll();
      this.broadcast({
        type: 'NOTIFICATION',
        payload: { title: 'Scheduler Cutoff', message: `Paused downloads at scheduled cutoff time (${currentHHMM})` }
      });
    }

    if (this._lastCheckedMinute !== currentHHMM) {
      this._lastCheckedMinute = currentHHMM;
      if (currentHHMM !== this.settings.scheduleStartTime) this._scheduledStartDone = false;
      if (currentHHMM !== this.settings.scheduleStopTime) this._scheduledStopDone = false;
    }
  }

  checkAutoShutdown() {
    if (!this.isProVerified() || !this.settings.shutdownOnCompletion) return;
    if (this._shutdownScheduled) return;

    let hasActiveOrQueued = false;
    let hasCompleted = false;

    for (const task of this.tasks.values()) {
      if (task.status === 'downloading' || task.status === 'probing' || task.status === 'queued') {
        hasActiveOrQueued = true;
        break;
      }
      if (task.status === 'completed') {
        hasCompleted = true;
      }
    }

    if (hasActiveOrQueued) {
      this._hadActiveDownloadsBefore = true;
    }

    if (!hasActiveOrQueued && hasCompleted && this._hadActiveDownloadsBefore) {
      this.triggerAutoShutdown();
    }
  }

  triggerAutoShutdown() {
    if (this._shutdownScheduled) return;
    this._shutdownScheduled = true;
    this.broadcast({
      type: 'SHUTDOWN_WARNING',
      payload: {
        countdownSeconds: 60,
        message: 'All downloads finished. Windows will shut down in 60 seconds.'
      }
    });

    if (process.platform === 'win32') {
      exec('shutdown /s /t 60 /c "XDM Turbo: All downloads completed. Shutting down in 60 seconds. You can cancel from XDM."', (err) => {
        if (err) console.error('Shutdown error:', err);
      });
    }
  }

  cancelAutoShutdown() {
    this._shutdownScheduled = false;
    this._hadActiveDownloadsBefore = false;
    if (this.settings.shutdownOnCompletion) {
      this.saveSettings({ shutdownOnCompletion: false });
    }
    if (process.platform === 'win32') {
      exec('shutdown /a', (err) => {
        if (err) console.error('Cancel shutdown error:', err);
      });
    }
    this.broadcast({
      type: 'SHUTDOWN_CANCELLED',
      payload: { message: 'Auto-shutdown has been cancelled.' }
    });
    return true;
  }
}

module.exports = DownloadManager;
