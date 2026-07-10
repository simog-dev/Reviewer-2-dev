import '../components/annotation-card.js';
import '../components/category-filter.js';
import { PDFViewer } from './pdf-viewer.js';
import { AnnotationManager } from './annotation-manager.js';
import { ResizablePanels } from './resizable-panels.js';
import { getCategoryIcon, escapeHtml, debounce, formatRelativeTime } from './utils.js';
import { createLLMProvider } from './llm-provider.js';
import { resetDraggableModal, setupDraggableModals } from './draggable-modals.js';
import ThemeManager from './theme-manager.js';

// State
let pdfId = null;
let pdfData = null;
let pdfViewer = null;
let annotationManager = null;
let resizablePanels = null;
let categories = [];
let activeCategories = [];
let highlightMode = false;
let pendingSelection = null;
let editingAnnotationId = null;
let popupJustShown = false;
let highlights = [];
let clickedHighlight = null;
let citationPopupTimeout = null;
let currentCitationRefs = [];
let citationPopupLocked = false; // Prevents popup from closing while hovering
let reviewLastSavedContent = '';
let reviewLastSavedAt = null;
let reviewStatusTimer = null;
let reviewSaveToken = 0;
let reviewHistory = [];
let reviewRedoStack = [];
let isApplyingReviewHistory = false;

const REVIEW_HISTORY_LIMIT = 6;

// DOM Elements
const pdfTitle = document.getElementById('pdf-title');
const pdfLoading = document.getElementById('pdf-loading');
const pdfViewerContainer = document.getElementById('pdf-viewer-container');
const currentPageEl = document.getElementById('current-page');
const totalPagesEl = document.getElementById('total-pages');
const zoomSelect = document.getElementById('zoom-select');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnHighlight = document.getElementById('btn-highlight');
const btnThumbnails = document.getElementById('btn-thumbnails');
const pdfWorkspace = document.getElementById('pdf-workspace');
const pdfThumbnailList = document.getElementById('pdf-thumbnail-list');
const btnBack = document.getElementById('btn-back');
const btnThemeToggle = document.getElementById('btn-theme-toggle');
const sortSelect = document.getElementById('sort-select');
const btnImport = document.getElementById('btn-import');
const btnExport = document.getElementById('btn-export');
const exportMenu = document.getElementById('export-menu');

const annotationList = document.getElementById('annotation-list');
const annotationListEmpty = document.getElementById('annotation-list-empty');
const annotationCount = document.getElementById('annotation-count');
const categoryFilters = document.getElementById('category-filters');

const selectionPopup = document.getElementById('selection-popup');
const categoryButtons = document.getElementById('category-buttons');
const categorySelection = document.getElementById('category-selection');
const btnQuickHighlight = document.getElementById('btn-quick-highlight');
const btnAnnotate = document.getElementById('btn-annotate');
const highlightPopup = document.getElementById('highlight-popup');
const btnHighlightDelete = document.getElementById('btn-highlight-delete');
const btnHighlightConvert = document.getElementById('btn-highlight-convert');

const annotationModal = document.getElementById('annotation-modal');
const modalTitle = document.getElementById('modal-title');
const modalClose = document.getElementById('modal-close');
const modalCancel = document.getElementById('modal-cancel');
const modalSave = document.getElementById('modal-save');
const selectedTextPreview = document.getElementById('selected-text-preview');
const categoryBadge = document.getElementById('category-badge');
const categorySelect = document.getElementById('category-select');
const commentInput = document.getElementById('comment-input');

const contextMenu = document.getElementById('context-menu');
const categoryMenu = document.getElementById('category-menu');
const toastContainer = document.getElementById('toast-container');
const btnGenerateReview = document.getElementById('btn-generate-review');
const llmConfigTooltip = document.getElementById('llm-config-tooltip');
const llmConfigSettingsLink = document.getElementById('llm-config-settings-link');

const completionModal = document.getElementById('completion-modal');
const completionModalClose = document.getElementById('completion-modal-close');
const completionModalCancel = document.getElementById('completion-modal-cancel');
const completionModalConfirm = document.getElementById('completion-modal-confirm');
const reviewDecisionSelect = document.getElementById('review-decision-select');
const btnMarkCompleted = document.getElementById('btn-mark-completed');
const completionBtnText = document.getElementById('completion-btn-text');

const deleteAnnotationModal = document.getElementById('delete-annotation-modal');
const deleteAnnotationModalClose = document.getElementById('delete-annotation-modal-close');
const deleteAnnotationModalCancel = document.getElementById('delete-annotation-modal-cancel');
const deleteAnnotationModalConfirm = document.getElementById('delete-annotation-modal-confirm');
let pendingDeleteAnnotationId = null;

const importCompatibilityModal = document.getElementById('import-compatibility-modal');
const importCompatibilityModalClose = document.getElementById('import-compatibility-modal-close');
const importCompatibilityMessage = document.getElementById('import-compatibility-message');
const importCompatibilityCancel = document.getElementById('import-compatibility-cancel');
const importCompatibilityConfirm = document.getElementById('import-compatibility-confirm');
let pendingImportData = null;

const pdfNotFoundModal = document.getElementById('pdf-not-found-modal');
const pdfNotFoundPath = document.getElementById('pdf-not-found-path');
const pdfNotFoundClose = document.getElementById('pdf-not-found-close');
const pdfNotFoundBack = document.getElementById('pdf-not-found-back');
const pdfNotFoundReload = document.getElementById('pdf-not-found-reload');

const searchWebview = document.getElementById('search-webview');
const btnWebviewBack = document.getElementById('btn-webview-back');
const btnWebviewForward = document.getElementById('btn-webview-forward');
const btnWebviewReload = document.getElementById('btn-webview-reload');
const webviewUrlBar = document.getElementById('webview-url-bar');

const citationPopup = document.getElementById('citation-popup');
const citationReferenceList = document.getElementById('citation-reference-list');

const pdfSearchBar = document.getElementById('pdf-search-bar');
const pdfSearchInput = document.getElementById('pdf-search-input');
const pdfSearchCount = document.getElementById('pdf-search-count');
const pdfSearchPrev = document.getElementById('pdf-search-prev');
const pdfSearchNext = document.getElementById('pdf-search-next');
const pdfSearchClose = document.getElementById('pdf-search-close');
const reviewEditor = document.getElementById('review-editor');
const reviewSaveStatus = document.getElementById('review-save-status');
const reviewUndoBtn = document.getElementById('review-undo-btn');
const reviewRedoBtn = document.getElementById('review-redo-btn');
const reviewExportBtn = document.getElementById('btn-review-export');
const reviewExportMenu = document.getElementById('review-export-menu');
const reviewEditorToolbar = document.getElementById('review-editor-toolbar');

const scheduleReviewSave = debounce(() => {
  saveReviewContent();
}, 900);

const scheduleReviewSnapshot = debounce(() => {
  recordReviewSnapshot();
}, 350);

// Initialize
async function init() {
  // Initialize theme
  await ThemeManager.init();
  setupThemeToggle();
  setupDraggableModals([
    annotationModal,
    completionModal,
    pdfNotFoundModal,
    importCompatibilityModal,
    deleteAnnotationModal
  ]);

  // Get PDF ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  pdfId = urlParams.get('id');

  if (!pdfId) {
    showToast('No PDF specified', 'error');
    await window.api.navigateToHome();
    return;
  }

  // Initialize managers
  annotationManager = new AnnotationManager({
    pdfId,
    onAnnotationCreated: handleAnnotationCreated,
    onAnnotationUpdated: handleAnnotationUpdated,
    onAnnotationDeleted: handleAnnotationDeleted,
    onAnnotationsFiltered: renderAnnotationList
  });

  // Initialize resizable panels
  resizablePanels = new ResizablePanels({
    pdfPanel: document.getElementById('pdf-panel'),
    annotationPanel: document.getElementById('annotation-panel'),
    searchPanel: document.getElementById('search-panel'),
    reviewPanel: document.getElementById('review-panel'),
    resizer1: document.getElementById('panel-resizer-1'),
    resizer2: document.getElementById('panel-resizer-2'),
    resizer3: document.getElementById('panel-resizer-3'),
    container: document.querySelector('.main-content'),
    onResize: () => {
      // Re-render search highlights after panel resize
      if (searchMatches.length > 0) {
        setTimeout(() => renderSearchHighlights(), 100);
      }
    }
  });

  // Load data
  await loadCategories();
  const pdfLoaded = await loadPDF();

  // Stop if PDF failed to load
  if (!pdfLoaded) {
    return;
  }

  await loadAnnotations();
  await loadHighlights();
  initializeReviewEditor();
  await checkLLMReady();

  setupEventListeners();
  setupKeyboardShortcuts();
}

// Load categories
async function loadCategories() {
  categories = await annotationManager.loadCategories();
  activeCategories = await window.api.getActiveCategories();
  renderCategoryFilters();
  renderCategoryButtons();
  renderCategorySelect();
  renderCategoryMenu();
}

// Load PDF
async function loadPDF() {
  try {
    pdfData = await window.api.getPDF(pdfId);
    if (!pdfData) {
      showToast('PDF not found', 'error');
      await window.api.navigateToHome();
      return false;
    }

    pdfTitle.textContent = pdfData.name;
    pdfTitle.title = pdfData.path;
    annotationManager.setPDFMetadata(pdfData);

    // Update last opened
    await window.api.updatePDF(pdfId, { lastOpenedAt: new Date().toISOString() });

    // Load PDF file
    const fileData = await window.api.readPDFFile(pdfData.path);

    // Initialize PDF viewer
    pdfViewer = new PDFViewer(pdfViewerContainer, {
      onPageChange: (page) => {
        currentPageEl.textContent = page;
        pdfViewer?.setActiveThumbnail(page);
      },
      onTextSelected: handleTextSelected,
      onHighlightClick: handleHighlightClick,
      onSimpleHighlightClick: handleSimpleHighlightClick,
      onCitationHover: handleCitationHover,
      onCitationLeave: handleCitationLeave
    });

    const totalPages = await pdfViewer.load(fileData);
    totalPagesEl.textContent = totalPages;
    pdfViewer.setThumbnailContainer(pdfThumbnailList);
    await restoreThumbnailSidebarPreference();

    // Update completion button state
    updateCompletionButton();

    // Hide loading
    pdfLoading.classList.add('hidden');
    return true;
  } catch (error) {
    console.error('Error loading PDF:', error);

    // Check if this is a FILE_NOT_FOUND error
    if (error.message && error.message.startsWith('FILE_NOT_FOUND:')) {
      const filePath = error.message.replace('FILE_NOT_FOUND:', '');
      showPDFNotFoundModal(filePath);
    } else {
      showToast('Failed to load PDF', 'error');
    }
    return false;
  }
}

