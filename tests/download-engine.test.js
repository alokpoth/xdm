process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const DownloadTask = require('../server/engine/DownloadTask');

test('DownloadTask Filename Formatting: Preserves authentic file names without branding suffixes', () => {
  const task = new DownloadTask({
    url: 'https://example.com/ubuntu-24.04-desktop-amd64.iso',
    fileName: 'ubuntu-24.04-desktop-amd64.iso'
  });
  assert.equal(task.fileName, 'ubuntu-24.04-desktop-amd64.iso');
  assert.ok(!task.fileName.includes('Zihan'));
  assert.ok(!task.fileName.includes('XDM by'));

  const sanitized = task.sanitizeFileName('my:movie*name?.mp4');
  assert.equal(sanitized, 'my_movie_name_.mp4');
  assert.ok(!sanitized.includes('Zihan'));
});

test('DownloadTask Range Support & Multi-Segment Download', async () => {
  // Create a mock HTTP server serving a 100KB payload with Range request support
  const testPayload = Buffer.alloc(100 * 1024, 0x42); // 100KB of 'B's
  const server = http.createServer((req, res) => {
    const range = req.headers['range'];
    if (range) {
      const match = range.match(/bytes=(\d+)-(\d+)?/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : testPayload.length - 1;
        const chunk = testPayload.subarray(start, end + 1);
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${testPayload.length}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunk.length,
          'Content-Type': 'application/octet-stream'
        });
        res.end(chunk);
        return;
      }
    }

    res.writeHead(200, {
      'Accept-Ranges': 'bytes',
      'Content-Length': testPayload.length,
      'Content-Type': 'application/octet-stream'
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.end(testPayload);
  });

  const port = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server.address().port);
    });
  });

  const tempDir = path.join(os.tmpdir(), `xdm_test_dl_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const dlUrl = `http://127.0.0.1:${port}/testfile.bin`;
  let resolveTask, rejectTask;
  const completionPromise = new Promise((resolve, reject) => {
    resolveTask = resolve;
    rejectTask = reject;
  });

  const task = new DownloadTask({
    url: dlUrl,
    fileName: 'testfile.bin',
    saveDir: tempDir,
    connections: 4,
    onProgress: (t) => {
      if (t.status === 'completed') resolveTask();
      if (t.status === 'error') rejectTask(new Error(t.error));
    }
  });

  task.start();
  await completionPromise;

  assert.equal(task.status, 'completed');
  assert.equal(task.progress, 100);
  assert.equal(task.downloadedBytes, testPayload.length);

  // Verify file was written to disk and matches the exact content
  const downloadedPath = path.join(tempDir, 'testfile.bin');
  assert.ok(fs.existsSync(downloadedPath));
  const fileData = fs.readFileSync(downloadedPath);
  assert.equal(fileData.length, testPayload.length);
  assert.deepEqual(fileData, testPayload);

  // Clean up
  try {
    fs.unlinkSync(downloadedPath);
    fs.rmdirSync(tempDir);
  } catch (e) {}
  await new Promise((resolve) => server.close(resolve));
});

test('DownloadTask Path Traversal & Malicious Filename Sanitization', () => {
  const task = new DownloadTask({
    url: 'https://example.com/payload.exe',
    fileName: '../../../Windows/System32/calc.exe',
    saveDir: 'C:\\Users\\Test\\Downloads'
  });
  assert.ok(!task.fileName.includes('..'));
  assert.ok(!task.fileName.includes('/'));
  assert.ok(!task.fileName.includes('\\'));
  assert.equal(task.fileName, 'calc.exe');

  // DOS reserved device names
  const conTask = new DownloadTask({
    url: 'https://example.com/CON.txt',
    fileName: 'CON.txt'
  });
  assert.equal(conTask.fileName, 'file_CON.txt');

  const auxTask = new DownloadTask({
    url: 'https://example.com/aux.bin',
    fileName: 'aux.bin'
  });
  assert.equal(auxTask.fileName, 'file_aux.bin');

  const nulTask = new DownloadTask({
    url: 'https://example.com/NUL.tar.gz',
    fileName: 'NUL.tar.gz'
  });
  assert.equal(nulTask.fileName, 'file_NUL.tar.gz');
});

