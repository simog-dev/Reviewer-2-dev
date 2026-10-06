/**
 * Reference Parser Module
 * Extracts and parses bibliographic references from PDF documents
 */

/**
 * @typedef {Object} Reference
 * @property {number|null} number - Reference number, or null for author-year entries
 * @property {number|string} id - Stable key used to resolve citations
 * @property {string[]} citationKeys - Normalized author-year aliases
 * @property {string[]} authors - Normalized bibliography author surnames
 * @property {string|null} year - Publication year, including an optional suffix
 * @property {string} text - Full reference text
 * @property {string|null} doi - DOI if found
 * @property {string|null} url - URL if found (excluding DOI URLs)
 * @property {number|null} startPage - Page where reference starts
 * @property {number|null} endPage - Page where reference ends
 * @property {boolean} spansMultiplePages - True if reference spans multiple pages
 */

// Regex patterns for citation detection in text
// NOTE: \s* after [ and before ] handles PDFs where citations are fragmented
// across multiple spans with extra whitespace (e.g., "[ 4]" instead of "[4]")
const CITATION_PATTERNS = {
  // Single citation: [1] or [ 1]
  single: /\[\s*(\d+)\s*\]/g,
  // Multiple citations: [1,2,3] or [1, 2, 3] or [ 1, 2, 3 ]
  multiple: /\[\s*(\d+(?:\s*,\s*\d+)+)\s*\]/g,
  // Range citations: [1-5] or [1–5] (en-dash)
  range: /\[\s*(\d+)\s*[-–]\s*(\d+)\s*\]/g,
  // Combined pattern for detection
  all: /\[\s*(\d+(?:\s*[-–,]\s*\d+)*)\s*\]/g
};

const SURNAME_SOURCE = String.raw`[\p{L}][\p{L}\p{M}'’\-]*`;
const MULTIWORD_SURNAME_SOURCE = String.raw`(?:de|del|della|van|von|da|di|la|le)\s+${SURNAME_SOURCE}|${SURNAME_SOURCE}`;
const AUTHOR_YEAR_PARENTHESES_PATTERN = /\(([^()]{1,240})\)/g;
const AUTHOR_YEAR_ET_AL_PATTERN = new RegExp(
  `^(${MULTIWORD_SURNAME_SOURCE})\\s*et\\s*al\\.\\s*,\\s*((?:19|20)\\d{2}[a-z]?)$`,
  'iu'
);
const AUTHOR_YEAR_PAIR_PATTERN = new RegExp(
  `^(${MULTIWORD_SURNAME_SOURCE})\\s*(?:and|&)\\s*(${MULTIWORD_SURNAME_SOURCE})\\s*,\\s*((?:19|20)\\d{2}[a-z]?)$`,
  'iu'
);
const AUTHOR_YEAR_SINGLE_PATTERN = new RegExp(
  `^(${MULTIWORD_SURNAME_SOURCE})\\s*,\\s*((?:19|20)\\d{2}[a-z]?)$`,
  'iu'
);
const AUTHOR_SEPARATOR_SOURCE = String.raw`(?:^|,\s*(?:and\s+)?|\band\s+|&\s*)`;
const INITIALS_SOURCE = String.raw`(?:\p{Lu}\.(?:-\p{Lu}\.)?\s*)+`;
const BIBLIOGRAPHY_SURNAME_SOURCE = String.raw`(?:${MULTIWORD_SURNAME_SOURCE})(?:\s+${SURNAME_SOURCE})?`;
const INITIALS_FIRST_AUTHOR_PATTERN = new RegExp(
  `${AUTHOR_SEPARATOR_SOURCE}(${INITIALS_SOURCE})(${BIBLIOGRAPHY_SURNAME_SOURCE})(?=\\s*(?:,|\\band\\b|&|\\.?$))`,
  'giu'
);
const SURNAME_FIRST_AUTHOR_PATTERN = new RegExp(
  `${AUTHOR_SEPARATOR_SOURCE}(${MULTIWORD_SURNAME_SOURCE})(?:\\s*,\\s*|\\s+)(${INITIALS_SOURCE})(?=\\s*(?:,|\\band\\b|&|\\.?$))`,
  'giu'
);

// Regex patterns for DOI and URL extraction
const DOI_PATTERN = /\b(10\.\d{4,}\/(?:(?!doi:)[^\s\]<>])+)/gi;
const URL_PATTERN = /https?:\/\/[^\s\]<>]+/gi;

// Patterns to identify reference section headers
const REFERENCE_SECTION_PATTERNS = [
  /^references?\s*$/i,
  /^bibliography\s*$/i,
  /^works?\s+cited\s*$/i,
  /^literature\s+cited\s*$/i,
  /^cited\s+references?\s*$/i
];

// Minimum Y gap (PDF coordinate units) to consider as a content area boundary
// Used to detect header/footer zones on pages where references span across pages
const PAGE_CONTENT_Y_GAP = 15;

// Patterns that indicate the end of the references section
const REFERENCE_SECTION_END_PATTERNS = [
  /^appendix/i,
  /^appendices/i,
  /^supplementary/i,
  /^supporting\s+information/i,
  /^acknowledgments?\s*$/i,
  /^acknowledgements?\s*$/i,
  /^author\s+contributions?\s*$/i,
  /^conflict\s+of\s+interest/i,
  /^competing\s+interests?\s*$/i,
  /^funding\s*$/i,
  /^data\s+availability/i,
  /^figure\s+legends?\s*$/i,
  /^tables?\s*$/i,
  /^figures?\s*$/i
];

/**
 * Parses citation numbers from a citation string
 * Handles: [1], [1,2,3], [1-5], [1,3-5,7]
 * @param {string} citationText - The citation text (e.g., "[1,3-5,7]")
 * @returns {number[]} Array of reference numbers
 */
export function parseCitationNumbers(citationText) {
  const numbers = new Set();

  // Remove brackets
  const inner = citationText.replace(/[\[\]]/g, '').trim();
  if (!inner) return [];

  // Split by comma
  const parts = inner.split(/\s*,\s*/);

  for (const part of parts) {
    // Check for range (e.g., "1-5" or "1–5")
    const rangeMatch = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (start <= end && end - start < 100) { // Sanity check
        for (let i = start; i <= end; i++) {
          numbers.add(i);
        }
      }
    } else if (/[-–]/.test(part)) {
      // Contains dash(es) but not a valid range (e.g., ORCID "0009-0000-2205-6599")
      // Skip — this is an identifier, not a citation
      continue;
    } else {
      // Single number
      const num = parseInt(part, 10);
      if (!isNaN(num) && num > 0 && num < 10000) {
        numbers.add(num);
      }
    }
  }

  return Array.from(numbers).sort((a, b) => a - b);
}

function normalizeCitationToken(value) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function authorYearKey(firstSurname, year, secondSurname = null) {
  const first = normalizeCitationToken(firstSurname);
  const normalizedYear = normalizeCitationToken(year);
  if (secondSurname) {
    return `author-year:${first}:${normalizeCitationToken(secondSurname)}:${normalizedYear}`;
  }
  return `author-year:${first}:${normalizedYear}`;
}

