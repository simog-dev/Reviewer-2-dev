/**
 * Global Teardown for E2E Tests
 * Runs after all tests
 */

const fs = require('fs');
const path = require('path');

module.exports = async function globalTeardown() {
  console.log('\n🧹 E2E Test Teardown\n');

  // Clean up test database
  const fixturesDir = path.join(__dirname, '..', 'fixtures');
  const testDbPath = path.join(fixturesDir, 'test-database.sqlite');

  if (fs.existsSync(testDbPath)) {
    try {
      fs.unlinkSync(testDbPath);
      console.log('Removed test database.');
    } catch (error) {
      console.log('Could not remove test database:', error.message);
    }
  }


  const testUserDataPath = path.join(fixturesDir, 'test-user-data');
  fs.rmSync(testUserDataPath, { recursive: true, force: true });

  console.log('Teardown complete.\n');
};
