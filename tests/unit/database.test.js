/**
 * Database Unit Tests
 * Tests the SQLite database operations
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Test database path (use temp directory)
const TEST_DB_PATH = path.join(os.tmpdir(), 'pdf-reviewer-test.sqlite');

class TestRunner {
  constructor(name) {
    this.suiteName = name;
    this.results = [];
    this.passed = 0;
    this.failed = 0;
    this.db = null;
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

  assertNotNull(value, message) {
    if (value === null || value === undefined) {
      throw new Error(message || 'Value is null/undefined');
    }
  }

  assertLength(arr, length, message) {
    if (!Array.isArray(arr) || arr.length !== length) {
      throw new Error(`${message || 'Array length mismatch'}: expected ${length}, got ${arr?.length}`);
    }
  }

  summary() {
    console.log('\n' + '-'.repeat(40));
    console.log(`${this.suiteName}: ${this.passed} passed, ${this.failed} failed`);
    return { passed: this.passed, failed: this.failed, results: this.results };
  }
}

async function runDatabaseTests() {
  console.log('\n🗄️  Database Unit Tests\n');
  console.log('='.repeat(50));

  const runner = new TestRunner('Database Tests');

  // Clean up any existing test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  // Load the database module
  const DBManager = require('../../src/database/db.js');
  let db;

  // Setup
  console.log('\n1. Database Initialization\n');

  await runner.test('Database can be created', () => {
    db = new DBManager(TEST_DB_PATH);
    runner.assertNotNull(db, 'Database instance is null');
    runner.assert(fs.existsSync(TEST_DB_PATH), 'Database file not created');
  });

  await runner.test('Schema tables exist', () => {
    const tables = db.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all();
    const tableNames = tables.map(t => t.name);

    runner.assert(tableNames.includes('pdfs'), 'pdfs table missing');
    runner.assert(tableNames.includes('annotations'), 'annotations table missing');
    runner.assert(tableNames.includes('categories'), 'categories table missing');
    runner.assert(tableNames.includes('settings'), 'settings table missing');
  });

  await runner.test('Default categories are seeded', () => {
    const categories = db.getAllCategories();
    runner.assertLength(categories, 5, 'Should have 5 default categories');

    const names = categories.map(c => c.name);
    runner.assert(names.includes('Critical'), 'Missing Critical category');
    runner.assert(names.includes('Major'), 'Missing Major category');
    runner.assert(names.includes('Minor'), 'Missing Minor category');
    runner.assert(names.includes('Suggestion'), 'Missing Suggestion category');
    runner.assert(names.includes('Question'), 'Missing Question category');
  });

  // PDF Operations
  console.log('\n2. PDF Operations\n');

  let testPdfId;

  await runner.test('addPDF creates a new PDF record', () => {
    const pdf = db.addPDF({
      name: 'test-document.pdf',
      path: '/path/to/test-document.pdf',
      pageCount: 10
    });

    runner.assertNotNull(pdf, 'PDF not created');
    runner.assertNotNull(pdf.id, 'PDF has no ID');
    runner.assertEqual(pdf.name, 'test-document.pdf', 'Name mismatch');
    runner.assertEqual(pdf.page_count, 10, 'Page count mismatch');

    testPdfId = pdf.id;
  });

  await runner.test('getPDF retrieves PDF by ID', () => {
    const pdf = db.getPDF(testPdfId);
    runner.assertNotNull(pdf, 'PDF not found');
    runner.assertEqual(pdf.id, testPdfId, 'ID mismatch');
    runner.assertEqual(pdf.name, 'test-document.pdf', 'Name mismatch');
  });

  await runner.test('getAllPDFs returns all PDFs', () => {
    const pdfs = db.getAllPDFs();
    runner.assert(pdfs.length >= 1, 'Should have at least 1 PDF');
    runner.assert(pdfs.some(p => p.id === testPdfId), 'Test PDF not in list');
  });

  await runner.test('updatePDF modifies PDF record', () => {
    const updated = db.updatePDF(testPdfId, {
      name: 'updated-document.pdf',
      pageCount: 20
    });

    runner.assertEqual(updated.name, 'updated-document.pdf', 'Name not updated');
    runner.assertEqual(updated.page_count, 20, 'Page count not updated');
  });

  await runner.test('searchPDFs finds PDFs by name', () => {
    const results = db.searchPDFs('updated');
    runner.assert(results.length >= 1, 'Search should find PDF');
    runner.assert(results.some(p => p.id === testPdfId), 'Test PDF not in results');
  });

  await runner.test('addPDF with duplicate path returns existing PDF', () => {
    const pdf = db.addPDF({
      name: 'duplicate.pdf',
      path: '/path/to/test-document.pdf', // Same path as before
      pageCount: 5
    });

    runner.assertEqual(pdf.id, testPdfId, 'Should return existing PDF');
  });

  // Annotation Operations
  console.log('\n3. Annotation Operations\n');

  let testAnnotationId;

  await runner.test('addAnnotation creates a new annotation', () => {
    const annotation = db.addAnnotation({
      pdfId: testPdfId,
      categoryId: 1, // Critical
      pageNumber: 1,
      selectedText: 'Test selected text',
      comment: 'Test comment',
      highlightRects: [{ left: 10, top: 20, width: 100, height: 15 }]
    });

    runner.assertNotNull(annotation, 'Annotation not created');
    runner.assertNotNull(annotation.id, 'Annotation has no ID');
    runner.assertEqual(annotation.page_number, 1, 'Page number mismatch');
    runner.assertEqual(annotation.selected_text, 'Test selected text', 'Text mismatch');
    runner.assertEqual(annotation.comment, 'Test comment', 'Comment mismatch');
    runner.assertEqual(annotation.category_name, 'Critical', 'Category mismatch');

    testAnnotationId = annotation.id;
  });

  await runner.test('getAnnotation retrieves annotation by ID', () => {
    const annotation = db.getAnnotation(testAnnotationId);
    runner.assertNotNull(annotation, 'Annotation not found');
    runner.assertEqual(annotation.id, testAnnotationId, 'ID mismatch');
  });

  await runner.test('getAnnotationsForPDF returns all annotations for a PDF', () => {
    // Add another annotation
    db.addAnnotation({
      pdfId: testPdfId,
      categoryId: 2, // Major
      pageNumber: 2,
      selectedText: 'Another text',
      comment: 'Another comment',
      highlightRects: [{ left: 50, top: 100, width: 80, height: 12 }]
    });

    const annotations = db.getAnnotationsForPDF(testPdfId);
    runner.assert(annotations.length >= 2, 'Should have at least 2 annotations');
  });

  await runner.test('updateAnnotation modifies annotation', () => {
    const updated = db.updateAnnotation(testAnnotationId, {
      categoryId: 3, // Minor
      comment: 'Updated comment'
    });

    runner.assertEqual(updated.comment, 'Updated comment', 'Comment not updated');
    runner.assertEqual(updated.category_name, 'Minor', 'Category not updated');
  });

  await runner.test('getAnnotationCountByCategory returns counts', () => {
    const counts = db.getAnnotationCountByCategory(testPdfId);
    runner.assert(counts.length === 5, 'Should have 5 category counts');

    const totalCount = counts.reduce((sum, c) => sum + c.count, 0);
    runner.assert(totalCount >= 2, 'Should have at least 2 annotations');
  });

  await runner.test('highlight_rects is parsed as array', () => {
    const annotation = db.getAnnotation(testAnnotationId);
    runner.assert(Array.isArray(annotation.highlight_rects), 'highlight_rects should be array');
    runner.assert(annotation.highlight_rects[0].left !== undefined, 'Rect should have left');
  });

  await runner.test('deleteAnnotation removes annotation', () => {
    const beforeCount = db.getAnnotationsForPDF(testPdfId).length;
    db.deleteAnnotation(testAnnotationId);
    const afterCount = db.getAnnotationsForPDF(testPdfId).length;

    runner.assertEqual(afterCount, beforeCount - 1, 'Annotation not deleted');
  });

  // Category Operations
  console.log('\n4. Category Operations\n');

  await runner.test('getAllCategories returns categories in order', () => {
    const categories = db.getAllCategories();
    runner.assertLength(categories, 5, 'Should have 5 categories');

    // Check order by sort_order
    for (let i = 0; i < categories.length - 1; i++) {
      runner.assert(
        categories[i].sort_order <= categories[i + 1].sort_order,
        'Categories not sorted correctly'
      );
    }
  });

  await runner.test('getCategory retrieves category by ID', () => {
    const category = db.getCategory(1);
    runner.assertNotNull(category, 'Category not found');
    runner.assertEqual(category.name, 'Critical', 'Wrong category');
    runner.assertNotNull(category.color, 'Category has no color');
  });

  // Settings Operations
  console.log('\n5. Settings Operations\n');

  await runner.test('setSetting stores a value', () => {
    db.setSetting('testKey', 'testValue');
    const value = db.getSetting('testKey');
    runner.assertEqual(value, 'testValue', 'Value not stored correctly');
  });

  await runner.test('setSetting handles objects', () => {
    const obj = { foo: 'bar', count: 42 };
    db.setSetting('testObject', obj);
    const value = db.getSetting('testObject');
    runner.assertEqual(value.foo, 'bar', 'Object not stored correctly');
    runner.assertEqual(value.count, 42, 'Object not stored correctly');
  });

  await runner.test('getSetting returns null for missing key', () => {
    const value = db.getSetting('nonexistentKey');
    runner.assertEqual(value, null, 'Should return null for missing key');
  });

  // Cleanup Operations
  console.log('\n6. Cleanup Operations\n');

  await runner.test('deletePDF removes PDF and its annotations', () => {
    // Add a PDF with annotations
    const pdf = db.addPDF({
      name: 'to-delete.pdf',
      path: '/path/to/delete.pdf',
      pageCount: 5
    });

    db.addAnnotation({
      pdfId: pdf.id,
      categoryId: 1,
      pageNumber: 1,
      selectedText: 'Delete me',
      highlightRects: [{ left: 0, top: 0, width: 50, height: 10 }]
    });

    db.deletePDF(pdf.id, true);

    const deletedPdf = db.getPDF(pdf.id);
    runner.assertEqual(deletedPdf, undefined, 'PDF should be deleted');

    const annotations = db.getAnnotationsForPDF(pdf.id);
    runner.assertLength(annotations, 0, 'Annotations should be deleted');
  });

  await runner.test('Database can be closed', () => {
    db.close();
    runner.assert(true, 'Database closed');
  });

  // Cleanup test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  return runner.summary();
}

module.exports = { runDatabaseTests };

// Run if executed directly
if (require.main === module) {
  runDatabaseTests()
    .then(result => {
      process.exit(result.failed === 0 ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