function parseAuthorYearCitationPart(text) {
  const normalizedText = (text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:(?:see|cf)\.?|see\s+also|e\.?g\.?)\s+/i, '');
  let match = normalizedText.match(AUTHOR_YEAR_ET_AL_PATTERN);
  if (match) {
    return {
      label: `${match[1]} et al., ${match[2]}`,
      key: authorYearKey(match[1], match[2]),
      firstSurname: match[1],
      secondSurname: null,
      year: match[2],
      form: 'et-al'
    };
  }

  match = normalizedText.match(AUTHOR_YEAR_PAIR_PATTERN);
  if (match) {
    return {
      label: `${match[1]} and ${match[2]}, ${match[3]}`,
      key: authorYearKey(match[1], match[3], match[2]),
      firstSurname: match[1],
      secondSurname: match[2],
      year: match[3],
      form: 'pair'
    };
  }

  match = normalizedText.match(AUTHOR_YEAR_SINGLE_PATTERN);
  if (match) {
    return {
      label: `${match[1]}, ${match[2]}`,
      key: authorYearKey(match[1], match[2]),
      firstSurname: match[1],
      secondSurname: null,
      year: match[2],
      form: 'single'
    };
  }

  return null;
}

function extractSurnamesWithPattern(authorText, pattern, surnameGroup) {
  const regex = new RegExp(pattern.source, pattern.flags);
  const surnames = [];
  let consumedUntil = 0;
  let match;

  while ((match = regex.exec(authorText)) !== null) {
    if (surnames.length === 0 && match.index !== 0) return [];
    if (surnames.length > 0 && authorText.slice(consumedUntil, match.index).trim()) return [];
    surnames.push(match[surnameGroup]);
    consumedUntil = regex.lastIndex;
  }

  // A successful author grammar must explain the entire prefix up to the year.
  // This rejects continuation text such as "editors, Genres on the Web" that
  // merely happens to begin with a valid-looking name list.
  return surnames.length > 0 && /^[\s.,]*(?:(?:editors?|eds?)\.?[\s.]*)?$/i.test(authorText.slice(consumedUntil))
    ? surnames
    : [];
}

/**
 * Extracts author surnames from the most common bibliography conventions:
 * "Levering, R." and "R. Levering". The longest successful parse wins so a
 * multi-author entry is not reduced to a partial single-author match.
 */
function extractBibliographySurnames(authorText) {
  if (/^(?:and\b|&)/i.test(authorText)) return [];

  const candidates = [
    extractSurnamesWithPattern(authorText, INITIALS_FIRST_AUTHOR_PATTERN, 2),
    extractSurnamesWithPattern(authorText, SURNAME_FIRST_AUTHOR_PATTERN, 1)
  ];
  const best = candidates.reduce(
    (longest, candidate) => candidate.length > longest.length ? candidate : longest,
    []
  );
  if (best.length > 0) return best;

  const bareSingle = authorText.match(new RegExp(`^(${MULTIWORD_SURNAME_SOURCE})\\.?$`, 'iu'));
  if (bareSingle) return [bareSingle[1]];

  const barePair = authorText.match(new RegExp(
    `^(${MULTIWORD_SURNAME_SOURCE})\\s+(?:and|&)\\s+(${MULTIWORD_SURNAME_SOURCE})\\.?$`,
    'iu'
  ));
  return barePair ? [barePair[1], barePair[2]] : [];
}

/**
 * Parses the author/year prefix of an unnumbered bibliography entry.
 * The year must occur near the beginning so years in titles are not mistaken
 * for entry boundaries.
 */
function parseAuthorYearReferenceStart(text) {
  const normalizedText = (text || '').replace(/\s+/g, ' ').trim();
  const yearMatch = normalizedText.match(/(?:^|[\s,(])((?:19|20)\d{2}[a-z]?)(?=$|[\s).,;:])/i);
  if (!yearMatch || yearMatch.index > 400) return null;

  const year = yearMatch[1];
  const authorText = normalizedText
    .slice(0, yearMatch.index + 1)
    .replace(/[\s,(]+$/, '')
    .replace(/,\s*,/g, ',')
    .trim();
  const surnames = extractBibliographySurnames(authorText);
  if (surnames.length === 0) return null;

  const citationKeys = [authorYearKey(surnames[0], year)];
  if (surnames.length === 2) {
    citationKeys.push(authorYearKey(surnames[0], year, surnames[1]));
  }

  return {
    firstSurname: surnames[0],
    secondSurname: surnames.length === 2 ? surnames[1] : null,
    surnames,
    authors: surnames,
    year,
    citationKeys
  };
}

/**
 * Finds bibliography starts even when PDF extraction concatenates two entries
 * onto one visual line. Candidate boundaries are validated by the same author
 * parser used for ordinary line starts, rather than by an unbounded regex.
 */
function findAuthorYearReferenceStartsInText(text) {
  const source = text || '';
  const starts = [];
  const yearRegex = /(?:19|20)\d{2}[a-z]?/giu;
  let yearMatch;

  while ((yearMatch = yearRegex.exec(source)) !== null) {
    const lowerBound = Math.max(0, yearMatch.index - 500);
    const candidateOffsets = new Set([lowerBound === 0 ? 0 : lowerBound]);
    const boundaryRegex = /[.;]\s+(?=[\p{Lu}])/gu;
    boundaryRegex.lastIndex = lowerBound;
    let boundary;
    while ((boundary = boundaryRegex.exec(source)) !== null && boundary.index < yearMatch.index) {
      candidateOffsets.add(boundary.index + boundary[0].length);
    }

    const candidates = [];
    for (const offset of candidateOffsets) {
      if (offset > yearMatch.index) continue;
      const candidateText = source.slice(offset, yearMatch.index + yearMatch[0].length);
      if (offset > 0 && !/(?:^\p{Lu}\.|,\s*\p{Lu}\.|\band\s+|&\s+)/u.test(candidateText)) {
        continue;
      }
      const parsed = parseAuthorYearReferenceStart(candidateText);
      if (!parsed || normalizeCitationToken(parsed.year) !== normalizeCitationToken(yearMatch[0])) continue;
      candidates.push({ offset, ...parsed });
    }

    // Prefer the candidate that explains the most authors; on ties keep the
    // earliest boundary so an initial such as "A." is not detached.
    candidates.sort((a, b) => b.surnames.length - a.surnames.length || a.offset - b.offset);
    if (candidates.length > 0) {
      const best = candidates[0];
      if (!starts.some(start => start.offset === best.offset)) starts.push(best);
    }
  }

  return starts.sort((a, b) => a.offset - b.offset);
}

/**
 * Author lists are frequently wrapped before the publication year. Inspect a
 * small visual-line window while keeping the boundary anchored to the first
 * line of the bibliography entry.
 */
function getAuthorYearReferenceStartAtLine(lines, index, maxLines = 4) {
  const startPage = lines[index]?.pageNum;
  let candidateText = '';

  for (let i = index; i < Math.min(lines.length, index + maxLines); i++) {
    const line = lines[i];
    if (line.pageNum !== startPage) break;

    const text = line.text.trim();
    if (!text) continue;
    candidateText += (candidateText ? ' ' : '') + text;

    const match = parseAuthorYearReferenceStart(candidateText);
    if (match) return match;
    if (candidateText.length > 500) break;
  }

  return null;
}

/**
 * Extracts DOI from reference text
 * @param {string} text - Reference text
 * @returns {string|null} DOI without URL prefix, or null
 */
export function extractDOI(text) {
  const match = text.match(DOI_PATTERN);
  if (match) {
    // Clean up the DOI (remove trailing punctuation)
    let doi = match[0].replace(/[.,;:)\]]+$/, '');
    return doi;
  }
  return null;
}

/**
 * Extracts URL from reference text (excluding DOI URLs)
 * @param {string} text - Reference text
 * @returns {string|null} URL or null
 */
export function extractURL(text) {
  const matches = text.match(URL_PATTERN);
  if (matches) {
    for (const url of matches) {
      // Skip DOI URLs
      if (url.includes('doi.org')) continue;
      // Clean up trailing punctuation
      return url.replace(/[.,;:)\]]+$/, '');
    }
  }
  return null;
}