async function restoreThumbnailSidebarPreference() {
  const savedValue = await window.api.getSetting('thumbnailSidebarVisible');
  setThumbnailSidebarVisible(savedValue === true);
}

function setThumbnailSidebarVisible(visible) {
  pdfWorkspace.classList.toggle('show-thumbnails', visible);
  btnThumbnails.classList.toggle('active', visible);
  btnThumbnails.setAttribute('aria-pressed', String(visible));

  if (visible) {
    pdfViewer?.setActiveThumbnail(pdfViewer.currentPage);
    requestAnimationFrame(() => pdfViewer?.renderVisibleThumbnails());
  }
}

function toggleThumbnailSidebar() {
  const visible = !pdfWorkspace.classList.contains('show-thumbnails');
  setThumbnailSidebarVisible(visible);
  window.api.setSetting('thumbnailSidebarVisible', visible).catch(() => {});
}

// Load annotations
async function loadAnnotations() {
  const annotations = await annotationManager.loadAnnotations();
  pdfViewer.setAnnotations(annotationManager.annotations);
  renderCategoryFilters();
  renderAnnotationList(annotations);
  updateAnnotationCount();
  updateCategoryFilterCounts();
}

// Load highlights
async function loadHighlights() {
  highlights = await window.api.getHighlightsForPDF(pdfId);
  pdfViewer.setHighlights(highlights);
}

// Build the list of categories to show in filters:
// union of active categories + categories referenced by annotations in this document
function getFilterCategories() {
  const byId = new Map();

  // Add active categories first
  activeCategories.forEach(cat => byId.set(cat.id, cat));

  // Add categories from existing annotations (may include inactive ones)
  annotationManager.annotations.forEach(a => {
    if (!byId.has(a.category_id)) {
      byId.set(a.category_id, {
        id: a.category_id,
        name: a.category_name,
        color: a.category_color,
        icon: a.category_icon,
        sort_order: Infinity
      });
    }
  });

  // Sort: categories with known sort_order first, then annotation-only ones at the end
  return Array.from(byId.values()).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

// Render functions
function renderCategoryFilters() {
  const filterCats = getFilterCategories();
  const hasActiveFilters = annotationManager.activeFilters.size > 0;
  categoryFilters.innerHTML = `
    <category-filter
      category-id="0"
      name="All"
      color="#3b82f6"
      icon="info"
      count="0"
      ${!hasActiveFilters ? 'active' : ''}
    ></category-filter>
    ${filterCats.map(cat => `
      <category-filter
        category-id="${cat.id}"
        name="${cat.name}"
        color="${cat.color}"
        icon="${cat.icon}"
        count="0"
        ${annotationManager.activeFilters.has(cat.id) ? 'active' : ''}
      ></category-filter>
    `).join('')}
  `;
}

function renderCategoryButtons() {
  categoryButtons.innerHTML = activeCategories.map(cat => `
    <button class="category-btn ${cat.name.toLowerCase()}"
            data-category-id="${cat.id}"
            data-tooltip="${cat.name}"
            style="background-color: ${cat.color}">
      ${getCategoryIcon(cat.icon)}
    </button>
  `).join('');
}

function renderCategorySelect() {
  categorySelect.innerHTML = activeCategories.map(cat => `
    <option value="${cat.id}">${cat.name}</option>
  `).join('');
}

function renderCategoryMenu() {
  categoryMenu.innerHTML = activeCategories.map(cat => `
    <div class="context-menu-item" data-category-id="${cat.id}" style="color: ${cat.color}">
      ${getCategoryIcon(cat.icon)}
      ${cat.name}
    </div>
  `).join('');
}

function renderAnnotationList(annotations) {
  if (annotations.length === 0) {
    annotationListEmpty.classList.remove('hidden');
    annotationList.querySelectorAll('annotation-card').forEach(el => el.remove());
    return;
  }

  annotationListEmpty.classList.add('hidden');

  // Clear existing cards
  annotationList.querySelectorAll('annotation-card').forEach(el => el.remove());

  // Render cards
  annotations.forEach(annotation => {
    const card = document.createElement('annotation-card');
    card.setAttribute('annotation-id', annotation.id);
    card.setAttribute('category-name', annotation.category_name);
    card.setAttribute('category-color', annotation.category_color);
    card.setAttribute('category-icon', annotation.category_icon);
    card.setAttribute('page-number', annotation.page_number);
    card.setAttribute('selected-text', annotation.selected_text || '');
    card.setAttribute('comment', annotation.comment || '');
    card.setAttribute('created-at', annotation.created_at);
    card.setAttribute('highlight-rects', JSON.stringify(annotation.highlight_rects || []));

    annotationList.appendChild(card);
  });
}

function updateAnnotationCount() {
  annotationCount.textContent = annotationManager.annotations.length;
}

function updateCategoryFilterCounts() {
  const counts = annotationManager.getCategoryCounts();
  const total = annotationManager.annotations.length;

  // Update "All" filter
  const allFilter = categoryFilters.querySelector('[category-id="0"]');
  if (allFilter) {
    allFilter.setAttribute('count', total);
  }

  // Update category filters for all visible filter chips
  const filterCats = getFilterCategories();
  filterCats.forEach(cat => {
    const filter = categoryFilters.querySelector(`[category-id="${cat.id}"]`);
    if (filter) {
      filter.setAttribute('count', counts[cat.id] || 0);
    }
  });
}

// Event handlers
function handleTextSelected({ pageNumber, selectedText, rects, mouseX, mouseY }) {
  console.log('handleTextSelected called:', { pageNumber, selectedText, rects: rects?.length });

  // HIGHLIGHT MODE: Uncomment the lines below to require highlight mode to be enabled
  // if (!highlightMode) {
  //   console.log('Highlight mode not enabled, ignoring');
  //   return;
  // }

  pendingSelection = { pageNumber, selectedText, rects };
  console.log('pendingSelection set:', pendingSelection);

  // Position and show popup
  selectionPopup.style.left = `${mouseX}px`;
  selectionPopup.style.top = `${mouseY + 10}px`;
  selectionPopup.classList.add('active');
  popupJustShown = true;
  requestAnimationFrame(() => { popupJustShown = false; });
}

function handleHighlightClick(annotation, event, isContextMenu = false) {
  if (isContextMenu) {
    showContextMenu(annotation, event.clientX, event.clientY);
  } else {
    // Open annotation panel if collapsed
    resizablePanels.ensureAnnotationPanelOpen();
    scrollToAnnotationCard(annotation.id);
  }
}

// Handle click on a simple highlight (not annotation)
function handleSimpleHighlightClick(highlight, event) {
  clickedHighlight = highlight;
  showHighlightPopup(event.clientX, event.clientY);
}

// Show highlight popup for existing highlights
function showHighlightPopup(x, y) {
  highlightPopup.style.left = `${x}px`;
  highlightPopup.style.top = `${y + 10}px`;
  highlightPopup.classList.add('active');
}

// Hide highlight popup
function hideHighlightPopup() {
  highlightPopup.classList.remove('active');
  clickedHighlight = null;
}

// Citation popup handlers
function handleCitationHover({ numbers, references, mouseX, mouseY, element }) {
  // Clear any pending hide timeout
  if (citationPopupTimeout) {
    clearTimeout(citationPopupTimeout);
    citationPopupTimeout = null;
  }

  // If popup is locked (user is hovering over it), don't update
  if (citationPopupLocked && citationPopup.classList.contains('active')) {
    return;
  }

  // Store current references for button actions
  currentCitationRefs = references;

  // Build reference list HTML with individual copy buttons
  let html = '';
  for (const { number, reference } of references) {
    if (reference) {
      const hasLink = reference.doi || reference.url;
      const searchTitle = hasLink ? 'Open link' : 'Search on Google';
      html += `
        <div class="citation-reference-item">
          <div class="citation-reference-header">
            <span class="citation-reference-number">[${number}]</span>
            <div class="citation-reference-actions">
              <button class="citation-action-btn" data-action="copy" data-number="${number}" title="Copy">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
              <button class="citation-action-btn citation-search-btn" data-action="search" data-number="${number}" title="${searchTitle}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <span>Search</span>
              </button>
            </div>
          </div>
          <span class="citation-reference-text">${escapeHtml(reference.text)}</span>
        </div>
      `;
    } else {
      html += `
        <div class="citation-reference-item">
          <div class="citation-reference-header">
            <span class="citation-reference-number">[${number}]</span>
            <div class="citation-reference-actions">
              <button class="citation-action-btn" disabled title="No reference to copy">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
              <button class="citation-action-btn" disabled title="No reference found">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <span>Search</span>
              </button>
            </div>
          </div>
          <span class="citation-reference-not-found">Reference not found in document</span>
        </div>
      `;
    }
  }
  citationReferenceList.innerHTML = html;

  // Position popup directly below the citation element for easier mouse movement
  const elementRect = element.getBoundingClientRect();
  citationPopup.style.left = `${elementRect.left}px`;
  citationPopup.style.top = `${elementRect.bottom + 2}px`;

  // Show popup
  citationPopup.classList.add('active');

  // Adjust position if going off-screen
  requestAnimationFrame(() => {
    const rect = citationPopup.getBoundingClientRect();
    if (rect.right > window.innerWidth - 10) {
      citationPopup.style.left = `${window.innerWidth - rect.width - 10}px`;
    }
    if (rect.bottom > window.innerHeight - 10) {
      citationPopup.style.top = `${elementRect.top - rect.height - 2}px`;
    }
  });
}

function handleCitationLeave() {
  // Don't hide if popup is locked (user hovering over popup)
  if (citationPopupLocked) return;

  // Delay hiding to allow mouse to move to popup
  if (citationPopupTimeout) {
    clearTimeout(citationPopupTimeout);
  }
  citationPopupTimeout = setTimeout(() => {
    if (!citationPopupLocked) {
      hideCitationPopup();
    }
  }, 300);
}

function hideCitationPopup() {
  if (citationPopupTimeout) {
    clearTimeout(citationPopupTimeout);
    citationPopupTimeout = null;
  }
  citationPopup.classList.remove('active');
  currentCitationRefs = [];
  citationPopupLocked = false;
}

function copySingleReference(number) {
  const ref = currentCitationRefs.find(r => r.number === number);
  if (!ref || !ref.reference) return;

  const text = `[${number}] ${ref.reference.text}`;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Reference copied to clipboard', 'success');
  }).catch(err => {
    console.error('Failed to copy:', err);
    showToast('Failed to copy reference', 'error');
  });
}

