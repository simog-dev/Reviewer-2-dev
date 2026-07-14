import { formatRelativeTime, formatFileSize } from '../js/utils.js';

class PDFCard extends HTMLElement {
  constructor() {
    super();
  }

  static get observedAttributes() {
    return [
      'pdf-id',
      'name',
      'path',
      'page-count',
      'annotation-count',
      'updated-at',
      'completed',
      'review-decision',
      'project-name',
      'venue',
      'due-date'
    ];
  }

  connectedCallback() {
    this.render();
    this.addEventListeners();
  }

  attributeChangedCallback() {
    if (this.innerHTML) {
      this.render();
      this.addEventListeners();
    }
  }

  get pdfId() {
    return this.getAttribute('pdf-id');
  }

  get name() {
    return this.getAttribute('name') || 'Untitled';
  }

  get path() {
    return this.getAttribute('path') || '';
  }

  get pageCount() {
    return parseInt(this.getAttribute('page-count') || '0', 10);
  }

  get annotationCount() {
    return parseInt(this.getAttribute('annotation-count') || '0', 10);
  }

  get updatedAt() {
    return this.getAttribute('updated-at') || new Date().toISOString();
  }

  get completed() {
    return this.getAttribute('completed');
  }

  get reviewDecision() {
    return this.getAttribute('review-decision');
  }

  get projectName() {
    return this.getAttribute('project-name') || '';
  }

  get venue() {
    return this.getAttribute('venue') || '';
  }

  get dueDate() {
    return this.getAttribute('due-date') || '';
  }

  escape(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  formatDueDate(value) {
    if (!value) return '';

    const [year, month, day] = String(value).slice(0, 10).split('-');
    if (!year || !month || !day) return String(value);

    return `${day}/${month}/${year}`;
  }

  render() {
    const truncatedPath = this.path.length > 40
      ? '...' + this.path.slice(-37)
      : this.path;
    const safeName = this.escape(this.name);
    const safePath = this.escape(this.path);
    const safeTruncatedPath = this.escape(truncatedPath);
    const safeProjectName = this.escape(this.projectName);
    const safeVenue = this.escape(this.venue);
    const dueDateLabel = this.dueDate ? `Due by ${this.formatDueDate(this.dueDate)}` : 'No due date';
    const dueDateClass = this.dueDate ? 'pdf-card__context-pill--date' : 'pdf-card__context-pill--muted';
    const safeDueDate = this.escape(dueDateLabel);
    const safeReviewDecision = this.escape(this.reviewDecision);

    const reviewDecisionLabels = {
      'accept': 'Accept',
      'minor-revisions': 'Minor',
      'major-revisions': 'Major',
      'reject': 'Reject'
    };

    this.innerHTML = `
      <div class="pdf-card__wrapper">
        ${this.completed === '1' ? `
        <div class="pdf-card__completion-indicator" title="Completed">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        ` : ''}
        <div class="pdf-card__card" tabindex="0" role="button" aria-label="Open ${safeName}">
          <div class="pdf-card__header">
            <div class="pdf-card__icon">PDF</div>
            <div class="pdf-card__info">
              <div class="pdf-card__name" title="${safeName}">${safeName}</div>
              ${this.projectName ? `
              <div class="pdf-card__project" title="${safeProjectName}">${safeProjectName}</div>
              ` : ''}
              <div class="pdf-card__path" title="${safePath}">${safeTruncatedPath}</div>
            </div>
          </div>
          <div class="pdf-card__context">
            ${this.venue ? `<span class="pdf-card__context-pill">${safeVenue}</span>` : ''}
            <span class="pdf-card__context-pill ${dueDateClass}">${safeDueDate}</span>
          </div>
          <div class="pdf-card__meta">
            <div class="pdf-card__meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              <span>${this.pageCount} page${this.pageCount !== 1 ? 's' : ''}</span>
            </div>
            <div class="pdf-card__meta-item pdf-card__annotation-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span>${this.annotationCount}</span>
            </div>
            ${this.reviewDecision ? `
            <div class="pdf-card__review-decision-badge ${safeReviewDecision}" title="Review Decision">
              ${this.escape(reviewDecisionLabels[this.reviewDecision] || this.reviewDecision)}
            </div>
            ` : ''}
            <div class="pdf-card__meta-item pdf-card__updated-at">
              <span>${formatRelativeTime(this.updatedAt)}</span>
            </div>
          </div>
        </div>
        <button class="pdf-card__delete-btn" title="Remove PDF" aria-label="Remove ${safeName}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
          </svg>
        </button>
      </div>
    `;
  }

  addEventListeners() {
    const card = this.querySelector('.pdf-card__card');
    const deleteBtn = this.querySelector('.pdf-card__delete-btn');

    card.addEventListener('click', (e) => {
      if (e.target.closest('.pdf-card__delete-btn')) return;
      this.dispatchEvent(new CustomEvent('pdf-open', {
        bubbles: true,
        composed: true,
        detail: { id: this.pdfId }
      }));
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.dispatchEvent(new CustomEvent('pdf-open', {
          bubbles: true,
          composed: true,
          detail: { id: this.pdfId }
        }));
      }
    });

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dispatchEvent(new CustomEvent('pdf-delete', {
        bubbles: true,
        composed: true,
        detail: { id: this.pdfId, name: this.name }
      }));
    });
  }
}

customElements.define('pdf-card', PDFCard);

export default PDFCard;
