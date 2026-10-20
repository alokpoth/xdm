const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, Notification, clipboard } = require('electron');
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

// Performance & Memory flags for Chromium - Turbo launch & 60fps GPU acceleration
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('v8-cache-options', 'code');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('enable-fast-unload');
app.commandLine.appendSwitch('disable-breakpad');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('renderer-process-limit', '2');
app.commandLine.appendSwitch('disable-gpu-process-crash-limit');

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
    backgroundColor: '#070b13',
    show: false, // Avoid white/black flash, display instantly on dom-ready/ready-to-show
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      spellcheck: false, // Saves 30-50MB RAM
      backgroundThrottling: true // Reduce CPU/RAM when minimized
    },
    icon: fs.existsSync(iconPath) ? iconPath : pngIcon
  });

  // Security: Prevent window navigation to arbitrary external sites
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      if (parsed.origin !== 'http://127.0.0.1:5173' && parsed.origin !== 'http://127.0.0.1:19684' && parsed.origin !== 'http://localhost:19684') {
        event.preventDefault();
        shell.openExternal(navigationUrl);
      }
    } catch (e) {
      event.preventDefault();
    }
  });

  // Security: Prevent unconstrained child windows from opening
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Resilient window presentation: only display window when UI has fully painted to prevent white/black flash
  if (!isHidden) {
    let windowShown = false;
    const revealWindow = () => {
      if (!windowShown && mainWindow && !mainWindow.isDestroyed()) {
        windowShown = true;
        mainWindow.show();
        mainWindow.focus();
      }
    };

    const safetyRevealTimeout = setTimeout(revealWindow, 2500);

    mainWindow.webContents.once('did-finish-load', () => {
      clearTimeout(safetyRevealTimeout);
      setTimeout(revealWindow, 60);
    });
    mainWindow.webContents.once('dom-ready', () => {
      clearTimeout(safetyRevealTimeout);
      setTimeout(revealWindow, 120);
    });
  }

  // Security: Lock down DevTools in production packaged builds
  if (app.isPackaged) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });
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

  // Resilient rapid UI loader with backend readiness check
  let loadAttempts = 0;
  const maxAttempts = 60;

  const tryLoad = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    // In dev mode, probe Vite dev server first
    if (!app.isPackaged && process.env.NODE_ENV !== 'production') {
      http.get('http://127.0.0.1:5173', () => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL('http://127.0.0.1:5173');
      }).on('error', () => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL('http://127.0.0.1:19684');
      });
    } else {
      // In production packaged app, load the internal server directly
      mainWindow.loadURL('http://127.0.0.1:19684').catch(() => {});
    }
  };

  tryLoad();

  mainWindow.webContents.on('did-fail-load', () => {
    if (loadAttempts < maxAttempts) {
      loadAttempts++;
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          tryLoad();
        }
      }, 150);
    }
  });

  mainWindow.on('close', (event) => {
    if (app.isQuitting) {
      return;
    }
    // Always intercept close and hide to system tray so downloads continue in background
    event.preventDefault();
    mainWindow.hide();
  });
}

function createTray() {
  if (tray) return;

  const iconPath = getIconPath('icon.ico');
  const pngIcon = getIconPath('icon.png');
  const trayIcon = fs.existsSync(iconPath) ? iconPath : pngIcon;

  const updateContextMenu = () => {
    let isAutoStart = false;
    try {
      isAutoStart = Boolean(app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin);
    } catch (e) {}

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show XDM Turbo',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      {
        label: 'Add New Download...',
        click: () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            if (mainWindow.webContents) {
              mainWindow.webContents.send('tray:open-add-modal');
            }
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Pause All Downloads',
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
        label: 'Resume All Downloads',
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
        label: 'Start with Windows (Background)',
        type: 'checkbox',
        checked: isAutoStart,
        click: (menuItem) => {
          try {
            app.setLoginItemSettings({
              openAtLogin: menuItem.checked,
              openAsHidden: true,
              path: process.execPath,
              args: ['--hidden']
            });
          } catch (e) {}
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

    if (tray) tray.setContextMenu(contextMenu);
  };

  try {
    tray = new Tray(trayIcon);
    tray.setToolTip('XDM Turbo (Active in Background)');
    updateContextMenu();

    // Single-click on system tray toggles or shows main window
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          if (mainWindow.isFocused()) {
            mainWindow.hide();
          } else {
            mainWindow.focus();
          }
        } else {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });

    // Double-click opens & focuses main window
    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });

    tray.on('right-click', () => {
      updateContextMenu();
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
    // Always hide to tray so app stays active in background
    mainWindow.hide();
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
  if (!filePath || typeof filePath !== 'string') return 'Invalid file path';
  try {
    const ext = path.extname(filePath).toLowerCase();
    const dangerousExts = ['.bat', '.cmd', '.vbs', '.ps1', '.reg'];
    if (dangerousExts.includes(ext) && mainWindow) {
      const response = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Cancel', 'Run Script'],
        defaultId: 0,
        cancelId: 0,
        title: 'Security Notice',
        message: `The file "${path.basename(filePath)}" contains executable script code. Are you sure you want to run it?`
      });
      if (response.response !== 1) {
        return 'Execution cancelled by user';
      }
    }
    return await shell.openPath(filePath);
  } catch (e) {
    return e.message;
  }
});

