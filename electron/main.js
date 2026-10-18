const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

function getIconPath(fileName = 'icon.ico') {
  const candidates = [
    path.join(__dirname, '../public', fileName),
    path.join(__dirname, '../dist', fileName),
    path.join(process.resourcesPath || '', 'public', fileName),
    path.join(process.resourcesPath || '', fileName),
    path.join(__dirname, fileName)
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(__dirname, '../public', fileName);
}

// Performance & Memory flags for Chromium - Turbo launch & sub-1s cold start
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,SpareRendererForSitePerProcess');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('v8-cache-options', 'code');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('enable-fast-unload');
app.commandLine.appendSwitch('disable-breakpad');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');
app.commandLine.appendSwitch('renderer-process-limit', '2');

// Ignore EADDRINUSE silently if already running
process.on('uncaughtException', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    return;
  }
  console.error('Unhandled Exception in Main:', err);
});

// Enforce single instance - second instance focuses existing window
const gotTheLock = app.requestSingleInstanceLock();

let mainWindow = null;
let tray = null;
let serverProcess = null;

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  // Start internal backend server immediately
  try {
    require('../server/server.js');
  } catch (e) {
    console.error('Failed to require server:', e);
  }

  // Defer Windows Registry browser integration so it never delays window launch
  setTimeout(() => {
    try {
      const browserInstaller = require('../server/utils/browserInstaller');
      browserInstaller.registerInRegistry();
    } catch (e) {}
  }, 2500);
}

function createWindow() {
  const isHidden = process.argv.includes('--hidden') || process.argv.includes('--minimized');
  const iconPath = getIconPath('icon.ico');
  const pngIcon = getIconPath('icon.png');

  mainWindow = new BrowserWindow({
    width: 1240,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    frame: false, // Sleek modern frameless window with custom titlebar
    titleBarStyle: 'hidden',
    backgroundColor: '#0b0f17',
    show: false, // Avoid white/black flash, display instantly on dom-ready/ready-to-show
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      spellcheck: false, // Saves 30-50MB RAM
      backgroundThrottling: true // Reduce CPU/RAM when minimized
    },
    icon: fs.existsSync(iconPath) ? iconPath : pngIcon
  });

  // Ultra-fast sub-second display: show on dom-ready with dark canvas, or ready-to-show
  if (!isHidden) {
    let windowShown = false;
    const revealWindow = () => {
      if (!windowShown && mainWindow) {
        windowShown = true;
        mainWindow.show();
        mainWindow.focus();
      }
    };

    mainWindow.webContents.once('dom-ready', revealWindow);
    mainWindow.once('ready-to-show', revealWindow);
    // Instant fallback guarantee
    setTimeout(revealWindow, 350);
  }

  // Track maximize state and send to renderer
  mainWindow.on('maximize', () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('window:maximized-changed', true);
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('window:maximized-changed', false);
    }
  });

  // Resilient rapid UI loader
  let loadAttempts = 0;
  const maxAttempts = 50;

  const tryLoad = () => {
    // In dev mode, probe Vite dev server first
    if (!app.isPackaged && process.env.NODE_ENV !== 'production') {
      http.get('http://127.0.0.1:5173', () => {
        mainWindow.loadURL('http://127.0.0.1:5173');
      }).on('error', () => {
        mainWindow.loadURL('http://127.0.0.1:19684');
      });
    } else {
      // In production packaged app, load the internal engine immediately for sub-1s launch!
      mainWindow.loadURL('http://127.0.0.1:19684');
    }
  };

  tryLoad();

  mainWindow.webContents.on('did-fail-load', () => {
    setTimeout(() => {
      if (mainWindow) mainWindow.loadURL('http://127.0.0.1:19684');
    }, 150);
  });

  mainWindow.on('close', (event) => {
    if (app.isQuitting) {
      return;
    }
    if (tray) {
      event.preventDefault();
      mainWindow.hide();
    } else {
      app.isQuitting = true;
      app.quit();
    }
  });
}

function createTray() {
  const iconPath = getIconPath('icon.ico');
  const pngIcon = getIconPath('icon.png');
  const trayIcon = fs.existsSync(iconPath) ? iconPath : pngIcon;

  // Simple tray menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open XDM Turbo',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Pause All',
      click: () => {
        http.request({
          hostname: '127.0.0.1',
          port: 19684,
          path: '/api/downloads/pause-all',
          method: 'POST'
        }).end();
      }
    },
    {
      label: 'Resume All',
      click: () => {
        http.request({
          hostname: '127.0.0.1',
          port: 19684,
          path: '/api/downloads/resume-all',
          method: 'POST'
        }).end();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit XDM Turbo',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  try {
    tray = new Tray(trayIcon);
    tray.setToolTip('XDM Turbo Download Manager');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (e) {
    console.error('Tray creation failed:', e.message);
  }
}

// Window control IPC handlers
ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.handle('window:close', () => {
  if (mainWindow) {
    if (tray) {
      mainWindow.hide();
    } else {
      app.isQuitting = true;
      app.quit();
    }
  }
});

ipcMain.handle('dialog:open-directory', async (event, defaultPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: defaultPath || app.getPath('downloads')
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('shell:open-path', async (event, filePath) => {
  return await shell.openPath(filePath);
});

ipcMain.handle('shell:show-item-in-folder', async (event, filePath) => {
  shell.showItemInFolder(filePath);
  return true;
});

ipcMain.handle('shell:open-external', async (event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

ipcMain.handle('app:get-auto-start', () => {
  try {
    const settings = app.getLoginItemSettings({
      args: ['--hidden']
    });
    return settings.openAtLogin;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('app:set-auto-start', (event, openAtLogin) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(openAtLogin),
      openAsHidden: true,
      path: process.execPath,
      args: ['--hidden']
    });
    return app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin;
  } catch (e) {
    return false;
  }
});

app.whenReady().then(() => {
  if (!gotTheLock) return;
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('will-quit', () => {
  if (tray) {
    try { tray.destroy(); } catch (e) {}
    tray = null;
  }
});

app.on('window-all-closed', () => {
  if (app.isQuitting || !tray) {
    app.quit();
  }
});