/**
 * Parses a single reference entry
 * @param {string} text - Raw reference text
 * @param {number|null} number - Reference number, or null for author-year entries
 * @returns {Reference}
 */
export function parseReferenceEntry(text, number) {
  // Clean up the text
  let cleanText = text
    .replace(/\s+/g, ' ')
    .trim();

  // Remove the leading number if present (e.g., "[1]", "[ 1 ]", "1.", or "1 )")
  cleanText = cleanText
    .replace(/^\[\s*\d+\s*\]\s*/, '')
    .replace(/^\d+\s*[.)]\s*/, '')
    .replace(/^\d+\s+/, '');

  const doi = extractDOI(cleanText);
  const url = extractURL(cleanText);
  const authorYear = parseAuthorYearReferenceStart(cleanText);

  return {
    id: number,
    number,
    citationKeys: authorYear?.citationKeys || [],
    authors: authorYear?.authors || [],
    year: authorYear?.year || null,
    text: cleanText,
    doi,
    url
  };
}

/**
 * Finds the start of the references section in page text items
 * @param {Object[]} textItems - Array of text items from PDF.js
 * @returns {number} Index of reference section start, or -1 if not found
 */
function findReferenceSectionStart(textItems) {
  for (let i = 0; i < textItems.length; i++) {
    const text = textItems[i].str.trim();
    for (const pattern of REFERENCE_SECTION_PATTERNS) {
      if (pattern.test(text)) {
        return i;
      }
    }
  }

  // Some PDFs split section headings across multiple text items, e.g.
  // "Refer" + "ences". Group nearby items into visual lines and retry.
  const lineGroups = groupTextItemsIntoLines(textItems);
  for (const line of lineGroups) {
    const compactText = line.text.replace(/\s+/g, '').trim();
    for (const pattern of REFERENCE_SECTION_PATTERNS) {
      if (pattern.test(line.text.trim()) || pattern.test(compactText)) {
        return line.startIndex;
      }
    }
  }

  return -1;
}

/**
 * Groups PDF.js text items into approximate visual lines.
 * Keeps original item indices so callers can jump back into textContent.items.
 * @param {Object[]} textItems
 * @param {number} yTolerance
 * @returns {Array<{startIndex: number, text: string}>}
 */
function groupTextItemsIntoLines(textItems, yTolerance = 3) {
  const lines = [];

  for (let i = 0; i < textItems.length; i++) {
    const item = textItems[i];
    const text = item.str || '';
    if (!text.trim()) continue;

    const y = item.transform ? item.transform[5] : null;
    const x = item.transform ? item.transform[4] : 0;
    let line = null;

    if (y !== null) {
      line = lines.find(candidate => Math.abs(candidate.y - y) <= yTolerance);
    }

    if (!line) {
      line = { y, startIndex: i, parts: [] };
      lines.push(line);
    }

    line.startIndex = Math.min(line.startIndex, i);
    line.parts.push({ x, text });
  }

  return lines
    .map(line => ({
      startIndex: line.startIndex,
      text: line.parts
        .sort((a, b) => a.x - b.x)
        .reduce((acc, part) => {
          const trimmed = part.text.trim();
          if (!trimmed) return acc;
          return acc + (shouldAddSpace(acc, trimmed) ? ' ' : '') + trimmed;
        }, '')
    }))
    .sort((a, b) => a.startIndex - b.startIndex);
}

function groupFlatItemsIntoLines(flatItems, yTolerance = 3) {
  const lines = [];
  let currentLine = null;

  for (let itemIndex = 0; itemIndex < flatItems.length; itemIndex++) {
    const entry = flatItems[itemIndex];
    const text = entry.item.str || '';
    if (!text.trim()) continue;

    const y = entry.item.transform ? entry.item.transform[5] : null;
    const x = entry.item.transform ? entry.item.transform[4] : 0;
    const sameLine = currentLine &&
      currentLine.pageNum === entry.pageNum &&
      y !== null &&
      currentLine.y !== null &&
      Math.abs(currentLine.y - y) <= yTolerance;

    if (!sameLine) {
      currentLine = {
        pageNum: entry.pageNum,
        y,
        startIndex: entry.globalIndex ?? entry.index ?? itemIndex,
        endIndex: entry.globalIndex ?? entry.index ?? itemIndex,
        minX: x,
        maxX: x + (entry.item.width || 0),
        parts: []
      };
      lines.push(currentLine);
    }

    currentLine.endIndex = entry.globalIndex ?? entry.index ?? itemIndex;
    currentLine.minX = Math.min(currentLine.minX, x);
    currentLine.maxX = Math.max(currentLine.maxX, x + (entry.item.width || 0));
    currentLine.parts.push({ x, text, item: entry.item });
  }

  return lines.map(line => ({
    pageNum: line.pageNum,
    y: line.y,
    startIndex: line.startIndex,
    endIndex: line.endIndex,
    minX: line.minX,
    maxX: line.maxX,
    items: line.parts.map(part => part.item),
    text: line.parts
      .sort((a, b) => a.x - b.x)
      .reduce((acc, part) => {
        const trimmed = part.text.trim();
        if (!trimmed) return acc;
        return acc + (shouldAddSpace(acc, trimmed) ? ' ' : '') + trimmed;
      }, '')
  }));
}

function normalizeBoilerplateText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\b\d+\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
}

function groupLinesByPage(lines) {
  const pages = new Map();
  for (const line of lines) {
    if (!pages.has(line.pageNum)) pages.set(line.pageNum, []);
    pages.get(line.pageNum).push(line);
  }
  return pages;
}

function joinTextItems(items) {
  return items
    .map(item => ({
      item,
      x: item.transform ? item.transform[4] : 0,
      text: item.str || ''
    }))
    .sort((a, b) => a.x - b.x)
    .reduce((text, part) => {
      const trimmed = part.text.trim();
      if (!trimmed) return text;
      return text + (shouldAddSpace(text, trimmed) ? ' ' : '') + trimmed;
    }, '');
}

function isSplitReferenceLabelItem(item, line) {
  const orderedItems = [...line.items].sort((a, b) => {
    const ax = a.transform ? a.transform[4] : 0;
    const bx = b.transform ? b.transform[4] : 0;
    return ax - bx;
  });
  const index = orderedItems.indexOf(item);
  const previous = orderedItems[index - 1]?.str?.trim() || '';
  const next = orderedItems[index + 1]?.str?.trim() || '';
  return ((previous === '[' && next === ']') || next === '.' || next === ')');
}

const NUMERIC_GUTTER_PATTERN = /^\d{1,6}$/;
const MIN_NUMERIC_GUTTER_RUN = 5;

function hasSequentialNumericRun(entries, minimumRunLength = MIN_NUMERIC_GUTTER_RUN) {
  const values = Array.from(new Set(entries.map(entry => Number(entry.item.str.trim()))))
    .sort((a, b) => a - b);
  let currentRun = 1;
  let longestRun = values.length > 0 ? 1 : 0;

  for (let i = 1; i < values.length; i++) {
    const gap = values[i] - values[i - 1];
    // PDF extraction can occasionally omit a line-number item, so tolerate
    // small gaps while still requiring a clearly progressive sequence.
    currentRun = gap >= 1 && gap <= 3 ? currentRun + 1 : 1;
    longestRun = Math.max(longestRun, currentRun);
  }

  return longestRun >= minimumRunLength;
}

