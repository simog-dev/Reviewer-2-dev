/**
 * Electron Test Helpers
 * Utilities for launching and interacting with the Electron app
 */

const { _electron: electron } = require('playwright');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', '..');
const TEST_PDF_PATH = path.join(__dirname, '..', 'fixtures', 'test-document.pdf');

/**
 * Launch the Electron application
 * @param {Object} options - Launch options
 * @returns {Promise<{app: ElectronApplication, window: Page}>}
 */
async function launchApp(options = {}) {
  const app = await electron.launch({
    args: [ROOT_DIR],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TEST_MODE: 'true'
    },
    ...options
  });

  // Wait for the first window to open
  const window = await app.firstWindow();

  // Wait for the app to be ready
  await window.waitForLoadState('domcontentloaded');

  return { app, window };
}

/**
 * Close the Electron application
 * @param {ElectronApplication} app
 */
async function closeApp(app) {
  if (app) {
    await app.close();
  }
}

/**
 * Wait for and get a page by URL pattern
 * @param {ElectronApplication} app
 * @param {string} urlPattern
 * @returns {Promise<Page>}
 */
async function getPageByUrl(app, urlPattern) {
  const windows = app.windows();
  for (const window of windows) {
    const url = await window.url();
    if (url.includes(urlPattern)) {
      return window;
    }
  }
  return null;
}

/**
 * Take a screenshot of the current window
 * @param {Page} window
 * @param {string} name
 */
async function takeScreenshot(window, name) {
  const screenshotsDir = path.join(__dirname, '..', 'e2e-results', 'screenshots');
  const fs = require('fs');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  await window.screenshot({
    path: path.join(screenshotsDir, `${name}-${Date.now()}.png`),
    fullPage: true
  });
}

/**
 * Get test PDF path
 * @returns {string}
 */
function getTestPDFPath() {
  return TEST_PDF_PATH;
}

/**
 * Wait for element to be visible
 * @param {Page} window
 * @param {string} selector
 * @param {number} timeout
 */
async function waitForElement(window, selector, timeout = 10000) {
  await window.waitForSelector(selector, { state: 'visible', timeout });
}

/**
 * Click and wait for navigation
 * @param {Page} window
 * @param {string} selector
 */
async function clickAndWait(window, selector) {
  await window.click(selector);
  await window.waitForLoadState('domcontentloaded');
}

/**
 * Evaluate in the main process
 * @param {ElectronApplication} app
 * @param {Function} fn
 */
async function evaluateInMain(app, fn) {
  return await app.evaluate(fn);
}

module.exports = {
  launchApp,
  closeApp,
  getPageByUrl,
  takeScreenshot,
  getTestPDFPath,
  waitForElement,
  clickAndWait,
  evaluateInMain,
  ROOT_DIR,
  TEST_PDF_PATH
};
