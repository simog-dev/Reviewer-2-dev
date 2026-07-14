/**
 * Reference Parser Unit Tests
 */

const path = require('path');
const { pathToFileURL } = require('url');

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
      console.log(`  PASS ${name}`);
    } catch (error) {
      this.results.push({ name, status: 'FAIL', error: error.message });
      this.failed++;
      console.log(`  FAIL ${name}`);
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

  summary() {
    console.log('\n' + '-'.repeat(40));
    console.log(`${this.suiteName}: ${this.passed} passed, ${this.failed} failed`);
    return { passed: this.passed, failed: this.failed, results: this.results };
  }
}

function textItem(str, x, y) {
  return {
    str,
    width: Math.max(str.length * 5, 1),
    height: 10,
    transform: [10, 0, 0, 10, x, y]
  };
}

function fakePdfDocument(pages) {
  return {
    numPages: pages.length,
    async getPage(pageNumber) {
      return {
        async getTextContent() {
          return { items: pages[pageNumber - 1] };
        }
      };
    }
  };
}

async function loadParser() {
  const parserPath = path.join(__dirname, '..', '..', 'src', 'js', 'reference-parser.js');
  return import(pathToFileURL(parserPath).href);
}

async function runReferenceParserTests() {
  console.log('\nReference Parser Unit Tests\n');
  console.log('='.repeat(50));

  const runner = new TestRunner('Reference Parser Tests');
  const parser = await loadParser();

  await runner.test('parseReferenceEntry removes spaced bracket labels', () => {
    const ref = parser.parseReferenceEntry('[ 12 ] Smith J. A useful paper. doi:10.1234/example.', 12);
    runner.assertEqual(ref.text, 'Smith J. A useful paper. doi:10.1234/example.', 'Reference label should be removed');
    runner.assertEqual(ref.doi, '10.1234/example', 'DOI should be extracted');
  });

  await runner.test('extractDOI ignores duplicated doi labels after DOI URLs', () => {
    const text = 'https://doi.org/10.1080/17483107.2023.2288391doi:10.1080/17483107.2023.2288391';
    runner.assertEqual(
      parser.extractDOI(text),
      '10.1080/17483107.2023.2288391',
      'DOI should stop before a duplicated doi label'
    );
  });

  await runner.test('extractReferencesFromPages handles split heading and split bracket number', async () => {
    const pdf = fakePdfDocument([
      [
        textItem('Refer', 100, 700),
        textItem('ences', 132, 700),
        textItem('[', 100, 660),
        textItem('1', 106, 660),
        textItem(']', 112, 660),
        textItem('Smith J. First article.', 124, 660),
        textItem('[2]', 100, 640),
        textItem('Jones A. Second article.', 124, 640)
      ]
    ]);

    const result = await parser.extractReferencesFromPages(pdf);

    runner.assertEqual(result.references.size, 2, 'Should extract both references');
    runner.assertEqual(result.references.get(1).text, 'Smith J. First article.', 'First reference text should be clean');
    runner.assertEqual(result.references.get(2).text, 'Jones A. Second article.', 'Second reference text should be clean');
    runner.assertEqual(result.refFormat, 'bracket', 'Should detect bracket format');
  });

  await runner.test('extractReferencesFromPages handles dot labels split across items', async () => {
    const pdf = fakePdfDocument([
      [
        textItem('References', 100, 700),
        textItem('1', 100, 660),
        textItem('.', 108, 660),
        textItem('Smith J. First dot article.', 124, 660),
        textItem('2.', 100, 640),
        textItem('Jones A. Second dot article.', 124, 640)
      ]
    ]);

    const result = await parser.extractReferencesFromPages(pdf);

    runner.assertEqual(result.references.size, 2, 'Should extract both dot references');
    runner.assertEqual(result.references.get(1).text, 'Smith J. First dot article.', 'First dot reference text should be clean');
    runner.assertEqual(result.refFormat, 'dot', 'Should detect dot format');
  });

  await runner.test('numeric gutter detection preserves split dot labels', async () => {
    const entries = [];
    for (let number = 1; number <= 6; number++) {
      const y = 680 - (number * 20);
      entries.push(
        textItem(String(number), 100, y),
        textItem('.', 108, y),
        textItem(`Author ${number}. Article ${number}.`, 124, y)
      );
    }
    const pdf = fakePdfDocument([[
      textItem('References', 100, 700),
      ...entries
    ]]);

    const result = await parser.extractReferencesFromPages(pdf);

    runner.assertEqual(result.references.size, 6, 'All split dot references should remain detectable');
    runner.assertEqual(result.references.get(6).text, 'Author 6. Article 6.', 'Last split dot reference should be intact');
  });

  await runner.test('extractReferencesFromPages keeps references that span pages', async () => {
    const pdf = fakePdfDocument([
      [
        textItem('References', 100, 700),
        textItem('[86]', 100, 660),
        textItem('Prior A. Previous article.', 132, 660),
        textItem('[87]', 100, 120),
        textItem('Yao X. Benefits and barriers associated with smart', 132, 120)
      ],
      [
        textItem('home health technologies in the care of older persons.', 132, 740),
        textItem('BMC geriatrics 24, 1 (2024), 152.', 132, 720),
        textItem('[88]', 100, 680),
        textItem('Next B. Following article.', 132, 680)
      ]
    ]);

    const result = await parser.extractReferencesFromPages(pdf);

    runner.assert(result.references.has(87), 'Reference 87 should be extracted');
    runner.assertEqual(result.references.get(87).startPage, 1, 'Reference 87 should start on page 1');
    runner.assertEqual(result.references.get(87).endPage, 2, 'Reference 87 should continue on page 2');
    runner.assert(result.references.get(87).text.includes('home health technologies'), 'Continuation text should be included');
  });

  await runner.test('extractReferencesFromPages excludes page furniture from cross-page references', async () => {
    const lineNumbers = Array.from({ length: 12 }, (_, index) =>
      textItem(String(index + 1), 20, 700 - (index * 12))
    );
    const pdf = fakePdfDocument([
      [
        textItem('References', 100, 760),
        textItem('[16]', 100, 160),
        textItem('Previous reference.', 132, 160),
        textItem('[17]', 100, 120),
        textItem('13', 20, 120),
        textItem('Ndibwile et al., in 2017 12th Asia Joint', 132, 120),
        textItem('25 Page 25 of 30', 250, 800),
        textItem('URL: http:/mc.manuscriptcentral.com/tbit', 200, 784),
        textItem('Email: review@example.test', 200, 768),
        textItem('Behaviour & Information Technology - FOR PEER REVIEW ONLY', 150, 752),
        ...lineNumbers
      ],
      [
        textItem('Conference on Information Security. 2017, pp. 38-47.', 132, 740),
        textItem('Available at https://example.test/paper.', 132, 720),
        textItem('[18]', 100, 680),
        textItem('Following reference.', 132, 680)
      ]
    ]);

    const result = await parser.extractReferencesFromPages(pdf);
    const reference = result.references.get(17);

    runner.assert(reference, 'Reference 17 should be extracted');
    runner.assert(reference.text.includes('Asia Joint Conference on Information Security'), 'Cross-page text should remain joined');
    runner.assert(reference.text.includes('https://example.test/paper'), 'A URL inside the reference should be preserved');
    runner.assert(!reference.text.includes('Page 25 of 30'), 'Page marker should be excluded');
    runner.assert(!reference.text.includes('mc.manuscriptcentral.com'), 'Publisher URL should be excluded');
    runner.assert(!reference.text.includes('FOR PEER REVIEW'), 'Review watermark should be excluded');
    runner.assert(!/\b1 2 3 4 5\b/.test(reference.text), 'Line-number gutter should be excluded');
  });

  return runner.summary();
}

module.exports = { runReferenceParserTests };

if (require.main === module) {
  runReferenceParserTests()
    .then(result => process.exit(result.failed === 0 ? 0 : 1))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
