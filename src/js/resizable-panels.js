const MIN_CONTENT = 200;
const RESIZER_W = 18;
const LABEL_THRESHOLD = 4;
const LEFT_TAB_W = 18;

const DEFAULT_RATIOS = [0.34, 0.58, 0.78];

export class ResizablePanels {
  constructor(options = {}) {
    this.container = options.container;
    this.panels = [
      { key: 'pdf', element: options.pdfPanel, contentSelector: '.pdf-workspace, .pdf-viewer-container', label: 'PDF' },
      { key: 'annotations', element: options.annotationPanel, contentSelector: '.annotation-panel-content', label: 'Annotations' },
      { key: 'search', element: options.searchPanel, contentSelector: '.search-panel-content', label: 'Search' },
      { key: 'review', element: options.reviewPanel, contentSelector: '.review-panel-content', label: 'Review' }
    ];
    this.resizers = [options.resizer1, options.resizer2, options.resizer3];
    this.positions = [];
    this.isDragging = false;
    this.activeDraggingIndex = null;
    this.startX = 0;
    this.startPositions = [];
    this.leftTab = null;
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
    const tab = document.createElement('div');
    tab.className = 'panel-left-tab';
    const label = document.createElement('span');
    label.className = 'resizer-label';
    label.textContent = 'PDF';
    tab.appendChild(label);
    this.container.appendChild(tab);
    this.leftTab = tab;
  }

  _setupResizerLabels() {
    this.resizers.forEach((resizer) => {
      const label = document.createElement('span');
      label.className = 'resizer-label';
      resizer.appendChild(label);
    });
  }

  _initPositions() {
    const available = this._availableWidth();
    this.positions = DEFAULT_RATIOS.map((ratio) => Math.round(available * ratio));
    this._clampPositions();
    this._applyPositions();
  }

  _containerWidth() {
    return this.container.clientWidth;
  }

  _availableWidth() {
    return Math.max(0, this._containerWidth() - LEFT_TAB_W - (this.resizers.length * RESIZER_W));
  }

  _maxPosition(index) {
    return this._availableWidth();
  }

  _clampPositions() {
    const max = this._availableWidth();

    if (!Array.isArray(this.positions) || this.positions.length !== this.resizers.length) {
      this.positions = DEFAULT_RATIOS.map((ratio) => Math.round(max * ratio));
    }

    for (let i = 0; i < this.positions.length; i += 1) {
      const min = i === 0 ? 0 : this.positions[i - 1];
      this.positions[i] = Math.max(min, Math.min(max, this.positions[i]));
    }
  }

  _applyPositions() {
    const available = this._availableWidth();
    const widths = [];
    let cursor = LEFT_TAB_W;
    let previousBoundary = 0;

    this.leftTab.style.left = '0';

    this.panels.forEach((panel, index) => {
      const boundary = index < this.positions.length ? this.positions[index] : available;
      const panelWidth = Math.max(0, boundary - previousBoundary);
      widths.push(panelWidth);

      panel.element.style.left = `${cursor}px`;
      panel.element.style.width = `${panelWidth}px`;
      this._updatePanelOverflow(panel.element, panel.contentSelector, panelWidth);
      panel.element.classList.toggle('collapsed', panelWidth <= LABEL_THRESHOLD);

      cursor += panelWidth;
      previousBoundary = boundary;

      if (index < this.resizers.length) {
        this.resizers[index].style.left = `${cursor}px`;
        this._updateResizerLabel(this.resizers[index], this.panels[index + 1].label);
        cursor += RESIZER_W;
      }
    });
  }

  _updatePanelOverflow(panel, contentSelector, visibleWidth) {
    const content = panel.querySelector(contentSelector);
    const panelKey = this.panels.find(item => item.element === panel)?.key;

    if (visibleWidth <= LABEL_THRESHOLD) {
      panel.style.overflowX = 'hidden';
      panel.classList.remove('narrow-scroll');
      if (content) content.style.minWidth = '';
      return;
    }

    if (visibleWidth < MIN_CONTENT) {
      panel.style.overflowX = panelKey === 'search' ? 'hidden' : 'auto';
      panel.classList.add('narrow-scroll');
      if (content) content.style.minWidth = `${MIN_CONTENT}px`;
      return;
    }

    panel.style.overflowX = 'hidden';
    panel.classList.remove('narrow-scroll');
    if (content) content.style.minWidth = '';
  }

  _updateResizerLabel(resizer, text) {
    const label = resizer.querySelector('.resizer-label');
    if (!label) return;
    label.textContent = text;
    label.style.display = 'block';
    resizer.classList.add('has-label');
  }

