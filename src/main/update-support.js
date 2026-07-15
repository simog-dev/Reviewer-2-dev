'use strict';

const { spawnSync } = require('child_process');

const DEVELOPER_ID_AUTHORITY = /^Authority=Developer ID Application:/m;
const VALID_TEAM_IDENTIFIER = /^TeamIdentifier=(?!not set\s*$)\S+/m;

function getMacAppBundlePath(executablePath) {
  if (!executablePath) return null;

  const marker = '/Contents/MacOS/';
  const markerIndex = executablePath.lastIndexOf(marker);
  if (markerIndex === -1) return null;

  const bundlePath = executablePath.slice(0, markerIndex);
  return bundlePath.endsWith('.app') ? bundlePath : null;
}

function hasDeveloperIdSignature({ executablePath, runCodesign = spawnSync } = {}) {
  const bundlePath = getMacAppBundlePath(executablePath);
  if (!bundlePath) return false;

  const result = runCodesign(
    '/usr/bin/codesign',
    ['-dv', '--verbose=4', bundlePath],
    { encoding: 'utf8' }
  );

  if (!result || result.status !== 0) return false;

  const signatureInfo = `${result.stdout || ''}\n${result.stderr || ''}`;
  return DEVELOPER_ID_AUTHORITY.test(signatureInfo) &&
    VALID_TEAM_IDENTIFIER.test(signatureInfo);
}

function supportsAutomaticUpdates({
  platform = process.platform,
  executablePath = process.execPath,
  runCodesign = spawnSync
} = {}) {
  if (platform !== 'darwin') return true;
  return hasDeveloperIdSignature({ executablePath, runCodesign });
}

module.exports = {
  getMacAppBundlePath,
  hasDeveloperIdSignature,
  supportsAutomaticUpdates
};
