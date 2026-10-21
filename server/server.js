const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const path = require('path');
const os = require('os');
const DownloadManager = require('./engine/DownloadManager');

const allowedOrigins = [
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^chrome-extension:\/\//,
  /^moz-extension:\/\//,
  /^vscode-webview:\/\//
];

const app = express();
const server = http.createServer(app);

// WebSocket telemetry connection with CSWSH protection
const wss = new WebSocketServer({
  server,
  verifyClient: (info, callback) => {
    const origin = info.origin || (info.req && info.req.headers && info.req.headers.origin);
    if (!origin) return callback(true); // Direct Electron / native IPC connection
    const isAllowed = allowedOrigins.some(pattern => pattern.test(origin));
    if (isAllowed) return callback(true);
    console.warn(`[Security] Blocked unauthorized WebSocket connection from origin: ${origin}`);
    return callback(false, 403, 'Forbidden Origin');
  }
});

const manager = new DownloadManager();

// Strict CORS: Only allow localhost, local dev server, and official browser extensions
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.some(pattern => pattern.test(origin));
    if (isAllowed) return callback(null, true);
    return callback(new Error('Cross-Origin Access Denied: External websites cannot control local XDM engine.'));
  },
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));

// Hard Ban Lockdown Middleware:
// If device is banned, all engine features, download endpoints, and controls are completely shut down
app.use('/api', (req, res, next) => {
  // Allow health check, checking license status, and checking unban status / activating valid token
  if (req.path === '/health' || req.path === '/license' || req.path === '/license/activate' || req.path === '/license/check-ban-status' || req.path === '/license/sync') {
    return next();
  }

  if (manager.licenseManager && manager.licenseManager.isBanned()) {
    const banInfo = manager.licenseManager.getBanInfo();
    return res.status(403).json({
      error: 'DEVICE_BANNED',
      message: 'This device is permanently banned by the license administrator. All download services, streams, and features are completely disabled.',
      deviceId: manager.licenseManager.deviceId,
      banReason: banInfo?.reason || 'Administrative hardware ban',
      isBanned: true
    });
  }
  next();
});

// WebSocket telemetry connection
wss.on('connection', (ws) => {
  manager.subscribe(ws);
});

// REST API Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', name: 'XDM Turbo Engine', version: '1.0.11' });
});

app.get('/api/default-dir', (req, res) => {
  try {
    const home = os.homedir() || process.env.USERPROFILE || process.env.HOME || '.';
    const defaultDir = path.join(home, 'Downloads');
    res.json({ defaultDir });
  } catch (e) {
    res.json({ defaultDir: '.' });
  }
});

app.get('/api/downloads', (req, res) => {
  res.json({
    downloads: manager.getAllDownloads(),
    stats: manager.getGlobalStats()
  });
});

app.post('/api/probe', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const info = await manager.probeUrl(url);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to probe URL' });
  }
});

app.post('/api/video/info', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const info = await manager.getVideoInfo(url);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to extract video info' });
  }
});

