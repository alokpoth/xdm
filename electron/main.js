const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu } = require('electron');
const path = require('path');
const http = require('http');

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
    icon: path.join(__dirname, '../public/icon.png')
  });

  // Load UI from local engine or vite
  const loadApp = () => {
    http.get('http://localhost:5173', () => {
      mainWindow.loadURL('http://localhost:5173');
    }).on('error', () => {
      mainWindow.loadURL('http://localhost:19684');
    });
  };
  setTimeout(loadApp, 400);

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

function createTray() {
  // Simple tray menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open XDM',
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
      label: 'Quit XDM',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  try {
    tray = new Tray(path.join(__dirname, '../public/favicon.ico'));
    tray.setToolTip('XDM Turbo Download Manager');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (e) {
    // Tray icon may not exist yet
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

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.hide();
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
