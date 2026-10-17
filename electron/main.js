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

  // Start internal backend server
  try {
    require('../server/server.js');
  } catch (e) {
    console.error('Failed to require server:', e);
  }

  // Auto-register browser extension in Windows Registry
  try {
    const browserInstaller = require('../server/utils/browserInstaller');
    browserInstaller.registerInRegistry();
  } catch (e) {}
}

function createWindow() {
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    },
    icon: fs.existsSync(iconPath) ? iconPath : pngIcon
  });

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

  // Resilient UI loader: wait for local server to be ready before showing
  let loadAttempts = 0;
  const maxAttempts = 40;

  const tryLoad = () => {
    // First check if Vite dev server is running
    http.get('http://127.0.0.1:5173', () => {
      mainWindow.loadURL('http://127.0.0.1:5173');
    }).on('error', () => {
      // Otherwise check local Express engine
      http.get('http://127.0.0.1:19684/api/stats', () => {
        mainWindow.loadURL('http://127.0.0.1:19684');
      }).on('error', () => {
        if (++loadAttempts < maxAttempts) {
          setTimeout(tryLoad, 250);
        } else {
          mainWindow.loadURL('http://127.0.0.1:19684');
        }
      });
    });
  };

  tryLoad();

  mainWindow.webContents.on('did-fail-load', () => {
    setTimeout(() => {
      if (mainWindow) mainWindow.loadURL('http://127.0.0.1:19684');
    }, 600);
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      if (tray) {
        event.preventDefault();
        mainWindow.hide();
      } else {
        app.isQuitting = true;
        app.quit();
      }
    }
    return false;
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

app.whenReady().then(() => {
  if (!gotTheLock) return;
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running in background tray
  }
});