test('DownloadTask Pause and Resume Integrity', async () => {
  // Large 200KB payload
  const testPayload = Buffer.alloc(200 * 1024, 0x5a); // 200KB of 'Z's
  const server = http.createServer((req, res) => {
    const range = req.headers['range'];
    if (range) {
      const match = range.match(/bytes=(\d+)-(\d+)?/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : testPayload.length - 1;
        const chunk = testPayload.subarray(start, end + 1);
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${testPayload.length}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunk.length,
          'Content-Type': 'application/octet-stream'
        });
        res.end(chunk);
        return;
      }
    }
    res.writeHead(200, {
      'Accept-Ranges': 'bytes',
      'Content-Length': testPayload.length,
      'Content-Type': 'application/octet-stream'
    });
    res.end(testPayload);
  });

  const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
  const tempDir = path.join(os.tmpdir(), `xdm_test_pauseresume_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const dlUrl = `http://127.0.0.1:${port}/largefile.bin`;
  let resolveTask;
  const completionPromise = new Promise((resolve) => { resolveTask = resolve; });

  const task = new DownloadTask({
    url: dlUrl,
    fileName: 'largefile.bin',
    saveDir: tempDir,
    connections: 4,
    onProgress: (t) => {
      if (t.status === 'completed') resolveTask();
    }
  });

  task.start();

  // Wait for initial segment progress then pause
  await new Promise((r) => setTimeout(r, 40));
  task.pause();
  assert.equal(task.status, 'paused');
  assert.equal(task.isPaused, true);
  assert.equal(task.activeStreams.size, 0);

  // Resume the task
  task.resume();
  await completionPromise;

  assert.equal(task.status, 'completed');
  assert.equal(task.downloadedBytes, testPayload.length);

  const downloadedPath = path.join(tempDir, 'largefile.bin');
  assert.ok(fs.existsSync(downloadedPath));
  assert.equal(fs.readFileSync(downloadedPath).length, testPayload.length);

  try {
    fs.unlinkSync(downloadedPath);
    fs.rmdirSync(tempDir);
  } catch (e) {}
  await new Promise((resolve) => server.close(resolve));
});

test('DownloadTask Non-Range Single Stream Fallback', async () => {
  // Create a mock server that does NOT support Range requests (returns 200 only)
  const testPayload = Buffer.from('Hello world non-resumable stream content');
  const server = http.createServer((req, res) => {
    res.writeHead(200, {
      'Content-Length': testPayload.length,
      'Content-Type': 'text/plain'
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.end(testPayload);
  });

  const port = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server.address().port);
    });
  });

  const tempDir = path.join(os.tmpdir(), `xdm_test_norange_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const dlUrl = `http://127.0.0.1:${port}/document.txt`;
  let resolveTask, rejectTask;
  const completionPromise = new Promise((resolve, reject) => {
    resolveTask = resolve;
    rejectTask = reject;
  });

  const task = new DownloadTask({
    url: dlUrl,
    fileName: 'document.txt',
    saveDir: tempDir,
    connections: 8, // Requests 8, but should fall back to 1 stream because server lacks range support
    onProgress: (t) => {
      if (t.status === 'completed') resolveTask();
      if (t.status === 'error') rejectTask(new Error(t.error));
    }
  });

  task.start();
  await completionPromise;

  assert.equal(task.status, 'completed');
  assert.equal(task.segments.length, 1, 'Must fallback to 1 stream when server has no range support');
  assert.equal(task.resumable, false);

  const downloadedPath = path.join(tempDir, 'document.txt');
  assert.ok(fs.existsSync(downloadedPath));
  assert.equal(fs.readFileSync(downloadedPath, 'utf8'), 'Hello world non-resumable stream content');

  try {
    fs.unlinkSync(downloadedPath);
    fs.rmdirSync(tempDir);
  } catch (e) {}
  await new Promise((resolve) => server.close(resolve));
});


test('DownloadManager Free Tier: Extension downloads strictly require verified PRO status', () => {
  const DownloadManager = require('../server/engine/DownloadManager');
  const tempDir = path.join(os.tmpdir(), `xdm_test_mgr_${Date.now()}`);
  const mgr = new DownloadManager({ storageDir: tempDir });
  assert.equal(mgr.isProVerified(), false, 'Default installation must not be PRO');
  mgr.destroy();
});

test('DownloadManager Queue Concurrency: resumeDownload and resumeAll strictly respect maxConcurrentDownloads', () => {
  const DownloadManager = require('../server/engine/DownloadManager');
  const tempDir = path.join(os.tmpdir(), `xdm_test_queue_${Date.now()}`);
  const mgr = new DownloadManager({ storageDir: tempDir });

  // Add 3 mock tasks in paused state
  const task1 = new DownloadTask({ id: 'task_1', url: 'http://127.0.0.1/1.bin', status: 'downloading' });
  const task2 = new DownloadTask({ id: 'task_2', url: 'http://127.0.0.1/2.bin', status: 'paused' });
  const task3 = new DownloadTask({ id: 'task_3', url: 'http://127.0.0.1/3.bin', status: 'paused' });

  mgr.tasks.set(task1.id, task1);
  mgr.tasks.set(task2.id, task2);
  mgr.tasks.set(task3.id, task3);

  // Free edition has maxLimit = 1. task1 is already downloading.
  // Resuming task2 must place it in 'queued' state, not start downloading
  mgr.resumeDownload('task_2');
  assert.equal(task2.status, 'queued', 'task_2 must be queued when active downloads >= maxLimit');

  // Resuming all when task1 is running should set paused tasks to queued
  mgr.resumeAll();
  assert.equal(task2.status, 'queued');
  assert.equal(task3.status, 'queued');

  mgr.destroy();
});
