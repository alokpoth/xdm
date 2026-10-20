/**
 * ⚡ XDM Turbo — V8 Bytecode Compiler (Bytenode)
 * 
 * Compiles critical proprietary JavaScript source code into native V8 bytecode (.jsc).
 * Strips plain text JavaScript from the production ASAR package so reverse-engineering
 * and code tampering become mathematically impractical.
 */

const fs = require('fs');
const path = require('path');
const bytenode = require('bytenode');
const electronPath = require('electron');

const ROOT_DIR = path.resolve(__dirname, '..');

const TARGET_FILES = [
  'server/engine/LicenseManager.js',
  'server/engine/DownloadManager.js',
  'server/engine/DownloadTask.js',
  'server/engine/VideoDownloader.js',
  'server/server.js',
  'electron/main.js'
];

async function compileAll() {
  console.log('============================================================');
  console.log('🔒 XDM TURBO — COMPILING TO V8 BINARY BYTECODE (BYTENODE)');
  console.log('   Target Electron Binary:', electronPath);
  console.log('============================================================\n');

  for (const relPath of TARGET_FILES) {
    const fullPath = path.join(ROOT_DIR, relPath);
    const origPath = fullPath + '.orig';
    const jscPath = fullPath.replace(/\.js$/, '.jsc');
    const isMainProcess = relPath === 'electron/main.js';

    if (!fs.existsSync(fullPath)) {
      console.warn(`[Skip] File not found: ${relPath}`);
      continue;
    }

    // Step 1: Backup original JS file
    fs.copyFileSync(fullPath, origPath);

    // Step 2: Compile original code to V8 Bytecode using Electron's exact V8 engine
    process.stdout.write(`⚙️  Compiling ${relPath} -> ${path.basename(jscPath)} ... `);
    await bytenode.compileFile({
      filename: origPath,
      output: jscPath,
      compileAsModule: true,
      electronMain: true,
      electronPath: electronPath
    });

    const jscSize = fs.statSync(jscPath).size;
    console.log(`[DONE] (${(jscSize / 1024).toFixed(1)} KB binary bytecode)`);

    // Step 3: Replace .js with minimal bytenode loader bootstrap
    const jscFileName = path.basename(jscPath);
    let loaderContent = '';
    if (isMainProcess) {
      loaderContent = `// XDM Turbo Protected Binary Bootstrap\nrequire('bytenode');\nrequire('./${jscFileName}');\n`;
    } else {
      loaderContent = `// XDM Turbo Protected Binary Bootstrap\nrequire('bytenode');\nmodule.exports = require('./${jscFileName}');\n`;
    }

    fs.writeFileSync(fullPath, loaderContent, 'utf-8');
  }

  console.log('\n✅ All critical files compiled into V8 Bytecode (.jsc)!');
  console.log('🛡️  Plain text JavaScript has been replaced with binary bytecode.');
  console.log('============================================================\n');
}

compileAll().catch(err => {
  console.error('\n❌ Bytecode compilation error:', err);
  process.exit(1);
});