function stripNumericGutters(lines) {
  const pageLines = groupLinesByPage(lines);

  for (const siblings of pageLines.values()) {
    const numericItems = siblings.flatMap(line => line.items
      .filter(item =>
        NUMERIC_GUTTER_PATTERN.test((item.str || '').trim()) &&
        !isSplitReferenceLabelItem(item, line)
      )
      .map(item => ({
        item,
        x: item.transform ? item.transform[4] : 0,
        rightX: (item.transform ? item.transform[4] : 0) + (item.width || 0)
      }))
    );
    const xClusters = [];

    for (const entry of numericItems) {
      // Line numbers may be left- or right-aligned. Matching either edge keeps
      // 999 and 1000 in the same cluster when the digit count changes.
      let cluster = xClusters.find(candidate =>
        Math.abs(candidate.x - entry.x) <= 8 ||
        Math.abs(candidate.rightX - entry.rightX) <= 8
      );
      if (!cluster) {
        cluster = { x: entry.x, rightX: entry.rightX, entries: [] };
        xClusters.push(cluster);
      }
      cluster.entries.push(entry);
      cluster.x = cluster.entries.reduce((sum, candidate) => sum + candidate.x, 0) / cluster.entries.length;
      cluster.rightX = cluster.entries.reduce((sum, candidate) => sum + candidate.rightX, 0) / cluster.entries.length;
    }

    const numericItemSet = new Set(numericItems.map(entry => entry.item));
    const contentXs = siblings.flatMap(line => line.items
      .filter(item => !numericItemSet.has(item) && (item.str || '').trim())
      .map(item => item.transform ? item.transform[4] : 0)
    ).sort((a, b) => a - b);
    const contentLeft = contentXs.length > 0
      ? contentXs[Math.floor(contentXs.length * 0.1)]
      : null;

    const gutterItems = new Set();
    for (const cluster of xClusters) {
      const isLeftOfContent = contentLeft === null || cluster.rightX < contentLeft - 8;
      if (isLeftOfContent && hasSequentialNumericRun(cluster.entries)) {
        cluster.entries.forEach(entry => gutterItems.add(entry.item));
      }
    }

    if (gutterItems.size === 0) continue;
    for (const line of siblings) {
      line.items = line.items.filter(item => !gutterItems.has(item));
      line.text = joinTextItems(line.items);
      if (line.items.length > 0) {
        line.minX = Math.min(...line.items.map(item => item.transform ? item.transform[4] : 0));
        line.maxX = Math.max(...line.items.map(item => {
          const x = item.transform ? item.transform[4] : 0;
          return x + (item.width || 0);
        }));
      }
    }
  }

  return lines;
}

/**
 * Identifies page furniture from layout, repetition and numeric gutter columns.
 * This happens before references are segmented so artifacts cannot become part
 * of a reference merely because they occur between two bibliography labels.
 */
function classifyPageArtifacts(lines) {
  const artifacts = new Set();
  const pageLines = groupLinesByPage(lines);
  const repeated = new Map();

  for (const line of lines) {
    const normalized = normalizeBoilerplateText(line.text);
    if (!normalized) continue;
    if (!repeated.has(normalized)) repeated.set(normalized, []);
    repeated.get(normalized).push(line);

    if (/for\s+peer\s+review|\bconfidential\b/i.test(line.text)) {
      artifacts.add(line);
    }
  }

  // Headers and footers commonly repeat at the same approximate Y position.
  for (const occurrences of repeated.values()) {
    const pages = new Set(occurrences.map(line => line.pageNum));
    if (pages.size < 2) continue;

    for (const line of occurrences) {
      const siblings = pageLines.get(line.pageNum) || [];
      const ys = siblings.map(candidate => candidate.y).filter(Number.isFinite);
      if (ys.length === 0 || !Number.isFinite(line.y)) continue;
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const edgeSize = Math.max((maxY - minY) * 0.15, 24);
      if (line.y <= minY + edgeSize || line.y >= maxY - edgeSize) {
        artifacts.add(line);
      }
    }
  }

  for (const siblings of pageLines.values()) {
    // A page marker anchors a local block of publisher furniture. URL/email
    // fields are removed only inside that block, so URLs in references survive.
    const pageMarkers = siblings.filter(line =>
      /^page\s+\d+(?:\s+of\s+\d+)?$/i.test(line.text.trim()) ||
      /^\d{1,3}\s+page\s+\d{1,3}(?:\s+of\s+\d{1,3})?$/i.test(line.text.trim())
    );

    for (const marker of pageMarkers) {
      artifacts.add(marker);
      if (!Number.isFinite(marker.y)) continue;
      for (const line of siblings) {
        if (!Number.isFinite(line.y) || Math.abs(line.y - marker.y) > 48) continue;
        if (/^(?:url|email)\s*:/i.test(line.text.trim()) ||
            /for\s+peer\s+review/i.test(line.text)) {
          artifacts.add(line);
        }
      }
    }
  }

  return artifacts;
}

/**
 * Detects a reference entry number at a specific text item. This handles PDFs
 * that split "[1]" or "1." across adjacent text items.
 * @param {Array<{item: Object}>} flatItems
 * @param {number} index
 * @param {'bracket'|'dot'} refFormat
 * @returns {{refNumber: number}|null}
 */
function getReferenceStartMatchAt(flatItems, index, refFormat) {
  const currentText = flatItems[index]?.item?.str || '';
  const trimmed = currentText.trim();

  if (refFormat === 'bracket') {
    const direct = trimmed.match(/^\[\s*(\d+)\s*\]/);
    if (direct) {
      return { refNumber: parseInt(direct[1], 10) };
    }

    let compact = '';
    for (let i = index; i < Math.min(index + 5, flatItems.length); i++) {
      compact += (flatItems[i].item.str || '').trim().replace(/\s+/g, '');
      const split = compact.match(/^\[(\d{1,4})\]/);
      if (split) {
        return { refNumber: parseInt(split[1], 10) };
      }
      if (compact.length > 10) break;
    }
    return null;
  }

  if (refFormat !== 'dot') return null;

  const direct = trimmed.match(/^(\d+)\s*[.)](\s|$)/);
  if (direct) {
    return { refNumber: parseInt(direct[1], 10) };
  }

  let compact = '';
  for (let i = index; i < Math.min(index + 4, flatItems.length); i++) {
    compact += (flatItems[i].item.str || '').trim().replace(/\s+/g, '');
    const split = compact.match(/^(\d{1,4})[.)]/);
    if (split) {
      return { refNumber: parseInt(split[1], 10) };
    }
    if (compact.length > 8) break;
  }

  return null;
}

function getReferenceStartMatchInText(text, refFormat) {
  const trimmed = (text || '').trim();
  if (refFormat === 'bracket') {
    const match = trimmed.match(/^\[\s*(\d{1,4})\s*\]/);
    return match ? { refNumber: parseInt(match[1], 10) } : null;
  }

  if (refFormat !== 'dot') return null;

  const match = trimmed.match(/^(\d{1,4})\s*[.)](\s|$)/);
  return match ? { refNumber: parseInt(match[1], 10) } : null;
}

/**
 * Determines whether references appear as [N], N., or author-year entries.
 * @param {Array<{item: Object}>} flatItems
 * @returns {'bracket'|'dot'|'author-year'}
 */
function detectReferenceFormat(flatItems) {
  const lines = groupFlatItemsIntoLines(flatItems);
  const lineFormat = detectReferenceFormatFromLines(lines);
  if (lineFormat) return lineFormat;

  for (let i = 0; i < Math.min(flatItems.length, 80); i++) {
    const text = flatItems[i].item.str || '';
    const trimmed = text.trim();
    if (!trimmed || isLikelyMetadata(flatItems[i].item)) continue;

    if (getReferenceStartMatchAt(flatItems, i, 'bracket')) {
      return 'bracket';
    }
    if (getReferenceStartMatchAt(flatItems, i, 'dot')) {
      return 'dot';
    }
  }

  return 'bracket';
}

