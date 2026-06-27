import { formatRelativeTime } from '../js/utils.js';

class ProjectCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  static get observedAttributes() {
    return ['project'];
  }

  connectedCallback() {
    this.render();
    this.addEventListeners();
  }

  attributeChangedCallback() {
    if (this.shadowRoot.innerHTML) {
      this.render();
      this.addEventListeners();
    }
  }

  get project() {
    try {
      return JSON.parse(this.getAttribute('project') || '{}');
    } catch {
      return {};
    }
  }

  render() {
    const project = this.project;
    const papers = Array.isArray(project.papers) ? project.papers : [];
    const completed = papers.length > 0 && papers.every(paper => paper.completed === 1);
    const totalAnnotations = papers.reduce((total, paper) => total + (paper.annotation_count || 0), 0);
    const reviewDecision = papers.length === 1 ? papers[0].review_decision : null;

    const styles = `
      <style>
        :host {
          display: block;
        }

        .project-card {
          display: flex;
          flex-direction: column;
          gap: 14px;
          background-color: var(--color-bg-secondary, #1a1a1a);
          border: 1px solid var(--color-border, #333333);
          border-radius: var(--radius-md, 8px);
          padding: 16px;
          min-height: 100%;
          transition: border-color 150ms ease, background-color 150ms ease, transform 150ms ease;
        }

        .project-card:hover {
          background-color: var(--color-bg-hover, #2a2a2a);
          border-color: var(--color-border-light, #404040);
          transform: translateY(-2px);
        }

        .project-header {
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: start;
        }

        .project-icon {
          width: 42px;
          height: 42px;
          border-radius: 8px;
          background: var(--color-primary-light, rgba(59, 130, 246, 0.1));
          color: var(--color-primary, #3b82f6);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .project-icon svg,
        .icon-btn svg,
        .paper-meta svg {
          width: 16px;
          height: 16px;
        }

        .project-name {
          color: var(--color-text, #e5e5e5);
          font-size: 1rem;
          font-weight: 700;
          line-height: 1.25;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .project-subtitle {
          margin-top: 3px;
          color: var(--color-text-muted, #737373);
          font-size: 0.75rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .status {
          width: 24px;
          height: 24px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          background-color: ${completed ? '#10b981' : 'var(--color-bg-tertiary, #262626)'};
          border: 1px solid ${completed ? '#10b981' : 'var(--color-border, #333333)'};
        }

        .meta-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          color: var(--color-text-secondary, #a3a3a3);
          font-size: 0.75rem;
        }

        .pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: 1px solid var(--color-border, #333333);
          border-radius: 999px;
          padding: 3px 8px;
          background-color: var(--color-bg, #111111);
        }

        .decision {
          border-color: transparent;
          background-color: var(--decision-bg, #2563eb);
          color: white;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }

        .decision.accept { --decision-bg: #047857; }
        .decision.minor-revisions { --decision-bg: #a16207; }
        .decision.major-revisions { --decision-bg: #c2410c; }
        .decision.reject { --decision-bg: #b91c1c; }

        .paper-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .paper {
          border: 1px solid var(--color-border, #333333);
          border-radius: 6px;
          background-color: var(--color-bg, #111111);
          padding: 10px;
          cursor: pointer;
        }

        .paper:hover,
        .paper:focus {
          border-color: var(--color-primary, #3b82f6);
          outline: none;
        }

        .paper-top {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .paper-name {
          min-width: 0;
          flex: 1;
          color: var(--color-text, #e5e5e5);
          font-size: 0.875rem;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .paper-check {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background-color: var(--color-bg-tertiary, #262626);
          color: var(--color-text-muted, #737373);
        }

        .paper-check.done {
          background-color: #10b981;
          color: white;
        }

        .paper-actions {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          opacity: 0;
        }

        .paper:hover .paper-actions,
        .paper:focus-within .paper-actions {
          opacity: 1;
        }

        .paper-action {
          border: none;
          background: transparent;
          color: var(--color-text-muted, #737373);
          border-radius: 4px;
          padding: 3px;
          cursor: pointer;
        }

        .paper-action:hover {
          color: var(--color-text, #e5e5e5);
          background-color: var(--color-bg-hover, #2a2a2a);
        }

        .paper-delete:hover {
          color: var(--color-error, #ef4444);
          background-color: rgba(239, 68, 68, 0.1);
        }

        .paper-meta {
          margin-top: 7px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--color-text-muted, #737373);
          font-size: 0.75rem;
        }

        .paper-meta span {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          min-width: 0;
        }

        .card-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: auto;
          padding-top: 4px;
        }

        .action-btn {
          border: 1px solid var(--color-border, #333333);
          background: transparent;
          color: var(--color-text-secondary, #a3a3a3);
          border-radius: 6px;
          height: 32px;
          padding: 0 10px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          font-size: 0.8125rem;
          font-weight: 600;
        }

        .action-btn:hover {
          color: var(--color-text, #e5e5e5);
          border-color: var(--color-border-light, #404040);
          background-color: var(--color-bg-hover, #2a2a2a);
        }

        .link-btn {
          margin-left: auto;
        }
      </style>
    `;

    const decisionLabels = {
      'accept': 'Accept',
      'minor-revisions': 'Minor',
      'major-revisions': 'Major',
      'reject': 'Reject'
    };

    this.shadowRoot.innerHTML = `
      ${styles}
      <article class="project-card">
        <div class="project-header">
          <div class="project-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            </svg>
          </div>
          <div>
            <div class="project-name" title="${this.escape(project.name || 'Untitled project')}">${this.escape(project.name || 'Untitled project')}</div>
            <div class="project-subtitle" title="${this.escape(project.conference || '')}">${this.escape(project.conference || `${papers.length} paper${papers.length !== 1 ? 's' : ''}`)}</div>
          </div>
          <div class="status" title="${completed ? 'Project completed' : 'Project incomplete'}">
            ${completed ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
          </div>
        </div>

        <div class="meta-row">
          <span class="pill">${papers.length} paper${papers.length !== 1 ? 's' : ''}</span>
          <span class="pill">${totalAnnotations} annotation${totalAnnotations !== 1 ? 's' : ''}</span>
          ${reviewDecision ? `<span class="pill decision ${this.escape(reviewDecision)}">${this.escape(decisionLabels[reviewDecision] || reviewDecision)}</span>` : ''}
        </div>

        <div class="paper-list">
          ${papers.map(paper => this.renderPaper(paper)).join('')}
        </div>

        <div class="card-actions">
          <button class="action-btn edit-project-btn" title="Edit project">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
            </svg>
            Edit
          </button>
          <button class="action-btn add-paper-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add paper
          </button>
          ${project.submission_link ? `
            <button class="action-btn link-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Platform
            </button>
          ` : ''}
        </div>
      </article>
    `;
  }

  renderPaper(paper) {
    return `
      <div class="paper" tabindex="0" role="button" data-paper-id="${this.escape(paper.id)}" aria-label="Open ${this.escape(paper.name)}">
        <div class="paper-top">
          <span class="paper-check ${paper.completed === 1 ? 'done' : ''}">
            ${paper.completed === 1 ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
          </span>
          <span class="paper-name" title="${this.escape(paper.name)}">${this.escape(paper.name)}</span>
          <span class="paper-actions">
            <button class="paper-action paper-edit" data-paper="${this.escape(JSON.stringify(paper))}" title="Edit paper" aria-label="Edit ${this.escape(paper.name)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
              </svg>
            </button>
            <button class="paper-action paper-delete" data-paper-id="${this.escape(paper.id)}" data-paper-name="${this.escape(paper.name)}" title="Remove paper" aria-label="Remove ${this.escape(paper.name)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </span>
        </div>
        <div class="paper-meta">
          <span>${paper.page_count || 0} pages</span>
          <span>${paper.annotation_count || 0} annotations</span>
          ${paper.review_deadline ? `<span>Due ${this.escape(paper.review_deadline)}</span>` : ''}
          <span>${formatRelativeTime(paper.updated_at || new Date().toISOString())}</span>
        </div>
      </div>
    `;
  }

  addEventListeners() {
    this.shadowRoot.querySelectorAll('.paper').forEach(paperEl => {
      const open = () => {
        this.dispatchEvent(new CustomEvent('project-paper-open', {
          bubbles: true,
          composed: true,
          detail: { id: paperEl.dataset.paperId }
        }));
      };
      paperEl.addEventListener('click', open);
      paperEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });
    });

    this.shadowRoot.querySelectorAll('.paper-delete').forEach(deleteBtn => {
      deleteBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent('pdf-delete', {
          bubbles: true,
          composed: true,
          detail: {
            id: deleteBtn.dataset.paperId,
            name: deleteBtn.dataset.paperName
          }
        }));
      });
    });

    this.shadowRoot.querySelectorAll('.paper-edit').forEach(editBtn => {
      editBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent('paper-edit', {
          bubbles: true,
          composed: true,
          detail: { paper: JSON.parse(editBtn.dataset.paper) }
        }));
      });
    });

    const addPaperBtn = this.shadowRoot.querySelector('.add-paper-btn');
    addPaperBtn?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('project-paper-add', {
        bubbles: true,
        composed: true,
        detail: { projectId: this.project.id }
      }));
    });

    const editProjectBtn = this.shadowRoot.querySelector('.edit-project-btn');
    editProjectBtn?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('project-edit', {
        bubbles: true,
        composed: true,
        detail: { project: this.project }
      }));
    });

    const linkBtn = this.shadowRoot.querySelector('.link-btn');
    linkBtn?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('project-platform-open', {
        bubbles: true,
        composed: true,
        detail: { url: this.project.submission_link }
      }));
    });
  }

  escape(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

customElements.define('project-card', ProjectCard);

export default ProjectCard;
