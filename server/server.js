const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const path = require('path');
const os = require('os');
const DownloadManager = require('./engine/DownloadManager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const manager = new DownloadManager();

app.use(cors());
app.use(express.json());

// WebSocket telemetry connection
wss.on('connection', (ws) => {
  manager.subscribe(ws);
});

// REST API Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', name: 'XDM Turbo Engine', version: '1.0.5' });
});

app.get('/api/default-dir', (req, res) => {
  const defaultDir = path.join(os.homedir(), 'Downloads');
  res.json({ defaultDir });
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
    const { url, formatId, title, saveDir } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const task = await manager.addVideoDownload({ url, formatId, title, saveDir });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to start video download' });
  }
});

app.post('/api/downloads', async (req, res) => {
  try {
    const { url, fileName, connections, saveDir, autoStart, category } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const task = await manager.addDownload({
      url,
      fileName,
      connections: parseInt(connections, 10) || 16,
      saveDir,
      autoStart,
      category
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

const browserInstaller = require('./utils/browserInstaller');

app.get('/api/extension/status', (req, res) => {
  res.json({
    installed: true,
    extensionId: 'oglkcogpmnehcnhnaehelcikpijjblgc',
    version: '1.0.3',
    path: path.resolve(__dirname, '../extension')
  });
});

app.post('/api/extension/auto-install', async (req, res) => {
  const result = await browserInstaller.registerInRegistry();
  res.json(result);
});

app.post('/api/extension/launch-browser', (req, res) => {
  const { browser } = req.body;
  browserInstaller.openBrowserWithExtension(browser);
  res.json({ success: true });
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
        alert('🚀 Sent to XDM Turbo Downloader: ' + url.split('/').pop());
      }).catch(err => {
        window.location.href = url; // fallback to browser download if XDM is not running
      });
    }
  }, true);
})();
`);
});

// Serve compiled static UI files if present
const distPath = path.join(__dirname, '../dist');
if (require('fs').existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/extension') && !req.path.startsWith('/ws')) {
      return res.sendFile(path.join(distPath, 'index.html'));
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
