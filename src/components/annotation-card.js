import { formatRelativeTime, truncateText, getCategoryIcon } from '../js/utils.js';

class AnnotationCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  static get observedAttributes() {
    return ['annotation-id', 'category-name', 'category-color', 'category-icon',
            'page-number', 'selected-text', 'comment', 'created-at', 'highlight-rects'];
  }

  connectedCallback() {
    this.render();
    this.addEventListeners();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue && this.shadowRoot.innerHTML) {
      this.render();
    }
  }

  get annotationId() {
    return this.getAttribute('annotation-id');
  }

  get categoryName() {
    return this.getAttribute('category-name') || 'Unknown';
  }

  get categoryColor() {
    return this.getAttribute('category-color') || '#666';
  }

  get categoryIcon() {
    return this.getAttribute('category-icon') || 'info';
  }

  get pageNumber() {
    return parseInt(this.getAttribute('page-number') || '1', 10);
  }

  get selectedText() {
    return this.getAttribute('selected-text') || '';
  }

  get comment() {
    return this.getAttribute('comment') || '';
  }

  get createdAt() {
    return this.getAttribute('created-at') || new Date().toISOString();
  }

  get highlightRects() {
    return this.getAttribute('highlight-rects') || '[]';
  }

  /**
   * Format selected text to show start and end
   * @param {string} text - The full selected text
   * @returns {string} Formatted text as "(start...end)"
   */
  formatSelectedTextPreview(text) {
    if (!text) return '';

    // Remove extra whitespace and newlines
    const cleanText = text.replace(/\s+/g, ' ').trim();

    // If text is short enough, show it all
    if (cleanText.length <= 60) {
      return `${cleanText}`;
    }

    // Show first ~30 chars and last ~30 chars
    const startLength = 30;
    const endLength = 30;

    const start = cleanText.substring(0, startLength).trim();
    const end = cleanText.substring(cleanText.length - endLength).trim();

    return `${start} [...] ${end}`;
  }

  render() {
    const styles = `
      <style>
        :host {
          display: block;
        }

        .card {
          background-color: var(--color-bg-tertiary, #252525);
          border: 1px solid var(--color-border, #333333);
          border-radius: var(--radius-md, 8px);
          padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
          margin-bottom: var(--spacing-sm, 8px);
          cursor: pointer;
          transition: all 150ms ease;
          border-left: 3px solid ${this.categoryColor};
        }

        .card:hover {
          background-color: var(--color-bg-hover, #2a2a2a);
          border-color: var(--color-border-light, #404040);
        }

        .card:focus {
          outline: 2px solid var(--color-primary, #3b82f6);
          outline-offset: 2px;
        }

        .card.active {
          background-color: var(--color-primary-light, rgba(59, 130, 246, 0.1));
          border-color: var(--color-primary, #3b82f6);
        }

        .card-header {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm, 8px);
          margin-bottom: var(--spacing-xs, 4px);
        }

        .category-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          background-color: ${this.categoryColor}20;
          color: ${this.categoryColor};
          border-radius: var(--radius-full, 9999px);
          font-size: 0.6875rem;
          font-weight: 500;
        }

        .category-badge svg {
          width: 12px;
          height: 12px;
        }

        .page-badge {
          font-size: 0.6875rem;
          color: var(--color-text-muted, #737373);
          background-color: var(--color-bg-secondary, #1a1a1a);
          padding: 2px 6px;
          border-radius: var(--radius-sm, 4px);
        }

        .card-actions {
          margin-left: auto;
          display: flex;
          gap: 2px;
          opacity: 0;
          transition: opacity 150ms ease;
        }

        .card:hover .card-actions {
          opacity: 1;
        }

        .action-btn {
          background: none;
          border: none;
          color: var(--color-text-muted, #737373);
          cursor: pointer;
          padding: 4px;
          border-radius: var(--radius-sm, 4px);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .action-btn:hover {
          background-color: var(--color-bg-secondary, #1a1a1a);
          color: var(--color-text, #e5e5e5);
        }

        .action-btn.delete:hover {
          background-color: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }

        .action-btn svg {
          width: 14px;
          height: 14px;
        }

        .card-content {
          margin-bottom: var(--spacing-xs, 4px);
        }

        .selected-text {
          font-size: 0.8125rem;
          color: var(--color-text-secondary, #a3a3a3);
          font-style: italic;
          margin-bottom: 4px;
          line-height: 1.4;
        }

        .comment {
          font-size: 0.875rem;
          color: var(--color-text, #e5e5e5);
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .timestamp {
          font-size: 0.6875rem;
          color: var(--color-text-muted, #737373);
        }
        .note-icon {
          width: 14px;
          height: 14px;
          margin-left: 4px;
          color: var(--color-text-muted, #737373);
        }
      </style>
    `;

    // Detect free notes
    const isFreeNote = !this.selectedText && JSON.parse(this.highlightRects).length === 0;

    // Format display text based on annotation type
    let displayText;
    if (isFreeNote) {
      displayText = this.comment || 'Note without highlight';
    } else if (this.selectedText && !this.comment) {
      // Show formatted preview if there's only selected text
      displayText = this.formatSelectedTextPreview(this.selectedText);
    } else if (this.comment) {
      displayText = this.comment;
    } else {
      displayText = 'No content';
    }

    // Show selected text preview if there's both selected text and comment
    const showSelectedTextPreview = this.comment && this.selectedText;

    // Note icon for free notes
    const noteIcon = isFreeNote ? `
      <svg class="note-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" title="Free note">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
    ` : '';

    this.shadowRoot.innerHTML = `
      ${styles}
      <div class="card" tabindex="0" role="button" aria-label="View annotation on page ${this.pageNumber}">
        <div class="card-header">
          <span class="category-badge">
            ${getCategoryIcon(this.categoryIcon)}
            ${this.categoryName}
          </span>
          <span class="page-badge">Page ${this.pageNumber}</span>
          ${noteIcon}
          <div class="card-actions">
            <button class="action-btn edit" title="Edit" aria-label="Edit annotation">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="action-btn delete" title="Delete" aria-label="Delete annotation">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="card-content">
          ${showSelectedTextPreview ? `<div class="selected-text">${this.formatSelectedTextPreview(this.selectedText)}</div>` : ''}
          <div class="comment">${displayText}</div>
        </div>
        <div class="card-footer">
          <span class="timestamp">${formatRelativeTime(this.createdAt)}</span>
        </div>
      </div>
    `;
  }

  addEventListeners() {
    const card = this.shadowRoot.querySelector('.card');
    const editBtn = this.shadowRoot.querySelector('.action-btn.edit');
    const deleteBtn = this.shadowRoot.querySelector('.action-btn.delete');

    card.addEventListener('click', (e) => {
      if (e.target.closest('.action-btn')) return;

      // Check if this is a free note
      const isFreeNote = !this.selectedText && JSON.parse(this.highlightRects).length === 0;

      this.dispatchEvent(new CustomEvent('annotation-click', {
        bubbles: true,
        composed: true,
        detail: { id: this.annotationId, isFreeNote: isFreeNote }
      }));
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.dispatchEvent(new CustomEvent('annotation-click', {
          bubbles: true,
          composed: true,
          detail: { id: this.annotationId }
        }));
      }
    });

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dispatchEvent(new CustomEvent('annotation-edit', {
        bubbles: true,
        composed: true,
        detail: { id: this.annotationId }
      }));
    });

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dispatchEvent(new CustomEvent('annotation-delete', {
        bubbles: true,
        composed: true,
        detail: { id: this.annotationId }
      }));
    });
  }

  setActive(active) {
    const card = this.shadowRoot.querySelector('.card');
    if (active) {
      card.classList.add('active');
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      card.classList.remove('active');
    }
  }

  flash() {
    const card = this.shadowRoot.querySelector('.card');
    card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 900);
  }
}

customElements.define('annotation-card', AnnotationCard);

export default AnnotationCard;