function searchSingleReference(number) {
  const ref = currentCitationRefs.find(r => r.number === number);
  if (!ref || !ref.reference) return;

  let url = null;

  // First priority: DOI link
  if (ref.reference.doi) {
    url = `https://doi.org/${ref.reference.doi}`;
  }
  // Second priority: Direct URL
  else if (ref.reference.url) {
    url = ref.reference.url;
  }
  // Fallback: Google search with reference text
  else if (ref.reference.text) {
    // Use the reference text for Google search
    const searchQuery = encodeURIComponent(ref.reference.text);
    url = `https://www.google.com/search?q=${searchQuery}`;
  }

  if (url) {
    searchWebview.src = url;
    webviewUrlBar.value = url;
    hideCitationPopup();

    // Expand search panel with animation
    resizablePanels.expandSearchPanel(450, 300);
  }
}

// Quick highlight without annotation
async function createQuickHighlight() {
  if (!pendingSelection) return;

  try {
    const highlight = await window.api.addHighlight({
      pdfId: pdfId,
      pageNumber: pendingSelection.pageNumber,
      selectedText: pendingSelection.selectedText,
      highlightRects: pendingSelection.rects,
      color: '#fbbf24'
    });

    highlights.push(highlight);
    pdfViewer.setHighlights(highlights);
    hideSelectionPopup();
    showToast('Text highlighted', 'success');
  } catch (error) {
    console.error('Error creating highlight:', error);
    showToast('Failed to create highlight', 'error');
  }
}

// Delete a simple highlight
async function deleteHighlight(highlightId) {
  try {
    await window.api.deleteHighlight(highlightId);
    highlights = highlights.filter(h => h.id !== highlightId);
    pdfViewer.setHighlights(highlights);
    hideHighlightPopup();
    showToast('Highlight removed', 'success');
  } catch (error) {
    console.error('Error deleting highlight:', error);
    showToast('Failed to remove highlight', 'error');
  }
}

// Convert highlight to annotation
function convertHighlightToAnnotation(highlight, popupX, popupY) {
  // Set up pending selection with highlight data
  pendingSelection = {
    pageNumber: highlight.page_number,
    selectedText: highlight.selected_text,
    rects: highlight.highlight_rects
  };

  // Store highlight id to delete after annotation is created
  pendingSelection.convertFromHighlightId = highlight.id;

  // Show category selection at the same position as highlight popup
  showCategorySelectionForConversion(popupX, popupY);

  hideHighlightPopup();
}

// Show category selection for converting highlight
function showCategorySelectionForConversion(x, y) {
  selectionPopup.style.left = `${x}px`;
  selectionPopup.style.top = `${y}px`;
  selectionPopup.classList.add('active', 'show-categories');
  categorySelection.classList.remove('hidden');
  categorySelection.classList.add('visible');

  // Hide the highlight/annotate action buttons
  const popupActions = selectionPopup.querySelector('.popup-actions');
  if (popupActions) {
    popupActions.style.display = 'none';
  }

  // Prevent document click handler from immediately closing this popup
  popupJustShown = true;
  requestAnimationFrame(() => { popupJustShown = false; });
}

// Show annotate options (expand category selection)
function showAnnotateOptions() {
  selectionPopup.classList.add('show-categories');
  categorySelection.classList.remove('hidden');
  categorySelection.classList.add('visible');
}

function handleAnnotationCreated(annotation) {
  console.log('handleAnnotationCreated called with:', annotation);
  console.log('Total annotations:', annotationManager.annotations.length);
  pdfViewer.setAnnotations(annotationManager.annotations);
  renderCategoryFilters();
  renderAnnotationList(annotationManager.getFilteredAndSorted());
  updateAnnotationCount();
  updateCategoryFilterCounts();

  showToast('Annotation created', 'success');
}

function handleAnnotationUpdated(annotation) {
  pdfViewer.setAnnotations(annotationManager.annotations);
  renderCategoryFilters();
  renderAnnotationList(annotationManager.getFilteredAndSorted());
  updateCategoryFilterCounts();
  showToast('Annotation updated', 'success');
}

function handleAnnotationDeleted(annotationId) {
  pdfViewer.setAnnotations(annotationManager.annotations);
  renderCategoryFilters();
  renderAnnotationList(annotationManager.getFilteredAndSorted());
  updateAnnotationCount();
  updateCategoryFilterCounts();
  showToast('Annotation deleted', 'success');
}

// UI Actions
// HIGHLIGHT MODE: Uncomment to re-enable highlight mode toggle
// function toggleHighlightMode() {
//   highlightMode = !highlightMode;
//   btnHighlight.classList.toggle('active', highlightMode);
//   pdfViewer.setHighlightMode(highlightMode);
//
//   if (!highlightMode) {
//     hideSelectionPopup();
//   }
// }

function hideSelectionPopup() {
  const wasActive = selectionPopup.classList.contains('active');
  selectionPopup.classList.remove('active', 'show-categories');
  categorySelection.classList.remove('visible');
  categorySelection.classList.add('hidden');

  // Reset popup actions visibility
  const popupActions = selectionPopup.querySelector('.popup-actions');
  if (popupActions) {
    popupActions.style.display = '';
  }

  pendingSelection = null;
  // Only clear text selection if the popup was showing (highlight mode flow)
  if (wasActive) {
    pdfViewer.clearSelection();
  }
}

function showFreeNoteModal() {
  resetDraggableModal(annotationModal);
  modalTitle.textContent = 'Add Note';

  // Hide selected text group for free notes
  document.getElementById('selected-text-group').style.display = 'none';

  // Set first category
  const firstCategory = activeCategories[0];
  categoryBadge.textContent = firstCategory.name;
  categoryBadge.style.backgroundColor = firstCategory.color;
  categorySelect.value = firstCategory.id;

  commentInput.value = '';

  // Flag as free note - use current page
  pendingSelection = {
    isFreeNote: true,
    pageNumber: pdfViewer.currentPage,
    selectedText: null,
    rects: []
  };

  annotationModal.classList.add('active');
  commentInput.focus();
}

function showAnnotationModal(categoryId) {
  if (!pendingSelection) return;
  resetDraggableModal(annotationModal);

  const category = categories.find(c => c.id === categoryId);
  if (!category) return;

  // Hide selection popup visually (but keep pendingSelection)
  selectionPopup.classList.remove('active');

  modalTitle.textContent = editingAnnotationId ? 'Edit Annotation' : 'Add Annotation';

  // Show/hide sections based on note type
  if (pendingSelection.isFreeNote) {
    // Free notes: hide selected text group
    document.getElementById('selected-text-group').style.display = 'none';
  } else {
    // Regular annotations: show selected text
    document.getElementById('selected-text-group').style.display = 'block';
    selectedTextPreview.textContent = pendingSelection.selectedText;
  }

  categoryBadge.textContent = category.name;
  categoryBadge.style.backgroundColor = category.color;
  categorySelect.value = categoryId;
  commentInput.value = '';

  if (editingAnnotationId) {
    const annotation = annotationManager.getAnnotation(editingAnnotationId);
    if (annotation) {
      commentInput.value = annotation.comment || '';
    }
  }

  annotationModal.classList.add('active');
  commentInput.focus();
}

function hideAnnotationModal() {
  annotationModal.classList.remove('active');
  pendingSelection = null;
  editingAnnotationId = null;
  selectionPopup.classList.remove('active');
  // Clear text selection only if we were in highlight mode
  if (highlightMode) {
    pdfViewer.clearSelection();
  }
}

async function saveAnnotation() {
  console.log('saveAnnotation called');
  console.log('editingAnnotationId:', editingAnnotationId);
  console.log('pendingSelection:', pendingSelection);

  // Validate: free notes (no selected text) must have comment text
  if (pendingSelection && pendingSelection.isFreeNote && !commentInput.value.trim()) {
    showToast('Comment text is required for notes without highlighted text', 'error');
    commentInput.focus();
    return;
  }

  try {
    if (editingAnnotationId) {
      // Update existing
      console.log('Updating existing annotation:', editingAnnotationId);
      await annotationManager.updateAnnotation(editingAnnotationId, {
        categoryId: parseInt(categorySelect.value, 10),
        comment: commentInput.value.trim()
      });
    } else if (pendingSelection) {
      // Create new annotation
      console.log('Creating new annotation with:', {
        categoryId: parseInt(categorySelect.value, 10),
        pageNumber: pendingSelection.pageNumber,
        selectedText: pendingSelection.selectedText || null,
        comment: commentInput.value.trim(),
        highlightRects: pendingSelection.rects
      });
      const result = await annotationManager.createAnnotation({
        categoryId: parseInt(categorySelect.value, 10),
        pageNumber: pendingSelection.pageNumber,
        selectedText: pendingSelection.selectedText || null,
        comment: commentInput.value.trim(),
        highlightRects: pendingSelection.rects
      });
      console.log('Annotation created:', result);

      // If converting from highlight, delete the highlight
      if (pendingSelection.convertFromHighlightId) {
        await window.api.deleteHighlight(pendingSelection.convertFromHighlightId);
        highlights = highlights.filter(h => h.id !== pendingSelection.convertFromHighlightId);
        pdfViewer.setHighlights(highlights);
      }
    } else {
      console.log('No editingAnnotationId or pendingSelection - nothing to save');
    }
  } catch (error) {
    console.error('Error saving annotation:', error);
    showToast('Failed to save annotation: ' + error.message, 'error');
    return;
  }

  hideAnnotationModal();
}

