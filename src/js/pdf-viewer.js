// PDF.js Viewer for Electron
// Compatible with pdfjs-dist v6.x

import * as pdfjsLib from '../../node_modules/pdfjs-dist/legacy/build/pdf.min.mjs';
import { extractReferencesFromPages, findCitationsInText, parseCitationNumbers } from './reference-parser.js';

// Initialize PDF.js worker
const basePath = new URL('..', window.location.href).href;
const pdfjsWorkerSrc = `${basePath}node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs`;
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc;

async function initPdfJs() {
  return pdfjsLib;
}

// Pages within this many viewport heights of the visible area are pre-rendered
const RENDER_BUFFER_VIEWPORTS = 2;
const PDF_TO_CSS_UNITS = pdfjsLib.PixelsPerInch?.PDF_TO_CSS_UNITS || (96 / 72);

// Category highlight colors (rgba with alpha for fill)
const CATEGORY_COLORS = {
  critical:   { r: 220, g: 38,  b: 38  },  // #dc2626
  major:      { r: 234, g: 88,  b: 12  },  // #ea580c
  minor:      { r: 202, g: 138, b: 4   },  // #ca8a04
  suggestion: { r: 37,  g: 99,  b: 235 },  // #2563eb
  question:   { r: 124, g: 58,  b: 237 },  // #7c3aed
};

export class PDFViewer {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.viewerElement = null;
    this.pdf = null;
    this.pages = [];               // PDF page objects (fetched during placeholder init)
    this.pageElements = new Map(); // pageNumber → {container, canvas, textLayer, highlightCanvas}
    this.renderedPages = new Set(); // pages with canvas + text currently rendered
    this.renderGeneration = 0;     // incremented on scale change to discard stale in-flight renders
    this.scale = options.scale || 1;
    this.currentPage = 1;
    this.totalPages = 0;

    this.onPageChange = options.onPageChange || (() => {});
    this.onTextSelected = options.onTextSelected || (() => {});
    this.onHighlightClick = options.onHighlightClick || (() => {});
    this.onSimpleHighlightClick = options.onSimpleHighlightClick || (() => {});
    this.onCitationHover = options.onCitationHover || (() => {});
    this.onCitationLeave = options.onCitationLeave || (() => {});

    this.highlightModeEnabled = false;
    this.annotations = [];
    this.highlights = [];  // Simple highlights (not annotations)
    this.observer = null;
    this.dualPageMode = false;

    // Reference tracking
    this.references = new Map();        // number → Reference object
    this.citationSpans = new Map();     // pageNumber → array of citation spans
    this.referencesExtracted = false;
    this.pageContentBands = new Map();  // pageNumber → {minY, maxY} in PDF coords
    this.refPages = new Set();          // pages that contain reference entries
    this.refFormat = 'bracket';         // 'bracket' ([N]) or 'dot' (N.)
    this.textLayerSelectionCleanupBound = false;

