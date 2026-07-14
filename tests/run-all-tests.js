#!/usr/bin/env node

/**
 * Main Test Runner
 * Runs all test suites in sequence and generates a comprehensive report
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const RESULTS_DIR = __dirname;

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(title) {
  console.log('\n' + '═'.repeat(70));
  log(`  ${title}`, 'bright');
  console.log('═'.repeat(70) + '\n');
}

function runCommand(command, options = {}) {
  try {
    const result = execSync(command, {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
      timeout: options.timeout || 300000 // 5 minutes default
    });
    return { success: true, output: result };
  } catch (error) {
    return {
      success: false,
      output: error.stdout || '',
      error: error.stderr || error.message
    };
  }
}

async function runTests() {
  const startTime = Date.now();
  const results = {
    timestamp: new Date().toISOString(),
    phases: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0
    }
  };

  header('PDF REVIEWER TEST SUITE');

  // Phase 1: Installation Tests
  header('PHASE 1: Installation Tests');

  log('Running installation tests...', 'cyan');
  const installResult = runCommand('node tests/install.test.js');
  results.phases.push({
    name: 'Installation',
    success: installResult.success,
    output: installResult.output
  });

  if (!installResult.success) {
    log('\n❌ Installation tests failed. Fix installation issues before continuing.', 'red');
    log('\nRun: npm install', 'yellow');

    // Try to read results file for details
    const resultsFile = path.join(RESULTS_DIR, 'install-test-results.json');
    if (fs.existsSync(resultsFile)) {
      const installResults = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));
      results.summary.total += installResults.passed + installResults.failed;
      results.summary.passed += installResults.passed;
      results.summary.failed += installResults.failed;
    }

    saveResults(results, startTime);
    process.exit(1);
  }

  log('\n✓ Installation tests passed', 'green');

  // Load install results
  const installResultsFile = path.join(RESULTS_DIR, 'install-test-results.json');
  if (fs.existsSync(installResultsFile)) {
    const installData = JSON.parse(fs.readFileSync(installResultsFile, 'utf-8'));
    results.summary.total += installData.passed + installData.failed;
    results.summary.passed += installData.passed;
    results.summary.failed += installData.failed;
  }

  // Phase 2: Unit Tests
  header('PHASE 2: Unit Tests');

  log('Running unit tests...', 'cyan');
  const unitResult = runCommand('node tests/run-with-electron.js tests/unit/run-unit-tests.js');
  results.phases.push({
    name: 'Unit Tests',
    success: unitResult.success,
    output: unitResult.output
  });

  // Load unit test results
  const unitResultsFile = path.join(RESULTS_DIR, 'unit-test-results.json');
  if (fs.existsSync(unitResultsFile)) {
    const unitData = JSON.parse(fs.readFileSync(unitResultsFile, 'utf-8'));
    results.summary.total += unitData.totalPassed + unitData.totalFailed;
    results.summary.passed += unitData.totalPassed;
    results.summary.failed += unitData.totalFailed;
  }

  if (unitResult.success) {
    log('\n✓ Unit tests passed', 'green');
  } else {
    log('\n⚠ Some unit tests failed', 'yellow');
  }

  // Phase 3: E2E Tests
  header('PHASE 3: E2E Tests (Playwright)');

  log('Running E2E tests...', 'cyan');
  log('Note: This will launch the Electron application\n', 'yellow');

  const e2eResult = runCommand('npx playwright test --config playwright.config.js', {
    timeout: 600000 // 10 minutes for E2E tests
  });

  results.phases.push({
    name: 'E2E Tests',
    success: e2eResult.success,
    output: e2eResult.output
  });

  // Load E2E test results
  const e2eResultsFile = path.join(RESULTS_DIR, 'e2e-test-results.json');
  if (fs.existsSync(e2eResultsFile)) {
    try {
      const e2eData = JSON.parse(fs.readFileSync(e2eResultsFile, 'utf-8'));
      if (e2eData.stats) {
        results.summary.total += e2eData.stats.expected || 0;
        results.summary.passed += (e2eData.stats.expected || 0) - (e2eData.stats.unexpected || 0);
        results.summary.failed += e2eData.stats.unexpected || 0;
      }
    } catch (e) {
      // Results file may have different format
    }
  }

  if (e2eResult.success) {
    log('\n✓ E2E tests passed', 'green');
  } else {
    log('\n⚠ Some E2E tests failed', 'yellow');
  }

  // Final Summary
  saveResults(results, startTime);
  printSummary(results, startTime);

  const exitCode = results.summary.failed > 0 ? 1 : 0;
  process.exit(exitCode);
}

function saveResults(results, startTime) {
  results.duration = Date.now() - startTime;
  const resultsPath = path.join(RESULTS_DIR, 'full-test-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
}

function printSummary(results, startTime) {
  const duration = Date.now() - startTime;
  const minutes = Math.floor(duration / 60000);
  const seconds = ((duration % 60000) / 1000).toFixed(1);

  header('TEST SUMMARY');

  console.log(`  Total Tests:  ${results.summary.total}`);
  log(`  Passed:       ${results.summary.passed}`, results.summary.passed > 0 ? 'green' : 'reset');
  log(`  Failed:       ${results.summary.failed}`, results.summary.failed > 0 ? 'red' : 'reset');
  console.log(`  Duration:     ${minutes}m ${seconds}s`);

  console.log('\n  Phases:');
  for (const phase of results.phases) {
    const status = phase.success ? '✓' : '✗';
    const color = phase.success ? 'green' : 'red';
    log(`    ${status} ${phase.name}`, color);
  }

  console.log('\n  Results saved to:');
  console.log('    - tests/full-test-results.json');
  console.log('    - tests/install-test-results.json');
  console.log('    - tests/unit-test-results.json');
  console.log('    - tests/e2e-test-results.json');

  if (results.summary.failed > 0) {
    console.log('\n' + '─'.repeat(70));
    log('\n  ❌ SOME TESTS FAILED\n', 'red');
    console.log('  Review the test output above for details.');
    console.log('  Run individual test suites for more information:');
    console.log('    npm run test:install  - Installation tests');
    console.log('    npm run test:unit     - Unit tests');
    console.log('    npm run test:e2e      - E2E tests');
  } else {
    console.log('\n' + '─'.repeat(70));
    log('\n  ✅ ALL TESTS PASSED\n', 'green');
  }

  console.log('═'.repeat(70) + '\n');
}

// Handle errors
process.on('uncaughtException', (error) => {
  log(`\nFatal error: ${error.message}`, 'red');
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  log(`\nUnhandled rejection: ${error}`, 'red');
  process.exit(1);
});

// Run tests
runTests();