function detectReferenceFormatFromLines(lines) {
  let bracketCount = 0;
  let dotCount = 0;
  let authorYearCount = 0;

  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i];
    if (getReferenceStartMatchInText(line.text, 'bracket')) bracketCount++;
    if (getReferenceStartMatchInText(line.text, 'dot')) dotCount++;
    if (getAuthorYearReferenceStartAtLine(lines, i)) authorYearCount++;
  }

  if (bracketCount === 0 && dotCount === 0 && authorYearCount === 0) return null;
  if (authorYearCount > bracketCount && authorYearCount > dotCount) return 'author-year';
  return dotCount > bracketCount ? 'dot' : 'bracket';
}

function lineFontSize(line) {
  const sizes = line.items.map(item => {
    const transform = item.transform;
    return transform ? Math.hypot(transform[2], transform[3]) : item.height;
  }).filter(size => Number.isFinite(size) && size > 0).sort((a, b) => a - b);
  return sizes.length ? sizes[Math.floor(sizes.length / 2)] : null;
}

function isReferenceSectionEndLine(line, referenceStartLine, previousContentLine) {
  const text = line.text.trim();
  if (REFERENCE_SECTION_END_PATTERNS.some(pattern => pattern.test(text))) return true;

  // Use typography and block separation, independently of the heading's text.
  // A normal-sized continuation must survive even across a page boundary.
  if (!referenceStartLine || !previousContentLine) return false;
  const headingSize = lineFontSize(line);
  const referenceSize = lineFontSize(referenceStartLine);
  if (headingSize === null || referenceSize === null || headingSize < referenceSize * 1.15) {
    return false;
  }
  if (line.pageNum !== previousContentLine.pageNum) return true;
  return Number.isFinite(line.y) && Number.isFinite(previousContentLine.y) &&
    previousContentLine.y - line.y >= referenceSize * 1.5 &&
    line.minX <= referenceStartLine.minX + referenceSize;
}

function extractReferencesFromLineGroups(flatItems) {
  const references = new Map();
  const refPages = new Set();
  const lines = stripNumericGutters(groupFlatItemsIntoLines(flatItems));
  const artifactLines = classifyPageArtifacts(lines);
  let sectionEndLineIndex = lines.length;
  let referenceStartLine = null;
  let previousContentLine = null;
  // Bound the bibliography before voting on its format: citations and lists
  // in an appendix must not influence either detection or segmentation.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.text.trim() || artifactLines.has(line)) continue;
    if (isReferenceSectionEndLine(line, referenceStartLine, previousContentLine)) {
      sectionEndLineIndex = i;
      break;
    }
    if (getReferenceStartMatchInText(line.text, 'bracket') ||
        getReferenceStartMatchInText(line.text, 'dot') ||
        getAuthorYearReferenceStartAtLine(lines, i)) {
      referenceStartLine = line;
    }
    previousContentLine = line;
  }
  const contentLines = lines.slice(0, sectionEndLineIndex)
    .filter(line => line.text.trim() && !artifactLines.has(line));
  const refFormat = detectReferenceFormatFromLines(contentLines) || detectReferenceFormat(flatItems);
  const refLinePositions = [];
  const entryStartXsByPage = new Map();

  for (let i = 0; i < sectionEndLineIndex; i++) {
    const line = lines[i];
    const trimmedText = line.text.trim();
    if (!trimmedText || artifactLines.has(line)) continue;

    const matches = refFormat === 'author-year'
      ? findAuthorYearReferenceStartsInText(line.text)
      : [getReferenceStartMatchInText(trimmedText, refFormat)].filter(Boolean);

    if (refFormat === 'author-year' && !matches.some(match => match.offset === 0)) {
      const wrappedMatch = getAuthorYearReferenceStartAtLine(lines, i);
      if (wrappedMatch) matches.unshift({ offset: 0, ...wrappedMatch });
    }
    if (matches.length === 0) continue;

    for (const match of matches) {
      const lastRefNumber = refLinePositions.length > 0
        ? refLinePositions[refLinePositions.length - 1].refNumber
        : 0;

      if (refFormat === 'dot' && match.refNumber !== lastRefNumber + 1) {
        continue;
      }
      if (refFormat === 'bracket' && lastRefNumber > 0 && match.refNumber <= lastRefNumber) {
        continue;
      }

      // Numbered labels share a gutter within a page. Recto/verso margins can
      // shift that gutter between pages, so never reuse another page's anchor.
      // Author-year entries are validated by their author grammar instead.
      const entryStartX = entryStartXsByPage.get(line.pageNum) ?? null;
      if (refFormat !== 'author-year' && entryStartX !== null && Math.abs(line.minX - entryStartX) > 30) {
        continue;
      }

      if (refFormat !== 'author-year' && entryStartX === null) {
        entryStartXsByPage.set(line.pageNum, line.minX);
      } else if (refFormat !== 'author-year' && (match.offset || 0) === 0) {
        entryStartXsByPage.set(line.pageNum, (entryStartX * 0.8) + (line.minX * 0.2));
      }

      const position = {
        refNumber: match.refNumber ?? null,
        citationKeys: match.citationKeys || [],
        authors: match.authors || match.surnames || [],
        year: match.year || null,
        lineIndex: i,
        charOffset: match.offset || 0
      };
      const duplicate = refLinePositions.some(existing =>
        existing.lineIndex === position.lineIndex && existing.charOffset === position.charOffset
      );
      if (!duplicate) refLinePositions.push(position);
    }
  }

  if (refLinePositions.length === 0) {
    return { references, refPages, refFormat };
  }

  for (let i = 0; i < refLinePositions.length; i++) {
    const current = refLinePositions[i];
    const next = refLinePositions[i + 1];
    const startLineIndex = current.lineIndex;
    const endLineIndex = next ? next.lineIndex : sectionEndLineIndex;
    let refText = '';
    let startPage = null;
    let endPage = null;

    for (let j = startLineIndex; j <= endLineIndex && j < sectionEndLineIndex; j++) {
      const line = lines[j];
      if (next && j === endLineIndex && next.charOffset === 0) break;

      const rawStart = j === startLineIndex ? current.charOffset : 0;
      const rawEnd = next && j === endLineIndex ? next.charOffset : line.text.length;
      const text = line.text.slice(rawStart, rawEnd).trim();
      if (!text || artifactLines.has(line)) continue;

      if (startPage === null) startPage = line.pageNum;
      endPage = line.pageNum;
      refPages.add(line.pageNum);

      if (shouldAddSpace(refText, text)) {
        refText += ' ';
      }
      refText += text;
    }

    if (refText.trim()) {
      const parsedRef = parseReferenceEntry(refText, current.refNumber);
      const referenceId = current.refNumber ?? `author-year:${i + 1}`;
      parsedRef.id = referenceId;
      parsedRef.citationKeys = Array.from(new Set([
        ...parsedRef.citationKeys,
        ...current.citationKeys
      ]));
      if (current.authors.length > 0) parsedRef.authors = current.authors;
      if (current.year) parsedRef.year = current.year;
      parsedRef.startPage = startPage;
      parsedRef.endPage = endPage;
      parsedRef.spansMultiplePages = startPage !== endPage;
      references.set(referenceId, parsedRef);
    }
  }

  return { references, refPages, refFormat };
}

