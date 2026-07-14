const { getElectronLaunchArgs } = require('../e2e/electron-launch-args');

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

  assertArrayEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      );
    }
  }
}

async function runElectronLaunchArgsTests() {
  console.log('\n🚀 Electron E2E Launch Arguments Tests\n');
  console.log('='.repeat(50));

  const runner = new TestRunner();
  const appPath = '/workspace/reviewer';

  await runner.test('disables the Chromium sandbox on Linux CI', () => {
    runner.assertArrayEqual(
      getElectronLaunchArgs(appPath, { platform: 'linux', isCI: true }),
      ['--no-sandbox', appPath],
      'Unexpected Linux CI arguments'
    );
  });

  await runner.test('keeps the sandbox enabled for local Linux tests', () => {
    runner.assertArrayEqual(
      getElectronLaunchArgs(appPath, { platform: 'linux', isCI: false }),
      [appPath],
      'Unexpected local Linux arguments'
    );
  });

  await runner.test('keeps the sandbox enabled on Windows and macOS CI', () => {
    for (const platform of ['win32', 'darwin']) {
      runner.assertArrayEqual(
        getElectronLaunchArgs(appPath, { platform, isCI: true }),
        [appPath],
        `Unexpected ${platform} CI arguments`
      );
    }
  });

  console.log('\n' + '-'.repeat(40));
  console.log(`Electron Launch Arguments Tests: ${runner.passed} passed, ${runner.failed} failed`);
  return { passed: runner.passed, failed: runner.failed, results: runner.results };
}

module.exports = { runElectronLaunchArgsTests };
