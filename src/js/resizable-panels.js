// Card stack resizable panels model
// Left panel (z-index 1) -> Center panel (z-index 2) -> Right panel (z-index 3)
// Panels can close fully to 0 width; the resizer bar stays visible with a vertical label.
// A static left-edge tab always shows "PDF" for the left panel.

const MIN_CONTENT = 200; // Minimum internal content width (enables scroll below this)
const RESIZER_W = 18;    // Resizer bar width
const LABEL_THRESHOLD = 4; // Panel considered collapsed when width <= this
const LEFT_TAB_W = 18;   // Static left-edge tab width (same as resizer)

export class ResizablePanels {
  constructor(options = {}) {
    this.pdfPanel = options.pdfPanel;
    this.annotationPanel = options.annotationPanel;
    this.searchPanel = options.searchPanel;
    this.resizer1 = options.resizer1;
    this.resizer2 = options.resizer2;
    this.container = options.container;

    this.isDragging = false;
    this.activeDragging = null;
    this.startX = 0;
    this.startPos1 = 0;
    this.startPos2 = 0;

    // pos1 = right edge of left panel (= left edge of resizer1)
    // pos2 = right edge of center panel content area
    this.pos1 = 0;
    this.pos2 = 0;

    this.onResize = options.onResize || (() => {});

    this.init();
  }

  init() {
    this._setupLeftTab();
    this._setupResizerLabels();
    this._initPositions();
    this.loadSavedLayout();
    this.setupResizers();
    this._observeResize();
  }

  _setupLeftTab() {
    // Create a static tab on the left edge that always says "PDF"
    const tab = document.createElement('div');
    tab.className = 'panel-left-tab';
    const label = document.createElement('span');
    label.className = 'resizer-label';
    label.textContent = 'PDF';
    label.style.display = '';
    tab.appendChild(label);
    this.container.appendChild(tab);
    this.leftTab = tab;
  }

  _initPositions() {
    const w = this.container.clientWidth;
    this.pos1 = Math.round(w * 0.4);
    this.pos2 = Math.round(w * 0.7);
    this._applyPositions();
  }

  _containerWidth() {
    return this.container.clientWidth;
  }

  _clampPositions() {
    const w = this._containerWidth();
    // Layout: [leftTab 18][left: pos1][R1: 18][center: pos2-pos1][R2: 18][right: rest]
    // Total fixed = LEFT_TAB_W + 2*RESIZER_W
    // pos1 >= 0, pos2 >= pos1, right >= 0
    const maxPos2 = w - LEFT_TAB_W - 2 * RESIZER_W;

    this.pos1 = Math.max(0, this.pos1);
    this.pos2 = Math.max(this.pos1, this.pos2);
    this.pos2 = Math.min(maxPos2, this.pos2);
    this.pos1 = Math.min(this.pos1, this.pos2);
  }

  _applyPositions() {
    const w = this._containerWidth();

    // Layout: [leftTab LEFT_TAB_W][leftPanel pos1][resizer1 RESIZER_W][centerPanel pos2-pos1][resizer2 RESIZER_W][rightPanel rest]
    const base = LEFT_TAB_W; // everything shifted right by the left tab

    const leftWidth = this.pos1;
    const leftLeft = base;

    const r1Left = base + this.pos1;

    const centerWidth = Math.max(0, this.pos2 - this.pos1);
    const centerLeft = r1Left + RESIZER_W;

    const r2Left = centerLeft + centerWidth;

    const rightLeft = r2Left + RESIZER_W;
    const rightWidth = Math.max(0, w - rightLeft);

    // Left tab (static)
    this.leftTab.style.left = '0';

    // Left panel
    this.pdfPanel.style.left = `${leftLeft}px`;
    this.pdfPanel.style.width = `${leftWidth}px`;

    // Resizer1
    this.resizer1.style.left = `${r1Left}px`;

    // Center panel
    this.annotationPanel.style.left = `${centerLeft}px`;
    this.annotationPanel.style.width = `${centerWidth}px`;

    // Resizer2
    this.resizer2.style.left = `${r2Left}px`;

    // Right panel
    this.searchPanel.style.left = `${rightLeft}px`;
    this.searchPanel.style.width = `${rightWidth}px`;

    // Overflow scrolling for narrow panels
    this._updatePanelOverflow(this.pdfPanel, leftWidth);
    this._updatePanelOverflow(this.annotationPanel, centerWidth);
    this._updatePanelOverflow(this.searchPanel, rightWidth);

    // Collapsed state & resizer labels
    const leftCollapsed = leftWidth <= LABEL_THRESHOLD;
    const centerCollapsed = centerWidth <= LABEL_THRESHOLD;
    const rightCollapsed = rightWidth <= LABEL_THRESHOLD;

    this.pdfPanel.classList.toggle('collapsed', leftCollapsed);
    this.annotationPanel.classList.toggle('collapsed', centerCollapsed);
    this.searchPanel.classList.toggle('collapsed', rightCollapsed);

    // Resizer labels are always visible:
    // - leftTab always shows "PDF"
    // - resizer1 always shows "Annotations" (center panel's left edge)
    // - resizer2 always shows "Search" (right panel's left edge)
    this._updateResizerLabel(this.resizer1, 'Annotations');
    this._updateResizerLabel(this.resizer2, 'Search');
  }