/**
 * Checks if a text item is likely metadata (page numbers, watermarks, line numbers)
 * @param {Object} item - PDF.js text item
 * @param {boolean} applyFilters - If true, apply aggressive filters (for multi-page refs)
 * @returns {boolean} True if item should be filtered out
 */
function isLikelyMetadata(item, applyFilters = false) {
  const text = item.str.trim();
  if (!text) return true;

  // Always filter common watermarks (regardless of page span)
  // Note: "preprint" is NOT included because it's a legitimate word in references
  // (e.g., "arXiv preprint arXiv:2503.19786")
  const watermarkPatterns = [
    /for\s+peer\s+review/i,
    /draft/i,
    /confidential/i,
    /manuscript/i,
    /submitted/i
  ];

  for (const pattern of watermarkPatterns) {
    if (pattern.test(text)) return true;
  }

  // Only apply these filters for references that span multiple pages
  // (they're at risk of capturing page numbers, line numbers, etc.)
  if (applyFilters) {
    // Standalone numeric strings (likely page/line numbers)
    // But exclude if it's part of a year, DOI, or arXiv ID
    if (NUMERIC_GUTTER_PATTERN.test(text)) {
      // Don't filter if it could be part of a year
      if (/^(19|20)\d{2}$/.test(text)) {
        return false;
      }
      return true;
    }

    // Don't filter dots, colons, slashes (used in DOIs, URLs, arXiv IDs)
    if (/^[.:\/\-]+$/.test(text)) {
      return false;
    }
  }

  return false;
}

/**
 * Determines if a space should be added before concatenating text
 * @param {string} previousText - The text accumulated so far
 * @param {string} newText - The new text to add
 * @returns {boolean} True if a space should be added
 */
function shouldAddSpace(previousText, newText) {
  if (!previousText) return false;

  // Don't add space if previous text ends with these characters
  const noSpaceAfter = [':', '/', '-', '(', '[', '?', '=', '&'];
  const lastChar = previousText.slice(-1);
  if (noSpaceAfter.includes(lastChar)) return false;

  // Don't add space if new text starts with these characters
  const noSpaceBefore = [':', '/', '-', ')', ']', '.', ',', ';', '?', '=', '&'];
  const firstChar = newText[0];
  if (noSpaceBefore.includes(firstChar)) return false;

  return true;
}


/**
 * Computes the Y-coordinate content band for a page's text items.
 * Identifies the main content area by finding the largest cluster of items
 * separated by large Y gaps (which indicate header/footer boundaries).
 * @param {Object[]} items - PDF.js text items for a single page
 * @param {number} gapThreshold - Minimum Y gap to consider as a boundary
 * @returns {{minY: number, maxY: number}|null} Content band, or null if insufficient data
 */
function computePageContentBand(items, gapThreshold = PAGE_CONTENT_Y_GAP) {
  const ys = items
    .filter(item => item.str && item.str.trim())
    .map(item => item.transform ? item.transform[5] : null)
    .filter(y => y !== null)
    .sort((a, b) => a - b);

  if (ys.length < 2) return null;

  // Find indices where large Y gaps occur
  const gapIndices = [];
  for (let i = 1; i < ys.length; i++) {
    if (ys[i] - ys[i - 1] > gapThreshold) {
      gapIndices.push(i);
    }
  }

  if (gapIndices.length === 0) {
    // No large gaps — entire range is content
    return { minY: ys[0], maxY: ys[ys.length - 1] };
  }

  // Split Y values into segments separated by large gaps
  const segments = [];
  let start = 0;
  for (const gapIdx of gapIndices) {
    segments.push({ startIdx: start, endIdx: gapIdx - 1 });
    start = gapIdx;
  }
  segments.push({ startIdx: start, endIdx: ys.length - 1 });

  // The segment with the most items is the main content area
  const contentSeg = segments.reduce((best, seg) => {
    const count = seg.endIdx - seg.startIdx + 1;
    const bestCount = best.endIdx - best.startIdx + 1;
    return count > bestCount ? seg : best;
  });

  // Add a small margin so edge items aren't excluded
  const margin = gapThreshold * 0.5;
  return {
    minY: ys[contentSeg.startIdx] - margin,
    maxY: ys[contentSeg.endIdx] + margin
  };
}

/**
 * Extracts references from all pages of a PDF document using a two-pass approach:
 * Numbered bibliographies use the existing two-pass extraction; unnumbered
 * author-year bibliographies are segmented from their visual line starts.
 * @param {PDFDocumentProxy} pdfDocument - PDF.js document proxy
 * @returns {Promise<{references: Map<number|string, Reference>, pageContentBands: Map<number, {minY: number, maxY: number}>}>}
 */
