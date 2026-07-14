/**
 * Build the command-line arguments used to launch Electron in E2E tests.
 *
 * GitHub-hosted Linux runners cannot use Electron's SUID sandbox because the
 * bundled chrome-sandbox executable is not installed as root with mode 4755.
 * Disable it only for CI test launches; packaged applications keep their
 * normal sandbox configuration.
 */
function getElectronLaunchArgs(appPath, {
  platform = process.platform,
  isCI = Boolean(process.env.CI)
} = {}) {
  const args = [];

  if (platform === 'linux' && isCI) {
    args.push('--no-sandbox');
  }

  args.push(appPath);
  return args;
}

module.exports = { getElectronLaunchArgs };
