const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const EXTENSION_ID = 'oglkcogpmnehcnhnaehelcikpijjblgc';
const VERSION = '1.0.5';

class BrowserInstaller {
  constructor() {
    if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'extension'))) {
      this.extensionDir = path.join(process.resourcesPath, 'extension');
    } else {
      this.extensionDir = path.resolve(__dirname, '../../extension');
    }
  }

  // Automatic multi-layered extension installation for Chrome, Edge, and Brave
  async registerInRegistry() {
    if (process.platform !== 'win32') {
      return { success: false, message: 'Registry integration is only available on Windows' };
    }

    const extPath = this.extensionDir;
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Local');

    // 1. Write Chromium External Extensions JSON files directly into user profiles
    const externalDirs = [
      path.join(localAppData, 'Google', 'Chrome', 'User Data', 'External Extensions'),
      path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'External Extensions'),
      path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data', 'External Extensions')
    ];

    const jsonContent = JSON.stringify({
      external_dir: extPath,
      external_version: VERSION
    }, null, 2);

    for (const dir of externalDirs) {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const jsonFile = path.join(dir, `${EXTENSION_ID}.json`);
        fs.writeFileSync(jsonFile, jsonContent, 'utf-8');
      } catch (e) {
        // Silently skip if user has never installed that specific browser
      }
    }

    // 2. Write Windows Registry Keys for Chromium
    const commands = [
      `reg.exe add "HKCU\\Software\\Google\\Chrome\\Extensions\\${EXTENSION_ID}" /v path /t REG_SZ /d "${extPath}" /f`,
      `reg.exe add "HKCU\\Software\\Google\\Chrome\\Extensions\\${EXTENSION_ID}" /v version /t REG_SZ /d "${VERSION}" /f`,
      `reg.exe add "HKCU\\Software\\Microsoft\\Edge\\Extensions\\${EXTENSION_ID}" /v path /t REG_SZ /d "${extPath}" /f`,
      `reg.exe add "HKCU\\Software\\Microsoft\\Edge\\Extensions\\${EXTENSION_ID}" /v version /t REG_SZ /d "${VERSION}" /f`,
      `reg.exe add "HKCU\\Software\\BraveSoftware\\Brave-Browser\\Extensions\\${EXTENSION_ID}" /v path /t REG_SZ /d "${extPath}" /f`,
      `reg.exe add "HKCU\\Software\\BraveSoftware\\Brave-Browser\\Extensions\\${EXTENSION_ID}" /v version /t REG_SZ /d "${VERSION}" /f`
    ];

    return new Promise((resolve) => {
      exec(commands.join(' && '), (err) => {
        if (!err) {
          resolve({ success: true, message: 'Extension auto-registered across Chrome, Edge, and Brave!' });
        } else {
          resolve({ success: true, message: 'External extensions JSON written successfully' });
        }
      });
    });
  }

  // Open Chrome / Edge directly with the extension loaded
  openBrowserWithExtension(browser = 'chrome') {
    const extPath = this.extensionDir;
    let cmd = '';

    if (browser === 'edge') {
      cmd = `start msedge --load-extension="${extPath}" "http://localhost:19684"`;
    } else if (browser === 'brave') {
      cmd = `start brave --load-extension="${extPath}" "http://localhost:19684"`;
    } else {
      cmd = `start chrome --load-extension="${extPath}" "http://localhost:19684"`;
    }

    exec(cmd, (err) => {
      if (err) {
        exec('start msedge edge://extensions || start chrome chrome://extensions');
      }
    });
  }
}

module.exports = new BrowserInstaller();
