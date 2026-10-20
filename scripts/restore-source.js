/**
 *  XDM Turbo — Source Restoration Utility
 * 
 * Restores original plain JavaScript files from .orig backups after production
 * packaging, and removes temporary .jsc files from the working directory.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

const TARGET_FILES = [
  'server/engine/LicenseManager.js',
  'server/engine/DownloadManager.js',
  'server/engine/DownloadTask.js',
  'server/engine/VideoDownloader.js',
  'server/server.js',
  'electron/main.js'
];

function restoreAll() {
  console.log('\n============================================================');
  console.log(' XDM TURBO — RESTORING SOURCE CODE FROM BACKUP');
  console.log('============================================================\n');

  for (const relPath of TARGET_FILES) {
    const fullPath = path.join(ROOT_DIR, relPath);
    const origPath = fullPath + '.orig';
    const jscPath = fullPath.replace(/\.js$/, '.jsc');

    // Restore original file
    if (fs.existsSync(origPath)) {
      fs.copyFileSync(origPath, fullPath);
      fs.unlinkSync(origPath);
      console.log(`[Restored] ${relPath}`);
    }

    // Clean up .jsc from working directory
    if (fs.existsSync(jscPath)) {
      fs.unlinkSync(jscPath);
    }
  }

  console.log('\n Source code restored to clean editable state.');
  console.log('============================================================\n');
}

restoreAll();
