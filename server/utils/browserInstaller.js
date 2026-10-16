const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const EXTENSION_ID = 'oglkcogpmnehcnhnaehelcikpijjblgc';

class BrowserInstaller {
  constructor() {
    this.extensionDir = path.resolve(__dirname, '../../extension');
  }

  // Auto register extension into Windows Registry for Chrome, Edge, and Brave using reg.exe
  async registerInRegistry() {
    if (process.platform !== 'win32') {
      return { success: false, message: 'Registry integration is only available on Windows' };
    }

    const extPath = this.extensionDir;
    const version = '1.0.1';

    const commands = [
      `reg.exe add "HKCU\\Software\\Google\\Chrome\\Extensions\\${EXTENSION_ID}" /v path /t REG_SZ /d "${extPath}" /f`,
      `reg.exe add "HKCU\\Software\\Google\\Chrome\\Extensions\\${EXTENSION_ID}" /v version /t REG_SZ /d "${version}" /f`,
      `reg.exe add "HKCU\\Software\\Microsoft\\Edge\\Extensions\\${EXTENSION_ID}" /v path /t REG_SZ /d "${extPath}" /f`,
      `reg.exe add "HKCU\\Software\\Microsoft\\Edge\\Extensions\\${EXTENSION_ID}" /v version /t REG_SZ /d "${version}" /f`,
      `reg.exe add "HKCU\\Software\\BraveSoftware\\Brave-Browser\\Extensions\\${EXTENSION_ID}" /v path /t REG_SZ /d "${extPath}" /f`,
      `reg.exe add "HKCU\\Software\\BraveSoftware\\Brave-Browser\\Extensions\\${EXTENSION_ID}" /v version /t REG_SZ /d "${version}" /f`
    ];

    return new Promise((resolve) => {
      exec(commands.join(' && '), (err, stdout) => {
        if (!err) {
          resolve({ success: true, message: 'Extension registered in Windows Registry for Chrome, Edge, and Brave!' });
        } else {
          resolve({ success: false, error: err.message });
        }
      });
    });
  }

  // Open Chrome / Edge directly with the extension loaded or to extensions page
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