  _updatePanelOverflow(panel, visibleWidth) {
    const content = panel.querySelector('.pdf-viewer-container, .annotation-panel-content, .search-panel-content');
    if (visibleWidth <= LABEL_THRESHOLD) {
      panel.style.overflowX = 'hidden';
      panel.classList.remove('narrow-scroll');
      if (content) content.style.minWidth = '';
    } else if (visibleWidth < MIN_CONTENT) {
      panel.style.overflowX = 'auto';
      panel.classList.add('narrow-scroll');
      if (content) content.style.minWidth = `${MIN_CONTENT}px`;
    } else {
      panel.style.overflowX = 'hidden';
      panel.classList.remove('narrow-scroll');
      if (content) content.style.minWidth = '';
    }
  }

  _setupResizerLabels() {
    for (const resizer of [this.resizer1, this.resizer2]) {
      const label = document.createElement('span');
      label.className = 'resizer-label';
      resizer.appendChild(label);
    }
  }

  _updateResizerLabel(resizer, text) {
    const label = resizer.querySelector('.resizer-label');
    if (!label) return;
    if (text) {
      label.textContent = text;
      label.style.display = 'block';
      resizer.classList.add('has-label');
    } else {
      label.textContent = '';
      label.style.display = 'none';
      resizer.classList.remove('has-label');
    }
  }

  loadSavedLayout() {
    window.api.getSetting('panelLayout').then(layout => {
      if (layout && layout.pos1Ratio != null && layout.pos2Ratio != null) {
        const w = this._containerWidth();
        this.pos1 = Math.round(layout.pos1Ratio * w);
        this.pos2 = Math.round(layout.pos2Ratio * w);
        this._clampPositions();

        // Ensure both annotation and search panels are open on load.
        // If either is collapsed, reset to default proportions (40/30/30).
        const maxPos2 = w - LEFT_TAB_W - 2 * RESIZER_W;
        const centerWidth = this.pos2 - this.pos1;
        const rightWidth = maxPos2 - this.pos2;

        if (centerWidth <= LABEL_THRESHOLD || rightWidth <= LABEL_THRESHOLD) {
          this.pos1 = Math.round(maxPos2 * 0.4);
          this.pos2 = Math.round(maxPos2 * 0.7);
        }

        this._clampPositions();
        this._applyPositions();
      }
    }).catch(() => {});
  }

  saveLayout() {
    const w = this._containerWidth();
    window.api.setSetting('panelLayout', {
      pos1Ratio: this.pos1 / w,
      pos2Ratio: this.pos2 / w
    }).catch(() => {});
  }

