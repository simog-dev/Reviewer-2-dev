import { getCategoryIcon } from '../js/utils.js';

class CategoryFilter extends HTMLElement {
  constructor() {
    super();
  }

  static get observedAttributes() {
    return ['category-id', 'name', 'color', 'icon', 'count', 'active'];
  }

  connectedCallback() {
    this.addEventListeners();
    this.render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue && this.innerHTML) {
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
    this.innerHTML = `
      <button class="category-filter-chip ${this.active ? 'active' : ''}"
              style="--category-filter-color: ${this.color};"
              tabindex="0"
              role="checkbox"
              aria-checked="${this.active}"
              aria-label="Filter by ${this.name}">
        ${getCategoryIcon(this.icon)}
        <span class="name">${this.name}</span>
        <span class="category-filter-count">${this.count}</span>
      </button>
    `;
  }

  addEventListeners() {
    this.addEventListener('click', (e) => {
      if (e.target.closest('.category-filter-chip')) {
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

    this.addEventListener('keydown', (e) => {
      if (e.target.closest('.category-filter-chip') && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        e.target.closest('.category-filter-chip').click();
      }
    });
  }

  setCount(count) {
    this.setAttribute('count', count.toString());
  }
}

customElements.define('category-filter', CategoryFilter);

export default CategoryFilter;
