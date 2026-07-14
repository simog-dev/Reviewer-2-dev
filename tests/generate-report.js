#!/usr/bin/env node

/**
 * Test Report Generator
 * Generates an HTML report from test results
 */

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = __dirname;
const REPORT_PATH = path.join(RESULTS_DIR, 'test-report.html');

function loadResults(filename) {
  const filepath = path.join(RESULTS_DIR, filename);
  if (fs.existsSync(filepath)) {
    try {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

function generateReport() {
  console.log('Generating test report...\n');

  const installResults = loadResults('install-test-results.json');
  const unitResults = loadResults('unit-test-results.json');
  const e2eResults = loadResults('e2e-test-results.json');
  const fullResults = loadResults('full-test-results.json');

  const timestamp = new Date().toISOString();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PDF Reviewer - Test Report</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #0f0f0f;
      color: #e5e5e5;
      line-height: 1.6;
      padding: 2rem;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    h1 {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }

    h2 {
      font-size: 1.5rem;
      margin: 2rem 0 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid #333;
    }

    h3 {
      font-size: 1.125rem;
      margin: 1rem 0 0.5rem;
    }

    .timestamp {
      color: #737373;
      font-size: 0.875rem;
      margin-bottom: 2rem;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .summary-card {
      background-color: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 1.5rem;
      text-align: center;
    }

    .summary-card.passed {
      border-color: #22c55e;
    }

    .summary-card.failed {
      border-color: #ef4444;
    }

    .summary-value {
      font-size: 2.5rem;
      font-weight: 700;
    }

    .summary-label {
      color: #a3a3a3;
      font-size: 0.875rem;
      text-transform: uppercase;
    }

    .passed { color: #22c55e; }
    .failed { color: #ef4444; }
    .warning { color: #f59e0b; }

    .test-suite {
      background-color: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      margin-bottom: 1rem;
      overflow: hidden;
    }

    .suite-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      background-color: #252525;
      border-bottom: 1px solid #333;
    }

    .suite-name {
      font-weight: 600;
    }

    .suite-stats {
      display: flex;
      gap: 1rem;
      font-size: 0.875rem;
    }

    .test-list {
      padding: 0.5rem;
    }

    .test-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      border-radius: 4px;
    }

    .test-item:hover {
      background-color: #252525;
    }

    .test-status {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
    }

    .test-name {
      flex: 1;
      font-size: 0.875rem;
    }

    .test-error {
      font-size: 0.75rem;
      color: #ef4444;
      padding: 0.5rem;
      background-color: rgba(239, 68, 68, 0.1);
      border-radius: 4px;
      margin: 0.25rem 0 0.25rem 1.5rem;
      font-family: monospace;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .badge-success {
      background-color: rgba(34, 197, 94, 0.2);
      color: #22c55e;
    }

    .badge-error {
      background-color: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }

    .phase-list {
      margin: 1rem 0;
    }

    .phase-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0;
    }

    footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid #333;
      text-align: center;
      color: #737373;
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>PDF Reviewer Test Report</h1>
    <p class="timestamp">Generated: ${timestamp}</p>

    ${fullResults ? `
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-value">${fullResults.summary.total}</div>
        <div class="summary-label">Total Tests</div>
      </div>
      <div class="summary-card passed">
        <div class="summary-value passed">${fullResults.summary.passed}</div>
        <div class="summary-label">Passed</div>
      </div>
      <div class="summary-card ${fullResults.summary.failed > 0 ? 'failed' : ''}">
        <div class="summary-value ${fullResults.summary.failed > 0 ? 'failed' : ''}">${fullResults.summary.failed}</div>
        <div class="summary-label">Failed</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${(fullResults.duration / 1000).toFixed(1)}s</div>
        <div class="summary-label">Duration</div>
      </div>
    </div>

    <h2>Test Phases</h2>
    <div class="phase-list">
      ${fullResults.phases.map(phase => `
        <div class="phase-item">
          <span class="${phase.success ? 'passed' : 'failed'}">${phase.success ? '✓' : '✗'}</span>
          <span>${phase.name}</span>
          <span class="badge ${phase.success ? 'badge-success' : 'badge-error'}">
            ${phase.success ? 'PASSED' : 'FAILED'}
          </span>
        </div>
      `).join('')}
    </div>
    ` : '<p class="warning">No full results available. Run: npm test</p>'}

    ${installResults ? `
    <h2>Installation Tests</h2>
    <div class="test-suite">
      <div class="suite-header">
        <span class="suite-name">Installation Verification</span>
        <div class="suite-stats">
          <span class="passed">${installResults.passed} passed</span>
          <span class="failed">${installResults.failed} failed</span>
        </div>
      </div>
      <div class="test-list">
        ${installResults.results.map(test => `
          <div class="test-item">
            <span class="test-status ${test.status === 'PASS' ? 'passed' : 'failed'}">
              ${test.status === 'PASS' ? '✓' : '✗'}
            </span>
            <span class="test-name">${test.name}</span>
          </div>
          ${test.error ? `<div class="test-error">${test.error}</div>` : ''}
        `).join('')}
      </div>
    </div>
    ` : ''}

    ${unitResults ? `
    <h2>Unit Tests</h2>
    ${unitResults.suites.map(suite => `
      <div class="test-suite">
        <div class="suite-header">
          <span class="suite-name">${suite.name}</span>
          <div class="suite-stats">
            <span class="passed">${suite.passed} passed</span>
            <span class="failed">${suite.failed} failed</span>
          </div>
        </div>
        <div class="test-list">
          ${suite.results.map(test => `
            <div class="test-item">
              <span class="test-status ${test.status === 'PASS' ? 'passed' : 'failed'}">
                ${test.status === 'PASS' ? '✓' : '✗'}
              </span>
              <span class="test-name">${test.name}</span>
            </div>
            ${test.error ? `<div class="test-error">${test.error}</div>` : ''}
          `).join('')}
        </div>
      </div>
    `).join('')}
    ` : ''}

    ${e2eResults && e2eResults.suites ? `
    <h2>E2E Tests</h2>
    ${e2eResults.suites.map(suite => `
      <div class="test-suite">
        <div class="suite-header">
          <span class="suite-name">${suite.title}</span>
          <div class="suite-stats">
            <span>${suite.specs?.length || 0} tests</span>
          </div>
        </div>
        <div class="test-list">
          ${(suite.specs || []).map(spec => `
            <div class="test-item">
              <span class="test-status ${spec.ok ? 'passed' : 'failed'}">
                ${spec.ok ? '✓' : '✗'}
              </span>
              <span class="test-name">${spec.title}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
    ` : ''}

    <footer>
      <p>PDF Reviewer Test Suite</p>
      <p>Run <code>npm test</code> to regenerate this report</p>
    </footer>
  </div>
</body>
</html>`;

  fs.writeFileSync(REPORT_PATH, html);
  console.log(`Report generated: ${REPORT_PATH}`);
  console.log(`Open in browser: file://${REPORT_PATH}`);
}

generateReport();