export async function extractReferencesFromPages(pdfDocument) {
  const references = new Map();
  const numPages = pdfDocument.numPages;

  // Collect all text from all pages
  const allTextContent = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Keep items in DOM order (PDF.js already provides them in a reasonable order)
    allTextContent.push({
      pageNum,
      items: textContent.items
    });
  }

  // Find the references section — use the LAST match, not the first.
  // "References" can appear earlier in the document (e.g., table of contents,
  // body text like "See References section"), so we want the final occurrence
  // which is the actual bibliography section near the end of the paper.
  let referenceStartPage = -1;
  let referenceStartIndex = -1;

  for (const { pageNum, items } of allTextContent) {
    const startIndex = findReferenceSectionStart(items);
    if (startIndex !== -1) {
      referenceStartPage = pageNum;
      referenceStartIndex = startIndex;
      // Don't break — keep scanning to find the last occurrence
    }
  }

  if (referenceStartPage === -1) {
    // No references section found, try to extract from last pages
    const heuristicResult = extractReferencesHeuristic(allTextContent);
    return heuristicResult;
  }

  // Flatten all items from reference section onward into a single array with global indices
  const flatItems = [];
  let globalIndex = 0;

  for (const { pageNum, items } of allTextContent) {
    if (pageNum < referenceStartPage) continue;

    const startIdx = (pageNum === referenceStartPage) ? referenceStartIndex + 1 : 0;

    for (let i = startIdx; i < items.length; i++) {
      const item = items[i];
      flatItems.push({
        item,
        globalIndex: globalIndex++,
        pageNum
      });
    }
  }

  const lineBasedResult = extractReferencesFromLineGroups(flatItems);
  const refFormat = lineBasedResult.refFormat;
  if (lineBasedResult.references.size > 0) {
    const pageContentBands = new Map();
    for (const { pageNum, items } of allTextContent) {
      if (lineBasedResult.refPages.has(pageNum)) {
        const band = computePageContentBand(items);
        if (band) {
          pageContentBands.set(pageNum, band);
        }
      }
    }

    return {
      references: lineBasedResult.references,
      pageContentBands,
      refPages: lineBasedResult.refPages,
      refFormat
    };
  }

  // FIRST PASS: Find all reference number positions using the detected format
  const refPositions = []; // Array of {refNumber, globalIndex, item}
  let reachedEnd = false;

  for (const { item, globalIndex } of flatItems) {
    const text = item.str;
    const trimmedText = text.trim();

    if (!trimmedText) continue;

    // Filter out metadata
    if (isLikelyMetadata(item)) {
      continue;
    }

    // Check if we've reached a section that ends references
    for (const endPattern of REFERENCE_SECTION_END_PATTERNS) {
      if (endPattern.test(trimmedText)) {
        reachedEnd = true;
        break;
      }
    }
    if (reachedEnd) break;

    // Check for reference number pattern, including numbers split across items.
    const refNumMatch = getReferenceStartMatchAt(flatItems, globalIndex, refFormat);
    if (refNumMatch) {
      const refNumber = refNumMatch.refNumber;

      // For dot format (N.), enforce sequential numbering to avoid false positives
      // e.g., "pp 14-25." where "25." starts a new text item
      if (refFormat === 'dot') {
        const lastRefNumber = refPositions.length > 0 ? refPositions[refPositions.length - 1].refNumber : 0;
        if (refNumber !== lastRefNumber + 1) {
          continue;
        }
      }

      refPositions.push({
        refNumber,
        globalIndex,
        item
      });
    }
  }

  // Determine which pages actually contain references (for content band computation)
  const refPages = new Set();
  for (const { globalIndex } of refPositions) {
    const entry = flatItems[globalIndex];
    if (entry) refPages.add(entry.pageNum);
  }
  // Also include the page after the last ref position (refs may span into it)
  if (refPositions.length > 0) {
    const lastRefGlobalIndex = refPositions[refPositions.length - 1].globalIndex;
    for (let j = lastRefGlobalIndex; j < flatItems.length; j++) {
      refPages.add(flatItems[j].pageNum);
    }
  }

  // Pre-compute content bands only for pages that contain references
  const pageContentBands = new Map();
  for (const { pageNum, items } of allTextContent) {
    if (refPages.has(pageNum)) {
      const band = computePageContentBand(items);
      if (band) {
        pageContentBands.set(pageNum, band);
      }
    }
  }

  // If no reference numbers found, return empty (but still return content bands for debug)
  if (refPositions.length === 0) {
    return { references, pageContentBands, refPages, refFormat };
  }

  // SECOND PASS: Extract text between consecutive reference numbers
  for (let i = 0; i < refPositions.length; i++) {
    const currentRef = refPositions[i];
    const nextRef = refPositions[i + 1]; // undefined for last reference
    const isLastRef = !nextRef;

    const startIndex = currentRef.globalIndex;
    const endIndex = nextRef ? nextRef.globalIndex : flatItems.length;

    // Collect all text from start to end (excluding the next reference number)
    let refText = '';
    let previousY = null;
    let referenceTextX = null; // Track X position of reference body text (not the number)
    let itemsSinceRefStart = 0;
    let startPage = null;
    let endPage = null;
    let isMultiPageRef = false;

    // FIRST: Quick scan to determine if this reference spans multiple pages
    for (let j = startIndex; j < endIndex; j++) {
      const { pageNum } = flatItems[j];
      if (startPage === null) startPage = pageNum;
      if (pageNum !== startPage) {
        isMultiPageRef = true;
        break;
      }
    }

    // Reset for actual text collection
    startPage = null;
    endPage = null;

    for (let j = startIndex; j < endIndex; j++) {
      const { item, pageNum } = flatItems[j];
      const text = item.str.trim();

      if (!text) continue;

      // Track page numbers
      if (startPage === null) startPage = pageNum;
      endPage = pageNum;

      // Apply aggressive metadata filters for ALL pages of multi-page references
      // This is because metadata (page numbers, line numbers) can appear at the END of any page
      // - Same page references: NO filters applied ✓
      // - Multi-page references: Filters applied to ALL pages ✓
      const applyFilters = isMultiPageRef;
      if (isLikelyMetadata(item, applyFilters)) {
        continue;
      }

      // For multi-page refs: skip items outside the page content band
      // This filters out headers (e.g., paper title) and footers (e.g., "Page 20 of 22")
      // that are spatially separated from the main text area on each page
      if (isMultiPageRef) {
        const itemY = item.transform ? item.transform[5] : null;
        if (itemY !== null) {
          const band = pageContentBands.get(pageNum);
          if (band && (itemY < band.minY || itemY > band.maxY)) {
            continue;
          }
        }
      }

      const itemY = item.transform ? item.transform[5] : null;
      const itemX = item.transform ? item.transform[4] : null;

      // For last reference, detect section breaks by Y gap and X position change
      if (isLastRef && itemsSinceRefStart > 3) {
        // Track the X position of the reference body text (after the first few items)
        if (referenceTextX === null && itemX !== null) {
          referenceTextX = itemX;
        }

        // Check for large Y gap (indicates section break)
        if (previousY !== null && itemY !== null) {
          const yGap = Math.abs(itemY - previousY);

          // Large vertical gap (> 20 in PDF coordinates)
          if (yGap > 20) {
            // Also check if X position changed significantly (> 30px)
            // This indicates a new section title at a different indent
            if (referenceTextX !== null && Math.abs(itemX - referenceTextX) > 30) {
              // Likely hit a new section (Appendix, Acknowledgments, etc.)
              break;
            }
          }
        }
      }

      // Add text to reference with intelligent spacing
      if (shouldAddSpace(refText, item.str)) {
        refText += ' ';
      }
      refText += item.str;

      previousY = itemY;
      itemsSinceRefStart++;
    }

    // Parse and store the reference
    if (refText.trim()) {
      const parsedRef = parseReferenceEntry(refText, currentRef.refNumber);
      // Add page span information
      parsedRef.startPage = startPage;
      parsedRef.endPage = endPage;
      parsedRef.spansMultiplePages = startPage !== endPage;
      references.set(currentRef.refNumber, parsedRef);

    }
  }

  return { references, pageContentBands, refPages, refFormat };
}

/**
 * Heuristic extraction when no clear References section is found
 * Uses the same line-based format detection before the numbered fallback.
 * @param {Object[]} allTextContent - All text content from pages (already sorted in reading order)
 * @returns {{references: Map<number|string, Reference>, pageContentBands: Map, refPages: Set, refFormat: string}}
 */
