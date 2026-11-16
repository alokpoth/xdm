const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const EXTENSION_ID = 'oglkcogpmnehcnhnaehelcikpijjblgc';
let VERSION = '1.1.0';

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

    // 2. Also register in Windows Registry for Chrome, Edge, and Brave safely without cmd.exe string injection
    const { execFileSync, spawn } = require('child_process');
    const regEntries = [
      ['HKCU\\Software\\Google\\Chrome\\Extensions\\' + EXTENSION_ID, 'path', extPath],
      ['HKCU\\Software\\Google\\Chrome\\Extensions\\' + EXTENSION_ID, 'version', VERSION],
      ['HKCU\\Software\\Microsoft\\Edge\\Extensions\\' + EXTENSION_ID, 'path', extPath],
      ['HKCU\\Software\\Microsoft\\Edge\\Extensions\\' + EXTENSION_ID, 'version', VERSION],
      ['HKCU\\Software\\BraveSoftware\\Brave-Browser\\Extensions\\' + EXTENSION_ID, 'path', extPath],
      ['HKCU\\Software\\BraveSoftware\\Brave-Browser\\Extensions\\' + EXTENSION_ID, 'version', VERSION],
      ['HKCU\\Software\\BraveSoftware\\Brave\\Extensions\\' + EXTENSION_ID, 'path', extPath],
      ['HKCU\\Software\\BraveSoftware\\Brave\\Extensions\\' + EXTENSION_ID, 'version', VERSION],
      // Allowlist policies so Chromium runs the extension without requiring manual developer mode
      ['HKCU\\Software\\Policies\\Google\\Chrome\\ExtensionInstallAllowlist', '1', EXTENSION_ID],
      ['HKCU\\Software\\Policies\\Google\\Chrome\\ExtensionInstallSources', '1', 'file:///*'],
      ['HKCU\\Software\\Policies\\Google\\Chrome\\ExtensionInstallSources', '2', 'http://127.0.0.1/*'],
      ['HKCU\\Software\\Policies\\Google\\Chrome\\ExtensionInstallSources', '3', 'http://localhost/*'],
      ['HKCU\\Software\\Policies\\Google\\Chrome\\ExtensionInstallSources', '4', 'https://xdm.zihan.xyz/*'],
      ['HKCU\\Software\\Policies\\Microsoft\\Edge\\ExtensionInstallAllowlist', '1', EXTENSION_ID],
      ['HKCU\\Software\\Policies\\Microsoft\\Edge\\ExtensionInstallSources', '1', 'file:///*'],
      ['HKCU\\Software\\Policies\\Microsoft\\Edge\\ExtensionInstallSources', '2', 'http://127.0.0.1/*'],
      ['HKCU\\Software\\Policies\\Microsoft\\Edge\\ExtensionInstallSources', '3', 'http://localhost/*'],
      ['HKCU\\Software\\Policies\\Microsoft\\Edge\\ExtensionInstallSources', '4', 'https://xdm.zihan.xyz/*'],
      ['HKCU\\Software\\Policies\\BraveSoftware\\Brave\\ExtensionInstallAllowlist', '1', EXTENSION_ID],
      ['HKCU\\Software\\Policies\\BraveSoftware\\Brave\\ExtensionInstallSources', '1', 'file:///*']
    ];

    for (const [key, valName, valData] of regEntries) {
      try {
        execFileSync('reg.exe', ['add', key, '/v', valName, '/t', 'REG_SZ', '/d', valData, '/f'], { windowsHide: true, stdio: 'ignore' });
      } catch (e) {}
    }

    return { success: true, message: 'External extensions JSON and Registry written successfully' };
  }

  getBrowserExe(browser = 'chrome') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    if (browser === 'brave') {
      const candidates = [
        path.join(progFiles, 'BraveSoftware/Brave-Browser/Application/brave.exe'),
        path.join(progFilesX86, 'BraveSoftware/Brave-Browser/Application/brave.exe'),
        path.join(localAppData, 'BraveSoftware/Brave-Browser/Application/brave.exe')
      ];
      for (const c of candidates) if (fs.existsSync(c)) return c;
      return 'brave';
    }
    if (browser === 'edge') {
      const candidates = [
        path.join(progFilesX86, 'Microsoft/Edge/Application/msedge.exe'),
        path.join(progFiles, 'Microsoft/Edge/Application/msedge.exe'),
        path.join(localAppData, 'Microsoft/Edge/Application/msedge.exe')
      ];
      for (const c of candidates) if (fs.existsSync(c)) return c;
      return 'msedge';
    }
    const candidates = [
      path.join(progFiles, 'Google/Chrome/Application/chrome.exe'),
      path.join(progFilesX86, 'Google/Chrome/Application/chrome.exe'),
      path.join(localAppData, 'Google/Chrome/Application/chrome.exe')
    ];
    for (const c of candidates) if (fs.existsSync(c)) return c;
    return 'chrome';
  }

  // Reveal the extension directory in Windows File Explorer so user can easily drag and drop into browser
  openExtensionFolder() {
    const extPath = this.extensionDir;
    try {
      if (process.platform === 'win32') {
        const { spawn } = require('child_process');
        spawn('explorer.exe', [extPath], { detached: true, stdio: 'ignore' }).unref();
        return true;
      }
    } catch (e) {}
    return false;
  }

  // Launch browser directly to extensions manager page (e.g. brave://extensions or chrome://extensions)
  openExtensionsPage(browser = 'chrome') {
    const browserExe = this.getBrowserExe(browser);
    const targetUrl = browser === 'brave' 
      ? 'brave://extensions' 
      : (browser === 'edge' ? 'edge://extensions' : 'chrome://extensions');

    const { spawn } = require('child_process');
    try {
      spawn(browserExe, [targetUrl], { detached: true, stdio: 'ignore' }).unref();
      return true;
    } catch (e) {
      try {
        spawn('cmd.exe', ['/c', 'start', browserExe, targetUrl], { detached: true, stdio: 'ignore' }).unref();
        return true;
      } catch (err) {
        return false;
      }
    }
  }

  // Open Chrome / Edge / Brave with the extension loaded
  openBrowserWithExtension(browser = 'chrome') {
    const extPath = this.extensionDir;
    const { spawn } = require('child_process');
    const browserExe = this.getBrowserExe(browser);

    try {
      spawn(browserExe, [
        `--load-extension=${extPath}`,
        '--no-default-browser-check',
        'http://localhost:19684'
      ], {
        detached: true,
        stdio: 'ignore'
      }).unref();
    } catch (e) {
      try {
        spawn('cmd.exe', ['/c', 'start', browserExe, 'http://localhost:19684'], { detached: true, stdio: 'ignore' }).unref();
      } catch (err) {}
    }
  }
}

module.exports = new BrowserInstaller();
