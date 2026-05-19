// tests/fixtures/extension-hello/main.js
// Sample extension entry — subscribes to task.created and writes a marker
// file the integration test can poll. Keeping side effects on the file
// system (rather than console.log) makes the assertion deterministic on
// every platform.

const path = require('node:path');
const fs = require('node:fs');

exports.activate = (sdk) => {
  sdk.events.on('task.created', (e) => {
    const marker = path.join(__dirname, '.last-task-created');
    fs.writeFileSync(marker, String(e.taskId), 'utf8');
  });
};

exports.deactivate = () => {
  const marker = path.join(__dirname, '.last-task-created');
  try { fs.unlinkSync(marker); } catch { /* already gone */ }
};