app.post('/api/video/download', async (req, res) => {
  try {
    const { url, formatId, title, saveDir, connections } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const isFromExtension = req.headers['x-xdm-source'] === 'extension' || 
                            req.body.isFromExtension || 
                            (req.headers['origin'] && req.headers['origin'].includes('chrome-extension://'));

    if (isFromExtension && !manager.isProVerified()) {
      manager.broadcast({ type: 'PRO_REQUIRED', feature: 'extension' });
      return res.status(403).json({ 
        success: false, 
        error: 'Browser Video Sniffer & 4K Grabber is an XDM Turbo PRO exclusive feature. Please upgrade to PRO to download videos directly from browsers.',
        proRequired: true
      });
    }

    // If url is a direct media stream (e.g. from Instagram CDN, Facebook CDN, or raw MP4), route to Turbo engine
    if (url.includes('.mp4') || url.includes('cdninstagram.com') || url.includes('fbcdn.net') || url.includes('mime=video') || url.includes('bytestart=')) {
      const cleanTitle = (title || 'Video_Download').replace(/[<>:"/\\|?*]+/g, '_').trim();
      const task = await manager.addDownload({
        url,
        fileName: `${cleanTitle}.mp4`,
        connections: parseInt(connections, 10) || (manager.isProVerified() ? 64 : 4),
        saveDir,
        autoStart: true
      });
      return res.json(task);
    }

    const task = await manager.addVideoDownload({ 
      url, 
      formatId, 
      title, 
      saveDir, 
      connections: parseInt(connections, 10) || (manager.isProVerified() ? 64 : 4) 
    });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to start video download' });
  }
});

app.post('/api/downloads', async (req, res) => {
  try {
    const { url, fileName, connections, saveDir, autoStart, category, formatId } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const isFromExtension = req.headers['x-xdm-source'] === 'extension' || 
                            req.body.isFromExtension || 
                            (req.headers['origin'] && req.headers['origin'].includes('chrome-extension://'));

    if (isFromExtension && !manager.isProVerified()) {
      manager.broadcast({ type: 'PRO_REQUIRED', feature: 'extension' });
      return res.status(403).json({ 
        success: false, 
        error: 'Browser Extension download capture is an XDM Turbo PRO exclusive feature. Please upgrade to PRO to unlock seamless 1-click browser integration.',
        proRequired: true
      });
    }

    const task = await manager.addDownload({
      url,
      fileName,
      connections: parseInt(connections, 10) || (manager.isProVerified() ? 64 : 4),
      saveDir,
      autoStart,
      category,
      formatId
    });

    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/downloads/:id/pause', (req, res) => {
  const success = manager.pauseDownload(req.params.id);
  res.json({ success });
});

app.post('/api/downloads/:id/resume', (req, res) => {
  const success = manager.resumeDownload(req.params.id);
  res.json({ success });
});

app.post('/api/downloads/:id/restart', (req, res) => {
  const success = manager.restartDownload(req.params.id);
  res.json({ success });
});

app.delete('/api/downloads/:id', (req, res) => {
  const deleteFile = req.query.deleteFile === 'true';
  const success = manager.deleteDownload(req.params.id, deleteFile);
  res.json({ success });
});

app.post('/api/downloads/:id/open', (req, res) => {
  try {
    manager.openFile(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/downloads/:id/open-folder', (req, res) => {
  try {
    manager.openFolder(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/downloads/pause-all', (req, res) => {
  manager.pauseAll();
  res.json({ success: true });
});

app.post('/api/downloads/resume-all', (req, res) => {
  manager.resumeAll();
  res.json({ success: true });
});

app.post('/api/downloads/clear-finished', (req, res) => {
  manager.clearFinished();
  res.json({ success: true });
});

app.get('/api/settings', (req, res) => {
  res.json(manager.settings);
});

app.post('/api/settings', (req, res) => {
  manager.saveSettings(req.body);
  res.json(manager.settings);
});

app.get('/api/stats', (req, res) => {
  res.json(manager.getGlobalStats());
});

app.post('/api/shutdown/cancel', (req, res) => {
  const success = manager.cancelAutoShutdown();
  res.json({ success });
});

function compareSemver(v1, v2) {
  const p1 = (v1 || '').replace(/^[^\d]*/, '').split('.').map(n => parseInt(n, 10) || 0);
  const p2 = (v2 || '').replace(/^[^\d]*/, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

app.get('/api/check-update', (req, res) => {
  const currentVersion = '1.0.11';
  const https = require('https');
  
  // Probe official GitLab API for latest release tags
  const glReq = https.get('https://gitlab.com/api/v4/projects/zihanfakir%2Fxdm/releases', {
    headers: {
      'User-Agent': 'XDM-Turbo-Client/1.0.11',
      'Accept': 'application/json'
    },
    timeout: 7000
  }, (glRes) => {
    let raw = '';
    glRes.on('data', chunk => raw += chunk);
    glRes.on('end', () => {
      try {
        if (glRes.statusCode === 200) {
          const releases = JSON.parse(raw);
          if (Array.isArray(releases) && releases.length > 0) {
            const latest = releases[0];
            const latestTag = (latest.tag_name || '').replace(/^v/i, '');
            const isNewer = compareSemver(latestTag, currentVersion) > 0;
            return res.json({
              updateAvailable: isNewer,
              currentVersion,
              latestVersion: latestTag || currentVersion,
              releaseName: latest.name || `Version ${latestTag}`,
              releaseNotes: latest.description || '',
              downloadUrl: 'https://gitlab.com/zihanfakir/xdm/-/raw/main/release/XDM.Turbo.Setup.1.0.11.exe?inline=false',
              publishedAt: latest.released_at || latest.created_at
            });
          }
        }
        return res.json({
          updateAvailable: false,
          currentVersion,
          latestVersion: currentVersion,
          message: 'Up to date'
        });
      } catch (e) {
        return res.json({ updateAvailable: false, currentVersion, error: e.message });
      }
    });
  });

  glReq.on('error', () => {
    res.json({ updateAvailable: false, currentVersion, offline: true });
  });

  glReq.on('timeout', () => {
    glReq.destroy();
    res.json({ updateAvailable: false, currentVersion, timeout: true });
  });
});

// License API Endpoints
app.get('/api/license', (req, res) => {
  res.json(manager.licenseManager.getStatus());
});

app.post('/api/license/activate', async (req, res) => {
  try {
    const { key, customerName, email } = req.body;
    if (!key) return res.status(400).json({ success: false, error: 'License key is required' });
    const result = await manager.licenseManager.activate(key, customerName, email);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/license/deactivate', async (req, res) => {
  try {
    const result = await manager.licenseManager.deactivate();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/license/check-ban-status', async (req, res) => {
  try {
    const result = await manager.licenseManager.checkOnlineUnbanStatus();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/license/sync', async (req, res) => {
  try {
    await manager.licenseManager.syncWithServer();
    res.json({ success: true, license: manager.licenseManager.getStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const browserInstaller = require('./utils/browserInstaller');

app.get('/api/extension/status', (req, res) => {
  const extPath = path.resolve(__dirname, '../extension');
  res.json({
    installed: true,
    extensionId: 'oglkcogpmnehcnhnaehelcikpijjblgc',
    version: '1.0.11',
    path: extPath,
    extensionDir: extPath
  });
});

app.post('/api/extension/auto-install', async (req, res) => {
  const result = await browserInstaller.registerInRegistry();
  res.json(result);
});

app.post('/api/extension/launch-browser', (req, res) => {
  const { browser } = req.body;
  const safeBrowser = ['chrome', 'edge', 'brave'].includes(String(browser || '').toLowerCase())
    ? String(browser).toLowerCase()
    : 'chrome';
  browserInstaller.openBrowserWithExtension(safeBrowser);
  res.json({ success: true });
});

app.post('/api/extension/open-folder', (req, res) => {
  const success = browserInstaller.openExtensionFolder();
  res.json({ success, path: browserInstaller.extensionDir });
});

app.post('/api/extension/open-extensions-page', (req, res) => {
  const { browser } = req.body;
  const safeBrowser = ['chrome', 'edge', 'brave'].includes(String(browser || '').toLowerCase())
    ? String(browser).toLowerCase()
    : 'chrome';
  const success = browserInstaller.openExtensionsPage(safeBrowser);
  res.json({ success });
});

// Browser Integration Script (Tampermonkey / Userscript to intercept all downloads into XDM)
app.get('/extension/xdm-helper.user.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`// ==UserScript==
// @name         XDM Download Manager Browser Interceptor
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Intercepts download links and sends them directly to XDM Turbo Download Manager!
// @author       XDM
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// ==/UserScript==

(function() {
  'use strict';
  const XDM_PORT = 19684;
  const DOWNLOAD_EXTS = ['.zip', '.rar', '.7z', '.tar', '.gz', '.iso', '.exe', '.msi', '.apk', '.mp4', '.mkv', '.mp3', '.pdf'];

  document.addEventListener('click', function(e) {
    let target = e.target.closest('a');
    if (!target || !target.href) return;

    const url = target.href;
    const isDownload = DOWNLOAD_EXTS.some(ext => url.toLowerCase().split('?')[0].endsWith(ext));

    if (isDownload) {
      e.preventDefault();
      e.stopPropagation();

      fetch(\`http://127.0.0.1:\${XDM_PORT}/api/downloads\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, autoStart: true })
      }).then(() => {
        alert('Sent to XDM Turbo Downloader: ' + url.split('/').pop());
      }).catch(err => {
        window.location.href = url; // fallback to browser download if XDM is not running
      });
    }
  }, true);
})();
`);
});

// Start Central Licensing Service on port 19685 in local dev/standalone mode
try {
  const { startServer } = require('../license-server/server');
  startServer(process.env.LICENSE_SERVER_PORT || 19685).catch(() => {});
} catch (e) {
  console.log('[Licensing Server] Running in external mode');
}

// Serve compiled static UI files if present (supports dev, standalone, and packaged Electron asar)
const candidateDistPaths = [
  path.join(__dirname, '../dist'),
  path.join(__dirname, 'dist'),
  path.join(process.resourcesPath || '', 'app.asar', 'dist'),
  path.join(process.resourcesPath || '', 'dist')
];
let activeDistPath = null;
const fsCore = require('fs');
for (const p of candidateDistPaths) {
  if (p && fsCore.existsSync(p) && fsCore.existsSync(path.join(p, 'index.html'))) {
    activeDistPath = p;
    break;
  }
}
if (activeDistPath) {
  app.use(express.static(activeDistPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/extension') && !req.path.startsWith('/ws')) {
      return res.sendFile(path.join(activeDistPath, 'index.html'));
    }
    next();
  });
}

const PORT = 19684;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[XDM Core Engine] Port ${PORT} is already running. Using existing instance.`);
  } else {
    console.error('[XDM Core Engine Error]', err);
  }
});

server.listen(PORT, () => {
  console.log(`[XDM Core Engine] Listening on http://127.0.0.1:${PORT}`);
});
