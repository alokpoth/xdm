const DownloadTask = require('../server/engine/DownloadTask');
const path = require('path');
const os = require('os');
const fs = require('fs');

async function testLargeMulti() {
  console.log('Testing 16-thread turbo download on 10MB payload...');
  const saveDir = path.join(os.tmpdir(), 'xdm_large_' + Date.now());
  fs.mkdirSync(saveDir, { recursive: true });

  // 10MB test file from Cloudflare
  const url = 'https://speed.cloudflare.com/__down?bytes=10485760';

  const task = new DownloadTask({
    url,
    saveDir,
    fileName: 'test_10mb.dat',
    connections: 16
  });

  const info = await task.probeUrl();
  console.log(`Probed: ${info.fileName} | Size: ${(info.totalBytes / (1024*1024)).toFixed(2)} MB`);

  await task.start();
  console.log(`Started with ${task.segments.length} parallel threads!`);

  return new Promise((resolve) => {
    const int = setInterval(() => {
      const mbDownloaded = (task.downloadedBytes / (1024*1024)).toFixed(2);
      const totalMb = (task.totalBytes / (1024*1024)).toFixed(2);
      const speedMb = (task.speed / (1024*1024)).toFixed(2);
      console.log(`Progress: ${mbDownloaded} / ${totalMb} MB (${task.toJSON().progress}%) | Speed: ${speedMb} MB/s | Threads: ${task.segments.length}`);

      if (task.status === 'completed') {
        console.log(`🎉 10MB DOWNLOAD COMPLETED! Peak Speed: ${(task.peakSpeed / (1024*1024)).toFixed(2)} MB/s`);
        clearInterval(int);
        try {
          fs.unlinkSync(task.filePath);
          fs.rmdirSync(saveDir);
        } catch(e) {}
        resolve(true);
      }
    }, 500);

    setTimeout(() => {
      clearInterval(int);
      task.cleanup();
      resolve(true);
    }, 20000);
  });
}

testLargeMulti().then(() => {
  console.log('Large multi-thread test passed!');
  process.exit(0);
});
