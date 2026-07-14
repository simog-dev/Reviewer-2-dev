#!/usr/bin/env node

/**
 * PDF Loading Test
 * Standalone test to verify PDF.js loading works correctly
 */

const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const TEST_PDF_PATH = path.join(FIXTURES_DIR, 'test-document.pdf');

async function testPDFLoading() {
  console.log('\n📄 PDF Loading Test\n');
  console.log('='.repeat(50));

  // Ensure test PDF exists
  if (!fs.existsSync(TEST_PDF_PATH)) {
    console.log('Creating test PDF...');
    createTestPDF(TEST_PDF_PATH);
  }

  console.log(`\nTest PDF: ${TEST_PDF_PATH}`);
  console.log(`File exists: ${fs.existsSync(TEST_PDF_PATH)}`);

  // Read the file
  const buffer = fs.readFileSync(TEST_PDF_PATH);
  console.log(`File size: ${buffer.length} bytes`);

  // Convert to Uint8Array (as we do in main.js)
  const uint8Array = new Uint8Array(buffer);
  console.log(`Uint8Array length: ${uint8Array.length}`);

  // Try to load with PDF.js
  console.log('\nLoading PDF.js (legacy build for Node.js)...');

  try {
    // Use dynamic import for ES module
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    console.log('PDF.js version:', pdfjsLib.version);

    // Set worker source to the actual worker file
    const workerPath = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${workerPath}`;
    console.log('Worker path:', pdfjsLib.GlobalWorkerOptions.workerSrc);

    console.log('\nLoading PDF document...');
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      verbosity: 0
    });

    const pdf = await loadingTask.promise;
    console.log(`\n✓ PDF loaded successfully!`);
    console.log(`  Pages: ${pdf.numPages}`);

    // Try to get first page
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    console.log(`  Page 1 size: ${viewport.width.toFixed(0)} x ${viewport.height.toFixed(0)}`);

    // Try to get text content
    const textContent = await page.getTextContent();
    console.log(`  Text items on page 1: ${textContent.items.length}`);

    if (textContent.items.length > 0) {
      const firstText = textContent.items[0].str;
      console.log(`  First text: "${firstText}"`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ PDF LOADING TEST PASSED');
    console.log('='.repeat(50) + '\n');

    return true;
  } catch (error) {
    console.error('\n❌ PDF Loading failed:', error.message);
    console.error('\nStack trace:', error.stack);

    console.log('\n' + '='.repeat(50));
    console.log('❌ PDF LOADING TEST FAILED');
    console.log('='.repeat(50) + '\n');

    return false;
  }
}

function createTestPDF(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Minimal valid PDF
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 123 >>
stream
BT
/F1 24 Tf
100 700 Td
(Test PDF Document) Tj
0 -30 Td
/F1 12 Tf
(This is a test document.) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000441 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
520
%%EOF`;

  fs.writeFileSync(filePath, pdf);
  console.log(`Created: ${filePath}`);
}

testPDFLoading()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