function scrollToAnnotationCard(annotationId) {
  // Remove active from all cards
  annotationList.querySelectorAll('annotation-card').forEach(card => {
    card.setActive(false);
  });

  // Find and activate the target card
  const targetCard = annotationList.querySelector(`[annotation-id="${annotationId}"]`);
  if (targetCard) {
    targetCard.setActive(true);
    targetCard.flash();
    // Scroll the card into view
    targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function scrollToHighlight(annotationId) {
  pdfViewer.highlightAnnotation(annotationId);
}

function showContextMenu(annotation, x, y) {
  contextMenu.classList.remove('hidden');
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.dataset.annotationId = annotation.id;

  // Ensure menu is within viewport
  const rect = contextMenu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    contextMenu.style.left = `${x - rect.width}px`;
  }
  if (rect.bottom > window.innerHeight) {
    contextMenu.style.top = `${y - rect.height}px`;
  }
}

function hideContextMenu() {
  contextMenu.classList.add('hidden');
  categoryMenu.classList.add('hidden');
}

function showCategoryMenu(x, y) {
  categoryMenu.classList.remove('hidden');
  categoryMenu.style.left = `${x}px`;
  categoryMenu.style.top = `${y}px`;
}

async function handleContextMenuAction(action, annotationId) {
  hideContextMenu();

  const annotation = annotationManager.getAnnotation(annotationId);
  if (!annotation) return;

  switch (action) {
    case 'edit':
      editingAnnotationId = annotationId;
      pendingSelection = {
        selectedText: annotation.selected_text,
        rects: annotation.highlight_rects,
        pageNumber: annotation.page_number
      };
      showAnnotationModal(annotation.category_id);
      break;

    case 'change-category':
      const rect = contextMenu.getBoundingClientRect();
      showCategoryMenu(rect.right + 5, rect.top);
      categoryMenu.dataset.annotationId = annotationId;
      break;

    case 'delete':
      showDeleteAnnotationModal(annotationId);
      break;
  }
}

async function changeCategoryFromMenu(categoryId, annotationId) {
  hideContextMenu();
  await annotationManager.updateAnnotation(annotationId, { categoryId });
}

function initializeReviewEditor() {
  const initialContent = normalizeReviewHtml(pdfData?.review_content || '');
  reviewEditor.innerHTML = initialContent;
  reviewLastSavedContent = initialContent;
  reviewLastSavedAt = pdfData?.review_updated_at || null;
  reviewHistory = [initialContent];
  reviewRedoStack = [];
  updateReviewHistoryButtons();
  updateReviewSaveStatus('saved');

  if (reviewStatusTimer) {
    clearInterval(reviewStatusTimer);
  }

  reviewStatusTimer = setInterval(() => {
    if (!reviewSaveStatus.classList.contains('is-saving') && !reviewSaveStatus.classList.contains('is-dirty')) {
      updateReviewSaveStatus('saved');
    }
  }, 30000);
}

function normalizeReviewHtml(html) {
  const normalized = String(html || '').trim();
  return normalized === '<br>' ? '' : normalized;
}

function getReviewEditorHtml() {
  return normalizeReviewHtml(reviewEditor.innerHTML);
}

function getReviewEditorText() {
  return reviewEditor.innerText.replace(/\n{3,}/g, '\n\n').trim();
}

function formatReviewTextAsHtml(text) {
  return String(text || '')
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function formatAbsoluteDateTime(dateValue) {
  const date = typeof dateValue === 'string'
    ? new Date(dateValue.endsWith('Z') || dateValue.includes('+') ? dateValue : `${dateValue}Z`)
    : dateValue;

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function getReviewSavedLabel() {
  if (!reviewLastSavedAt) {
    return 'Not saved yet';
  }

  const savedAt = typeof reviewLastSavedAt === 'string'
    ? new Date(reviewLastSavedAt.endsWith('Z') || reviewLastSavedAt.includes('+') ? reviewLastSavedAt : `${reviewLastSavedAt}Z`)
    : reviewLastSavedAt;
  const diffMs = Date.now() - savedAt.getTime();

  if (diffMs < 10 * 60 * 1000) {
    return `Saved ${formatRelativeTime(savedAt)}`;
  }

  return `Saved at ${formatAbsoluteDateTime(savedAt)}`;
}

function updateReviewSaveStatus(state = 'saved') {
  reviewSaveStatus.classList.remove('is-saving', 'is-dirty');

  if (state === 'saving') {
    reviewSaveStatus.textContent = 'Saving...';
    reviewSaveStatus.classList.add('is-saving');
    return;
  }

  if (state === 'dirty') {
    reviewSaveStatus.textContent = 'Unsaved changes';
    reviewSaveStatus.classList.add('is-dirty');
    return;
  }

  reviewSaveStatus.textContent = getReviewSavedLabel();
}

function recordReviewSnapshot() {
  if (isApplyingReviewHistory) return;

  const html = getReviewEditorHtml();
  const lastSnapshot = reviewHistory[reviewHistory.length - 1];
  if (html === lastSnapshot) return;

  reviewHistory.push(html);
  if (reviewHistory.length > REVIEW_HISTORY_LIMIT) {
    reviewHistory = reviewHistory.slice(reviewHistory.length - REVIEW_HISTORY_LIMIT);
  }
  reviewRedoStack = [];
  updateReviewHistoryButtons();
}

function updateReviewHistoryButtons() {
  reviewUndoBtn.disabled = reviewHistory.length <= 1;
  reviewRedoBtn.disabled = reviewRedoStack.length === 0;
}

function applyReviewHistoryState(html) {
  isApplyingReviewHistory = true;
  reviewEditor.innerHTML = html;
  isApplyingReviewHistory = false;
  updateReviewFormattingState();
  updateReviewSaveStatus(getReviewEditorHtml() === reviewLastSavedContent ? 'saved' : 'dirty');
  scheduleReviewSave();
}

function undoReviewChange() {
  if (reviewHistory.length <= 1) return;
  const current = reviewHistory.pop();
  reviewRedoStack.push(current);
  applyReviewHistoryState(reviewHistory[reviewHistory.length - 1]);
  updateReviewHistoryButtons();
}

function redoReviewChange() {
  if (reviewRedoStack.length === 0) return;
  const next = reviewRedoStack.pop();
  reviewHistory.push(next);
  applyReviewHistoryState(next);
  updateReviewHistoryButtons();
}

async function saveReviewContent(force = false) {
  const html = getReviewEditorHtml();
  if (!force && html === reviewLastSavedContent) {
    updateReviewSaveStatus('saved');
    return;
  }

  updateReviewSaveStatus('saving');
  const currentToken = ++reviewSaveToken;

  try {
    const timestamp = new Date().toISOString();
    const updatedPdf = await window.api.updatePDF(pdfId, {
      reviewContent: html,
      reviewUpdatedAt: timestamp
    });

    if (currentToken !== reviewSaveToken) return;

    pdfData = updatedPdf;
    reviewLastSavedContent = normalizeReviewHtml(updatedPdf.review_content || html);
    reviewLastSavedAt = updatedPdf.review_updated_at || timestamp;
    updateReviewSaveStatus('saved');
  } catch (error) {
    console.error('Review autosave failed:', error);
    reviewSaveStatus.textContent = 'Save failed';
    reviewSaveStatus.classList.remove('is-saving');
    reviewSaveStatus.classList.add('is-dirty');
  }
}

function handleReviewEditorInput() {
  updateReviewSaveStatus(getReviewEditorHtml() === reviewLastSavedContent ? 'saved' : 'dirty');
  scheduleReviewSnapshot();
  scheduleReviewSave();
}

function toggleReviewExportMenu() {
  reviewExportMenu.classList.toggle('active');
}

function toggleExportMenu() {
  exportMenu.classList.toggle('active');
}

async function exportAnnotations(format) {
  exportMenu.classList.remove('active');

  try {
    let content;
    let defaultName;
    let filters;

    if (format === 'json') {
      content = await annotationManager.exportAsJSON();
      defaultName = `${pdfData.name.replace('.pdf', '')}_annotations.json`;
      filters = [{ name: 'JSON Files', extensions: ['json'] }];
    } else {
      content = await annotationManager.exportAsCSV();
      defaultName = `${pdfData.name.replace('.pdf', '')}_annotations.csv`;
      filters = [{ name: 'CSV Files', extensions: ['csv'] }];
    }

    const result = await window.api.saveFile({ defaultName, filters, content });

    if (result.success) {
      showToast(`Exported to ${result.filePath}`, 'success');
    } else if (!result.canceled) {
      showToast('Export failed', 'error');
    }
  } catch (error) {
    console.error('Export error:', error);
    showToast('Export failed', 'error');
  }
}

async function exportReview(format) {
  reviewExportMenu.classList.remove('active');

  const textContent = getReviewEditorText();
  const htmlContent = getReviewEditorHtml();

  if (!textContent && !htmlContent) {
    showToast('Review is empty', 'error');
    return;
  }

  const baseName = pdfData.name.replace(/\.pdf$/i, '');

  try {
    if (format === 'txt') {
      const result = await window.api.saveFile({
        defaultName: `${baseName}-review.txt`,
        filters: [{ name: 'Text Files', extensions: ['txt'] }],
        content: textContent
      });

      if (result.success) {
        showToast(`Exported to ${result.filePath}`, 'success');
      } else if (!result.canceled) {
        showToast('Export failed', 'error');
      }
      return;
    }

    const result = await window.api.exportReviewPDF({
      defaultName: `${baseName}-review.pdf`,
      title: `${baseName} Review`,
      html: htmlContent
    });

    if (result.success) {
      showToast(`Exported to ${result.filePath}`, 'success');
    } else if (!result.canceled) {
      showToast('Export failed', 'error');
    }
  } catch (error) {
    console.error('Review export error:', error);
    showToast('Export failed', 'error');
  }
}

function updateReviewFormattingState() {
  reviewEditorToolbar.querySelectorAll('.review-tool-btn[data-command]').forEach((button) => {
    const command = button.dataset.command;
    const toggleCommands = new Set(['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList']);
    if (!toggleCommands.has(command)) {
      button.classList.remove('active');
      return;
    }

    try {
      button.classList.toggle('active', document.queryCommandState(command));
    } catch {
      button.classList.remove('active');
    }
  });
}

async function importAnnotations() {
  try {
    const result = await window.api.openImportFile();
    if (!result || result.canceled) return;
    if (!result.success) {
      showToast('Import file could not be opened', 'error');
      return;
    }

    let importData;
    try {
      importData = JSON.parse(result.content);
    } catch {
      showToast('Import file is not valid JSON', 'error');
      return;
    }

    const compatibility = checkImportCompatibility(importData);
    if (compatibility.requiresConfirmation) {
      pendingImportData = importData;
      showImportCompatibilityModal(compatibility.message);
      return;
    }

    await performImport(importData);
  } catch (error) {
    console.error('Import error:', error);
    showToast('Import failed: ' + error.message, 'error');
  }
}

function checkImportCompatibility(importData) {
  const importedPdf = importData?.pdf;

  if (!importedPdf) {
    return {
      requiresConfirmation: true,
      message: 'This JSON file does not include PDF metadata, so Reviewer cannot verify that these annotations belong to the current PDF. You can still try the import, then confirm or undo it.'
    };
  }

  const importedPageCount = Number(importedPdf.pageCount ?? importedPdf.page_count);
  const currentPageCount = Number(pdfData.page_count || pdfViewer?.totalPages || 0);
  const importedName = String(importedPdf.name || '').trim();
  const currentName = String(pdfData.name || '').trim();
  const issues = [];

  if (importedPageCount && currentPageCount && importedPageCount !== currentPageCount) {
    issues.push(`page count differs (${importedPageCount} in the file, ${currentPageCount} in the current PDF)`);
  }

  if (importedName && currentName && importedName !== currentName) {
    issues.push(`PDF name differs ("${importedName}" vs "${currentName}")`);
  }

  const highestImportedPage = getHighestImportedPage(importData);
  if (highestImportedPage && currentPageCount && highestImportedPage > currentPageCount) {
    issues.push(`import contains page ${highestImportedPage}, but the current PDF has ${currentPageCount} pages`);
  }

  if (issues.length > 0) {
    return {
      requiresConfirmation: true,
      message: `This import may belong to a different PDF: ${issues.join('; ')}. You can still try the import, then confirm or undo it.`
    };
  }

  if (!importedPageCount && !importedName) {
    return {
      requiresConfirmation: true,
      message: 'The import metadata is incomplete, so Reviewer cannot verify that these annotations belong to the current PDF. You can still try the import, then confirm or undo it.'
    };
  }

  return { requiresConfirmation: false };
}

function getHighestImportedPage(importData) {
  const importedItems = [
    ...(Array.isArray(importData?.annotations) ? importData.annotations : []),
    ...(Array.isArray(importData?.highlights) ? importData.highlights : [])
  ];

  return importedItems.reduce((highest, item) => {
    const pageNumber = Number(item.pageNumber ?? item.page_number);
    return Number.isFinite(pageNumber) ? Math.max(highest, pageNumber) : highest;
  }, 0);
}

function showImportCompatibilityModal(message) {
  resetDraggableModal(importCompatibilityModal);
  importCompatibilityMessage.textContent = message;
  importCompatibilityModal.classList.add('active');
}

function hideImportCompatibilityModal() {
  importCompatibilityModal.classList.remove('active');
  importCompatibilityMessage.textContent = '';
  pendingImportData = null;
}

async function confirmCompatibilityImport() {
  const importData = pendingImportData;
  hideImportCompatibilityModal();
  if (importData) {
    await performImport(importData);
  }
}

async function performImport(importData) {
  const result = await annotationManager.importFromJSON(importData, { notify: false });
  await loadCategories();
  highlights = await window.api.getHighlightsForPDF(pdfId);
  pdfViewer.setHighlights(highlights);
  pdfViewer.setAnnotations(annotationManager.annotations);
  renderCategoryFilters();
  renderAnnotationList(annotationManager.getFilteredAndSorted());
  updateAnnotationCount();
  updateCategoryFilterCounts();

  const importedCount = result.annotations.length + result.highlights.length;
  showImportConfirmationToast(result, `${importedCount} item${importedCount === 1 ? '' : 's'} imported`);
}

function showImportConfirmationToast(importResult, message) {
  const toast = document.createElement('div');
  toast.className = 'toast toast-success';
  toast.innerHTML = `
    <span class="toast-message">${escapeHtml(message)}</span>
    <div class="toast-actions">
      <button class="toast-action" data-action="confirm">Confirm</button>
      <button class="toast-action" data-action="undo">Undo</button>
    </div>
  `;

  toastContainer.appendChild(toast);

  toast.addEventListener('click', async (e) => {
    const actionButton = e.target.closest('.toast-action');
    if (!actionButton) return;

    if (actionButton.dataset.action === 'undo') {
      await annotationManager.rollbackImport(importResult.annotations, importResult.highlights, importResult.categories);
      await loadCategories();
      highlights = await window.api.getHighlightsForPDF(pdfId);
      pdfViewer.setHighlights(highlights);
      pdfViewer.setAnnotations(annotationManager.annotations);
      renderCategoryFilters();
      renderAnnotationList(annotationManager.getFilteredAndSorted());
      updateAnnotationCount();
      updateCategoryFilterCounts();
      toast.remove();
      showToast('Import undone', 'success');
      return;
    }

    toast.remove();
    showToast('Import confirmed', 'success');
  });
}

// Check if LLM is configured (API key set)
async function checkLLMReady() {
  const apiKey = await window.api.getSetting('llm_api_key');
  btnGenerateReview.disabled = !apiKey;
}

// Generate review using LLM
async function generateReview() {
  const annotations = annotationManager.annotations;
  if (annotations.length === 0) {
    showToast('No annotations to review', 'error');
    return;
  }

  // Set loading state
  btnGenerateReview.disabled = true;
  btnGenerateReview.querySelector('.generate-review-icon').style.display = 'none';
  btnGenerateReview.querySelector('.generate-review-spinner').style.display = 'flex';
  btnGenerateReview.querySelector('.generate-review-label').textContent = 'Generating...';

  try {
    const apiKey = await window.api.getSetting('llm_api_key');
    const provider = await window.api.getSetting('llm_provider') || 'google';
    const model = await window.api.getSetting('llm_model') || '';
    const temperature = parseFloat(await window.api.getSetting('llm_temperature') || '0.7');
    const prompt = await window.api.getSetting('llm_prompt') || undefined;

    const llmProvider = createLLMProvider(provider, { apiKey, model, temperature, prompt });
    const reviewText = await llmProvider.generateReview(annotations, pdfData.name);
    const generatedHtml = formatReviewTextAsHtml(reviewText);
    reviewEditor.innerHTML = generatedHtml;
    resizablePanels.ensureReviewPanelOpen(460, 260);
    recordReviewSnapshot();
    updateReviewFormattingState();
    await saveReviewContent(true);
    reviewEditor.focus();
    showToast('Review generated', 'success');
  } catch (error) {
    console.error('Generate review error:', error);
    showToast('Review generation failed: ' + error.message, 'error');
  } finally {
    // Reset button state
    btnGenerateReview.querySelector('.generate-review-icon').style.display = '';
    btnGenerateReview.querySelector('.generate-review-spinner').style.display = 'none';
    btnGenerateReview.querySelector('.generate-review-label').textContent = 'Generate Review';
    await checkLLMReady();
  }
}

// Toast notification
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" aria-label="Close">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  `;

  toastContainer.appendChild(toast);

  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => toast.remove());

  setTimeout(() => {
    if (toast.parentElement) {
      toast.remove();
    }
  }, 4000);
}

// Completion Functions
function updateCompletionButton() {
  if (!pdfData) return;

  const isCompleted = pdfData.completed === 1;

  if (isCompleted) {
    completionBtnText.textContent = 'Mark as Incomplete';
    btnMarkCompleted.classList.add('completed');
    btnMarkCompleted.title = 'Mark as Incomplete';
  } else {
    completionBtnText.textContent = 'Mark as Completed';
    btnMarkCompleted.classList.remove('completed');
    btnMarkCompleted.title = 'Mark as Completed';
  }
}

function showCompletionModal() {
  resetDraggableModal(completionModal);
  reviewDecisionSelect.value = pdfData.review_decision || 'accept';
  completionModal.classList.add('active');
  reviewDecisionSelect.focus();
}

function hideCompletionModal() {
  completionModal.classList.remove('active');
  reviewDecisionSelect.value = 'accept';
}

async function handleMarkCompleted() {
  const isCompleted = pdfData.completed === 1;

  if (isCompleted) {
    // Mark as incomplete directly (no modal)
    try {
      const updatedPdf = await window.api.markPDFIncomplete(pdfId);
      pdfData = updatedPdf;
      updateCompletionButton();
      showToast('PDF marked as incomplete', 'success');
    } catch (error) {
      console.error('Error marking PDF as incomplete:', error);
      showToast('Failed to update completion status', 'error');
    }
  } else {
    // Show modal for optional comment
    showCompletionModal();
  }
}

async function confirmCompletion() {
  try {
    const reviewDecision = reviewDecisionSelect.value;
    const updatedPdf = await window.api.markPDFCompleted(pdfId, reviewDecision);
    pdfData = updatedPdf;
    updateCompletionButton();
    hideCompletionModal();
    showToast('PDF marked as completed', 'success');
  } catch (error) {
    console.error('Error marking PDF as completed:', error);
    showToast('Failed to update completion status', 'error');
  }
}

// PDF Not Found Modal Functions
function showPDFNotFoundModal(filePath) {
  resetDraggableModal(pdfNotFoundModal);
  pdfNotFoundPath.textContent = filePath;
  pdfNotFoundModal.classList.add('active');
  pdfLoading.classList.add('hidden');
}

function hidePDFNotFoundModal() {
  pdfNotFoundModal.classList.remove('active');
}

async function handlePDFNotFoundReload() {
  try {
    // Open file dialog to select new PDF
    const newPath = await window.api.openPDFDialog();
    if (!newPath) {
      return; // User canceled
    }

    // Update the PDF path in the database
    await window.api.updatePDF(pdfId, { path: newPath });

    // Hide modal and reload the page to load the new PDF
    hidePDFNotFoundModal();
    location.reload();
  } catch (error) {
    console.error('Error reloading PDF:', error);
    showToast('Failed to reload PDF', 'error');
  }
}

// PDF Search Functions
let searchMatches = [];
let currentSearchMatchIndex = -1;
let pdfSearchToken = 0;

function openPDFSearch() {
  pdfSearchBar.classList.add('active');
  pdfSearchInput.focus();
  pdfSearchInput.select();
}

function closePDFSearch() {
  pdfSearchToken++;
  pdfSearchBar.classList.remove('active');
  pdfSearchInput.value = '';
  searchMatches = [];
  currentSearchMatchIndex = -1;
  pdfSearchCount.textContent = '';
  clearSearchHighlights();
}

async function performPDFSearch(query) {
  const searchToken = ++pdfSearchToken;

  if (!query || !pdfViewer) {
    searchMatches = [];
    currentSearchMatchIndex = -1;
    pdfSearchCount.textContent = '';
    clearSearchHighlights();
    return;
  }

  // Clear previous search
  clearSearchHighlights();
  searchMatches = [];
  currentSearchMatchIndex = -1;
  pdfSearchCount.textContent = 'Searching...';
  pdfSearchPrev.disabled = true;
  pdfSearchNext.disabled = true;

  let usedIncrementalSearch = false;
  let lastProgressHighlightRender = 0;

  if (typeof pdfViewer.findText === 'function') {
    try {
      searchMatches = await pdfViewer.findText(query, {
        isCancelled: () => searchToken !== pdfSearchToken,
        onProgress: ({ matches, pageNum, totalPages }) => {
          if (searchToken !== pdfSearchToken) return;

          searchMatches = [...matches];
          if (searchMatches.length > 0 && currentSearchMatchIndex === -1) {
            currentSearchMatchIndex = 0;
          }

          if (searchMatches.length > 0) {
            pdfSearchCount.textContent = `${searchMatches.length} found...`;
            const now = Date.now();
            if (now - lastProgressHighlightRender > 150) {
              lastProgressHighlightRender = now;
              renderSearchHighlights();
            }
          } else {
            pdfSearchCount.textContent = `Searching ${pageNum}/${totalPages}`;
          }
        }
      });
      if (searchToken !== pdfSearchToken) return;
      usedIncrementalSearch = true;
    } catch (error) {
      if (searchToken !== pdfSearchToken) return;
      console.warn('Incremental PDF search failed, falling back to page scan:', error);
    }
  }

  if (!usedIncrementalSearch) {
    const queryLower = query.toLowerCase();

    // Search through all pages
    for (let pageNum = 1; pageNum <= pdfViewer.totalPages; pageNum++) {
      if (searchToken !== pdfSearchToken) return;

      const page = pdfViewer.pages[pageNum - 1];
      if (!page) continue;

      try {
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 }); // Use scale=1 for normalized coordinates

        // Build full page text and track character positions
        let fullText = '';
        const charPositions = [];

        textContent.items.forEach((item, itemIndex) => {
          fullText += item.str;

          // Store position info for each character in this item
          for (let i = 0; i < item.str.length; i++) {
            charPositions.push({
              itemIndex,
              item,
              charIndexInItem: i
            });
          }

          // Add space between items
          fullText += ' ';
          charPositions.push(null); // space character
        });

        const fullTextLower = fullText.toLowerCase();

        // Find all matches in this page
        let startIndex = 0;
        while (true) {
          const index = fullTextLower.indexOf(queryLower, startIndex);
          if (index === -1) break;

          // Get bounding boxes for this match (in normalized coordinates, scale=1)
          const rects = [];
          for (let i = index; i < index + query.length && i < charPositions.length; i++) {
            const charPos = charPositions[i];
            if (!charPos) continue; // skip spaces

            const item = charPos.item;
            const tx = item.transform;

            // Calculate character position (normalized, scale=1)
            const charWidth = item.width / item.str.length;
            const x = tx[4] + (charPos.charIndexInItem * charWidth);
            const y = tx[5];
            const width = charWidth;
            const height = item.height || Math.abs(tx[3]);

            // Store normalized coordinates (will be scaled during rendering)
            rects.push({
              left: x,
              top: viewport.height - y - height,
              width: width,
              height: height
            });
          }

          // Merge adjacent rects
          const mergedRects = mergeSearchRects(rects);

          searchMatches.push({
            pageNum,
            textIndex: index,
            text: fullText.substr(index, query.length),
            rects: mergedRects // Stored as normalized coordinates (scale=1)
          });

          startIndex = index + 1;
        }
      } catch (error) {
        console.warn(`Failed to search page ${pageNum}:`, error);
      }

      if (searchToken !== pdfSearchToken) return;
      pdfSearchCount.textContent = searchMatches.length > 0
        ? `${searchMatches.length} found...`
        : `Searching ${pageNum}/${pdfViewer.totalPages}`;
      await new Promise(resolve => {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => resolve());
        } else {
          setTimeout(resolve, 0);
        }
      });
    }
  }

  if (searchToken !== pdfSearchToken) return;

  // Update UI
  if (searchMatches.length > 0) {
    currentSearchMatchIndex = 0;
    updateSearchCount();
    highlightCurrentMatch();
  } else {
    pdfSearchCount.textContent = 'No results';
    pdfSearchPrev.disabled = true;
    pdfSearchNext.disabled = true;
  }
}

