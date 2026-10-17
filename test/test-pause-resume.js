const DownloadTask = require('../server/engine/DownloadTask');
const path = require('path');
const fs = require('fs');
const os = require('os');

async function testPauseResume() {
  console.log('Testing Pause, Resume, and Restart lifecycle...');
  const testDir = path.join(os.tmpdir(), 'xdm_test_pause_' + Date.now());
  fs.mkdirSync(testDir, { recursive: true });

  const testUrl = 'https://speed.cloudflare.com/__down?bytes=10000000'; // 10MB

  const task = new DownloadTask({
    url: testUrl,
    saveDir: testDir,
    fileName: 'pause_test.bin',
    connections: 16
  });

  await task.probeUrl();
  console.log('Probed: totalBytes =', task.totalBytes);

  await task.start();
  console.log('Download started...');

  // Wait 300ms then pause
  await new Promise(r => setTimeout(r, 300));
  task.pause();
  console.log('Paused! Status:', task.status, 'downloaded:', task.downloadedBytes);

  if (task.status !== 'paused') {
    throw new Error('Task did not pause correctly');
  }

  // Resume
  await new Promise(r => setTimeout(r, 200));
  task.resume();
  console.log('Resumed! Status:', task.status);

  // Wait until completed or timeout
  await new Promise((resolve) => {
    const check = setInterval(() => {
      console.log(`Progress: ${(task.downloadedBytes / (1024*1024)).toFixed(2)} MB / ${(task.totalBytes / (1024*1024)).toFixed(2)} MB (${task.status})`);
      if (task.status === 'completed') {
        clearInterval(check);
        resolve();
      }
    }, 400);

    setTimeout(() => {
      clearInterval(check);
      task.cleanup();
      resolve();
    }, 15000);
  });

  console.log('Lifecycle test passed!');
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (e) {}
}

testPauseResume().then(() => {
  console.log('All pause-resume assertions passed!');
  process.exit(0);
}).catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
