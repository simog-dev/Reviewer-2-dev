'use strict';

const DEFAULT_STATUS = Object.freeze({
  status: 'idle',
  currentVersion: '',
  availableVersion: null,
  progress: null,
  message: null,
  manual: false
});

function serializeError(error) {
  if (!error) return 'Unknown update error';
  return error.message || String(error);
}

function sanitizeUpdateInfo(info = {}) {
  return {
    version: info.version || null,
    releaseName: typeof info.releaseName === 'string' ? info.releaseName : null,
    releaseDate: info.releaseDate || null
  };
}

class UpdateManager {
  constructor({ app, autoUpdater, BrowserWindow, logger = console }) {
    this.app = app;
    this.autoUpdater = autoUpdater;
    this.BrowserWindow = BrowserWindow;
    this.logger = logger;
    this.started = false;
    this.state = {
      ...DEFAULT_STATUS,
      currentVersion: app.getVersion()
    };
  }

  isEnabled() {
    return this.app.isPackaged;
  }

  start() {
    if (this.started) return;
    this.started = true;

    this.autoUpdater.autoDownload = false;
    this.autoUpdater.autoInstallOnAppQuit = true;

    this.autoUpdater.on('checking-for-update', () => {
      this.setState({ status: 'checking', message: null, progress: null });
    });

    this.autoUpdater.on('update-available', (info) => {
      const update = sanitizeUpdateInfo(info);
      this.setState({
        status: 'available',
        availableVersion: update.version,
        update,
        message: null,
        progress: null
      });
    });

    this.autoUpdater.on('update-not-available', () => {
      this.setState({
        status: 'up-to-date',
        availableVersion: null,
        update: null,
        message: null,
        progress: null
      });
    });

    this.autoUpdater.on('download-progress', (progress) => {
      this.setState({
        status: 'downloading',
        progress: {
          percent: Math.max(0, Math.min(100, Number(progress.percent) || 0)),
          transferred: Number(progress.transferred) || 0,
          total: Number(progress.total) || 0,
          bytesPerSecond: Number(progress.bytesPerSecond) || 0
        },
        message: null
      });
    });

    this.autoUpdater.on('update-downloaded', (info) => {
      const update = sanitizeUpdateInfo(info);
      this.setState({
        status: 'downloaded',
        availableVersion: update.version || this.state.availableVersion,
        update,
        progress: { percent: 100 },
        message: null
      });
    });

    this.autoUpdater.on('error', (error) => {
      this.logger.error('Auto-updater error:', error);
      this.setState({
        status: 'error',
        message: serializeError(error),
        progress: null
      });
    });
  }

  getState() {
    return { ...this.state };
  }

  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.broadcast();
    return this.getState();
  }

  broadcast() {
    for (const window of this.BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send('updater:status', this.getState());
      }
    }
  }

  async check({ manual = false } = {}) {
    this.setState({ manual, status: 'checking', message: null, progress: null });

    if (!this.isEnabled()) {
      return this.setState({
        status: 'disabled',
        message: 'Update checks are available only in the installed app.'
      });
    }

    try {
      await this.autoUpdater.checkForUpdates();
    } catch (error) {
      this.logger.error('Error checking for updates:', error);
      this.setState({ status: 'error', message: serializeError(error), progress: null });
    }

    return this.getState();
  }

  async download() {
    if (this.state.status !== 'available') {
      return this.getState();
    }

    try {
      this.setState({ status: 'downloading', progress: { percent: 0 }, message: null, manual: true });
      await this.autoUpdater.downloadUpdate();
    } catch (error) {
      this.logger.error('Error downloading update:', error);
      this.setState({ status: 'error', message: serializeError(error), progress: null });
    }

    return this.getState();
  }

  install() {
    if (this.state.status !== 'downloaded') return false;
    this.autoUpdater.quitAndInstall(false, true);
    return true;
  }
}

module.exports = {
  UpdateManager,
  sanitizeUpdateInfo,
  serializeError
};
