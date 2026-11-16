const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

try {
  run('python scripts/generate_icons.py');
  run('python scripts/generate_installer_graphics.py');
  run('npm run build');
  run('node scripts/build-bytecode.js');
  run('node scripts/patch-nsis.js');
  run('npx electron-builder --win');
} finally {
  // Always restore readable JS sources cleanly even if build fails
  try {
    run('node scripts/restore-source.js');
  } catch (restoreErr) {
    console.error('[dist-win] Failed to restore sources:', restoreErr.message);
  }
}

run('powershell -NoProfile -ExecutionPolicy Bypass -File scripts/create-and-sign.ps1');

const setupSrc = path.join(ROOT, 'release', `XDM Turbo Setup ${VERSION}.exe`);
const setupDst = path.join(ROOT, 'release', `XDM.Turbo.Setup.${VERSION}.exe`);
const portSrc = path.join(ROOT, 'release', `XDM Turbo ${VERSION}.exe`);
const portDst = path.join(ROOT, 'release', `XDM.Turbo.${VERSION}.exe`);

if (fs.existsSync(setupSrc)) fs.copyFileSync(setupSrc, setupDst);
if (fs.existsSync(portSrc)) fs.copyFileSync(portSrc, portDst);

// Repackage Chromium extension ZIP for release & docs
const extZipRelease = path.join(ROOT, 'release', 'xdm-turbo-extension.zip');
const extZipDocs = path.join(ROOT, 'docs', 'xdm-turbo-extension.zip');
run(`powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path 'extension\\*' -DestinationPath '${extZipRelease}' -Force"`);
fs.copyFileSync(extZipRelease, extZipDocs);

console.log(`\n[dist-win] Release v${VERSION} artifacts ready in release/ and docs/!`);
