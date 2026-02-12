/**
 * Reference Parser Module
 * Extracts and parses bibliographic references from PDF documents
 */

/**
 * @typedef {Object} Reference
 * @property {number} number - Reference number
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

// Regex patterns for DOI and URL extraction
const DOI_PATTERN = /\b(10\.\d{4,}\/[^\s\]<>]+)/gi;
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
 * @param {number} number - Reference number
 * @returns {Reference}
 */
export function parseReferenceEntry(text, number) {
  // Clean up the text
  let cleanText = text
    .replace(/\s+/g, ' ')
    .trim();

  // Remove the leading number if present (e.g., "[1]" or "1.")
  cleanText = cleanText
    .replace(/^\[\d+\]\s*/, '')
    .replace(/^\d+\.\s*/, '')
    .replace(/^\d+\s+/, '');

  const doi = extractDOI(cleanText);
  const url = extractURL(cleanText);

  return {
    number,
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
  return -1;
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
    // Very short numeric-only strings (likely page/line numbers)
    // But exclude if it's part of a year, DOI, or arXiv ID
    if (/^\d{1,3}$/.test(text)) {
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
 * 1. First pass: Find all reference number positions [1], [2], etc.
 * 2. Second pass: Extract text between consecutive reference numbers
 * @param {PDFDocumentProxy} pdfDocument - PDF.js document proxy
 * @returns {Promise<{references: Map<number, Reference>, pageContentBands: Map<number, {minY: number, maxY: number}>}>}
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

  // Detect reference numbering format by scanning the start of the references section.
  // We look at the first items to see if references use [N] brackets or N. dot format.
  // This must be done BEFORE the full pass to avoid matching inline citations [N]
  // that appear inside reference text of dot-formatted lists.
  let refPattern = /^\s*\[(\d+)\]/; // default: bracket format
  let refFormat = 'bracket';
  for (let i = 0; i < Math.min(flatItems.length, 50); i++) {
    const text = flatItems[i].item.str;
    const trimmed = text.trim();
    if (!trimmed || isLikelyMetadata(flatItems[i].item)) continue;
    if (/^\s*\[\d+\]/.test(text)) {
      refPattern = /^\s*\[(\d+)\]/;
      refFormat = 'bracket';
      break;
    }
    if (/^\s*\d+\.(\s|$)/.test(text)) {
      refPattern = /^\s*(\d+)\.(\s|$)/;
      refFormat = 'dot';
      break;
    }
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

    // Check for reference number pattern
    const refNumMatch = text.match(refPattern);
    if (refNumMatch) {
      const refNumber = parseInt(refNumMatch[1], 10);

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
 * Uses two-pass approach: find all [number] positions, then extract text between them
 * @param {Object[]} allTextContent - All text content from pages (already sorted in reading order)
 * @returns {Map<number, Reference>}
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

  // Detect reference numbering format by scanning the first items
  let refPattern = /^\s*\[(\d+)\]/; // default: bracket format
  let refFormat = 'bracket';
  for (let i = 0; i < Math.min(flatItems.length, 50); i++) {
    const text = flatItems[i].item.str;
    const trimmed = text.trim();
    if (!trimmed || isLikelyMetadata(flatItems[i].item, false)) continue;
    if (/^\s*\[\d+\]/.test(text)) {
      refPattern = /^\s*\[(\d+)\]/;
      refFormat = 'bracket';
      break;
    }
    if (/^\s*\d+\.(\s|$)/.test(text)) {
      refPattern = /^\s*(\d+)\.(\s|$)/;
      refFormat = 'dot';
      break;
    }
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

    // Look for numbered entries at the start
    const refNumMatch = text.match(refPattern);

    if (refNumMatch) {
      const num = parseInt(refNumMatch[1], 10);

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
 * Finds all citation occurrences in a text string
 * @param {string} text - Text to search for citations
 * @returns {Array<{match: string, numbers: number[], index: number}>}
 */
export function findCitationsInText(text) {
  const citations = [];
  const regex = new RegExp(CITATION_PATTERNS.all.source, 'g');

  let match;
  while ((match = regex.exec(text)) !== null) {
    const numbers = parseCitationNumbers(match[0]);
    if (numbers.length > 0) {
      citations.push({
        match: match[0],
        numbers,
        index: match.index
      });
    }
  }

  return citations;
}

/**
 * Checks if a text span likely contains a citation
 * @param {string} text - Text to check
 * @returns {boolean}
 */
export function containsCitation(text) {
  return CITATION_PATTERNS.all.test(text);
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
