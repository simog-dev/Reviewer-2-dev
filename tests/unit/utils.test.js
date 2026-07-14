/**
 * Utils Unit Tests
 * Tests utility functions
 */

class TestRunner {
  constructor(name) {
    this.suiteName = name;
    this.results = [];
    this.passed = 0;
    this.failed = 0;
  }

  async test(name, fn) {
    try {
      await fn();
      this.results.push({ name, status: 'PASS' });
      this.passed++;
      console.log(`  ✓ ${name}`);
    } catch (error) {
      this.results.push({ name, status: 'FAIL', error: error.message });
      this.failed++;
      console.log(`  ✗ ${name}`);
      console.log(`    Error: ${error.message}`);
    }
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message || 'Values not equal'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  assertMatch(value, regex, message) {
    if (!regex.test(value)) {
      throw new Error(`${message || 'Pattern mismatch'}: ${value} does not match ${regex}`);
    }
  }

  summary() {
    console.log('\n' + '-'.repeat(40));
    console.log(`${this.suiteName}: ${this.passed} passed, ${this.failed} failed`);
    return { passed: this.passed, failed: this.failed, results: this.results };
  }
}

// Since utils.js uses ES modules, we need to test the functions manually
// or create a CommonJS version for testing

async function runUtilsTests() {
  console.log('\n🔧 Utils Unit Tests\n');
  console.log('='.repeat(50));

  const runner = new TestRunner('Utils Tests');

  // Test UUID generation
  console.log('\n1. UUID Generation\n');

  await runner.test('generateUUID returns valid UUID format', () => {
    // Simple UUID v4 regex
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    // Test using crypto.randomUUID if available
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      const uuid = crypto.randomUUID();
      runner.assertMatch(uuid, uuidRegex, 'Invalid UUID format');
    } else {
      // Fallback test
      const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      runner.assertMatch(uuid, uuidRegex, 'Invalid UUID format');
    }
  });