function mergeSearchRects(rects) {
  if (rects.length === 0) return [];

  const merged = [];
  let current = { ...rects[0] };

  for (let i = 1; i < rects.length; i++) {
    const rect = rects[i];

    // Check if rects are on same line and adjacent
    if (Math.abs(rect.top - current.top) < 2 &&
        rect.left <= current.left + current.width + 2) {
      // Merge horizontally
      current.width = Math.max(current.left + current.width, rect.left + rect.width) - current.left;
      current.height = Math.max(current.height, rect.height);
    } else {
      merged.push(current);
      current = { ...rect };
    }
  }
  merged.push(current);

  return merged;
}

function updateSearchCount() {
  if (searchMatches.length === 0) {
    pdfSearchCount.textContent = '';
    pdfSearchPrev.disabled = true;
    pdfSearchNext.disabled = true;
  } else {
    pdfSearchCount.textContent = `${currentSearchMatchIndex + 1} of ${searchMatches.length}`;
    pdfSearchPrev.disabled = false;
    pdfSearchNext.disabled = false;
  }
}

function goToNextSearchMatch() {
  if (searchMatches.length === 0) return;
  currentSearchMatchIndex = (currentSearchMatchIndex + 1) % searchMatches.length;
  updateSearchCount();
  highlightCurrentMatch();
}