  setupResizers() {
    const startDrag = (e, resizerEl, activeName) => {
      e.preventDefault();
      this.isDragging = true;
      this.activeDragging = activeName;
      this.startX = e.clientX;
      this.startPos1 = this.pos1;
      this.startPos2 = this.pos2;
      resizerEl.classList.add('dragging');
      resizerEl.setPointerCapture(e.pointerId);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };

    const onMove = (e) => {
      if (!this.isDragging) return;

      const delta = e.clientX - this.startX;
      const w = this._containerWidth();
      const maxPos2 = w - LEFT_TAB_W - 2 * RESIZER_W;

      if (this.activeDragging === 'resizer1') {
        let newPos1 = this.startPos1 + delta;
        newPos1 = Math.max(0, Math.min(maxPos2, newPos1));
        this.pos1 = newPos1;
        if (this.pos2 < this.pos1) {
          this.pos2 = this.pos1;
        }
        this.pos2 = Math.min(maxPos2, this.pos2);
      } else {
        let newPos2 = this.startPos2 + delta;
        newPos2 = Math.max(0, Math.min(maxPos2, newPos2));
        this.pos2 = newPos2;
        if (this.pos1 > this.pos2) {
          this.pos1 = this.pos2;
        }
        this.pos1 = Math.max(0, this.pos1);
      }

      this._applyPositions();
      this.onResize();
    };

    const endDrag = () => {
      if (this.isDragging) {
        this.isDragging = false;
        if (this.activeDragging === 'resizer1') {
          this.resizer1.classList.remove('dragging');
        } else if (this.activeDragging === 'resizer2') {
          this.resizer2.classList.remove('dragging');
        }
        this.activeDragging = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        this.saveLayout();
      }
    };

    this.resizer1.addEventListener('pointerdown', (e) => startDrag(e, this.resizer1, 'resizer1'));
    this.resizer2.addEventListener('pointerdown', (e) => startDrag(e, this.resizer2, 'resizer2'));
    this.resizer1.addEventListener('pointermove', onMove);
    this.resizer2.addEventListener('pointermove', onMove);
    this.resizer1.addEventListener('pointerup', endDrag);
    this.resizer2.addEventListener('pointerup', endDrag);
    document.addEventListener('mouseup', endDrag);
  }

  _observeResize() {
    const ro = new ResizeObserver(() => {
      if (this.isDragging) return;
      this._clampPositions();
      this._applyPositions();
    });
    ro.observe(this.container);
  }

  // No-ops for backward compatibility with keyboard shortcuts
  togglePdf() {}
  toggleAnnotations() {}
  toggleSearch() {}
  restorePanels() {}

  /**
   * Ensure the annotation (center) panel is visible.
   * If collapsed, expand it by shifting pos1 left (stealing from PDF panel),
   * using the same animated approach as expandSearchPanel.
   * @param {number} targetWidth - Target width in pixels (default 350)
   * @param {number} duration - Animation duration in ms (default 300)
   */
  ensureAnnotationPanelOpen(targetWidth = 350, duration = 300) {
    const centerWidth = this.pos2 - this.pos1;

    // Already wide enough
    if (centerWidth >= targetWidth) return;

    // Shift pos1 left to create space for annotations
    const neededShift = targetWidth - centerWidth;
    const targetPos1 = Math.max(0, this.pos1 - neededShift);

    // Animate (same pattern as expandSearchPanel)
    const startPos1 = this.pos1;
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);

      this.pos1 = startPos1 + (targetPos1 - startPos1) * eased;
      this._clampPositions();
      this._applyPositions();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.saveLayout();
        this.onResize();
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * Expand the search panel to a reasonable width with smooth animation
   * @param {number} targetWidth - Target width in pixels (default 400)
   * @param {number} duration - Animation duration in ms (default 300)
   */
  expandSearchPanel(targetWidth = 400, duration = 300) {
    const w = this._containerWidth();
    const rightLeft = LEFT_TAB_W + this.pos1 + RESIZER_W + (this.pos2 - this.pos1) + RESIZER_W;
    const currentRightWidth = w - rightLeft;

    // If already wide enough, do nothing
    if (currentRightWidth >= targetWidth) return;

    // Calculate how much we need to shift pos2 left
    const neededShift = targetWidth - currentRightWidth;
    const targetPos2 = Math.max(this.pos1, this.pos2 - neededShift);

    // Animate
    const startPos2 = this.pos2;
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);

      this.pos2 = startPos2 + (targetPos2 - startPos2) * eased;
      this._clampPositions();
      this._applyPositions();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.saveLayout();
        this.onResize();
      }
    };

    requestAnimationFrame(animate);
  }
}

export default ResizablePanels;