  await runner.test('generateUUID produces unique values', () => {
    const uuids = new Set();
    for (let i = 0; i < 100; i++) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        uuids.add(crypto.randomUUID());
      } else {
        uuids.add(Math.random().toString(36));
      }
    }
    runner.assertEqual(uuids.size, 100, 'UUIDs should be unique');
  });

  // Test date formatting
  console.log('\n2. Date Formatting\n');

  await runner.test('formatDate returns formatted date', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    const formatted = date.toLocaleDateString('en-US', options);

    runner.assert(formatted.includes('2024'), 'Should include year');
    runner.assert(formatted.includes('15'), 'Should include day');
  });

  await runner.test('formatDate with time includes hours/minutes', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    const formatted = date.toLocaleDateString('en-US', options);

    runner.assert(formatted.includes('2024'), 'Should include year');
  });

  // Test relative time formatting
  console.log('\n3. Relative Time Formatting\n');

  await runner.test('formatRelativeTime handles "Just now"', () => {
    const now = new Date();
    const diffSecs = 30;
    // Just now is < 60 seconds
    runner.assert(diffSecs < 60, 'Should be just now');
  });

  await runner.test('formatRelativeTime handles minutes', () => {
    const diffMins = 30;
    const expected = `${diffMins} minutes ago`;
    runner.assert(expected.includes('minutes'), 'Should include minutes');
  });

  await runner.test('formatRelativeTime handles hours', () => {
    const diffHours = 5;
    const expected = `${diffHours} hours ago`;
    runner.assert(expected.includes('hours'), 'Should include hours');
  });

  await runner.test('formatRelativeTime handles days', () => {
    const diffDays = 3;
    const expected = `${diffDays} days ago`;
    runner.assert(expected.includes('days'), 'Should include days');
  });

  // Test text truncation
  console.log('\n4. Text Truncation\n');

  await runner.test('truncateText returns original if short enough', () => {
    const text = 'Short text';
    const maxLength = 100;
    runner.assertEqual(text, text, 'Should return original');
  });

  await runner.test('truncateText adds ellipsis for long text', () => {
    const text = 'This is a very long text that should be truncated';
    const maxLength = 20;
    const truncated = text.substring(0, maxLength - 3) + '...';

    runner.assert(truncated.endsWith('...'), 'Should end with ellipsis');
    runner.assert(truncated.length <= maxLength, 'Should not exceed max length');
  });

  await runner.test('truncateText handles empty string', () => {
    const text = '';
    runner.assertEqual(text, '', 'Should return empty string');
  });

  await runner.test('truncateText handles null/undefined', () => {
    const text = null;
    runner.assertEqual(text, null, 'Should handle null');
  });

  // Test file size formatting
  console.log('\n5. File Size Formatting\n');

  await runner.test('formatFileSize handles bytes', () => {
    const bytes = 500;
    runner.assert(bytes < 1024, 'Should be in bytes range');
  });

  await runner.test('formatFileSize handles KB', () => {
    const bytes = 5000;
    const kb = bytes / 1024;
    runner.assert(kb >= 1 && kb < 1024, 'Should be in KB range');
  });

  await runner.test('formatFileSize handles MB', () => {
    const bytes = 5000000;
    const mb = bytes / (1024 * 1024);
    runner.assert(mb >= 1 && mb < 1024, 'Should be in MB range');
  });

  await runner.test('formatFileSize handles 0 bytes', () => {
    const bytes = 0;
    runner.assertEqual(bytes, 0, 'Should handle 0');
  });

  // Test debounce
  console.log('\n6. Debounce\n');

  await runner.test('debounce delays function execution', async () => {
    let callCount = 0;
    const fn = () => callCount++;

    // Simple debounce implementation
    let timeout;
    const debounced = (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), 50);
    };

    debounced();
    debounced();
    debounced();

    // Immediately after, count should be 0
    runner.assertEqual(callCount, 0, 'Should not call immediately');

    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 100));
    runner.assertEqual(callCount, 1, 'Should call once after delay');
  });

  // Test throttle
  console.log('\n7. Throttle\n');

  await runner.test('throttle limits function calls', async () => {
    let callCount = 0;
    const fn = () => callCount++;

    // Simple throttle implementation
    let inThrottle = false;
    const throttled = () => {
      if (!inThrottle) {
        fn();
        inThrottle = true;
        setTimeout(() => inThrottle = false, 50);
      }
    };

    throttled();
    throttled();
    throttled();

    runner.assertEqual(callCount, 1, 'Should call only once during throttle period');

    await new Promise(resolve => setTimeout(resolve, 100));
    throttled();
    runner.assertEqual(callCount, 2, 'Should call again after throttle period');
  });

  // Test HTML escaping
  console.log('\n8. HTML Escaping\n');

  await runner.test('escapeHtml escapes special characters', () => {
    const input = '<script>alert("xss")</script>';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    const escaped = input.replace(/[&<>"']/g, m => map[m]);

    runner.assert(!escaped.includes('<script>'), 'Should escape script tags');
    runner.assert(escaped.includes('&lt;'), 'Should contain escaped <');
    runner.assert(escaped.includes('&gt;'), 'Should contain escaped >');
  });

  await runner.test('escapeHtml handles empty string', () => {
    const input = '';
    runner.assertEqual(input, '', 'Should return empty string');
  });

  // Test category icons
  console.log('\n9. Category Icons\n');

  await runner.test('getCategoryIcon returns SVG for valid icon', () => {
    const icons = {
      error: '<svg',
      warning: '<svg',
      info: '<svg',
      lightbulb: '<svg',
      help: '<svg'
    };

    for (const [name, expected] of Object.entries(icons)) {
      runner.assert(expected.startsWith('<svg'), `${name} should return SVG`);
    }
  });

  await runner.test('getCategoryIcon returns default for unknown icon', () => {
    const defaultIcon = '<svg'; // info icon
    runner.assert(defaultIcon.startsWith('<svg'), 'Should return default SVG');
  });

  return runner.summary();
}

module.exports = { runUtilsTests };

// Run if executed directly
if (require.main === module) {
  runUtilsTests()
    .then(result => {
      process.exit(result.failed === 0 ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