function goToPrevSearchMatch() {
  if (searchMatches.length === 0) return;
  currentSearchMatchIndex = (currentSearchMatchIndex - 1 + searchMatches.length) % searchMatches.length;
  updateSearchCount();
  highlightCurrentMatch();
}

function highlightCurrentMatch() {
  if (searchMatches.length === 0 || currentSearchMatchIndex === -1) return;

  const match = searchMatches[currentSearchMatchIndex];

  // Render highlights for all matches (includes current highlighting)
  renderSearchHighlights();

  // Scroll directly to the first rect of the current match (centered in viewport).
  // scrollToPageRect ensures the page is rendered before computing the scroll target.
  if (match.rects && match.rects.length > 0) {
    pdfViewer.scrollToPageRect(match.pageNum, match.rects[0]);
  } else {
    pdfViewer.goToPage(match.pageNum);
  }
}

function renderSearchHighlights() {
  // Clear existing highlights
  clearSearchHighlights();

  if (searchMatches.length === 0) return;

  // Group matches by page
  const matchesByPage = new Map();
  searchMatches.forEach((match, index) => {
    if (!matchesByPage.has(match.pageNum)) {
      matchesByPage.set(match.pageNum, []);
    }
    matchesByPage.get(match.pageNum).push({ match, index });
  });

  // Render highlights for each page
  matchesByPage.forEach((matches, pageNum) => {
    const pageElements = pdfViewer.pageElements.get(pageNum);
    if (!pageElements || !pdfViewer.renderedPages.has(pageNum)) return;

    matches.forEach(({ match, index }) => {
      match.rects.forEach(rect => {
        const highlightDiv = document.createElement('div');
        highlightDiv.className = 'pdf-search-highlight';
        if (index === currentSearchMatchIndex) {
          highlightDiv.classList.add('current');
        }

        const scale = typeof pdfViewer.getCoordinateScale === 'function'
          ? pdfViewer.getCoordinateScale()
          : pdfViewer.scale;
        const horizontalPadding = 3; // 3px padding on each side
        const verticalPadding = 1;   // 1px padding top/bottom

        highlightDiv.style.left = `${(rect.left * scale) - horizontalPadding}px`;
        highlightDiv.style.top = `${(rect.top * scale) - verticalPadding}px`;
        highlightDiv.style.width = `${(rect.width * scale) + (horizontalPadding * 2)}px`;
        highlightDiv.style.height = `${(rect.height * scale) + (verticalPadding * 2)}px`;

        pageElements.textLayer.appendChild(highlightDiv);
      });
    });
  });
}

function clearSearchHighlights() {
  // Remove all search highlight elements
  document.querySelectorAll('.pdf-search-highlight').forEach(el => el.remove());
}

// Delete Annotation Modal
function showDeleteAnnotationModal(annotationId) {
  resetDraggableModal(deleteAnnotationModal);
  pendingDeleteAnnotationId = annotationId;
  deleteAnnotationModal.classList.add('active');
}

function hideDeleteAnnotationModal() {
  deleteAnnotationModal.classList.remove('active');
  pendingDeleteAnnotationId = null;
}

async function confirmDeleteAnnotation() {
  if (pendingDeleteAnnotationId) {
    await annotationManager.deleteAnnotation(pendingDeleteAnnotationId);
  }
  hideDeleteAnnotationModal();
}

