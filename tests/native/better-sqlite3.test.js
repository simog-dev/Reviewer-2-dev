const Database = require('better-sqlite3');

if (!process.versions.electron) {
  throw new Error('This native-module test must run with Electron');
}

const db = new Database(':memory:');

try {
  const result = db.prepare('SELECT sqlite_version() AS version').get();

  if (!result?.version) {
    throw new Error('SQLite did not return its version');
  }

  console.log(`NATIVE_RUNTIME_INFO:${JSON.stringify({
    electron: process.versions.electron,
    node: process.versions.node,
    modules: process.versions.modules,
    sqlite: result.version
  })}`);
} finally {
  db.close();
}