    this.init();
  }

  init() {
    this.viewerElement = this.container.querySelector('.pdf-viewer') ||
                          this.container.appendChild(document.createElement('div'));
    this.viewerElement.className = 'pdf-viewer';

    this.setupScrollListener();
    this.setupSelectionListener();
  }

  _viewportScale(scale = this.scale) {
    return scale * PDF_TO_CSS_UNITS;
  }

  async load(data) {
    try {
      const pdfjs = await initPdfJs();

      // Ensure data is Uint8Array
      let pdfData = data;
      if (ArrayBuffer.isView(data)) {
        pdfData = new Uint8Array(data.buffer || data);
      } else if (data instanceof ArrayBuffer) {
        pdfData = new Uint8Array(data);
      } else if (typeof data === 'object' && data.data) {
        // Handle serialized Buffer from IPC
        pdfData = new Uint8Array(data.data);
      }

      const loadingTask = pdfjs.getDocument({
        data: pdfData,
        cMapUrl: '../node_modules/pdfjs-dist/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: '../node_modules/pdfjs-dist/standard_fonts/',
      });

      this.pdf = await loadingTask.promise;
      this.totalPages = this.pdf.numPages;

      this.viewerElement.innerHTML = '';
      this.pages = [];
      this.pageElements.clear();
      this.renderedPages.clear();
      this.renderGeneration++;
      this.destroyObserver();

      // Create sized placeholders for all pages (no canvas rendering yet).
      // This establishes the correct total scroll height immediately.
      await this.initPagePlaceholders();

      // Observe pages and render those near the viewport
      this.setupObserver();
      this.renderVisiblePages();
      this.updateCurrentPageFromScroll();

      // Extract references in background (non-blocking)
      this.extractReferences();

      return this.totalPages;
    } catch (error) {
      console.error('Error loading PDF:', error);
      throw error;
    }
  }

  // Create lightweight placeholder containers for every page.
  // Each gets the correct layout dimensions so scroll positions are accurate,
  // but no canvas or text layer content is rendered yet.
  async initPagePlaceholders() {
    for (let i = 1; i <= this.totalPages; i++) {
      const page = await this.pdf.getPage(i);
      this.pages[i - 1] = page;
      const viewport = page.getViewport({ scale: this._viewportScale() });

      const pageContainer = document.createElement('div');
      pageContainer.className = 'pdf-page';
      pageContainer.dataset.pageNumber = i;
      pageContainer.style.width = `${viewport.width}px`;
      pageContainer.style.height = `${viewport.height}px`;

      const canvas = document.createElement('canvas');
      canvas.width = 0;
      canvas.height = 0;

      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      textLayerDiv.style.setProperty('--scale-factor', viewport.scale);

      const highlightCanvas = document.createElement('canvas');
      highlightCanvas.className = 'highlight-canvas';
      highlightCanvas.width = 0;
      highlightCanvas.height = 0;

      pageContainer.appendChild(canvas);
      pageContainer.appendChild(highlightCanvas);
      pageContainer.appendChild(textLayerDiv);
      // Append to viewer; rebuildLayout will reorganize if dual mode
      this.viewerElement.appendChild(pageContainer);

      this.pageElements.set(i, {
        container: pageContainer,
        canvas,
        textLayer: textLayerDiv,
        highlightCanvas,
        viewport
      });

      // Click hit-test for highlight navigation.
      // The text layer (z-index: 2) sits above the highlight layer (z-index: 1),
      // so clicks on highlighted text reach spans first. This listener performs
      // a coordinate hit-test to forward matching clicks to onHighlightClick.
      // Attached once per page; reads live state at click time.
      const pageNumber = i;
      textLayerDiv.addEventListener('click', (e) => {
        if (this.highlightModeEnabled) return;

        const pageRect = pageContainer.getBoundingClientRect();
        const coordinateScale = this._viewportScale();
        const clickX = (e.clientX - pageRect.left) / coordinateScale;
        const clickY = (e.clientY - pageRect.top) / coordinateScale;

        // First check for annotations
        const hitAnnotation = this.annotations.find(ann => {
          if (ann.page_number !== pageNumber) return false;
          return ann.highlight_rects.some(rect =>
            clickX >= rect.left && clickX <= rect.left + rect.width &&
            clickY >= rect.top && clickY <= rect.top + rect.height
          );
        });

        if (hitAnnotation) {
          e.stopPropagation();
          this.onHighlightClick(hitAnnotation, e);
          return;
        }

        // Then check for simple highlights
        const hitHighlight = this.highlights.find(hl => {
          if (hl.page_number !== pageNumber) return false;
          return hl.highlight_rects.some(rect =>
            clickX >= rect.left && clickX <= rect.left + rect.width &&
            clickY >= rect.top && clickY <= rect.top + rect.height
          );
        });

        if (hitHighlight) {
          e.stopPropagation();
          this.onSimpleHighlightClick(hitHighlight, e);
        }
      });

      textLayerDiv.addEventListener('contextmenu', (e) => {
        if (this.highlightModeEnabled) return;

        const pageRect = pageContainer.getBoundingClientRect();
        const coordinateScale = this._viewportScale();
        const clickX = (e.clientX - pageRect.left) / coordinateScale;
        const clickY = (e.clientY - pageRect.top) / coordinateScale;

        const hitAnnotation = this.annotations.find(ann => {
          if (ann.page_number !== pageNumber) return false;
          return ann.highlight_rects.some(rect =>
            clickX >= rect.left && clickX <= rect.left + rect.width &&
            clickY >= rect.top && clickY <= rect.top + rect.height
          );
        });

        if (hitAnnotation) {
          e.preventDefault();
          e.stopPropagation();
          this.onHighlightClick(hitAnnotation, e, true);
        }
      });

      // Cursor hit-test: show pointer when hovering over a highlight
      textLayerDiv.addEventListener('mousemove', (e) => {
        if (this.highlightModeEnabled) {
          textLayerDiv.classList.remove('over-highlight');
          return;
        }

        const pageRect = pageContainer.getBoundingClientRect();
        const coordinateScale = this._viewportScale();
        const mx = (e.clientX - pageRect.left) / coordinateScale;
        const my = (e.clientY - pageRect.top) / coordinateScale;

        // Check annotations
        const overAnnotation = this.annotations.some(ann => {
          if (ann.page_number !== pageNumber) return false;
          return ann.highlight_rects.some(rect =>
            mx >= rect.left && mx <= rect.left + rect.width &&
            my >= rect.top && my <= rect.top + rect.height
          );
        });

        // Check simple highlights
        const overSimpleHighlight = this.highlights.some(hl => {
          if (hl.page_number !== pageNumber) return false;
          return hl.highlight_rects.some(rect =>
            mx >= rect.left && mx <= rect.left + rect.width &&
            my >= rect.top && my <= rect.top + rect.height
          );
        });

        textLayerDiv.classList.toggle('over-highlight', overAnnotation || overSimpleHighlight);
      });

      textLayerDiv.addEventListener('mouseleave', () => {
        textLayerDiv.classList.remove('over-highlight');
      });
    }

    // Organize into spreads if dual page mode is active
    if (this.dualPageMode) {
      this.rebuildLayout();
    }
  }

  setDualPageMode(enabled) {
    if (this.dualPageMode === enabled) return;
    this.dualPageMode = enabled;
    if (this.totalPages === 0) return;

    const scrollRatio = this.container.scrollTop / this.container.scrollHeight;
    this.rebuildLayout();
    this.container.scrollTop = scrollRatio * this.container.scrollHeight;
  }

  rebuildLayout() {
    // Remove all children from viewer without destroying pageContainers
    // First remove any existing spread wrappers
    this.viewerElement.querySelectorAll('.pdf-page-spread').forEach(s => {
      // Move children back out before removing spread
      while (s.firstChild) {
        this.viewerElement.appendChild(s.firstChild);
      }
      s.remove();
    });

    // Detach all page containers
    const pages = [];
    this.pageElements.forEach((elements, pageNumber) => {
      pages.push({ pageNumber, container: elements.container });
    });
    pages.sort((a, b) => a.pageNumber - b.pageNumber);
    pages.forEach(p => p.container.remove());

    if (!this.dualPageMode) {
      // Single page: append directly
      pages.forEach(p => this.viewerElement.appendChild(p.container));
    } else {
      // Dual page: page 1 alone, then pairs [2,3], [4,5], ...
      let i = 0;
      while (i < pages.length) {
        const spread = document.createElement('div');
        spread.className = 'pdf-page-spread';

        if (i === 0) {
          // First page alone
          spread.appendChild(pages[i].container);
          i++;
        } else {
          spread.appendChild(pages[i].container);
          i++;
          if (i < pages.length) {
            spread.appendChild(pages[i].container);
            i++;
          }
        }

        this.viewerElement.appendChild(spread);
      }
    }

    // Recreate observer
    this.destroyObserver();
    this.setupObserver();
    this.renderVisiblePages();
  }

  setupObserver() {
    const vh = this.container.getBoundingClientRect().height;
    const margin = vh * RENDER_BUFFER_VIEWPORTS;

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const pageNumber = parseInt(entry.target.dataset.pageNumber, 10);
          this.renderPageIfNeeded(pageNumber);
        }
      });
    }, {
      root: this.container,
      rootMargin: `${margin}px 0px ${margin}px 0px`
    });

    this.pageElements.forEach((elements) => {
      this.observer.observe(elements.container);
    });
  }

  destroyObserver() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  // Synchronous check: render any pages within the buffer zone around the viewport.
  // Used on initial load and after zoom to kick off immediate rendering for visible pages.
  renderVisiblePages() {
    const containerRect = this.container.getBoundingClientRect();
    const bufferSize = containerRect.height * RENDER_BUFFER_VIEWPORTS;

    this.pageElements.forEach((elements, pageNumber) => {
      const pageRect = elements.container.getBoundingClientRect();
      if (pageRect.bottom >= containerRect.top - bufferSize &&
          pageRect.top <= containerRect.bottom + bufferSize) {
        this.renderPageIfNeeded(pageNumber);
      }
    });
  }

  // Render a single page's canvas and text layer on demand.
  // Idempotent: returns immediately if the page is already rendered.
  async renderPageIfNeeded(pageNumber) {
    if (this.renderedPages.has(pageNumber)) return;
    this.renderedPages.add(pageNumber);

    const generation = this.renderGeneration;
    const pdfjs = await initPdfJs();
    const page = this.pages[pageNumber - 1];
    const elements = this.pageElements.get(pageNumber);
    if (!page || !elements) {
      this.renderedPages.delete(pageNumber);
      return;
    }

    const { canvas, textLayer: textLayerDiv, highlightCanvas } = elements;
    const pixelRatio = window.devicePixelRatio || 1;

    // Canvas renders at device-pixel resolution for crisp output on retina displays.
    // CSS size stays at layout resolution so the page occupies the correct space.
    const layoutScale = this._viewportScale();
    const renderViewport = page.getViewport({ scale: layoutScale * pixelRatio });
    const layoutViewport = page.getViewport({ scale: layoutScale });

    const context = canvas.getContext('2d');
    canvas.width = renderViewport.width;
    canvas.height = renderViewport.height;
    canvas.style.width = `${layoutViewport.width}px`;
    canvas.style.height = `${layoutViewport.height}px`;

    // Size highlight canvas to match PDF canvas
    highlightCanvas.width = renderViewport.width;
    highlightCanvas.height = renderViewport.height;
    highlightCanvas.style.width = `${layoutViewport.width}px`;
    highlightCanvas.style.height = `${layoutViewport.height}px`;

    await page.render({
      canvasContext: context,
      viewport: renderViewport
    }).promise;

    // Bail out if a zoom change invalidated this render
    if (generation !== this.renderGeneration) {
      this.renderedPages.delete(pageNumber);
      return;
    }

    // Text layer uses the layout viewport (CSS pixels), not the device-pixel viewport
    // Ensure --scale-factor is set correctly before rendering
    textLayerDiv.style.setProperty('--scale-factor', layoutViewport.scale);
    try {
      const textContent = await page.getTextContent({
        includeMarkedContent: true,
        disableNormalization: true
      });

      // Filter out watermark text (e.g. "For Peer Review") that overlaps real content
      textContent.items = textContent.items.filter(item => {
        const str = (item.str || '').trim();
        return !/^For\s+Peer\s+Review$/i.test(str);
      });

      if (pdfjs.TextLayer) {
        const textLayer = new pdfjs.TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport: layoutViewport
        });
        await textLayer.render();
      } else if (pdfjs.renderTextLayer) {
        await pdfjs.renderTextLayer({
          textContent: textContent,
          container: textLayerDiv,
          viewport: layoutViewport,
          textDivs: []
        }).promise;
      }
      this._ensureTextLayerSelectionSentinel(textLayerDiv);
    } catch (textError) {
      console.warn('Text layer rendering failed:', textError);
    }

    // Mark citations in the text layer
    this.markCitationsOnPage(pageNumber);

    // Render any annotations belonging to this page
    this.redrawPageHighlights(pageNumber);
  }

  async setScale(newScale) {
    if (newScale === 'fit-width') {
      const containerWidth = this.container.clientWidth - 48; // padding
      const page = this.pages[0];
      if (page) {
        const viewport = page.getViewport({ scale: PDF_TO_CSS_UNITS });
        if (this.dualPageMode) {
          // Two pages + gap (16px)
          newScale = (containerWidth - 16) / (viewport.width * 2);
        } else {
          newScale = containerWidth / viewport.width;
        }
      } else {
        newScale = 1;
      }
    }

    this.scale = newScale;
    this.renderGeneration++; // invalidate any in-flight renders at the previous scale
    const scrollRatio = this.container.scrollTop / this.container.scrollHeight;

    // Update placeholder dimensions and clear all rendered content
    this.pageElements.forEach((elements, pageNumber) => {
      const page = this.pages[pageNumber - 1];
      if (!page) return;

      const viewport = page.getViewport({ scale: this._viewportScale() });
      elements.container.style.width = `${viewport.width}px`;
      elements.container.style.height = `${viewport.height}px`;
      elements.viewport = viewport;
      elements.textLayer.style.setProperty('--scale-factor', viewport.scale);

      // Clear rendered content so pages re-render at new scale
      elements.canvas.width = 0;
      elements.canvas.height = 0;
      elements.canvas.style.width = '';
      elements.canvas.style.height = '';
      elements.textLayer.innerHTML = '';
      elements.highlightCanvas.width = 0;
      elements.highlightCanvas.height = 0;
      elements.highlightCanvas.style.width = '';
      elements.highlightCanvas.style.height = '';
    });
    this.renderedPages.clear();

    // Restore scroll position and re-render visible pages at new scale
    this.container.scrollTop = scrollRatio * this.container.scrollHeight;
    this.renderVisiblePages();
  }

  zoomIn() {
    const newScale = Math.min(this.scale * 1.25, 3);
    return this.setScale(newScale);
  }

  zoomOut() {
    const newScale = Math.max(this.scale / 1.25, 0.25);
    return this.setScale(newScale);
  }

  getScale() {
    return this.scale;
  }

  getCoordinateScale() {
    return this._viewportScale();
  }

  setupScrollListener() {
    let scrollTimeout;
    this.container.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        this.updateCurrentPageFromScroll();
        this.renderVisiblePages();
      }, 100);
    });
  }

  updateCurrentPageFromScroll() {
    const containerRect = this.container.getBoundingClientRect();
    const containerCenter = containerRect.top + containerRect.height / 2;

    let closestPage = 1;
    let closestDistance = Infinity;

    this.pageElements.forEach((elements, pageNumber) => {
      const rect = elements.container.getBoundingClientRect();
      const pageCenter = rect.top + rect.height / 2;
      const distance = Math.abs(pageCenter - containerCenter);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestPage = pageNumber;
      }
    });

    if (closestPage !== this.currentPage) {
      this.currentPage = closestPage;
      this.onPageChange(this.currentPage);
    }
  }

  scrollToPage(pageNumber) {
    const pageElement = this.pageElements.get(pageNumber);
    if (pageElement) {
      this._scrollElementIntoContainer(pageElement.container, 'start');
    }
  }

  goToPage(pageNumber) {
    // Alias for scrollToPage for consistency
    this.scrollToPage(pageNumber);
  }

  // Scroll to a specific rect (at scale=1) within a page, centering it in the viewport.
  // Ensures the page is rendered first.
  async scrollToPageRect(pageNumber, rect, behavior = 'smooth') {
    await this.renderPageIfNeeded(pageNumber);
    // Wait one frame for the browser to finish layout after rendering
    await new Promise(resolve => requestAnimationFrame(resolve));
    const elements = this.pageElements.get(pageNumber);
    if (!elements || !rect) return;
    this._scrollToRectInPage(elements, rect, behavior);
  }

  // Scroll an element into view within this.container without affecting outer layout.
  _scrollElementIntoContainer(element, block = 'center') {
    const containerRect = this.container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const offset = elementRect.top - containerRect.top + this.container.scrollTop;

    let target;
    if (block === 'start') {
      target = offset;
    } else {
      // center
      target = offset - (containerRect.height - elementRect.height) / 2;
    }

    this.container.scrollTo({ top: target, behavior: 'smooth' });
  }

  // Scroll so that a highlight rect (stored at scale=1) within a page is centered in the viewport.
  // Uses a temporary absolutely-positioned marker element to let the browser compute
  // the exact pixel position, avoiding manual offset arithmetic.
  _scrollToRectInPage(pageElements, rect, behavior = 'smooth') {
    if (!rect) return;

    // Place a zero-size marker at the rect's vertical center inside the page container
    const marker = document.createElement('div');
    marker.style.cssText = `position:absolute;left:0;pointer-events:none;width:0;height:0;`;
    const coordinateScale = this._viewportScale();
    marker.style.top = `${rect.top * coordinateScale + (rect.height * coordinateScale) / 2}px`;
    pageElements.container.appendChild(marker);

    // Compute the marker's absolute position within the scroll container
    const markerRect = marker.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    const markerAbsoluteY = markerRect.top - containerRect.top + this.container.scrollTop;

    marker.remove();

    // Scroll so the marker (= highlight center) is at the center of the container
    const target = markerAbsoluteY - this.container.clientHeight / 2;
    this.container.scrollTo({ top: Math.max(0, target), behavior });
  }

  setupSelectionListener() {
    document.addEventListener('mouseup', (e) => {
      // HIGHLIGHT MODE: Uncomment the line below to require highlight mode to be enabled
      // if (!this.highlightModeEnabled) return;

      // Ignore mouseup events on popup elements (they handle their own clicks)
      if (e.target.closest('#selection-popup') || e.target.closest('#highlight-popup')) {
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      let range = selection.getRangeAt(0);
      if (!range) return;

      // Check if selection is within the PDF viewer
      const textLayer = range.commonAncestorContainer.closest?.('.textLayer') ||
                        range.commonAncestorContainer.parentElement?.closest?.('.textLayer');
      if (!textLayer) return;

      const pageContainer = textLayer.closest('.pdf-page');
      if (!pageContainer) return;

      // Expand range to include complete words
      range = this.expandRangeToWordBoundaries(range);

      // Update the browser selection to the expanded range
      selection.removeAllRanges();
      selection.addRange(range);

      const pageNumber = parseInt(pageContainer.dataset.pageNumber, 10);
      const selectedText = selection.toString().trim();

      if (!selectedText) return;

      // Get bounding rects relative to the page.
      // We use per-span bounding rects instead of range.getClientRects() because
      // PDF.js text layer spans use CSS transforms for positioning, and
      // getClientRects() can return incorrect/incomplete rects when a selection
      // crosses spans with different transforms (e.g. superscript characters).
      const pageRect = pageContainer.getBoundingClientRect();
      const rects = this._getSelectionRectsFromSpans(range, textLayer, pageRect);

      // Merge adjacent rects
      const mergedRects = this.mergeRects(rects);

      this.onTextSelected({
        pageNumber,
        selectedText,
        rects: mergedRects,
        mouseX: e.clientX,
        mouseY: e.clientY
      });
    });
  }

  // Expand selection range to include complete words at boundaries
  expandRangeToWordBoundaries(range) {
    try {
      // Word boundary regex: spaces, punctuation that typically separate words
      // NOTE: We exclude [ ] from word boundaries to keep citations like [11] together
      const wordBoundary = /[\s\.,;:!?\-\–\—\(\)\{\}\"\'\/\\]/;

      // Expand start backwards
      let startNode = range.startContainer;
      let startOffset = range.startOffset;

      if (startNode.nodeType === Node.TEXT_NODE) {
        // First expand within current node
        while (startOffset > 0 && !wordBoundary.test(startNode.textContent[startOffset - 1])) {
          startOffset--;
        }

        // Then try to expand into previous sibling nodes
        let currentNode = startNode;
        let currentOffset = startOffset;

        while (currentOffset === 0) {
          const prevNode = this._getPreviousTextNode(currentNode);
          if (!prevNode) break;

          const prevText = prevNode.textContent;

          // Skip empty nodes
          if (prevText.length === 0) {
            currentNode = prevNode;
            currentOffset = 0;
            continue;
          }

          // Skip nodes that are only whitespace (common in PDF.js text layer)
          if (/^\s+$/.test(prevText)) {
            currentNode = prevNode;
            currentOffset = 0;
            continue;
          }

          // Check if we can expand into this node
          if (!wordBoundary.test(prevText[prevText.length - 1])) {
            // Find word boundary in previous node
            let offset = prevText.length - 1;
            while (offset > 0 && !wordBoundary.test(prevText[offset - 1])) {
              offset--;
            }
            currentNode = prevNode;
            currentOffset = offset;
          } else {
            break;
          }
        }

        range.setStart(currentNode, currentOffset);
      }

      // Expand end forwards
      let endNode = range.endContainer;
      let endOffset = range.endOffset;

      if (endNode.nodeType === Node.TEXT_NODE) {
        // First expand within current node
        const endText = endNode.textContent;
        while (endOffset < endText.length && !wordBoundary.test(endText[endOffset])) {
          endOffset++;
        }

        // Then try to expand into next sibling nodes
        let currentNode = endNode;
        let currentOffset = endOffset;

        while (currentOffset === currentNode.textContent.length) {
          const nextNode = this._getNextTextNode(currentNode);
          if (!nextNode) break;

          const nextText = nextNode.textContent;

          // Skip empty nodes
          if (nextText.length === 0) {
            currentNode = nextNode;
            currentOffset = 0;
            continue;
          }

          // Skip nodes that are only whitespace (common in PDF.js text layer)
          if (/^\s+$/.test(nextText)) {
            currentNode = nextNode;
            currentOffset = nextText.length;
            continue;
          }

          // Check if we can expand into this node
          if (!wordBoundary.test(nextText[0])) {
            // Find word boundary in next node
            let offset = 0;
            while (offset < nextText.length && !wordBoundary.test(nextText[offset])) {
              offset++;
            }
            currentNode = nextNode;
            currentOffset = offset;
          } else {
            break;
          }
        }

        range.setEnd(currentNode, currentOffset);
      }

      return range;
    } catch (error) {
      console.error('Error expanding range:', error);
      return range;
    }
  }

  // Helper: get the previous text node in DOM tree (within same page)
  _getPreviousTextNode(node) {
    // Get the parent span
    let current = node.parentNode;
    if (!current) return null;

    // Move to previous sibling span
    let prevSibling = current.previousElementSibling;
    if (prevSibling && prevSibling.hasAttribute('role') && prevSibling.getAttribute('role') === 'presentation') {
      // Return the first text node child
      return prevSibling.firstChild;
    }

    return null;
  }

  // Helper: get the next text node in DOM tree (within same page)
  _getNextTextNode(node) {
    // Get the parent span
    let current = node.parentNode;
    if (!current) return null;

    // Move to next sibling span
    let nextSibling = current.nextElementSibling;
    if (nextSibling && nextSibling.hasAttribute('role') && nextSibling.getAttribute('role') === 'presentation') {
      // Return the first text node child
      return nextSibling.firstChild;
    }

    return null;
  }

  /**
   * Compute highlight rects by iterating over individual text layer spans
   * within a selection range. This is more reliable than range.getClientRects()
   * which can fail with PDF.js spans that use CSS transforms (e.g. superscripts).
   */
  _getSelectionRectsFromSpans(range, textLayer, pageRect) {
    const rects = [];
    const textSpans = Array.from(textLayer.querySelectorAll('span[role="presentation"]'));

    // Find which spans overlap with the selection range
    for (const span of textSpans) {
      // Check if this span intersects the selection range
      if (!range.intersectsNode(span)) continue;

      const spanRect = span.getBoundingClientRect();
      if (spanRect.width < 1 || spanRect.height < 1) continue;

      // Determine if the span is fully or partially selected
      const spanTextNode = span.firstChild;
      if (!spanTextNode || spanTextNode.nodeType !== Node.TEXT_NODE) continue;

      let left = spanRect.left;
      let right = spanRect.right;

      // If this span contains the range start or end, compute partial rect
      if (span.contains(range.startContainer) || span.contains(range.endContainer)) {
        // Create a sub-range for just the selected portion of this span
        const subRange = document.createRange();
        const startInSpan = span.contains(range.startContainer);
        const endInSpan = span.contains(range.endContainer);

        if (startInSpan) {
          subRange.setStart(range.startContainer, range.startOffset);
        } else {
          subRange.setStart(spanTextNode, 0);
        }

        if (endInSpan) {
          subRange.setEnd(range.endContainer, range.endOffset);
        } else {
          subRange.setEnd(spanTextNode, spanTextNode.textContent.length);
        }

        // Use the sub-range rects, but fall back to the full span rect
        // if getClientRects returns nothing useful (transform issues)
        const subRects = subRange.getClientRects();
        if (subRects.length > 0) {
          let minLeft = Infinity, maxRight = -Infinity;
          for (let i = 0; i < subRects.length; i++) {
            if (subRects[i].width < 1) continue;
            minLeft = Math.min(minLeft, subRects[i].left);
            maxRight = Math.max(maxRight, subRects[i].right);
          }
          if (minLeft < Infinity) {
            left = minLeft;
            right = maxRight;
          }
        }
      }

      rects.push({
        left: (left - pageRect.left) / this._viewportScale(),
        top: (spanRect.top - pageRect.top) / this._viewportScale(),
        width: (right - left) / this._viewportScale(),
        height: spanRect.height / this._viewportScale()
      });
    }

    return rects;
  }

  mergeRects(rects) {
    if (rects.length === 0) return [];

    // Sort by top then left
    rects.sort((a, b) => a.top - b.top || a.left - b.left);

    const merged = [];
    let current = { ...rects[0] };

    for (let i = 1; i < rects.length; i++) {
      const rect = rects[i];

      // Check if rects are on the same line and adjacent.
      // Use a tolerance proportional to height to handle superscript/subscript
      // characters that have a different vertical offset on the same line.
      const lineHeight = Math.max(current.height, rect.height);
      const verticalTolerance = Math.max(5, lineHeight * 0.6);
      const verticallyAligned = Math.abs(rect.top - current.top) < verticalTolerance ||
        // Also check vertical overlap (rects share vertical space)
        (rect.top < current.top + current.height && rect.top + rect.height > current.top);

      if (verticallyAligned && rect.left <= current.left + current.width + 5) {
        // Merge: extend to cover both rects
        const newTop = Math.min(current.top, rect.top);
        const newBottom = Math.max(current.top + current.height, rect.top + rect.height);
        current.top = newTop;
        current.width = Math.max(current.left + current.width, rect.left + rect.width) - current.left;
        current.height = newBottom - newTop;
      } else {
        merged.push(current);
        current = { ...rect };
      }
    }
    merged.push(current);

    return merged;
  }

  setHighlightMode(enabled) {
    this.highlightModeEnabled = enabled;
  }

  setAnnotations(annotations) {
    this.annotations = annotations;
    this.renderAllHighlights();
  }

  setHighlights(highlights) {
    this.highlights = highlights;
    this.renderAllHighlights();
  }

  renderAllHighlights() {
    // Only update highlights on pages that are already rendered;
    // unrendered pages will get their highlights when renderPageIfNeeded runs
    this.pageElements.forEach((elements, pageNumber) => {
      if (!this.renderedPages.has(pageNumber)) return;
      this.redrawPageHighlights(pageNumber);
    });
  }

  // Clear and redraw all highlights for a single page on its highlight canvas
  redrawPageHighlights(pageNumber) {
    const elements = this.pageElements.get(pageNumber);
    if (!elements || !elements.highlightCanvas.width) return;

    const ctx = elements.highlightCanvas.getContext('2d');
    ctx.clearRect(0, 0, elements.highlightCanvas.width, elements.highlightCanvas.height);

    const pixelRatio = window.devicePixelRatio || 1;

    // Draw simple highlights first (so annotations are on top)
    const pageHighlights = this.highlights.filter(h => h.page_number === pageNumber);
    for (const hl of pageHighlights) {
      this._drawSimpleHighlightRects(ctx, hl, pixelRatio, 0.3);
    }

    // Then draw annotation highlights
    const pageAnnotations = this.annotations.filter(a => a.page_number === pageNumber);
    for (const ann of pageAnnotations) {
      this._drawAnnotationRects(ctx, ann, pixelRatio, 0.75);
    }

  }

  // Draw the rectangles for a single annotation on a canvas context
  _drawAnnotationRects(ctx, annotation, pixelRatio, alpha) {
    // Skip free notes (annotations with no highlight rectangles)
    if (!annotation.highlight_rects || annotation.highlight_rects.length === 0) {
      return;
    }

    // Use category_color from the annotation (fetched from DB via JOIN)
    // If not available, fall back to hardcoded colors
    let fillStyle;
    if (annotation.category_color) {
      fillStyle = this._hexToRgba(annotation.category_color, alpha);
    } else {
      const color = CATEGORY_COLORS[annotation.category_name.toLowerCase()];
      if (!color) return;
      fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
    }

    ctx.fillStyle = fillStyle;

    for (const rect of annotation.highlight_rects) {
      ctx.fillRect(
        rect.left * this._viewportScale() * pixelRatio,
        rect.top * this._viewportScale() * pixelRatio,
        rect.width * this._viewportScale() * pixelRatio,
        rect.height * this._viewportScale() * pixelRatio
      );
    }
  }

  // Draw the rectangles for a simple highlight (not annotation)
  _drawSimpleHighlightRects(ctx, highlight, pixelRatio, alpha) {
    if (!highlight.highlight_rects || highlight.highlight_rects.length === 0) {
      return;
    }

    // Use highlight color (default yellow #fbbf24)
    const color = highlight.color || '#fbbf24';
    ctx.fillStyle = this._hexToRgba(color, alpha);

    for (const rect of highlight.highlight_rects) {
      ctx.fillRect(
        rect.left * this._viewportScale() * pixelRatio,
        rect.top * this._viewportScale() * pixelRatio,
        rect.width * this._viewportScale() * pixelRatio,
        rect.height * this._viewportScale() * pixelRatio
      );
    }
  }

  // Convert hex color to rgba
  _hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  renderHighlight(annotation) {
    // For canvas-based highlights, just redraw the whole page
    this.redrawPageHighlights(annotation.page_number);
  }

  updateHighlight(annotationId, categoryName) {
    const annotation = this.annotations.find(a => a.id === annotationId);
    if (annotation) {
      this.redrawPageHighlights(annotation.page_number);
    }
  }

  removeHighlight(annotationId) {
    // Find which page this annotation was on before it was removed from this.annotations
    // Caller should pass the page number or we scan all rendered pages
    // Since the annotation may already be removed from this.annotations, redraw all rendered pages
    this.pageElements.forEach((elements, pageNumber) => {
      if (this.renderedPages.has(pageNumber)) {
        this.redrawPageHighlights(pageNumber);
      }
    });
  }

  async highlightAnnotation(annotationId) {
    const annotation = this.annotations.find(a => a.id === annotationId);
    if (!annotation) return;

    await this.renderPageIfNeeded(annotation.page_number);
    // Wait one frame for the browser to finish layout after rendering
    await new Promise(resolve => requestAnimationFrame(resolve));

    const elements = this.pageElements.get(annotation.page_number);
    if (!elements) return;

    // For free notes (no highlight rects), just scroll to the page
    if (!annotation.highlight_rects || annotation.highlight_rects.length === 0) {
      this._scrollElementIntoContainer(elements.container, 'center');
      return;
    }

    // Regular annotations with highlights: flash the highlight
    if (!elements.highlightCanvas.width) return;

    const pixelRatio = window.devicePixelRatio || 1;
    const ctx = elements.highlightCanvas.getContext('2d');
    const pageNumber = annotation.page_number;

    // Flash animation: alternate between high and normal opacity
    let flashCount = 0;
    const maxFlashes = 4; // 2 full cycles (high-low-high-low)
    const flashInterval = 300;

    const flash = () => {
      this.redrawPageHighlights(pageNumber);
      if (flashCount < maxFlashes) {
        // Draw this annotation's rects with higher opacity on even counts
        if (flashCount % 2 === 0) {
          this._drawAnnotationRects(ctx, annotation, pixelRatio, 0.55);
        }
        flashCount++;
        setTimeout(() => requestAnimationFrame(flash), flashInterval);
      }
    };

    requestAnimationFrame(flash);

    // Scroll so the first highlight rect is vertically centered in the container
    const firstRect = annotation.highlight_rects[0];
    if (firstRect) {
      this._scrollToRectInPage(elements, firstRect);
    } else {
      this._scrollElementIntoContainer(elements.container, 'center');
    }
  }

  clearSelection() {
    window.getSelection()?.removeAllRanges();
  }

  _ensureTextLayerSelectionSentinel(textLayerDiv) {
    if (!textLayerDiv.querySelector('.endOfContent')) {
      const endOfContent = document.createElement('div');
      endOfContent.className = 'endOfContent';
      textLayerDiv.appendChild(endOfContent);
    }

    if (textLayerDiv.dataset.selectionSentinelBound === 'true') return;

    textLayerDiv.addEventListener('mousedown', () => {
      textLayerDiv.classList.add('selecting');
    });

    if (!this.textLayerSelectionCleanupBound) {
      document.addEventListener('mouseup', () => {
        this.viewerElement
          ?.querySelectorAll('.textLayer.selecting')
          .forEach(layer => layer.classList.remove('selecting'));
      });
      this.textLayerSelectionCleanupBound = true;
    }

    textLayerDiv.dataset.selectionSentinelBound = 'true';
  }

  /**
   * Find text in the rendered PDF text layers and return DOM-aligned rects.
   * This avoids rebuilding PDF item coordinates by hand, which drifts from
   * PDF.js for scaled, transformed, or fragmented text runs.
   * @param {string} query
   * @returns {Promise<Array<{pageNum: number, textIndex: number, text: string, rects: Array}>>}
   */
  async findText(query) {
    const needle = (query || '').trim();
    if (!needle || !this.pdf) return [];

    const matches = [];
    const needleLower = needle.toLowerCase();

    for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
      await this.renderPageIfNeeded(pageNum);
      await new Promise(resolve => requestAnimationFrame(resolve));

      const elements = this.pageElements.get(pageNum);
      if (!elements?.textLayer) continue;

      const pageRect = elements.container.getBoundingClientRect();
      const textNodes = this._getTextLayerTextNodes(elements.textLayer);
      if (textNodes.length === 0) continue;

      let fullText = '';
      const nodeMap = [];

      for (const node of textNodes) {
        const text = node.textContent || '';
        if (!text) continue;

        nodeMap.push({
          node,
          startOffset: fullText.length,
          endOffset: fullText.length + text.length
        });
        fullText += text;
      }

      const fullTextLower = fullText.toLowerCase();
      let startIndex = 0;

      while (true) {
        const index = fullTextLower.indexOf(needleLower, startIndex);
        if (index === -1) break;

        const rects = this._getTextRangeRectsFromNodes(
          nodeMap,
          index,
          index + needle.length,
          pageRect
        );
        const mergedRects = this.mergeRects(rects);

        matches.push({
          pageNum,
          textIndex: index,
          text: fullText.substring(index, index + needle.length),
          rects: mergedRects
        });

        startIndex = index + 1;
      }
    }

    return matches;
  }

  /**
   * Get searchable text nodes from PDF.js presentation spans only.
   * Skips UI overlays inserted into the text layer (search highlights, etc.).
   */
  _getTextLayerTextNodes(textLayer) {
    const nodes = [];
    const walker = document.createTreeWalker(
      textLayer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parentSpan = node.parentElement?.closest('span[role="presentation"]');
          if (!parentSpan || !textLayer.contains(parentSpan)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (node.parentElement?.closest('.pdf-search-highlight')) {
            return NodeFilter.FILTER_REJECT;
          }
          return node.textContent ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      nodes.push(node);
    }

    return nodes;
  }

  _getTextRangeRectsFromNodes(nodeMap, rangeStart, rangeEnd, pageRect) {
    const rects = [];

    for (const nodeInfo of nodeMap) {
      if (nodeInfo.endOffset <= rangeStart) continue;
      if (nodeInfo.startOffset >= rangeEnd) break;

      const start = Math.max(0, rangeStart - nodeInfo.startOffset);
      const end = Math.min(nodeInfo.node.textContent.length, rangeEnd - nodeInfo.startOffset);
      if (end <= start) continue;

      const subRange = document.createRange();
      subRange.setStart(nodeInfo.node, start);
      subRange.setEnd(nodeInfo.node, end);

      const domRects = subRange.getClientRects();
      if (domRects.length > 0) {
        for (let i = 0; i < domRects.length; i++) {
          const rect = domRects[i];
          if (rect.width < 1 || rect.height < 1) continue;
          rects.push(this._domRectToPageRect(rect, pageRect));
        }
      } else {
        const parentSpan = nodeInfo.node.parentElement?.closest('span[role="presentation"]');
        if (parentSpan) {
          const spanRect = parentSpan.getBoundingClientRect();
          if (spanRect.width >= 1 && spanRect.height >= 1) {
            rects.push(this._domRectToPageRect(spanRect, pageRect));
          }
        }
      }

      subRange.detach?.();
    }

    return rects;
  }

  _domRectToPageRect(rect, pageRect) {
    return {
      left: (rect.left - pageRect.left) / this._viewportScale(),
      top: (rect.top - pageRect.top) / this._viewportScale(),
      width: rect.width / this._viewportScale(),
      height: rect.height / this._viewportScale()
    };
  }

  /**
   * Extract references from the PDF document
   * Called automatically after load, runs in background
   */
  async extractReferences() {
    if (!this.pdf || this.referencesExtracted) return;

    try {
      const result = await extractReferencesFromPages(this.pdf);
      this.references = result.references;
      this.pageContentBands = result.pageContentBands || new Map();
      this.refPages = result.refPages || new Set();
      this.refFormat = result.refFormat || 'bracket';
      this.referencesExtracted = true;
      console.log(`Extracted ${this.references.size} references from PDF`);

      // Re-mark citations on already rendered pages now that we have references
      this.renderedPages.forEach(pageNumber => {
        this.markCitationsOnPage(pageNumber);
      });

    } catch (error) {
      console.warn('Failed to extract references:', error);
    }
  }

  /**
   * Get references map for external access
   * @returns {Map<number, Reference>}
   */
  getReferences() {
    return this.references;
  }

  /**
   * Mark citation patterns in the text layer as interactive links
   * @param {number} pageNumber - The page to process
   */
  markCitationsOnPage(pageNumber) {
    const elements = this.pageElements.get(pageNumber);
    if (!elements || !elements.textLayer) return;

    const textLayer = elements.textLayer;

    // Remove previously marked citations on this page
    textLayer.querySelectorAll('.citation-link').forEach(span => {
      // Unwrap the citation link
      const parent = span.parentNode;
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    });

    // Clear tracking for this page
    this.citationSpans.set(pageNumber, []);

    // Get all text spans with role="presentation" (PDF.js text layer spans)
    const textSpans = Array.from(textLayer.querySelectorAll('span[role="presentation"]'));
    if (textSpans.length === 0) return;

    // Build a map of span index to span element and concatenated text
    const spanMap = [];
    let fullText = '';

    textSpans.forEach((span, index) => {
      const text = span.textContent || '';
      spanMap.push({
        span,
        text,
        startOffset: fullText.length,
        endOffset: fullText.length + text.length
      });
      fullText += text;
    });

    // Find all [N] bracket citations in the concatenated text
    const citations = findCitationsInText(fullText);

    // For each citation, find which spans it touches and wrap them
    for (const citation of citations) {
      const citationStart = citation.index;
      const citationEnd = citation.index + citation.match.length;

      // Find all spans that overlap with this citation
      const affectedSpans = [];
      for (const spanInfo of spanMap) {
        if (spanInfo.endOffset <= citationStart) continue; // Span is before citation
        if (spanInfo.startOffset >= citationEnd) break;     // Span is after citation

        // This span overlaps with the citation
        affectedSpans.push({
          ...spanInfo,
          citationStartInSpan: Math.max(0, citationStart - spanInfo.startOffset),
          citationEndInSpan: Math.min(spanInfo.text.length, citationEnd - spanInfo.startOffset)
        });
      }

      // Create citation link wrapper
      if (affectedSpans.length === 1) {
        // Simple case: citation is within a single span
        const { span, citationStartInSpan, citationEndInSpan } = affectedSpans[0];
        this._wrapCitationInSingleSpan(span, citationStartInSpan, citationEndInSpan, citation.match, citation.numbers, pageNumber);
      } else if (affectedSpans.length > 1) {
        // Complex case: citation spans multiple spans
        this._wrapCitationAcrossSpans(affectedSpans, citation.match, citation.numbers, pageNumber);
      }
    }

    // On reference pages with dot format (N.), wrap reference numbers as citation links
    if (this.refFormat === 'dot' && this.refPages.has(pageNumber)) {
      this._markDotReferencesOnPage(textSpans, pageNumber);
    }

    // Setup hover listeners for this page's citations
    this.setupCitationHoverListeners(pageNumber);
  }

  /**
   * Mark dot-format reference numbers (e.g., "1.", "2.") as citation links
   * on reference section pages. These spans contain just the number+dot.
   */
  _markDotReferencesOnPage(textSpans, pageNumber) {
    const pageCitations = this.citationSpans.get(pageNumber) || [];
    const dotPattern = /^\s*(\d+)\.\s*$/;

    for (const span of textSpans) {
      // Skip spans already wrapped
      if (span.querySelector('.citation-link')) continue;

      const text = span.textContent;
      const match = text.match(dotPattern);
      if (!match) continue;

      const refNum = parseInt(match[1], 10);
      // Only wrap if this reference number exists in our extracted references
      if (!this.references.has(refNum)) continue;

      const citationSpan = document.createElement('span');
      citationSpan.className = 'citation-link';
      citationSpan.textContent = text;
      citationSpan.dataset.numbers = JSON.stringify([refNum]);

      pageCitations.push({ span: citationSpan, numbers: [refNum] });

      span.textContent = '';
      span.appendChild(citationSpan);
    }

    this.citationSpans.set(pageNumber, pageCitations);
  }

  /**
   * Wrap a citation that is entirely within a single span
   */
  _wrapCitationInSingleSpan(span, startIdx, endIdx, citationText, citationNumbers, pageNumber) {
    const text = span.textContent;
    const fragment = document.createDocumentFragment();

    // Text before citation
    if (startIdx > 0) {
      fragment.appendChild(document.createTextNode(text.substring(0, startIdx)));
    }

    // Citation link
    const citationSpan = document.createElement('span');
    citationSpan.className = 'citation-link';
    citationSpan.textContent = citationText;
    citationSpan.dataset.numbers = JSON.stringify(citationNumbers);

    const pageCitations = this.citationSpans.get(pageNumber) || [];
    pageCitations.push({ span: citationSpan, numbers: citationNumbers });
    this.citationSpans.set(pageNumber, pageCitations);

    fragment.appendChild(citationSpan);

    // Text after citation
    if (endIdx < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(endIdx)));
    }

    // Replace span content
    span.textContent = '';
    span.appendChild(fragment);
  }

  /**
   * Wrap a citation that spans across multiple spans
   * Each affected span gets its own citation wrapper with the same data
   */
  _wrapCitationAcrossSpans(affectedSpans, citationText, citationNumbers, pageNumber) {
    const pageCitations = this.citationSpans.get(pageNumber) || [];

    // Process each affected span
    for (let i = 0; i < affectedSpans.length; i++) {
      const { span, text, citationStartInSpan, citationEndInSpan } = affectedSpans[i];
      const isFirst = i === 0;
      const isLast = i === affectedSpans.length - 1;

      const fragment = document.createDocumentFragment();

      // Add text before citation (only in first span)
      if (isFirst && citationStartInSpan > 0) {
        fragment.appendChild(document.createTextNode(text.substring(0, citationStartInSpan)));
      }

      // Create citation wrapper for this part
      const citationPart = document.createElement('span');
      citationPart.className = 'citation-link';
      citationPart.dataset.numbers = JSON.stringify(citationNumbers);
      citationPart.textContent = text.substring(citationStartInSpan, citationEndInSpan);

      // Add position class for seamless border rendering
      if (isFirst && isLast) {
        // Single span (shouldn't happen here, but just in case)
      } else if (isFirst) {
        citationPart.classList.add('citation-start');
      } else if (isLast) {
        citationPart.classList.add('citation-end');
      } else {
        citationPart.classList.add('citation-middle');
      }

      // Track only the first citation span (for event handling)
      if (isFirst) {
        pageCitations.push({ span: citationPart, numbers: citationNumbers });
      }

      fragment.appendChild(citationPart);

      // Add text after citation (only in last span)
      if (isLast && citationEndInSpan < text.length) {
        fragment.appendChild(document.createTextNode(text.substring(citationEndInSpan)));
      }

      // Replace span content
      span.textContent = '';
      span.appendChild(fragment);
    }

    this.citationSpans.set(pageNumber, pageCitations);
  }

  /**
   * Setup hover event listeners for citations on a page
   * @param {number} pageNumber - The page number
   */
  setupCitationHoverListeners(pageNumber) {
    const elements = this.pageElements.get(pageNumber);
    if (!elements || !elements.textLayer) return;

    const textLayer = elements.textLayer;

    // Use event delegation on the text layer
    textLayer.addEventListener('mouseover', (e) => {
      const citationLink = e.target.closest('.citation-link');
      if (!citationLink) return;

      const numbers = JSON.parse(citationLink.dataset.numbers || '[]');
      if (numbers.length === 0) return;

      // Get references for these numbers
      const refs = numbers.map(num => ({
        number: num,
        reference: this.references.get(num) || null
      }));

      const rect = citationLink.getBoundingClientRect();

      this.onCitationHover({
        numbers,
        references: refs,
        mouseX: rect.left + rect.width / 2,
        mouseY: rect.bottom,
        element: citationLink
      });
    });

    textLayer.addEventListener('mouseout', (e) => {
      const citationLink = e.target.closest('.citation-link');
      if (!citationLink) return;

      // Check if we're moving to the popup (don't hide if so)
      const relatedTarget = e.relatedTarget;
      if (relatedTarget && relatedTarget.closest('.citation-popup')) return;

      this.onCitationLeave();
    });
  }

  destroy() {
    this.destroyObserver();
    this.pdf = null;
    this.pages = [];
    this.pageElements.clear();
    this.renderedPages.clear();
    this.references.clear();
    this.citationSpans.clear();
    this.referencesExtracted = false;
    this.viewerElement.innerHTML = '';
  }
}

export default PDFViewer;
