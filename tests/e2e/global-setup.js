/**
 * Global Setup for E2E Tests
 * Runs before all tests
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

module.exports = async function globalSetup() {
  console.log('\n🔧 E2E Test Setup\n');

  // Create test fixtures directory if it doesn't exist
  const fixturesDir = path.join(__dirname, '..', 'fixtures');
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  // Create a simple test PDF if it doesn't exist
  const testPdfPath = path.join(fixturesDir, 'test-document.pdf');
  if (!fs.existsSync(testPdfPath)) {
    console.log('Creating test PDF fixture...');
    createTestPDF(testPdfPath);
  }

  // Clean up any existing test database
  const testDbPath = path.join(fixturesDir, 'test-database.sqlite');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  // Create test output directory
  const outputDir = path.join(__dirname, '..', 'e2e-results');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Setup complete.\n');
};

/**
 * Creates a minimal valid PDF file for testing
 */
function createTestPDF(filePath) {
  // Minimal PDF with 3 pages and some text
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R 6 0 R 9 0 R] /Count 3 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 178 >>
stream
BT
/F1 24 Tf
100 700 Td
(Test PDF Document - Page 1) Tj
0 -30 Td
/F1 12 Tf
(This is a test document for PDF Reviewer.) Tj
0 -20 Td
(It contains some sample text for highlighting.) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
6 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 7 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
7 0 obj
<< /Length 147 >>
stream
BT
/F1 24 Tf
100 700 Td
(Test PDF Document - Page 2) Tj
0 -30 Td
/F1 12 Tf
(Second page with more content.) Tj
0 -20 Td
(Additional text for testing annotations.) Tj
ET
endstream
endobj
8 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
9 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 10 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
10 0 obj
<< /Length 120 >>
stream
BT
/F1 24 Tf
100 700 Td
(Test PDF Document - Page 3) Tj
0 -30 Td
/F1 12 Tf
(Third and final page.) Tj
ET
endstream
endobj
xref
0 11
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000125 00000 n
0000000266 00000 n
0000000496 00000 n
0000000575 00000 n
0000000716 00000 n
0000000915 00000 n
0000000994 00000 n
0000001136 00000 n
trailer
<< /Size 11 /Root 1 0 R >>
startxref
1308
%%EOF`;

  fs.writeFileSync(filePath, pdf);
  console.log(`Created test PDF: ${filePath}`);
}