// Event Listeners
function setupEventListeners() {
  // Navigation
  btnBack.addEventListener('click', () => window.api.navigateToHome());

  // Zoom controls
  btnZoomIn.addEventListener('click', async () => {
    await pdfViewer.zoomIn();
    updateZoomSelect();
    // Re-render search highlights after zoom
    if (searchMatches.length > 0) {
      setTimeout(() => renderSearchHighlights(), 100);
    }
  });

  btnZoomOut.addEventListener('click', async () => {
    await pdfViewer.zoomOut();
    updateZoomSelect();
    // Re-render search highlights after zoom
    if (searchMatches.length > 0) {
      setTimeout(() => renderSearchHighlights(), 100);
    }
  });

  zoomSelect.addEventListener('change', async (e) => {
    const value = e.target.value;
    await pdfViewer.setScale(value === 'fit-width' ? value : parseFloat(value));
    // Re-render search highlights after zoom
    if (searchMatches.length > 0) {
      setTimeout(() => renderSearchHighlights(), 100);
    }
  });

  // Dual page mode
  const btnDualPage = document.getElementById('btn-dual-page');
  btnDualPage.addEventListener('click', () => {
    btnDualPage.classList.toggle('active');
    pdfViewer.setDualPageMode(btnDualPage.classList.contains('active'));
  });

  btnThumbnails.addEventListener('click', toggleThumbnailSidebar);

  // Highlight mode
  // HIGHLIGHT MODE: Uncomment to re-enable highlight mode toggle
  // btnHighlight.addEventListener('click', toggleHighlightMode);

  // Add free note button
  const addFreeNoteBtn = document.getElementById('btn-add-free-note');
  addFreeNoteBtn.addEventListener('click', () => {
    showFreeNoteModal();
  });

  // Sort
  sortSelect.addEventListener('change', (e) => {
    annotationManager.setSortBy(e.target.value);
  });

  // Generate Review
  btnGenerateReview.addEventListener('click', generateReview);

  // LLM Configuration Tooltip
  let tooltipHideTimeout;

  btnGenerateReview.addEventListener('mouseenter', () => {
    if (btnGenerateReview.disabled) {
      clearTimeout(tooltipHideTimeout);
      llmConfigTooltip.classList.add('visible');
    }
  });

  btnGenerateReview.addEventListener('mouseleave', (e) => {
    if (!llmConfigTooltip.contains(e.relatedTarget)) {
      tooltipHideTimeout = setTimeout(() => {
        llmConfigTooltip.classList.remove('visible');
      }, 150);
    }
  });

  llmConfigTooltip.addEventListener('mouseenter', () => {
    clearTimeout(tooltipHideTimeout);
  });

  llmConfigTooltip.addEventListener('mouseleave', () => {
    tooltipHideTimeout = setTimeout(() => {
      llmConfigTooltip.classList.remove('visible');
    }, 150);
  });

  llmConfigSettingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    window.api.navigateToSettings();
  });

  btnImport.addEventListener('click', importAnnotations);
  btnExport.addEventListener('click', toggleExportMenu);
  exportMenu.querySelectorAll('.export-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      exportAnnotations(item.dataset.format);
    });
  });
  reviewExportBtn.addEventListener('click', toggleReviewExportMenu);
  reviewExportMenu.querySelectorAll('.export-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      exportReview(item.dataset.format);
    });
  });

  reviewEditor.addEventListener('input', handleReviewEditorInput);
  reviewEditor.addEventListener('focus', updateReviewFormattingState);
  reviewUndoBtn.addEventListener('click', undoReviewChange);
  reviewRedoBtn.addEventListener('click', redoReviewChange);

  reviewEditorToolbar.addEventListener('click', (e) => {
    const button = e.target.closest('.review-tool-btn');
    if (!button) return;

    reviewEditor.focus();

    if (button.dataset.command) {
      document.execCommand(button.dataset.command, false, null);
    } else if (button.dataset.block) {
      document.execCommand('formatBlock', false, button.dataset.block);
    }

    updateReviewFormattingState();
    handleReviewEditorInput();
  });

  document.addEventListener('selectionchange', () => {
    const selection = document.getSelection();
    if (!selection || !selection.anchorNode) return;
    if (!reviewEditor.contains(selection.anchorNode)) return;
    updateReviewFormattingState();
  });

  // Quick highlight button
  btnQuickHighlight.addEventListener('click', () => {
    createQuickHighlight();
  });

  // Annotate button (show category selection)
  btnAnnotate.addEventListener('click', () => {
    showAnnotateOptions();
  });

  // Highlight popup buttons
  btnHighlightDelete.addEventListener('click', () => {
    if (clickedHighlight) {
      deleteHighlight(clickedHighlight.id);
    }
  });

  btnHighlightConvert.addEventListener('click', () => {
    if (clickedHighlight) {
      // Get current highlight popup position to show category selection in same place
      const popupX = parseInt(highlightPopup.style.left, 10);
      const popupY = parseInt(highlightPopup.style.top, 10);
      convertHighlightToAnnotation(clickedHighlight, popupX, popupY);
    }
  });

  // Citation popup events - delegate clicks to individual buttons
  citationPopup.addEventListener('click', (e) => {
    const btn = e.target.closest('.citation-action-btn');
    if (!btn || btn.disabled) return;

    const action = btn.dataset.action;
    const number = parseInt(btn.dataset.number, 10);

    if (action === 'copy') {
      copySingleReference(number);
    } else if (action === 'search') {
      searchSingleReference(number);
    }
  });

  // Keep citation popup open when hovering over it
  citationPopup.addEventListener('mouseenter', () => {
    citationPopupLocked = true;
    if (citationPopupTimeout) {
      clearTimeout(citationPopupTimeout);
      citationPopupTimeout = null;
    }
  });

  citationPopup.addEventListener('mouseleave', () => {
    citationPopupLocked = false;
    citationPopupTimeout = setTimeout(() => {
      hideCitationPopup();
    }, 200);
  });

  // Category buttons in selection popup
  categoryButtons.addEventListener('click', (e) => {
    const btn = e.target.closest('.category-btn');
    if (btn) {
      const categoryId = parseInt(btn.dataset.categoryId, 10);
      // Show modal first, then hide popup
      // (hideSelectionPopup clears pendingSelection, so call it after)
      showAnnotationModal(categoryId);
    }
  });

  // Category filters
  categoryFilters.addEventListener('filter-change', (e) => {
    const { categoryId, active } = e.detail;
    const clickedFilter = categoryFilters.querySelector(`[category-id="${categoryId}"]`);

    if (categoryId === 0) {
      // "All" filter - clear all filters
      annotationManager.clearFilters();
      categoryFilters.querySelectorAll('category-filter').forEach(filter => {
        const id = parseInt(filter.getAttribute('category-id'), 10);
        if (id === 0) {
          filter.setAttribute('active', '');
        } else {
          filter.removeAttribute('active');
        }
      });
    } else {
      // Category filter - toggle it
      annotationManager.toggleFilter(categoryId);

      // Sync the component's active state with the actual filter state
      const isActive = annotationManager.activeFilters.has(categoryId);
      if (isActive) {
        clickedFilter.setAttribute('active', '');
      } else {
        clickedFilter.removeAttribute('active');
      }

      // Update "All" filter state
      const allFilter = categoryFilters.querySelector('[category-id="0"]');
      if (allFilter) {
        if (annotationManager.activeFilters.size === 0) {
          allFilter.setAttribute('active', '');
        } else {
          allFilter.removeAttribute('active');
        }
      }
    }
  });

  // Annotation modal
  modalClose.addEventListener('click', hideAnnotationModal);
  modalCancel.addEventListener('click', hideAnnotationModal);
  modalSave.addEventListener('click', saveAnnotation);

  // Completion modal
  btnMarkCompleted.addEventListener('click', handleMarkCompleted);
  completionModalClose.addEventListener('click', hideCompletionModal);
  completionModalCancel.addEventListener('click', hideCompletionModal);
  completionModalConfirm.addEventListener('click', confirmCompletion);

  // Delete Annotation modal
  deleteAnnotationModalClose.addEventListener('click', hideDeleteAnnotationModal);
  deleteAnnotationModalCancel.addEventListener('click', hideDeleteAnnotationModal);
  deleteAnnotationModalConfirm.addEventListener('click', confirmDeleteAnnotation);
  deleteAnnotationModal.addEventListener('click', (e) => {
    if (e.target === deleteAnnotationModal) hideDeleteAnnotationModal();
  });

  // Import compatibility modal
  importCompatibilityModalClose.addEventListener('click', hideImportCompatibilityModal);
  importCompatibilityCancel.addEventListener('click', hideImportCompatibilityModal);
  importCompatibilityConfirm.addEventListener('click', confirmCompatibilityImport);
  importCompatibilityModal.addEventListener('click', (e) => {
    if (e.target === importCompatibilityModal) hideImportCompatibilityModal();
  });

  // PDF Not Found modal
  pdfNotFoundClose.addEventListener('click', () => window.api.navigateToHome());
  pdfNotFoundBack.addEventListener('click', () => window.api.navigateToHome());
  pdfNotFoundReload.addEventListener('click', handlePDFNotFoundReload);

  annotationModal.addEventListener('click', (e) => {
    if (e.target === annotationModal) hideAnnotationModal();
  });

  pdfNotFoundModal.addEventListener('click', (e) => {
    if (e.target === pdfNotFoundModal) {
      window.api.navigateToHome();
    }
  });

  categorySelect.addEventListener('change', () => {
    const category = categories.find(c => c.id === parseInt(categorySelect.value, 10));
    if (category) {
      categoryBadge.textContent = category.name;
      categoryBadge.style.backgroundColor = category.color;
    }
  });

  // Annotation card events
  document.addEventListener('annotation-click', (e) => {
    const annotation = annotationManager.getAnnotation(e.detail.id);
    if (!annotation) return;

    if (e.detail.isFreeNote) {
      // For free notes: go to page only
      pdfViewer.goToPage(annotation.page_number);
      scrollToAnnotationCard(annotation.id);
    } else {
      // Regular annotations: scroll to highlight
      scrollToHighlight(e.detail.id);
      scrollToAnnotationCard(annotation.id);
    }
  });

  document.addEventListener('annotation-edit', (e) => {
    const { id } = e.detail;
    const annotation = annotationManager.getAnnotation(id);
    if (annotation) {
      editingAnnotationId = id;
      pendingSelection = {
        selectedText: annotation.selected_text,
        rects: annotation.highlight_rects,
        pageNumber: annotation.page_number
      };
      showAnnotationModal(annotation.category_id);
    }
  });

  document.addEventListener('annotation-delete', async (e) => {
    const { id } = e.detail;
    showDeleteAnnotationModal(id);
  });

  // Context menu
  contextMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.context-menu-item');
    if (item) {
      const action = item.dataset.action;
      const annotationId = contextMenu.dataset.annotationId;
      handleContextMenuAction(action, annotationId);
    }
  });

  categoryMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.context-menu-item');
    if (item) {
      const categoryId = parseInt(item.dataset.categoryId, 10);
      const annotationId = categoryMenu.dataset.annotationId;
      changeCategoryFromMenu(categoryId, annotationId);
    }
  });

  // Close menus on outside click
  document.addEventListener('click', (e) => {
    // Ignore clicks within the search panel
    const searchPanel = document.getElementById('search-panel');
    if (searchPanel && searchPanel.contains(e.target)) {
      return;
    }

    if (!contextMenu.contains(e.target) && !categoryMenu.contains(e.target)) {
      hideContextMenu();
    }
    if (!btnExport.contains(e.target) && !exportMenu.contains(e.target)) {
      exportMenu.classList.remove('active');
    }
    if (!reviewExportBtn.contains(e.target) && !reviewExportMenu.contains(e.target)) {
      reviewExportMenu.classList.remove('active');
    }
    // Close selection popup when clicking outside of it
    // Skip if popup was just shown this frame (selection mouseup + click fire together)
    // Also skip if the annotation modal is open (don't reset pendingSelection while modal is open)
    if (!popupJustShown &&
        !selectionPopup.contains(e.target) &&
        !annotationModal.contains(e.target) &&
        !annotationModal.classList.contains('active')) {
      hideSelectionPopup();
    }
    // Close highlight popup when clicking outside of it
    if (!highlightPopup.contains(e.target)) {
      hideHighlightPopup();
    }
  });

  // Additional handler specifically for mousedown to close selection popup
  // This ensures clicking outside works even for large text selections
  document.addEventListener('mousedown', (e) => {
    // Only handle if selection popup is visible
    if (!selectionPopup.classList.contains('active')) return;

    // Don't close if clicking inside the popup, modal, or if modal is open
    if (popupJustShown ||
        selectionPopup.contains(e.target) ||
        annotationModal.contains(e.target) ||
        annotationModal.classList.contains('active')) {
      return;
    }

    // Close popup if clicking anywhere else (including on selected text)
    hideSelectionPopup();
  });

  // Webview navigation controls
  if (btnWebviewBack && searchWebview) {
    btnWebviewBack.addEventListener('click', () => {
      if (searchWebview.canGoBack()) {
        searchWebview.goBack();
      }
    });
  }

  if (btnWebviewForward && searchWebview) {
    btnWebviewForward.addEventListener('click', () => {
      if (searchWebview.canGoForward()) {
        searchWebview.goForward();
      }
    });
  }

  if (btnWebviewReload && searchWebview) {
    btnWebviewReload.addEventListener('click', () => {
      searchWebview.reload();
    });
  }

  // URL bar navigation
  if (webviewUrlBar && searchWebview) {
    webviewUrlBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        let input = webviewUrlBar.value.trim();
        if (!input) return;

        let url;

        // Check if input is a URL or a search query
        if (input.match(/^[a-zA-Z]+:\/\//)) {
          // Already has protocol (http://, https://, etc.)
          url = input;
        } else if (input.includes(' ') || !input.includes('.')) {
          // Contains spaces or no dots -> treat as search query
          url = `https://www.google.com/search?q=${encodeURIComponent(input)}`;
        } else if (input.match(/^[\w-]+(\.[\w-]+)+/)) {
          // Looks like a domain (word.word pattern) -> treat as URL
          url = 'https://' + input;
        } else {
          // Default to search
          url = `https://www.google.com/search?q=${encodeURIComponent(input)}`;
        }

        searchWebview.src = url;
        webviewUrlBar.blur();
      }
    });
  }

  // Update navigation button states and URL bar based on webview navigation
  if (searchWebview) {
    const updateNavigationState = () => {
      if (btnWebviewBack) {
        btnWebviewBack.disabled = !searchWebview.canGoBack();
      }
      if (btnWebviewForward) {
        btnWebviewForward.disabled = !searchWebview.canGoForward();
      }
      if (webviewUrlBar) {
        webviewUrlBar.value = searchWebview.getURL();
      }
    };

    searchWebview.addEventListener('did-navigate', updateNavigationState);
    searchWebview.addEventListener('did-navigate-in-page', updateNavigationState);

    // Initial state update after webview loads
    searchWebview.addEventListener('dom-ready', updateNavigationState);

    // Handle navigation failures (404, network errors, etc.)
    searchWebview.addEventListener('did-fail-load', (event) => {
      // Ignore sub-frame failures and aborted loads (-3 error code)
      if (!event.isMainFrame || event.errorCode === -3) return;

      const errorMessages = {
        '-6': 'Page not found',
        '-105': 'Could not find this address',
        '-106': 'No internet connection',
        '-21': 'Access denied',
        '-324': 'Empty response from server',
        '-501': 'Insecure connection'
      };

      const errorMessage = errorMessages[event.errorCode] || `Could not load this page`;

      // Show error page in webview with dark background
      searchWebview.insertCSS(`
        * {
          box-sizing: border-box;
        }
        body {
          margin: 0;
          padding: 40px 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #1e293b;
          color: #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          overflow-x: hidden;
          overflow-y: auto;
        }
        .error-container {
          max-width: 500px;
          width: 100%;
          text-align: center;
        }
        .error-icon {
          font-size: 72px;
          color: #334155;
          opacity: 0.3;
          margin: 0 0 24px 0;
          font-weight: 300;
          line-height: 1;
        }
        h1 {
          color: #f1f5f9;
          font-size: 24px;
          font-weight: 500;
          margin: 0 0 12px 0;
        }
        .error-message {
          color: #94a3b8;
          font-size: 16px;
          margin: 0 0 24px 0;
          line-height: 1.5;
        }
        .error-url {
          background: rgba(15, 23, 42, 0.6);
          padding: 12px 16px;
          border-radius: 8px;
          word-break: break-all;
          margin: 20px 0;
          font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
          font-size: 13px;
          color: #64748b;
          border: 1px solid rgba(51, 65, 85, 0.5);
          overflow-wrap: break-word;
        }
        .error-code {
          color: #334155;
          font-size: 11px;
          margin-top: 32px;
          opacity: 0.5;
        }
        .suggestion {
          color: #64748b;
          font-size: 14px;
          margin-top: 20px;
          line-height: 1.6;
        }
      `);

      const suggestions = {
        '-6': 'The page you\'re looking for doesn\'t exist or has been moved.',
        '-105': 'Check that you typed the address correctly.',
        '-106': 'Make sure you\'re connected to the internet.',
        '-21': 'This website may be blocking access.',
        '-324': 'The server didn\'t send any data.',
        '-501': 'This page requires a secure connection.'
      };

      const suggestion = suggestions[event.errorCode] || 'Please check the URL and try again.';

      searchWebview.executeJavaScript(`
        document.body.innerHTML = \`
          <div class="error-container">
            <div class="error-icon">?</div>
            <h1>Couldn't Load Page</h1>
            <p class="error-message">${errorMessage}</p>
            <div class="error-url">${event.validatedURL}</div>
            <p class="suggestion">${suggestion}</p>
            <p class="error-code">Error code: ${event.errorCode}</p>
          </div>
        \`;
      `);
    });
  }

  // PDF Search event listeners with debounce
  let searchDebounceTimeout;
  pdfSearchInput.addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(() => {
      performPDFSearch(e.target.value);
    }, 400); // Wait 400ms after user stops typing
  });

  pdfSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        goToPrevSearchMatch();
      } else {
        goToNextSearchMatch();
      }
    } else if (e.key === 'Escape') {
      closePDFSearch();
    }
  });

  pdfSearchPrev.addEventListener('click', goToPrevSearchMatch);
  pdfSearchNext.addEventListener('click', goToNextSearchMatch);
  pdfSearchClose.addEventListener('click', closePDFSearch);

  // Re-render search highlights when scrolling (new pages rendered)
  let scrollTimeout;
  pdfViewerContainer.addEventListener('scroll', () => {
    if (searchMatches.length === 0) return;
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      renderSearchHighlights();
    }, 200);
  });
}

