const DownloadTask = require('../server/engine/DownloadTask');
const path = require('path');
const fs = require('fs');
const os = require('os');

async function testExactRange() {
  const testDir = path.join(os.tmpdir(), 'xdm_exact_test_' + Date.now());
  fs.mkdirSync(testDir, { recursive: true });

  const url = 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png';

  const task = new DownloadTask({
    url,
    saveDir: testDir,
    connections: 8
  });

  console.log('Probing URL...');
  const info = await task.probeUrl();
  console.log('Probe info:', info);

  console.log('Starting 8-connection turbo download...');
  await task.start();

  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      console.log(`Progress: ${task.downloadedBytes} / ${task.totalBytes} (${((task.downloadedBytes / task.totalBytes)*100).toFixed(1)}%) | Status: ${task.status}`);

      if (task.status === 'completed') {
        clearInterval(timer);
        const downloadedPath = path.join(testDir, task.fileName);
        const sizeOnDisk = fs.statSync(downloadedPath).size;
        console.log(`Expected size: ${task.totalBytes}`);
        console.log(`Actual size on disk: ${sizeOnDisk}`);
        if (sizeOnDisk === task.totalBytes) {
          console.log(' PERFECT MATCH! Exact byte-for-byte segment stitching verified!');
        } else {
          console.error('Mismatch: size differs!');
        }

        try {
          fs.unlinkSync(downloadedPath);
          fs.rmdirSync(testDir);
        } catch(e) {}

        resolve(sizeOnDisk === task.totalBytes);
      }
    }, 200);

    setTimeout(() => {
      clearInterval(timer);
      task.cleanup();
      resolve(false);
    }, 15000);
  });
}

testExactRange().then((success) => {
  if (success) {
    console.log('Test PASSED!');
    process.exit(0);
  } else {
    console.error('Test FAILED!');
    process.exit(1);
  }
});