  loadSavedLayout() {
    window.api.getSetting('panelLayout').then((layout) => {
      const available = this._availableWidth();
      if (!layout) return;

      if (layout.pos1Ratio != null && layout.pos2Ratio != null && layout.pos3Ratio != null) {
        this.positions = [
          Math.round(layout.pos1Ratio * available),
          Math.round(layout.pos2Ratio * available),
          Math.round(layout.pos3Ratio * available)
        ];
      } else if (layout.pos1Ratio != null && layout.pos2Ratio != null) {
        this.positions = [
          Math.round(layout.pos1Ratio * available),
          Math.round(layout.pos2Ratio * available),
          Math.round(DEFAULT_RATIOS[2] * available)
        ];
      } else {
        return;
      }

      this._clampPositions();
      this._ensureSecondaryPanelsVisible();
      this._applyPositions();
    }).catch(() => {});
  }

  saveLayout() {
    const available = this._availableWidth() || 1;
    window.api.setSetting('panelLayout', {
      pos1Ratio: this.positions[0] / available,
      pos2Ratio: this.positions[1] / available,
      pos3Ratio: this.positions[2] / available
    }).catch(() => {});
  }

  _ensureSecondaryPanelsVisible() {
    const widths = [
      this.positions[0],
      this.positions[1] - this.positions[0],
      this.positions[2] - this.positions[1],
      this._availableWidth() - this.positions[2]
    ];

    if (widths.slice(1).some((width) => width <= LABEL_THRESHOLD)) {
      const available = this._availableWidth();
      this.positions = DEFAULT_RATIOS.map((ratio) => Math.round(available * ratio));
      this._clampPositions();
    }
  }

  setupResizers() {
    const startDrag = (event, index) => {
      event.preventDefault();
      this.isDragging = true;
      this.activeDraggingIndex = index;
      this.startX = event.clientX;
      this.startPositions = [...this.positions];
      this.resizers[index].classList.add('dragging');
      this.resizers[index].setPointerCapture(event.pointerId);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };

    const onMove = (event) => {
      if (!this.isDragging || this.activeDraggingIndex == null) return;

      const delta = event.clientX - this.startX;
      const index = this.activeDraggingIndex;
      const max = this._availableWidth();
      const nextPositions = [...this.positions];
      nextPositions[index] = Math.max(0, Math.min(max, this.startPositions[index] + delta));

      if (delta > 0) {
        for (let i = index + 1; i < nextPositions.length; i += 1) {
          if (nextPositions[i] < nextPositions[i - 1]) {
            nextPositions[i] = nextPositions[i - 1];
          }
        }
      } else if (delta < 0) {
        for (let i = index - 1; i >= 0; i -= 1) {
          if (nextPositions[i] > nextPositions[i + 1]) {
            nextPositions[i] = nextPositions[i + 1];
          }
        }
      }

      this.positions = nextPositions;
      this._clampPositions();
      this._applyPositions();
      this.onResize();
    };

    const endDrag = () => {
      if (!this.isDragging) return;

      if (this.activeDraggingIndex != null) {
        this.resizers[this.activeDraggingIndex].classList.remove('dragging');
      }

      this.isDragging = false;
      this.activeDraggingIndex = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      this.saveLayout();
    };

    this.resizers.forEach((resizer, index) => {
      resizer.addEventListener('pointerdown', (event) => startDrag(event, index));
      resizer.addEventListener('pointermove', onMove);
      resizer.addEventListener('pointerup', endDrag);
    });

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

  togglePdf() {}
  toggleAnnotations() {}
  toggleSearch() {}
  toggleReview() {}
  restorePanels() {}

  ensureAnnotationPanelOpen(targetWidth = 350, duration = 300) {
    const currentWidth = this.positions[1] - this.positions[0];
    if (currentWidth >= targetWidth) return;

    const targetPos1 = Math.max(0, this.positions[1] - targetWidth);
    this._animatePosition(0, targetPos1, duration);
  }

  expandSearchPanel(targetWidth = 400, duration = 300) {
    const currentWidth = this.positions[2] - this.positions[1];
    if (currentWidth >= targetWidth) return;

    const targetBoundary = Math.min(this._availableWidth(), this.positions[1] + targetWidth);
    this._animatePosition(2, targetBoundary, duration);
  }

  ensureReviewPanelOpen(targetWidth = 420, duration = 300) {
    const currentWidth = this._availableWidth() - this.positions[2];
    if (currentWidth >= targetWidth) return;

    const targetPos3 = Math.max(this.positions[1], this._availableWidth() - targetWidth);
    this._animatePosition(2, targetPos3, duration);
  }

  _animatePosition(index, target, duration) {
    const start = this.positions[index];
    const startTime = performance.now();

    const animate = (time) => {
      const progress = Math.min((time - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      this.positions[index] = start + (target - start) * eased;
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