function extractReferencesHeuristic(allTextContent) {
  const references = new Map();

  // Look at the last 3 pages (items are already sorted in reading order)
  const lastPages = allTextContent.slice(-3);

  // Flatten all items into a single array
  const flatItems = [];

  for (const { pageNum, items } of lastPages) {
    for (const item of items) {
      flatItems.push({ item, pageNum });
    }
  }

  const lineBasedResult = extractReferencesFromLineGroups(flatItems);
  const refFormat = lineBasedResult.refFormat;
  if (lineBasedResult.references.size > 0) {
    const pageContentBands = new Map();
    for (const { pageNum, items } of lastPages) {
      if (lineBasedResult.refPages.has(pageNum)) {
        const band = computePageContentBand(items);
        if (band) pageContentBands.set(pageNum, band);
      }
    }

    return {
      references: lineBasedResult.references,
      pageContentBands,
      refPages: lineBasedResult.refPages,
      refFormat
    };
  }

  // FIRST PASS: Find all reference number positions using the detected format
  const refPositions = []; // Array of {refNumber, index, item}

  for (let i = 0; i < flatItems.length; i++) {
    const { item } = flatItems[i];
    const text = item.str;
    const trimmedText = text.trim();

    if (!trimmedText) continue;

    // Filter out metadata (no filters applied in first pass)
    if (isLikelyMetadata(item, false)) {
      continue;
    }

    // Look for numbered entries at the start, including numbers split across items
    const refNumMatch = getReferenceStartMatchAt(flatItems, i, refFormat);

    if (refNumMatch) {
      const num = refNumMatch.refNumber;

      // Only consider it a reference if it looks like a sequence
      if (refPositions.length === 0 || num === (refPositions[refPositions.length - 1]?.refNumber || 0) + 1) {
        refPositions.push({
          refNumber: num,
          index: i,
          item
        });
      }
    }
  }

  // Determine which pages contain references
  const refPages = new Set();
  for (const { index } of refPositions) {
    const entry = flatItems[index];
    if (entry) refPages.add(entry.pageNum);
  }
  if (refPositions.length > 0) {
    const lastRefIndex = refPositions[refPositions.length - 1].index;
    for (let j = lastRefIndex; j < flatItems.length; j++) {
      refPages.add(flatItems[j].pageNum);
    }
  }

  // Pre-compute content bands only for pages with references
  const pageContentBands = new Map();
  for (const { pageNum, items } of lastPages) {
    if (refPages.has(pageNum)) {
      const band = computePageContentBand(items);
      if (band) pageContentBands.set(pageNum, band);
    }
  }

  // If no reference numbers found, return empty
  if (refPositions.length === 0) {
    return { references, pageContentBands, refPages, refFormat };
  }

  // SECOND PASS: Extract text between consecutive reference numbers
  for (let i = 0; i < refPositions.length; i++) {
    const currentRef = refPositions[i];
    const nextRef = refPositions[i + 1]; // undefined for last reference
    const isLastRef = !nextRef;

    const startIndex = currentRef.index;
    const endIndex = nextRef ? nextRef.index : flatItems.length;

    // Collect all text from start to end (excluding the next reference number)
    let refText = '';
    let previousY = null;
    let referenceTextX = null;
    let itemsSinceRefStart = 0;
    let startPage = null;
    let endPage = null;
    let isMultiPageRef = false;

    // FIRST: Quick scan to determine if this reference spans multiple pages
    for (let j = startIndex; j < endIndex; j++) {
      const { pageNum } = flatItems[j];
      if (startPage === null) startPage = pageNum;
      if (pageNum !== startPage) {
        isMultiPageRef = true;
        break;
      }
    }

    // Reset for actual text collection
    startPage = null;
    endPage = null;

    for (let j = startIndex; j < endIndex; j++) {
      const { item, pageNum } = flatItems[j];
      const text = item.str.trim();

      if (!text) continue;

      // Track page numbers
      if (startPage === null) startPage = pageNum;
      endPage = pageNum;

      // Apply aggressive metadata filters for ALL pages of multi-page references
      const applyFilters = isMultiPageRef;
      if (isLikelyMetadata(item, applyFilters)) {
        continue;
      }

      // For multi-page refs: skip items outside the page content band
      if (isMultiPageRef) {
        const itemY = item.transform ? item.transform[5] : null;
        if (itemY !== null) {
          const band = pageContentBands.get(pageNum);
          if (band && (itemY < band.minY || itemY > band.maxY)) {
            continue;
          }
        }
      }

      const itemY = item.transform ? item.transform[5] : null;
      const itemX = item.transform ? item.transform[4] : null;

      // For last reference, detect section breaks by Y gap and X position change
      if (isLastRef && itemsSinceRefStart > 3) {
        if (referenceTextX === null && itemX !== null) {
          referenceTextX = itemX;
        }

        if (previousY !== null && itemY !== null) {
          const yGap = Math.abs(itemY - previousY);

          if (yGap > 20) {
            if (referenceTextX !== null && Math.abs(itemX - referenceTextX) > 30) {
              break;
            }
          }
        }
      }

      // Add text to reference with intelligent spacing
      if (shouldAddSpace(refText, item.str)) {
        refText += ' ';
      }
      refText += item.str;

      previousY = itemY;
      itemsSinceRefStart++;
    }

    // Parse and store the reference
    if (refText.trim()) {
      const parsedRef = parseReferenceEntry(refText, currentRef.refNumber);
      // Add page span information
      parsedRef.startPage = startPage;
      parsedRef.endPage = endPage;
      parsedRef.spansMultiplePages = startPage !== endPage;
      references.set(currentRef.refNumber, parsedRef);

    }
  }

  return { references, pageContentBands, refPages, refFormat };
}

/**
 * Finds all numeric and parenthetical author-year citation occurrences.
 * @param {string} text - Text to search for citations
 * @param {Map<number|string, Reference>} references - Extracted bibliography
 * @returns {Array<{match: string, numbers: number[], targets: Array<{id: number|string|null, label: string}>, index: number}>}
 */
export function findCitationsInText(text, references = new Map()) {
  const citations = [];
  const numericRegex = new RegExp(CITATION_PATTERNS.all.source, 'g');

  let match;
  while ((match = numericRegex.exec(text)) !== null) {
    const numbers = parseCitationNumbers(match[0]);
    if (numbers.length > 0) {
      citations.push({
        match: match[0],
        numbers,
        targets: numbers.map(number => ({ id: number, label: `[${number}]` })),
        index: match.index
      });
    }
  }

  const referenceAliases = new Map();
  for (const [id, reference] of references) {
    for (const key of reference.citationKeys || []) {
      if (!referenceAliases.has(key)) referenceAliases.set(key, []);
      referenceAliases.get(key).push(id);
    }
  }

  const resolvePart = part => {
    const aliasMatches = referenceAliases.get(part.key) || [];
    return aliasMatches.filter(id => {
      const reference = references.get(id);
      const authors = reference?.authors || [];
      if (authors.length === 0) return true;

      if (part.form === 'single') return authors.length === 1;
      if (part.form === 'pair') {
        return authors.length === 2 &&
          normalizeCitationToken(authors[1]) === normalizeCitationToken(part.secondSurname);
      }
      return authors.length >= 2;
    });
  };

  const targetsForParts = parts => {
    const referenceIdsByPart = parts.map(resolvePart);
    const hasCitationEvidence = parts.some((part, index) =>
      part.form !== 'single' || referenceIdsByPart[index].length > 0
    );
    if (!hasCitationEvidence) return null;

    return parts.flatMap((part, index) => {
      const ids = referenceIdsByPart[index];
      return ids.length > 0
        ? ids.map(id => ({ id, label: part.label }))
        : [{ id: null, label: part.label }];
    });
  };

  const authorYearRegex = new RegExp(AUTHOR_YEAR_PARENTHESES_PATTERN.source, 'g');
  while ((match = authorYearRegex.exec(text)) !== null) {
    const parts = match[1].split(/\s*;\s*/).map(parseAuthorYearCitationPart);
    if (parts.length === 0 || parts.some(part => !part)) continue;
    const targets = targetsForParts(parts);
    if (!targets) continue;

    citations.push({
      match: match[0],
      numbers: [],
      targets,
      index: match.index
    });
  }

  const narrativeRegex = new RegExp(
    `((?:${MULTIWORD_SURNAME_SOURCE})(?:\\s*et\\s*al\\.|\\s*(?:and|&)\\s*(?:${MULTIWORD_SURNAME_SOURCE}))?)` +
    `\\s*\\(\\s*((?:19|20)\\d{2}[a-z]?)\\s*\\)`,
    'giu'
  );
  while ((match = narrativeRegex.exec(text)) !== null) {
    const part = parseAuthorYearCitationPart(`${match[1]}, ${match[2]}`);
    if (!part) continue;
    const targets = targetsForParts([part]);
    if (!targets) continue;
    citations.push({
      match: match[0],
      numbers: [],
      targets,
      index: match.index
    });
  }

  return citations
    .sort((a, b) => a.index - b.index)
    .filter((citation, index, sorted) =>
      index === 0 || citation.index >= sorted[index - 1].index + sorted[index - 1].match.length
    );
}

/**
 * Checks if a text span likely contains a citation
 * @param {string} text - Text to check
 * @param {Map<number|string, Reference>} references - Extracted bibliography
 * @returns {boolean}
 */
export function containsCitation(text, references = new Map()) {
  return findCitationsInText(text, references).length > 0;
}

export default {
  parseCitationNumbers,
  extractDOI,
  extractURL,
  parseReferenceEntry,
  extractReferencesFromPages,
  findCitationsInText,
  containsCitation
};