function updateZoomSelect() {
  const scale = pdfViewer.getScale();

  // Find the closest matching option
  const options = Array.from(zoomSelect.options).filter(opt => opt.value !== 'fit-width');
  let closestOption = options[0];
  let closestDiff = Math.abs(parseFloat(options[0].value) - scale);

  for (const option of options) {
    const diff = Math.abs(parseFloat(option.value) - scale);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestOption = option;
    }
  }

  if (closestOption && closestDiff < 0.1) {
    zoomSelect.value = closestOption.value;
  }
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const isEditingReview = e.target === reviewEditor || reviewEditor.contains(e.target);

    if (isEditingReview) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoReviewChange();
        return;
      }

      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault();
        redoReviewChange();
        return;
      }
    }

    // Don't trigger shortcuts when typing in input fields
    if (e.target.matches('input, textarea, select') || e.target.isContentEditable) {
      if (e.key === 'Escape') {
        e.target.blur();
      }
      return;
    }

    // Ctrl+O: Go back to home (open new PDF)
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      window.api.navigateToHome();
    }

    // Ctrl+F: Open PDF search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      openPDFSearch();
    }

    // D: Toggle dual page mode
    if (e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      const btnDualPage = document.getElementById('btn-dual-page');
      btnDualPage.click();
    }

    // T: Toggle page thumbnails
    if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      toggleThumbnailSidebar();
    }

    // H: Toggle highlight mode
    // HIGHLIGHT MODE: Uncomment to re-enable highlight mode toggle
    // if (e.key === 'h' || e.key === 'H') {
    //   e.preventDefault();
    //   toggleHighlightMode();
    // }

    // N: Add free note
    if (e.key === 'n' || e.key === 'N') {
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        showFreeNoteModal();
      }
    }

    // Escape: Close modal/deselect
    if (e.key === 'Escape') {
      if (deleteAnnotationModal.classList.contains('active')) {
        hideDeleteAnnotationModal();
      } else if (importCompatibilityModal.classList.contains('active')) {
        hideImportCompatibilityModal();
      } else if (pdfNotFoundModal.classList.contains('active')) {
        window.api.navigateToHome();
      } else if (completionModal.classList.contains('active')) {
        hideCompletionModal();
      } else if (annotationModal.classList.contains('active')) {
        hideAnnotationModal();
      } else if (selectionPopup.classList.contains('active')) {
        hideSelectionPopup();
      } else if (!contextMenu.classList.contains('hidden')) {
        hideContextMenu();
      }
    }

    // Ctrl+[: Collapse PDF panel
    if ((e.ctrlKey || e.metaKey) && e.key === '[') {
      e.preventDefault();
      resizablePanels.togglePdf();
    }

    // Ctrl+]: Collapse annotation panel
    if ((e.ctrlKey || e.metaKey) && e.key === ']') {
      e.preventDefault();
      resizablePanels.toggleAnnotations();
    }

    // Ctrl+/: Toggle search panel
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      resizablePanels.toggleSearch();
    }

    // Ctrl+\: Restore all panels
    if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
      e.preventDefault();
      resizablePanels.restorePanels();
    }

    // Ctrl+- / Ctrl+=: Zoom
    if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
      e.preventDefault();
      pdfViewer.zoomOut().then(updateZoomSelect);
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      pdfViewer.zoomIn().then(updateZoomSelect);
    }
  });
}

// Theme toggle setup
function setupThemeToggle() {
  updateThemeIcon();

  // Listen for theme changes
  ThemeManager.addListener(() => {
    updateThemeIcon();
  });

  // Toggle button click
  btnThemeToggle.addEventListener('click', async () => {
    await ThemeManager.cycle();
  });
}

function updateThemeIcon() {
  const preference = ThemeManager.getPreference();
  const currentTheme = ThemeManager.getCurrentTheme();

  const lightActive = currentTheme === 'light';
  const darkActive = currentTheme === 'dark';
  const title = currentTheme === 'light'
    ? (preference === 'auto' ? 'Theme: Auto (Light)' : 'Theme: Light')
    : (preference === 'auto' ? 'Theme: Auto (Dark)' : 'Theme: Dark');

  btnThemeToggle.innerHTML = `
    <span class="theme-toggle-icon ${lightActive ? 'is-active' : ''}" aria-hidden="true">
      ${getSunIcon()}
    </span>
    <span class="theme-toggle-divider" aria-hidden="true"></span>
    <span class="theme-toggle-icon ${darkActive ? 'is-active' : ''}" aria-hidden="true">
      ${getMoonIcon()}
    </span>
  `;
  btnThemeToggle.title = title;
}

function getSunIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  `;
}

function getMoonIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  `;
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);
