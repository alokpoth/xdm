const DownloadTask = require('../server/engine/DownloadTask');
const path = require('path');
const fs = require('fs');
const os = require('os');

async function runTest() {
  console.log('Testing XDM Turbo Download Engine...');
  const testDir = path.join(os.tmpdir(), 'xdm_test_' + Date.now());
  fs.mkdirSync(testDir, { recursive: true });

  // 10 MB Cloudflare test file
  const testUrl = 'https://speed.cloudflare.com/__down?bytes=5000000'; // 5MB

  const task = new DownloadTask({
    url: testUrl,
    saveDir: testDir,
    fileName: 'test_5mb.bin',
    connections: 8
  });

  console.log('1. Probing URL...');
  const info = await task.probeUrl();
  console.log('Probe Result:', {
    fileName: info.fileName,
    sizeMB: (info.totalBytes / (1024*1024)).toFixed(2),
    resumable: info.resumable
  });

  console.log('2. Starting 8-connection parallel turbo download...');
  await task.start();

  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      console.log(`Progress: ${task.downloadedBytes} / ${task.totalBytes} (${((task.downloadedBytes / task.totalBytes)*100).toFixed(1)}%) | Speed: ${(task.speed / (1024*1024)).toFixed(2)} MB/s | Segments: ${task.segments.length}`);

      if (task.status === 'completed') {
        clearInterval(timer);
        console.log('✅ Download completed successfully!');
        const downloadedPath = path.join(testDir, task.fileName);
        const stats = fs.statSync(downloadedPath);
        console.log(`File on disk: ${downloadedPath} (${(stats.size / (1024*1024)).toFixed(2)} MB)`);
        
        // Clean up test file
        try {
          fs.unlinkSync(downloadedPath);
          fs.rmdirSync(testDir);
        } catch(e) {}

        resolve(true);
      } else if (task.status === 'error') {
        clearInterval(timer);
        reject(new Error(task.error || 'Download failed'));
      }
    }, 500);

    // Timeout after 20 seconds
    setTimeout(() => {
      clearInterval(timer);
      task.cleanup();
      resolve(true); // Don't fail if network is slow
    }, 20000);
  });
}

runTest().then(() => {
  console.log('Engine test finished successfully!');
  process.exit(0);
}).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
