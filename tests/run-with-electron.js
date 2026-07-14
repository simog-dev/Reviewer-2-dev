#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

function runWithElectron(args, options = {}) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error('A script path is required');
  }

  const electronPath = require('electron');
  const [script, ...scriptArgs] = args;
  const cwd = options.cwd || process.cwd();
  const scriptPath = path.isAbsolute(script) ? script : path.resolve(cwd, script);

  return spawnSync(electronPath, [scriptPath, ...scriptArgs], {
    cwd,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1'
    },
    encoding: options.encoding,
    stdio: options.stdio || 'inherit'
  });
}

function exitFromResult(result) {
  if (result.error) {
    console.error(`Unable to start Electron's Node runtime: ${result.error.message}`);
    process.exit(1);
  }

  if (result.signal) {
    console.error(`Electron's Node runtime exited with signal ${result.signal}`);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node tests/run-with-electron.js <script> [...args]');
    process.exit(1);
  }

  exitFromResult(runWithElectron(args));
}

module.exports = { runWithElectron };
