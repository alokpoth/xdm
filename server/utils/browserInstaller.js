const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const EXTENSION_ID = 'oglkcogpmnehcnhnaehelcikpijjblgc';
let VERSION = '1.0.7';

class BrowserInstaller {
  constructor() {
    if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'extension'))) {
      this.extensionDir = path.join(process.resourcesPath, 'extension');
    } else {
      this.extensionDir = path.resolve(__dirname, '../../extension');
    }

    try {
      const manifestPath = path.join(this.extensionDir, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (m.version) VERSION = m.version;
      }
    } catch (e) {}
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

    // 2. Also register in Windows Registry for Chrome and Edge
    const regCmds = [
      `reg add "HKCU\\Software\\Google\\Chrome\\Extensions\\${EXTENSION_ID}" /v path /t REG_SZ /d "${extPath}" /f`,
      `reg add "HKCU\\Software\\Google\\Chrome\\Extensions\\${EXTENSION_ID}" /v version /t REG_SZ /d "${VERSION}" /f`,
      `reg add "HKCU\\Software\\Microsoft\\Edge\\Extensions\\${EXTENSION_ID}" /v path /t REG_SZ /d "${extPath}" /f`,
      `reg add "HKCU\\Software\\Microsoft\\Edge\\Extensions\\${EXTENSION_ID}" /v version /t REG_SZ /d "${VERSION}" /f`,
      `reg add "HKCU\\Software\\Policies\\Google\\Chrome\\ExtensionInstallAllowlist" /v "1" /t REG_SZ /d "${EXTENSION_ID}" /f`,
      `reg add "HKCU\\Software\\Policies\\Microsoft\\Edge\\ExtensionInstallAllowlist" /v "1" /t REG_SZ /d "${EXTENSION_ID}" /f`
    ];

    for (const cmd of regCmds) {
      try {
        exec(cmd);
      } catch (e) {}
    }

    return { success: true, message: 'External extensions JSON and Registry written successfully' };
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
