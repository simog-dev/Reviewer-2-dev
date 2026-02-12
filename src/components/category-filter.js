import { getCategoryIcon } from '../js/utils.js';

class CategoryFilter extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  static get observedAttributes() {
    return ['category-id', 'name', 'color', 'icon', 'count', 'active'];
  }

  connectedCallback() {
    this.addEventListeners();  // Add listeners first (to shadowRoot)
    this.render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue && this.shadowRoot.innerHTML) {
      this.render();
    }
  }

  get categoryId() {
    return parseInt(this.getAttribute('category-id') || '0', 10);
  }

  get name() {
    return this.getAttribute('name') || 'Unknown';
  }

  get color() {
    return this.getAttribute('color') || '#666';
  }

  get icon() {
    return this.getAttribute('icon') || 'info';
  }

  get count() {
    return parseInt(this.getAttribute('count') || '0', 10);
  }

  get active() {
    return this.hasAttribute('active');
  }

  set active(value) {
    if (value) {
      this.setAttribute('active', '');
    } else {
      this.removeAttribute('active');
    }
  }

  render() {
    const styles = `
      <style>
        :host {
          display: inline-block;
        }

        .filter-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          background-color: var(--color-bg-tertiary, #252525);
          border: 1px solid var(--color-border, #333333);
          border-radius: var(--radius-full, 9999px);
          font-size: 0.75rem;
          color: var(--color-text-secondary, #a3a3a3);
          cursor: pointer;
          transition: all 150ms ease;
          user-select: none;
        }

        .filter-chip:hover {
          background-color: var(--color-bg-hover, #2a2a2a);
          border-color: var(--color-border-light, #404040);
        }

        .filter-chip:focus {
          outline: 2px solid var(--color-primary, #3b82f6);
          outline-offset: 2px;
        }

        .filter-chip.active {
          background-color: ${this.color}20;
          border-color: ${this.color};
          color: ${this.color};
        }

        .filter-chip svg {
          width: 12px;
          height: 12px;
        }

        .count {
          background-color: ${this.active ? this.color + '40' : 'var(--color-bg-secondary, #1a1a1a)'};
          padding: 1px 5px;
          border-radius: var(--radius-full, 9999px);
          font-size: 0.6875rem;
          min-width: 16px;
          text-align: center;
        }
      </style>
    `;

    this.shadowRoot.innerHTML = `
      ${styles}
      <button class="filter-chip ${this.active ? 'active' : ''}"
              tabindex="0"
              role="checkbox"
              aria-checked="${this.active}"
              aria-label="Filter by ${this.name}">
        ${getCategoryIcon(this.icon)}
        <span class="name">${this.name}</span>
        <span class="count">${this.count}</span>
      </button>
    `;
  }

  addEventListeners() {
    // Use event delegation on shadowRoot (survives re-renders)
    this.shadowRoot.addEventListener('click', (e) => {
      if (e.target.closest('.filter-chip')) {
        // Don't toggle internally - let parent control the state
        // Just dispatch the event with current state
        this.dispatchEvent(new CustomEvent('filter-change', {
          bubbles: true,
          composed: true,
          detail: {
            categoryId: this.categoryId,
            active: this.active  // Current state, parent will update it
          }
        }));
      }
    });

    this.shadowRoot.addEventListener('keydown', (e) => {
      if (e.target.closest('.filter-chip') && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        e.target.closest('.filter-chip').click();
      }
    });
  }

  setCount(count) {
    this.setAttribute('count', count.toString());
  }
}

customElements.define('category-filter', CategoryFilter);

export default CategoryFilter;
