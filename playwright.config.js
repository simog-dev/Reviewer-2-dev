// @ts-check
const { defineConfig } = require('@playwright/test');
const path = require('path');

/**
 * Playwright configuration for Electron E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.test.js',

  /* Run tests in files in parallel */
  fullyParallel: false,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests - Electron tests need to run sequentially */
  workers: 1,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/e2e-report', open: 'never' }],
    ['json', { outputFile: 'tests/e2e-test-results.json' }]
  ],

  /* Shared settings for all the projects below */
  use: {
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'retain-on-failure'
  },

  /* Timeout for each test */
  timeout: 60000,

  /* Expect timeout */
  expect: {
    timeout: 10000
  },

  /* Output folder for test artifacts */
  outputDir: 'tests/e2e-results',

  /* Global setup and teardown */
  globalSetup: path.join(__dirname, 'tests/e2e/global-setup.js'),
  globalTeardown: path.join(__dirname, 'tests/e2e/global-teardown.js')
});
