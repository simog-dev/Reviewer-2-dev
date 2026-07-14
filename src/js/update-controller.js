let controllerStarted = false;
let currentStatus = null;
let noticeElement = null;

function createNotice() {
  const element = document.createElement('aside');
  element.className = 'update-notice';
  element.hidden = true;
  element.setAttribute('aria-live', 'polite');
  element.innerHTML = `
    <div class="update-notice__content">
      <div class="update-notice__eyebrow">Application update</div>
      <div class="update-notice__title"></div>
      <div class="update-notice__message"></div>
      <div class="update-notice__progress" hidden>
        <div class="update-notice__progress-bar"></div>
      </div>
    </div>
    <div class="update-notice__actions"></div>
  `;
  document.body.appendChild(element);
  return element;
}

function action(label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn ${className}`;
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function dismiss(version) {
  if (version) sessionStorage.setItem('dismissed-update-version', version);
  if (noticeElement) noticeElement.hidden = true;
}

function render(status) {
  currentStatus = status;
  window.dispatchEvent(new CustomEvent('reviewer:update-status', { detail: status }));

  if (!noticeElement) noticeElement = createNotice();

  const title = noticeElement.querySelector('.update-notice__title');
  const message = noticeElement.querySelector('.update-notice__message');
  const progress = noticeElement.querySelector('.update-notice__progress');
  const progressBar = noticeElement.querySelector('.update-notice__progress-bar');
  const actions = noticeElement.querySelector('.update-notice__actions');
  actions.replaceChildren();
  progress.hidden = true;
  noticeElement.classList.remove('update-notice--error');

  const dismissedVersion = sessionStorage.getItem('dismissed-update-version');
  const isDismissed = status.status === 'available' && dismissedVersion === status.availableVersion;
  const isQuietStatus = ['idle', 'up-to-date', 'checking', 'disabled', 'error'].includes(status.status) && !status.manual;

  if (isDismissed || isQuietStatus) {
    noticeElement.hidden = true;
    return;
  }

  noticeElement.hidden = false;

  switch (status.status) {
    case 'checking':
      title.textContent = 'Checking for updates…';
      message.textContent = `Installed version: ${status.currentVersion}`;
      break;
    case 'available':
      title.textContent = `Version ${status.availableVersion} is available`;
      message.textContent = `You are using version ${status.currentVersion}. Download the update in the background.`;
      actions.append(
        action('Later', 'btn--secondary', () => dismiss(status.availableVersion)),
        action('Download update', 'btn--primary', () => window.api.downloadUpdate())
      );
      break;
    case 'downloading': {
      const percent = Math.round(status.progress?.percent || 0);
      title.textContent = 'Downloading update…';
      message.textContent = `${percent}% complete. You can continue working.`;
      progress.hidden = false;
      progressBar.style.width = `${percent}%`;
      break;
    }
    case 'downloaded':
      title.textContent = `Version ${status.availableVersion} is ready`;
      message.textContent = 'Restart Reviewer 2 to install it. Your local data will be preserved.';
      actions.append(
        action('Later', 'btn--secondary', () => dismiss()),
        action('Restart and install', 'btn--primary', () => window.api.installUpdate())
      );
      break;
    case 'up-to-date':
      title.textContent = 'Reviewer 2 is up to date';
      message.textContent = `Version ${status.currentVersion} is the latest available version.`;
      actions.append(action('Close', 'btn--secondary', () => dismiss()));
      break;
    case 'disabled':
      title.textContent = 'Update check unavailable';
      message.textContent = status.message;
      actions.append(action('Close', 'btn--secondary', () => dismiss()));
      break;
    case 'error':
      noticeElement.classList.add('update-notice--error');
      title.textContent = 'Could not check for updates';
      message.textContent = status.message || 'Check your internet connection and try again.';
      actions.append(
        action('Close', 'btn--secondary', () => dismiss()),
        action('Try again', 'btn--primary', () => window.api.checkForUpdates())
      );
      break;
    default:
      noticeElement.hidden = true;
  }
}

export async function initUpdateController() {
  if (controllerStarted || !window.api?.getUpdateStatus) return;
  controllerStarted = true;

  window.api.onUpdateStatus(render);
  render(await window.api.getUpdateStatus());
}

export function getCurrentUpdateStatus() {
  return currentStatus;
}
