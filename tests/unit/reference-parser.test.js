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

async function loadCitationSpanPlanner() {
  const plannerPath = path.join(__dirname, '..', '..', 'src', 'js', 'citation-span-planner.js');
  return import(pathToFileURL(plannerPath).href);
}

async function loadCitationTextModel() {
  const modelPath = path.join(__dirname, '..', '..', 'src', 'js', 'citation-text-model.js');
  return import(pathToFileURL(modelPath).href);
}

async function runReferenceParserTests() {
  console.log('\nReference Parser Unit Tests\n');
  console.log('='.repeat(50));

  const runner = new TestRunner('Reference Parser Tests');
  const parser = await loadParser();
  const spanPlanner = await loadCitationSpanPlanner();
  const citationTextModel = await loadCitationTextModel();

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

  await runner.test('line-number gutters crossing 999 do not hide references on the next page', async () => {
    const nextPageLines = Array.from({ length: 7 }, (_, index) => {
      const lineNumber = 998 + index;
      const y = 740 - (index * 20);
      // Mimic a right-aligned gutter: four-digit values start farther left.
      const gutterX = lineNumber < 1000 ? 25 : 20;
      const items = [textItem(String(lineNumber), gutterX, y)];
      if (index === 0) {
        items.push(
          textItem('[12]', 100, y),
          textItem('Davidoff S. Principles of Smart Home Control.', 132, y)
        );
      } else if (index === 4) {
        items.push(
          textItem('[13]', 100, y),
          textItem('DeepSeek. Preview Release.', 132, y)
        );
      }
      return items;
    }).flat();
    const pdf = fakePdfDocument([
      [
        textItem('References', 100, 760),
        textItem('[11]', 100, 120),
        textItem('Corno F. Empowering End Users.', 132, 120)
      ],
      nextPageLines
    ]);

    const result = await parser.extractReferencesFromPages(pdf);

    runner.assertEqual(result.references.size, 3, 'References after a gutter crossing 999 should remain detectable');
    runner.assert(result.references.has(12), 'Reference 12 should be extracted on the next page');
    runner.assert(result.references.has(13), 'Reference 13 should be extracted after the gutter crosses 1000');
    runner.assert(!/\b(?:99[89]|100[0-4])\b/.test(result.references.get(11).text), 'Reference 11 must not absorb line numbers');
    runner.assert(!/\b(?:99[89]|100[0-4])\b/.test(result.references.get(12).text), 'Reference 12 must not contain line numbers');
  });

  await runner.test('numbered references survive alternating page margins and deferred line-number gutters', async () => {
    for (const format of ['bracket', 'dot']) {
      const label = number => format === 'bracket' ? `[${number}]` : `${number}.`;
      const body = number => `Author ${String.fromCharCode(64 + number)}. A distinct article.`;
      const pages = Array.from({ length: 3 }, (_, pageIndex) => {
        // Recto/verso layouts shift the entire text block, not just the gutter.
        const left = pageIndex === 1 ? 150 : 100;
        const items = pageIndex === 0 ? [textItem('References', left, 760)] : [];
        for (let index = 0; index < 6; index++) {
          const number = pageIndex * 6 + index + 1;
          const y = 700 - index * 60;
          items.push(textItem(label(number), left, y));
          items.push(textItem(body(number), left + 32, y));
        }
        // The PDF stream can emit all margin numbers after the body text.
        for (let index = 0; index < 20; index++) {
          const number = 989 + pageIndex * 20 + index;
          items.push(textItem(String(number), left - 45, 720 - index * 20));
        }
        return items;
      });
      const { references } = await parser.extractReferencesFromPages(fakePdfDocument(pages));
      runner.assertEqual(references.size, 18, `${format}: all pages should be indexed`);
      for (let number = 1; number <= 18; number++) {
        runner.assertEqual(references.get(number)?.text, body(number),
          `${format}: reference ${number} must not absorb line numbers or later references`);
      }
      const citations = parser.findCitationsInText('[6,7,12,13,18]', references);
      runner.assert(citations[0].targets.every(target => references.has(target.id)),
        'Citations across page boundaries should resolve');
    }
  });

  await runner.test('last reference stops at a typographic section heading regardless of its title', async () => {
    for (const title of ['A Study Scenes', 'A. Study Scenes', 'A study scene', 'A. study scene', 'Evaluation Details']) {
      for (const newPage of [false, true]) {
        for (const prefix of ['[49] ', '1. ', '']) {
          const entry = 'A. Writer. 2022. Helping Users Debug Trigger-Action Programs.';
          const ending = 'Proceedings of the ACM. doi:10.1145/3569506';
          const heading = textItem(title, newPage ? 150 : 100, newPage ? 740 : 560);
          heading.height = 12;
          heading.transform = [12, 0, 0, 12, newPage ? 150 : 100, newPage ? 740 : 560];
          const bibliography = [
            textItem('References', 100, 760),
            textItem(prefix + entry, 100, 700),
            textItem(ending, 132, 680)
          ];
          const appendix = [heading, textItem('Study material and figures.', 150, 520),
            textItem('[50] A citation inside the appendix.', 150, 500)];
          const pages = newPage ? [bibliography, appendix] : [[...bibliography, ...appendix]];
          const result = await parser.extractReferencesFromPages(fakePdfDocument(pages));
          runner.assertEqual(result.references.size, 1, 'Appendix citations must not become bibliography entries');
          const ref = [...result.references.values()][0];
          runner.assertEqual(ref.text, `${entry} ${ending}`, `Stop before ${title} (${prefix}, next page: ${newPage})`);
          runner.assertEqual(ref.endPage, 1, 'Appendix page must not extend the reference');
          runner.assert(!result.refPages.has(2), 'Appendix page must not be indexed as bibliography');
        }
      }
    }
  });

  await runner.test('last reference retains ordinary continuation text across pages', async () => {
    const result = await parser.extractReferencesFromPages(fakePdfDocument([
      [textItem('References', 100, 760), textItem('[49] A. Writer. 2022.', 100, 120)],
      [textItem('A study scene and its interpretation.', 150, 740),
        textItem('Proceedings of the ACM. doi:10.1145/3569506', 150, 720)]
    ]));
    runner.assertEqual(result.references.get(49).text,
      'A. Writer. 2022. A study scene and its interpretation. Proceedings of the ACM. doi:10.1145/3569506',
      'Heading-like words at normal body size must not truncate a real reference');
    runner.assertEqual(result.references.get(49).endPage, 2, 'Genuine continuation should include the next page');
  });

  await runner.test('extractReferencesFromPages handles unnumbered author-year bibliographies', async () => {
    const pdf = fakePdfDocument([[
      textItem('References', 100, 720),
      textItem('Zheng, Q., Wu, A., and Park, T. (2021). A first study.', 100, 680),
      textItem('Continuation discussing evidence published in 2020.', 124, 660),
      textItem('Zheng, Q., and Li, P. (2024). A paired study.', 100, 620)
    ]]);

    const result = await parser.extractReferencesFromPages(pdf);
    const references = Array.from(result.references.values());

    runner.assertEqual(result.refFormat, 'author-year', 'Should detect author-year format');
    runner.assertEqual(references.length, 2, 'Should extract both unnumbered references');
    runner.assert(references[0].text.includes('evidence published in 2020'), 'A continuation containing a year should not start a new reference');
    runner.assertEqual(references[0].number, null, 'Author-year references should not receive fake numbers');
    runner.assert(references[1].citationKeys.some(key => key.includes('zheng:li:2024')), 'Two-author alias should be indexed');
  });

  await runner.test('findCitationsInText resolves et al. and two-author citations', async () => {
    const pdf = fakePdfDocument([[
      textItem('References', 100, 720),
      textItem('Zheng, Q., Wu, A., and Park, T. (2021). A first study.', 100, 680),
      textItem('Zheng, Q., and Li, P. (2024). A paired study.', 100, 640)
    ]]);
    const { references } = await parser.extractReferencesFromPages(pdf);
    const citations = parser.findCitationsInText(
      'Prior work (Zheng et al., 2021) was extended later (Zheng and Li, 2024).',
      references
    );

    runner.assertEqual(citations.length, 2, 'Should detect both citation forms');
    runner.assert(citations.every(citation => citation.targets.length === 1), 'Each citation should resolve once');
    runner.assert(citations.every(citation => citation.targets[0].id !== null), 'Both citations should resolve to references');
  });

  await runner.test('findCitationsInText handles semicolon groups and rejects generic parentheses', async () => {
    const pdf = fakePdfDocument([[
      textItem('References', 100, 720),
      textItem('Zheng, Q., Wu, A., and Park, T. (2021). A first study.', 100, 680),
      textItem('Zheng, Q., and Li, P. (2024). A paired study.', 100, 640)
    ]]);
    const { references } = await parser.extractReferencesFromPages(pdf);
    const citations = parser.findCitationsInText(
      'Evidence (Zheng et al., 2021; Zheng and Li, 2024), not merely (2021) or (Figure 2, 2021).',
      references
    );

    runner.assertEqual(citations.length, 1, 'Only the author-year group should be detected');
    runner.assertEqual(citations[0].targets.length, 2, 'Both references in the group should resolve');
  });

  await runner.test('extractReferencesFromPages indexes initial-first author lists', async () => {
    const pdf = fakePdfDocument([[
      textItem('References', 100, 720),
      textItem('R. Levering, M. Cutler, and L. Yu. 2008. Using Visual Features for Fine-Grained', 100, 680),
      textItem('Genre Classification of Web Pages. In Proc. of the 41st Hawaii Int. Conf. on', 124, 660),
      textItem('Systems Sciences (HICSS-41).', 124, 640),
      textItem('A. Symonenko. 2007. A semantic classification study.', 100, 600)
    ]]);

    const result = await parser.extractReferencesFromPages(pdf);
    const references = Array.from(result.references.values());
    const levering = references.find(reference => reference.text.startsWith('R. Levering'));

    runner.assertEqual(result.refFormat, 'author-year', 'Should detect initial-first author-year entries');
    runner.assertEqual(references.length, 2, 'Should extract both initial-first references');
    runner.assert(levering, 'Levering reference should be extracted');
    runner.assert(levering.text.includes('Systems Sciences (HICSS-41)'), 'Wrapped reference lines should be preserved');
    runner.assert(levering.citationKeys.some(key => key.includes('levering:2008')), 'First surname should be indexed instead of its initial');
  });

  await runner.test('findCitationsInText resolves single authors and initial-first references', async () => {
    const pdf = fakePdfDocument([[
      textItem('References', 100, 720),
      textItem('R. Levering, M. Cutler, and L. Yu. 2008. Using Visual Features.', 100, 680),
      textItem('A. Symonenko. 2007. A semantic classification study.', 100, 640)
    ]]);
    const { references } = await parser.extractReferencesFromPages(pdf);
    const citations = parser.findCitationsInText(
      'The methods follow earlier work (Levering et al., 2008) and (Symonenko, 2007), not (Figure, 2021).',
      references
    );

    runner.assertEqual(citations.length, 2, 'Should detect the et al. and resolved single-author citations only');
    runner.assert(citations.every(citation => citation.targets[0].id !== null), 'Both citations should resolve to bibliography entries');
    runner.assert(citations.some(citation => citation.match === '(Symonenko, 2007)'), 'Single-author citation should be detected');
  });

  await runner.test('extractReferencesFromPages separates initial-first two-author entries', async () => {
    const pdf = fakePdfDocument([[
      textItem('References', 100, 720),
      textItem('J. Karlgren, I. Bretan, J. Dewe, A. Hallberg, and N. Wolkert. 1998. Iterative', 100, 680),
      textItem('Information Retrieval Using Fast Clustering and Usage-Specific Genres.', 124, 660),
      textItem('A. Kennedy and M. Shepherd. 2005. Automatic Identification of Home Pages.', 100, 620)
    ]]);

    const result = await parser.extractReferencesFromPages(pdf);
    const references = Array.from(result.references.values());
    const karlgren = references.find(reference => reference.text.startsWith('J. Karlgren'));
    const kennedy = references.find(reference => reference.text.startsWith('A. Kennedy'));

    runner.assertEqual(references.length, 2, 'Kennedy should start a separate reference');
    runner.assert(karlgren && !karlgren.text.includes('Automatic Identification'), 'Karlgren should not absorb Kennedy');
    runner.assert(kennedy?.citationKeys.some(key => key.includes('kennedy:shepherd:2005')), 'Two-author entry should expose its pair alias');
  });

  await runner.test('extractReferencesFromPages handles author lists wrapped before the year', async () => {
    const pdf = fakePdfDocument([[
      textItem('References', 100, 720),
      textItem('P.C.K. Yeung, S. Büttcher, C.L.A. Clarke,', 100, 680),
      textItem('and M. Kolla. 2007. A Bayesian Approach for Learning Document Type Relevance.', 124, 660),
      textItem('J. Xu, Y. Cao, H. Li, N. Craswell, and Y. Huang. 2007. Searching Documents.', 100, 620),
      textItem('B. Kessler, G. Nunberg, and H. Schütze. 1997. Automatic Detection of Text Genre.', 100, 580)
    ]]);

    const result = await parser.extractReferencesFromPages(pdf);
    const references = Array.from(result.references.values());
    const yeung = references.find(reference => reference.text.startsWith('P.C.K. Yeung'));

    runner.assertEqual(references.length, 3, 'All wrapped and unwrapped entries should be extracted');
    runner.assert(yeung?.citationKeys.some(key => key.includes('yeung:2007')), 'Wrapped Yeung entry should be indexed');
  });

  await runner.test('findCitationsInText tolerates spaces lost between PDF spans', async () => {
    const pdf = fakePdfDocument([[
      textItem('References', 100, 720),
      textItem('J. Xu, Y. Cao, H. Li, N. Craswell, and Y. Huang. 2007. Searching Documents.', 100, 680),
      textItem('P.C.K. Yeung, S. Büttcher, C.L.A. Clarke, and M. Kolla. 2007. A Bayesian Approach.', 100, 640),
      textItem('B. Kessler, G. Nunberg, and H. Schütze. 1997. Automatic Detection of Text Genre.', 100, 600)
    ]]);
    const { references } = await parser.extractReferencesFromPages(pdf);
    const citations = parser.findCitationsInText(
      '(Xuet al.,2007), (Yeungetal.,2007) and (Kessleretal.,1997)',
      references
    );

    runner.assertEqual(citations.length, 3, 'All citations should survive missing inter-span spaces');
    runner.assert(citations.every(citation => citation.targets[0].id !== null), 'All compact citations should resolve');
  });

  await runner.test('citation span planning preserves adjacent and cross-span citations', () => {
    const firstSpan = { id: 'first' };
    const secondSpan = { id: 'second' };
    const firstText = '(Xu et al., 2007), (Yeung et al.,';
    const secondText = ' 2007)';
    const fullText = firstText + secondText;
    const spanMap = [
      { span: firstSpan, text: firstText, startOffset: 0, endOffset: firstText.length },
      { span: secondSpan, text: secondText, startOffset: firstText.length, endOffset: fullText.length }
    ];
    const citations = parser.findCitationsInText(fullText);
    const fragments = spanPlanner.planCitationFragments(spanMap, citations);

    runner.assertEqual(citations.length, 2, 'Both adjacent citations should be detected');
    runner.assertEqual(fragments.get(firstSpan).length, 2, 'The first span should retain Xu and the start of Yeung');
    runner.assertEqual(fragments.get(secondSpan).length, 1, 'The second span should retain the end of Yeung');
    runner.assertEqual(fragments.get(firstSpan)[1].partCount, 2, 'Yeung should be represented as a cross-span citation');
  });

  await runner.test('author-year segmentation separates references concatenated on one line', async () => {
    const pdf = fakePdfDocument([[
      textItem('References', 100, 720),
      textItem(
        'J. Karlgren, I. Bretan, J. Dewe, A. Hallberg, and N. Wolkert. 1998. ' +
        'Iterative Information Retrieval Using Fast Clustering and Usage-Specific Genres. ' +
        'In Proc. of the 8th DELOS Workshop, pages 85–92. ' +
        'A. Kennedy and M. Shepherd. 2005. Automatic Identification of Home Pages on the Web.',
        100,
        680
      )
    ]]);

    const result = await parser.extractReferencesFromPages(pdf);
    const references = Array.from(result.references.values());

    runner.assertEqual(references.length, 2, 'Both concatenated entries should be segmented');
    runner.assert(references[0].text.startsWith('J. Karlgren'), 'Karlgren should remain the first entry');
    runner.assert(!references[0].text.includes('A. Kennedy'), 'Karlgren should not absorb Kennedy');
    runner.assert(references[1].text.startsWith('A. Kennedy'), 'Kennedy should start the second entry');
  });

  await runner.test('mapped PDF text restores line spaces and keeps drawable offsets', async () => {
    const pdf = fakePdfDocument([[
      textItem('References', 100, 720),
      textItem('J. Karlgren, I. Bretan, J. Dewe, A. Hallberg, and N. Wolkert. 1998. Study.', 100, 680),
      textItem('J. Xu, Y. Cao, H. Li, N. Craswell, and Y. Huang. 2007. Study.', 100, 640),
      textItem('P.C.K. Yeung, S. Büttcher, C.L.A. Clarke, and M. Kolla. 2007. Study.', 100, 600),
      textItem('B. Kessler, G. Nunberg, and H. Schütze. 1997. Study.', 100, 560)
    ]]);
    const { references } = await parser.extractReferencesFromPages(pdf);

    const firstSpan = { id: 'line-1' };
    const secondSpan = { id: 'line-2' };
    const thirdSpan = { id: 'line-3' };
    const firstItem = textItem(
      'Preliminary results (Karlgren et al., 1998). (Xu et al., 2007), (Yeung et al.,',
      100,
      700
    );
    firstItem.hasEOL = true;
    const secondItem = textItem('2007) and prior work by (Kessler et', 100, 680);
    secondItem.hasEOL = true;
    const thirdItem = textItem('al., 1997) suffer from limitations.', 100, 660);

    const model = citationTextModel.buildCitationTextModel([
      { span: firstSpan, text: firstItem.str, item: firstItem },
      { span: secondSpan, text: secondItem.str, item: secondItem },
      { span: thirdSpan, text: thirdItem.str, item: thirdItem }
    ]);
    const citations = parser.findCitationsInText(model.text, references);
    const fragments = spanPlanner.planCitationFragments(model.spanMap, citations);

    runner.assertEqual(citations.length, 4, 'All four citations should be detected across visual lines');
    runner.assert(citations.every(citation => citation.targets[0].id !== null), 'Every citation should resolve');
    runner.assertEqual(fragments.get(firstSpan).length, 3, 'The first visual line should contain three citation fragments');
    runner.assertEqual(fragments.get(secondSpan).length, 2, 'The second line should finish Yeung and start Kessler');
    runner.assertEqual(fragments.get(thirdSpan).length, 1, 'The third line should finish Kessler');
  });

  await runner.test('single-author citations do not resolve to multi-author references', async () => {
    const pdf = fakePdfDocument([[
      textItem('References', 100, 720),
      textItem('A. Symonenko and B. Example. 2007. A joint study.', 100, 680)
    ]]);
    const { references } = await parser.extractReferencesFromPages(pdf);
    const citations = parser.findCitationsInText('A generic parenthesis (Symonenko, 2007).', references);

    runner.assertEqual(citations.length, 0, 'A single-author callout must not bind to a multi-author work');
  });

  await runner.test('title years do not create false inline bibliography entries', async () => {
    const pdf = fakePdfDocument([[
      textItem('References', 100, 720),
      textItem(
        'A. Author. 2010. An Overview of the Semantic Web. 2008 Edition and Later Developments.',
        100,
        680
      ),
      textItem('B. Writer. 2012. A different article.', 100, 640)
    ]]);
    const result = await parser.extractReferencesFromPages(pdf);

    runner.assertEqual(result.references.size, 2, 'A year in a title must remain inside its reference');
    runner.assert(Array.from(result.references.values())[0].text.includes('Web. 2008 Edition'), 'Title text should be preserved');
  });

  await runner.test('narrative author-year citations resolve with the same bibliography index', async () => {
    const pdf = fakePdfDocument([[
      textItem('References', 100, 720),
      textItem('A. Symonenko. 2007. A single-author study.', 100, 680),
      textItem('Q. Zheng, A. Wu, and T. Park. 2021. A multi-author study.', 100, 640),
      textItem('Q. Zheng and P. Li. 2024. A paired study.', 100, 600)
    ]]);
    const { references } = await parser.extractReferencesFromPages(pdf);
    const citations = parser.findCitationsInText(
      'Symonenko (2007), Zheng et al. (2021), and Zheng and Li (2024) reached similar conclusions.',
      references
    );

    runner.assertEqual(citations.length, 3, 'All narrative citation forms should be detected');
    runner.assert(citations.every(citation => citation.targets[0].id !== null), 'Narrative citations should resolve');
  });

  await runner.test('author-year bibliography accepts independent column origins', async () => {
    const pdf = fakePdfDocument([[
      textItem('References', 100, 720),
      textItem('A. Left. 2001. First-column entry.', 100, 680),
      textItem('B. Left. 2002. Another first-column entry.', 100, 640),
      textItem('C. Right. 2003. First entry in the second column.', 350, 680),
      textItem('D. Right. 2004. Another second-column entry.', 350, 640)
    ]]);
    const result = await parser.extractReferencesFromPages(pdf);

    runner.assertEqual(result.references.size, 4, 'A second column must not be rejected by the first column X origin');
    runner.assert(Array.from(result.references.values()).some(reference => reference.authors[0] === 'Right'), 'Second-column authors should be indexed');
  });

  await runner.test('wrapped editor text is not mistaken for a bibliography start', async () => {
    const pdf = fakePdfDocument([[
      textItem('References', 100, 720),
      textItem('L. Björneborn. 2008. Genre Connectivity and Genre Drift.', 100, 680),
      textItem('In A. Mehler, S. Sharoff, G. Rehm, and M. Santini, editors,', 124, 660),
      textItem('Genres on the Web. In preparation.', 124, 640),
      textItem('E.S. Boese. 2005. Stereotyping the web.', 100, 600)
    ]]);
    const result = await parser.extractReferencesFromPages(pdf);
    const references = Array.from(result.references.values());

    runner.assertEqual(references.length, 2, 'Editor continuation lines must remain in the preceding entry');
    runner.assert(references[0].text.includes('A. Mehler'), 'Editor continuation should be preserved');
    runner.assertEqual(references[1].authors[0], 'Boese', 'The following real entry should remain detectable');
  });

  await runner.test('bibliography author grammar handles hyphenated initials and compound surnames', async () => {
    const pdf = fakePdfDocument([[
      textItem('References', 100, 720),
      textItem('R. Gleim, A. Mehler, and H.-J. Eikmeyer. 2007. A corpus study.', 100, 680),
      textItem('R. C. Holt, A. Schürr, S. Elliott Sim, , and A. Winter. 2006. A standard.', 100, 640),
      textItem('G. Rehm and M. Santini, editors. 2007. Workshop proceedings.', 100, 600)
    ]]);
    const result = await parser.extractReferencesFromPages(pdf);
    const references = Array.from(result.references.values());

    runner.assertEqual(references.length, 3, 'All non-trivial author lists should be segmented');
    runner.assert(references.some(reference => reference.authors.includes('Eikmeyer')), 'Hyphenated initials should not hide the surname');
    runner.assert(references.some(reference => reference.authors.includes('Elliott Sim')), 'Compound surnames should be retained');
    runner.assert(references.some(reference => reference.authors.join('|') === 'Rehm|Santini'), 'Editor suffixes should be accepted before the year');
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
