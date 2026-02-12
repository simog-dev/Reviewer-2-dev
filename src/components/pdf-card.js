import { formatRelativeTime, formatFileSize } from '../js/utils.js';

class PDFCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  static get observedAttributes() {
    return ['pdf-id', 'name', 'path', 'page-count', 'annotation-count', 'updated-at', 'completed', 'review-decision'];
  }

  connectedCallback() {
    this.render();
    this.addEventListeners();
  }

  attributeChangedCallback() {
    if (this.shadowRoot.innerHTML) {
      this.render();
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

  render() {
    const styles = `
      <style>
        :host {
          display: block;
        }

        .card {
          display: flex;
          flex-direction: column;
          background-color: var(--color-bg-secondary, #1a1a1a);
          border: 1px solid var(--color-border, #333333);
          border-radius: var(--radius-md, 8px);
          padding: var(--spacing-md, 16px);
          cursor: pointer;
          transition: all 150ms ease;
        }

        .card:hover {
          background-color: var(--color-bg-hover, #2a2a2a);
          border-color: var(--color-border-light, #404040);
          transform: translateY(-2px);
        }

        .card:focus {
          outline: 2px solid var(--color-primary, #3b82f6);
          outline-offset: 2px;
        }

        .card-header {
          display: flex;
          align-items: flex-start;
          gap: var(--spacing-sm, 8px);
          margin-bottom: var(--spacing-sm, 8px);
        }

        .pdf-icon {
          flex-shrink: 0;
          width: 40px;
          height: 40px;
          background-color: #ef4444;
          border-radius: var(--radius-sm, 4px);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: 0.75rem;
        }

        .card-info {
          flex: 1;
          min-width: 0;
        }

        .card-name {
          font-weight: 600;
          font-size: 0.9375rem;
          color: var(--color-text, #e5e5e5);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 2px;
        }

        .card-path {
          font-size: 0.75rem;
          color: var(--color-text-muted, #737373);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .card-meta {
          display: flex;
          align-items: center;
          gap: var(--spacing-md, 16px);
          margin-top: auto;
          padding-top: var(--spacing-sm, 8px);
          border-top: 1px solid var(--color-border, #333333);
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.75rem;
          color: var(--color-text-secondary, #a3a3a3);
        }

        .meta-item svg {
          width: 14px;
          height: 14px;
          opacity: 0.7;
        }

        .annotation-badge {
          background-color: var(--color-primary-light, rgba(59, 130, 246, 0.1));
          color: var(--color-primary, #3b82f6);
          padding: 2px 6px;
          border-radius: var(--radius-full, 9999px);
          font-weight: 500;
        }

        .delete-btn {
          position: absolute;
          top: var(--spacing-sm, 8px);
          right: var(--spacing-sm, 8px);
          background: none;
          border: none;
          color: var(--color-text-muted, #737373);
          cursor: pointer;
          padding: 4px;
          border-radius: var(--radius-sm, 4px);
          opacity: 0;
          transition: all 150ms ease;
        }

        .card-wrapper:hover .delete-btn {
          opacity: 1;
        }

        .delete-btn:hover {
          background-color: rgba(239, 68, 68, 0.1);
          color: var(--color-error, #ef4444);
        }

        .card-wrapper {
          position: relative;
        }

        .completion-indicator {
          position: absolute;
          top: 6px;
          left: 6px;
          width: 20px;
          height: 20px;
          background-color: #10b981;
          color: white;
          border-radius: var(--radius-full, 9999px);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 4px rgba(16, 185, 129, 0.3);
          z-index: 1;
        }

        .completion-indicator svg {
          width: 12px;
          height: 12px;
        }

        .review-decision-badge {
          background-color: var(--badge-bg, #3b82f6);
          color: white;
          padding: 2px 8px;
          border-radius: var(--radius-full, 9999px);
          font-weight: 600;
          font-size: 0.6875rem;
          text-transform: uppercase;
          letter-spacing: 0.025em;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        }

        .review-decision-badge.accept {
          --badge-bg: #047857;
        }

        .review-decision-badge.minor-revisions {
          --badge-bg: #a16207;
        }

        .review-decision-badge.major-revisions {
          --badge-bg: #c2410c;
        }

        .review-decision-badge.reject {
          --badge-bg: #b91c1c;
        }
      </style>
    `;

    const truncatedPath = this.path.length > 40
      ? '...' + this.path.slice(-37)
      : this.path;

    const reviewDecisionLabels = {
      'accept': 'Accept',
      'minor-revisions': 'Minor',
      'major-revisions': 'Major',
      'reject': 'Reject'
    };

    this.shadowRoot.innerHTML = `
      ${styles}
      <div class="card-wrapper">
        ${this.completed === '1' ? `
        <div class="completion-indicator" title="Completed">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        ` : ''}
        <div class="card" tabindex="0" role="button" aria-label="Open ${this.name}">
          <div class="card-header">
            <div class="pdf-icon">PDF</div>
            <div class="card-info">
              <div class="card-name" title="${this.name}">${this.name}</div>
              <div class="card-path" title="${this.path}">${truncatedPath}</div>
            </div>
          </div>
          <div class="card-meta">
            <div class="meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              <span>${this.pageCount} page${this.pageCount !== 1 ? 's' : ''}</span>
            </div>
            <div class="meta-item annotation-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span>${this.annotationCount}</span>
            </div>
            ${this.reviewDecision ? `
            <div class="review-decision-badge ${this.reviewDecision}" title="Review Decision">
              ${reviewDecisionLabels[this.reviewDecision] || this.reviewDecision}
            </div>
            ` : ''}
            <div class="meta-item" style="margin-left: auto;">
              <span>${formatRelativeTime(this.updatedAt)}</span>
            </div>
          </div>
        </div>
        <button class="delete-btn" title="Remove PDF" aria-label="Remove ${this.name}">
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
    const card = this.shadowRoot.querySelector('.card');
    const deleteBtn = this.shadowRoot.querySelector('.delete-btn');

    card.addEventListener('click', (e) => {
      if (e.target.closest('.delete-btn')) return;
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
