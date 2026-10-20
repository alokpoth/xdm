const DownloadTask = require('../server/engine/DownloadTask');
const path = require('path');
const os = require('os');
const fs = require('fs');

async function debug() {
  const saveDir = path.join(os.tmpdir(), 'debug_xdm_' + Date.now());
  fs.mkdirSync(saveDir, { recursive: true });

  const task = new DownloadTask({
    url: 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png',
    saveDir,
    connections: 8
  });

  await task.start();

  const int = setInterval(() => {
    const summary = task.segments.map(s => 
      `#${s.id}:${s.status}(${s.current}-${s.end}, dl:${s.downloaded})`
    ).join(' | ');
    console.log(summary);

    if (task.status === 'completed') {
      console.log(' ALL DONE SUCCESSFULLY!');
      clearInterval(int);
      try {
        fs.unlinkSync(task.filePath);
        fs.rmdirSync(saveDir);
      } catch(e) {}
      process.exit(0);
    }
  }, 500);

  setTimeout(() => {
    console.log('Final logs:', task.logs);
    clearInterval(int);
    task.cleanup();
    process.exit(1);
  }, 10000);
}

debug();