ipcMain.handle('shell:show-item-in-folder', async (event, filePath) => {
  shell.showItemInFolder(filePath);
  return true;
});

ipcMain.handle('shell:open-external', async (event, url) => {
  try {
    if (!url || typeof url !== 'string') return false;
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      await shell.openExternal(parsed.href);
      return true;
    }
  } catch (e) {}
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

ipcMain.handle('app:show-notification', (event, { title, body, filePath }) => {
  try {
    if (Notification.isSupported()) {
      const iconPath = getIconPath('icon.png');
      const notif = new Notification({
        title: title || 'XDM Turbo',
        body: body || 'Download completed!',
        icon: fs.existsSync(iconPath) ? iconPath : undefined
      });
      if (filePath) {
        notif.on('click', () => {
          if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
          try {
            if (fs.existsSync(filePath)) {
              shell.showItemInFolder(filePath);
            } else {
              const parentDir = path.dirname(filePath);
              if (fs.existsSync(parentDir)) shell.openPath(parentDir);
            }
          } catch (e) {}
        });
      }
      notif.show();
      return true;
    }
  } catch (e) {
    console.error('Notification error:', e);
  }
  return false;
});

let clipboardMonitoringEnabled = true;
let lastClipboardText = '';

const DOWNLOAD_EXTS_REGEX = /\.(zip|rar|7z|tar|gz|bz2|iso|xz|tgz|exe|msi|dmg|pkg|deb|rpm|apk|pdf|doc|docx|xls|xlsx|ppt|pptx|mp4|mkv|avi|mov|flv|wmv|webm|mp3|wav|flac|aac|ogg|m4a|epub)(\?.*)?$/i;
const MEDIA_URL_REGEX = /(youtube\.com\/watch\?v=|youtu\.be\/|facebook\.com\/.*\/videos|fb\.watch\/|instagram\.com\/(reel|p)\/|tiktok\.com\/@.*\/video|twitter\.com\/.*\/status|x\.com\/.*\/status|vimeo\.com\/\d+)/i;

function startClipboardMonitor() {
  try {
    lastClipboardText = clipboard.readText().trim();
  } catch (e) {}

  setInterval(() => {
    if (!clipboardMonitoringEnabled || !mainWindow || mainWindow.isDestroyed()) return;
    try {
      const text = clipboard.readText().trim();
      if (!text || text === lastClipboardText) return;
      lastClipboardText = text;

      if (/^https?:\/\//i.test(text)) {
        if (DOWNLOAD_EXTS_REGEX.test(text) || MEDIA_URL_REGEX.test(text)) {
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('clipboard:url-detected', { url: text });
          }
        }
      }
    } catch (e) {}
  }, 1000);
}

ipcMain.handle('clipboard:set-monitoring', (event, enabled) => {
  clipboardMonitoringEnabled = Boolean(enabled);
  return clipboardMonitoringEnabled;
});

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.xdm.turbomanager');
  }
  if (!gotTheLock) return;
  createTray();
  createWindow();
  startClipboardMonitor();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
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
  if (app.isQuitting) {
    app.quit();
  }
  // In XDM Turbo, closing all windows keeps the background download engine and tray active!
});
