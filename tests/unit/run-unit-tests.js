/**
 * Unit Test Runner
 * Runs all unit tests and generates a combined report
 */

const path = require('path');
const fs = require('fs');

async function runAllUnitTests() {
  console.log('\n' + '═'.repeat(60));
  console.log('  UNIT TEST SUITE');
  console.log('═'.repeat(60));

  const results = {
    timestamp: new Date().toISOString(),
    suites: [],
    totalPassed: 0,
    totalFailed: 0
  };

  // Test suites to run
  const suites = [
    { name: 'Database', file: './database.test.js', runner: 'runDatabaseTests' },
    { name: 'Utils', file: './utils.test.js', runner: 'runUtilsTests' },
    { name: 'Reference Parser', file: './reference-parser.test.js', runner: 'runReferenceParserTests' }
  ];

  for (const suite of suites) {
    try {
      const testModule = require(suite.file);
      const result = await testModule[suite.runner]();

      results.suites.push({
        name: suite.name,
        ...result
      });

      results.totalPassed += result.passed;
      results.totalFailed += result.failed;
    } catch (error) {
      console.error(`\n❌ Failed to run ${suite.name} tests:`, error.message);
      results.suites.push({
        name: suite.name,
        passed: 0,
        failed: 1,
        results: [{ name: 'Suite initialization', status: 'FAIL', error: error.message }]
      });
      results.totalFailed++;
    }
  }

  // Print summary
  console.log('\n' + '═'.repeat(60));
  console.log('  UNIT TEST SUMMARY');
  console.log('═'.repeat(60));
  console.log(`\n  Total: ${results.totalPassed + results.totalFailed} tests`);
  console.log(`  Passed: ${results.totalPassed}`);
  console.log(`  Failed: ${results.totalFailed}`);
  console.log('\n  Results by suite:');

  for (const suite of results.suites) {
    const status = suite.failed === 0 ? '✓' : '✗';
    console.log(`    ${status} ${suite.name}: ${suite.passed} passed, ${suite.failed} failed`);
  }

  console.log('\n' + '═'.repeat(60));

  // Save results
  const resultsPath = path.join(__dirname, '..', 'unit-test-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${resultsPath}`);

  return results.totalFailed === 0;
}

runAllUnitTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
