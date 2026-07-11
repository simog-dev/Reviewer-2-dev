import { formatRelativeTime, truncateText, getCategoryIcon } from '../js/utils.js';

class AnnotationCard extends HTMLElement {
  constructor() {
    super();
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
    if (oldValue !== newValue && this.innerHTML) {
      this.render();
      this.addEventListeners();
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

  getCategoryContrastColor() {
    const hex = this.categoryColor.replace('#', '');
    if (![3, 6].includes(hex.length) || !/^[0-9a-f]+$/i.test(hex)) {
      return '#ffffff';
    }

    const normalized = hex.length === 3
      ? hex.split('').map(value => value + value).join('')
      : hex;
    const channels = [0, 2, 4].map(index => parseInt(normalized.slice(index, index + 2), 16) / 255);
    const luminance = channels.reduce((total, channel, index) => {
      const linear = channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
      return total + linear * [0.2126, 0.7152, 0.0722][index];
    }, 0);

    return luminance > 0.42 ? '#171717' : '#ffffff';
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
      <svg class="annotation-card__note-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" title="Free note">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
    ` : '';

    this.innerHTML = `
      <div class="annotation-card__card"
           style="--annotation-category-color: ${this.categoryColor}; --annotation-category-contrast-color: ${this.getCategoryContrastColor()};"
           tabindex="0"
           role="button"
           aria-label="View annotation on page ${this.pageNumber}">
        <div class="annotation-card__header">
          <span class="annotation-card__category-badge">
            ${getCategoryIcon(this.categoryIcon)}
            ${this.categoryName}
          </span>
          <span class="annotation-card__page-badge">Page ${this.pageNumber}</span>
          ${noteIcon}
          <div class="annotation-card__actions">
            <button class="annotation-card__action annotation-card__action--edit" title="Edit" aria-label="Edit annotation">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="annotation-card__action annotation-card__action--delete" title="Delete" aria-label="Delete annotation">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="annotation-card__content">
          ${showSelectedTextPreview ? `<div class="annotation-card__selected-text">${this.formatSelectedTextPreview(this.selectedText)}</div>` : ''}
          <div class="annotation-card__comment">${displayText}</div>
        </div>
        <div class="annotation-card__footer">
          <span class="annotation-card__timestamp">${formatRelativeTime(this.createdAt)}</span>
        </div>
      </div>
    `;
  }

  addEventListeners() {
    const card = this.querySelector('.annotation-card__card');
    const editBtn = this.querySelector('.annotation-card__action--edit');
    const deleteBtn = this.querySelector('.annotation-card__action--delete');

    card.addEventListener('click', (e) => {
      if (e.target.closest('.annotation-card__action')) return;

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
    const card = this.querySelector('.annotation-card__card');
    if (active) {
      card.classList.add('active');
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      card.classList.remove('active');
    }
  }

  flash() {
    const card = this.querySelector('.annotation-card__card');
    card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 900);
  }
}

customElements.define('annotation-card', AnnotationCard);

export default AnnotationCard;
