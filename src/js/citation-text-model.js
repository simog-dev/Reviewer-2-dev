/**
 * Builds a searchable text stream from PDF.js text-layer spans without losing
 * the offsets needed to draw a citation back on the original PDF text.
 *
 * PDF.js frequently splits a visual sentence into multiple spans and does not
 * guarantee that whitespace is included in either adjacent span.  The stream
 * therefore inserts inferred whitespace while leaving each source span's
 * offsets anchored to its original text.
 */

function normalizeSpanText(text) {
  return (text || '')
    .replace(/[\u00a0\t\r\n]/g, ' ')
    // Preserve string length so logical offsets remain valid DOM text offsets.
    .replace(/[\u200b\ufeff]/g, ' ');
}

function itemGeometry(item) {
  if (!item?.transform) return null;
  const [a, b, c, d, x, y] = item.transform;
  return {
    x,
    y,
    width: Number.isFinite(item.width) ? item.width : 0,
    height: Number.isFinite(item.height) ? item.height : Math.max(Math.hypot(c, d), Math.hypot(a, b), 1)
  };
}

function requiresLexicalSpace(previousText, nextText) {
  const previous = previousText.slice(-1);
  const next = nextText[0];
  if (!previous || !next || /\s/.test(previous) || /\s/.test(next)) return false;
  if (/[([{\u201c\u2018\/\-]/u.test(previous)) return false;
  if (/[\])},.;:!?%\/]/u.test(next)) return false;
  return /[\p{L}\p{N}.]/u.test(previous) && /[\p{L}\p{N}]/u.test(next);
}

/**
 * Infer only whitespace that is absent from the PDF text items. Geometry wins;
 * lexical fallback is used when tests or unusual PDFs do not expose it.
 */
export function inferTextSeparator(previous, current) {
  if (!previous || !current || !previous.text || !current.text) return '';
  if (/\s$/u.test(previous.text) || /^\s/u.test(current.text)) return '';

  const lexicalSpace = requiresLexicalSpace(previous.text, current.text);
  if (!lexicalSpace) return '';
  if (previous.item?.hasEOL) return ' ';

  const previousGeometry = itemGeometry(previous.item);
  const currentGeometry = itemGeometry(current.item);
  if (!previousGeometry || !currentGeometry) return ' ';

  const lineTolerance = Math.max(previousGeometry.height, currentGeometry.height, 1) * 0.4;
  if (Math.abs(previousGeometry.y - currentGeometry.y) > lineTolerance) return ' ';

  const previousCharacterWidth = previousGeometry.width / Math.max(previous.text.trim().length, 1);
  const currentCharacterWidth = currentGeometry.width / Math.max(current.text.trim().length, 1);
  const characterWidth = Math.max(Math.min(previousCharacterWidth, currentCharacterWidth), 1);
  const horizontalGap = currentGeometry.x - (previousGeometry.x + previousGeometry.width);

  // A small positive gap is how PDF.js represents a missing word space. A
  // negative/zero gap normally means a word was split for font/encoding reasons.
  return horizontalGap > characterWidth * 0.12 ? ' ' : '';
}

/**
 * @param {Array<{span: Object, text?: string, item?: Object}>} sources
 * @returns {{text: string, spanMap: Array<{span: Object, text: string, startOffset: number, endOffset: number}>}}
 */
export function buildCitationTextModel(sources) {
  let text = '';
  const spanMap = [];
  let previous = null;

  for (const source of sources) {
    const normalizedText = normalizeSpanText(source.text ?? source.span?.textContent ?? '');
    if (!normalizedText) continue;

    const current = { ...source, text: normalizedText };
    text += inferTextSeparator(previous, current);

    const startOffset = text.length;
    text += normalizedText;
    spanMap.push({
      span: source.span,
      text: normalizedText,
      startOffset,
      endOffset: text.length
    });
    previous = current;
  }

  return { text, spanMap };
}

export default { buildCitationTextModel, inferTextSeparator };
