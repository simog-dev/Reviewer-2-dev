const { EventEmitter } = require('events');
const {
  UpdateManager,
  sanitizeUpdateInfo,
  serializeError
} = require('../../src/main/update-manager');
const {
  getMacAppBundlePath,
  hasDeveloperIdSignature,
  supportsAutomaticUpdates
} = require('../../src/main/update-support');

class TestRunner {
  constructor() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;
  }

  async test(name, fn) {
    try {
      await fn();
      this.results.push({ name, status: 'PASS' });
      this.passed++;
      console.log(`  ✓ ${name}`);
    } catch (error) {
      this.results.push({ name, status: 'FAIL', error: error.message });
      this.failed++;
      console.log(`  ✗ ${name}`);
      console.log(`    Error: ${error.message}`);
    }
  }

  assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message || 'Values not equal'}: expected ${expected}, got ${actual}`);
    }
  }
}

function createManager({ packaged = true, automaticUpdatesSupported = true } = {}) {
  const sent = [];
  const updater = new EventEmitter();
  updater.checkForUpdates = async () => {};
  updater.downloadUpdate = async () => {};
  updater.quitAndInstall = () => {};

  const window = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: (channel, payload) => sent.push({ channel, payload })
    }
  };

  const manager = new UpdateManager({
    app: { isPackaged: packaged, getVersion: () => '1.0.1' },
    autoUpdater: updater,
    BrowserWindow: { getAllWindows: () => [window] },
    automaticUpdatesSupported,
    logger: { error: () => {} }
  });

  return { manager, updater, sent };
}

async function runUpdateManagerTests() {
  console.log('\n⬆️  Update Manager Unit Tests\n');
  console.log('='.repeat(50));

  const runner = new TestRunner();

  await runner.test('sanitizes update metadata exposed to the renderer', () => {
    const info = sanitizeUpdateInfo({ version: '1.2.0', releaseName: 'Stable', extra: 'secret' });
    runner.assertEqual(info.version, '1.2.0');
    runner.assertEqual(info.releaseName, 'Stable');
    runner.assert(!Object.hasOwn(info, 'extra'), 'Unexpected properties should not be exposed');
  });

  await runner.test('serializes Error and string values', () => {
    runner.assertEqual(serializeError(new Error('network down')), 'network down');
    runner.assertEqual(serializeError('failed'), 'failed');
  });

  await runner.test('does not contact the update server in development', async () => {
    const { manager, updater } = createManager({ packaged: false });
    let checks = 0;
    updater.checkForUpdates = async () => { checks++; };
    manager.start();

    const status = await manager.check({ manual: true });
    runner.assertEqual(checks, 0);
    runner.assertEqual(status.status, 'disabled');
  });

  await runner.test('disables automatic updates for unsigned packaged macOS builds', async () => {
    const { manager, updater } = createManager({ automaticUpdatesSupported: false });
    let checks = 0;
    updater.checkForUpdates = async () => { checks++; };
    manager.start();

    const status = await manager.check({ manual: true });
    runner.assertEqual(checks, 0);
    runner.assertEqual(status.status, 'disabled');
    runner.assert(
      status.message.includes('signed build'),
      'The disabled state should explain the signing requirement'
    );
  });

  await runner.test('extracts the macOS app bundle from an executable path', () => {
    runner.assertEqual(
      getMacAppBundlePath('/Applications/Reviewer2.app/Contents/MacOS/Reviewer2'),
      '/Applications/Reviewer2.app'
    );
    runner.assertEqual(getMacAppBundlePath('/usr/local/bin/reviewer2'), null);
  });

  await runner.test('accepts only a Developer ID signature with a team identifier', () => {
    const executablePath = '/Applications/Reviewer2.app/Contents/MacOS/Reviewer2';
    const signedResult = {
      status: 0,
      stdout: '',
      stderr: 'Authority=Developer ID Application: Example (TEAM123456)\nTeamIdentifier=TEAM123456\n'
    };
    const adHocResult = {
      status: 0,
      stdout: '',
      stderr: 'Signature=adhoc\nTeamIdentifier=not set\n'
    };

    runner.assert(
      hasDeveloperIdSignature({ executablePath, runCodesign: () => signedResult }),
      'Developer ID signature should be accepted'
    );
    runner.assert(
      !hasDeveloperIdSignature({ executablePath, runCodesign: () => adHocResult }),
      'Ad-hoc signature should be rejected'
    );
  });

  await runner.test('requires Developer ID only on macOS', () => {
    let calls = 0;
    const runCodesign = () => {
      calls++;
      return { status: 1, stdout: '', stderr: '' };
    };

    runner.assert(supportsAutomaticUpdates({ platform: 'win32', runCodesign }));
    runner.assertEqual(calls, 0, 'Windows should not invoke codesign');
    runner.assert(!supportsAutomaticUpdates({
      platform: 'darwin',
      executablePath: '/Applications/Reviewer2.app/Contents/MacOS/Reviewer2',
      runCodesign
    }));
    runner.assertEqual(calls, 1, 'macOS should verify its code signature');
  });

  await runner.test('broadcasts an available update', () => {
    const { manager, updater, sent } = createManager();
    manager.start();
    updater.emit('update-available', { version: '1.1.0', releaseName: 'Reviewer 2 v1.1.0' });

    runner.assertEqual(manager.getState().status, 'available');
    runner.assertEqual(manager.getState().availableVersion, '1.1.0');
    runner.assertEqual(sent.at(-1).channel, 'updater:status');
  });

  await runner.test('clamps download progress to a valid percentage', () => {
    const { manager, updater } = createManager();
    manager.start();
    updater.emit('download-progress', { percent: 150, transferred: 10, total: 20 });

    runner.assertEqual(manager.getState().progress.percent, 100);
  });

  await runner.test('installs only after the update has downloaded', () => {
    const { manager, updater } = createManager();
    let installs = 0;
    updater.quitAndInstall = () => { installs++; };
    manager.start();

    runner.assertEqual(manager.install(), false);
    updater.emit('update-downloaded', { version: '1.1.0' });
    runner.assertEqual(manager.install(), true);
    runner.assertEqual(installs, 1);
  });

  console.log('\n' + '-'.repeat(40));
  console.log(`Update Manager Tests: ${runner.passed} passed, ${runner.failed} failed`);
  return { passed: runner.passed, failed: runner.failed, results: runner.results };
}

module.exports = { runUpdateManagerTests };
