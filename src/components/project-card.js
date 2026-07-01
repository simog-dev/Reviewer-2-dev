import { formatDate, formatRelativeTime } from '../js/utils.js';

class ProjectCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._project = null;
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
    if (this._project) {
      return this._project;
    }

    try {
      return JSON.parse(this.getAttribute('project') || '{}');
    } catch {
      return {};
    }
  }

  set project(value) {
    this._project = value || {};
    this.render();
    this.addEventListeners();
  }

  render() {
    const project = this.project;
    const papers = Array.isArray(project.papers) ? project.papers : [];
    const completed = papers.length > 0 && papers.every(paper => paper.completed === 1);
    const totalAnnotations = papers.reduce((total, paper) => total + (paper.annotation_count || 0), 0);
    const projectUpdatedLabel = formatRelativeTime(project.updated_at || new Date().toISOString());

    const styles = `
      <style>
        :host {
          display: block;
          box-sizing: border-box;
          height: 100%;
        }

        *,
        *::before,
        *::after {
          box-sizing: inherit;
        }

        .pc-shell {
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-height: 100%;
          height: 100%;
          padding: 18px;
          border: 1px solid rgba(148, 163, 184, 0.26);
          border-radius: 24px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(249, 250, 252, 0.94) 100%);
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
          transition:
            transform 180ms ease,
            box-shadow 180ms ease,
            border-color 180ms ease;
        }

        .pc-shell:hover {
          transform: translateY(-1px);
          box-shadow: 0 18px 36px rgba(15, 23, 42, 0.08);
          border-color: rgba(59, 130, 246, 0.24);
        }

        :host-context(html[data-theme="dark"]) .pc-shell {
          background:
            linear-gradient(180deg, rgba(15, 23, 42, 0.96) 0%, rgba(17, 24, 39, 0.92) 100%);
          border-color: rgba(71, 85, 105, 0.42);
          box-shadow: 0 12px 28px rgba(2, 6, 23, 0.35);
        }

        :host-context(html[data-theme="dark"]) .pc-shell:hover {
          border-color: rgba(96, 165, 250, 0.28);
        }

        .pc-header {
          display: grid;
          grid-template-columns: 40px minmax(0, 1fr) auto;
          gap: 12px;
          align-items: start;
        }

        .pc-project-icon {
          width: 40px;
          height: 40px;
          border-radius: 14px;
          background: rgba(59, 130, 246, 0.1);
          color: var(--color-primary, #2563eb);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .pc-icon-btn svg,
        .pc-paper-meta svg,
        .pc-paper-footer svg,
        .pc-paper-add-slot svg {
          width: 16px;
          height: 16px;
        }

        .pc-paper-icon svg {
          width: 100%;
          height: 100%;
        }

        .pc-project-name {
          color: var(--color-text, #0f172a);
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1rem;
          font-weight: 700;
          line-height: 1.25;
          letter-spacing: -0.02em;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .pc-project-subtitle {
          margin-top: 5px;
          color: var(--color-text-secondary, #475569);
          font-size: 0.84rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .pc-project-submeta {
          margin-top: 4px;
          color: var(--color-text-muted, #64748b);
          font-size: 0.78rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .pc-project-status {
          width: 24px;
          height: 24px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          background-color: ${completed ? '#16a34a' : 'rgba(148, 163, 184, 0.35)'};
          border: 1px solid ${completed ? '#16a34a' : 'rgba(148, 163, 184, 0.24)'};
          box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
        }

        .pc-project-status svg {
          width: 14px;
          height: 14px;
        }

        .pc-summary {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          color: var(--color-text-secondary, #475569);
          font-size: 0.79rem;
        }

        .pc-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          border-radius: 999px;
          padding: 4px 10px;
          background: rgba(248, 250, 252, 0.94);
          font-weight: 600;
        }

        :host-context(html[data-theme="dark"]) .pc-pill {
          background: rgba(15, 23, 42, 0.9);
          border-color: rgba(71, 85, 105, 0.46);
        }

        .pc-decision {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 22px;
          padding: 3px 8px;
          border-radius: 999px;
          border-color: transparent;
          background-color: var(--decision-bg, #2563eb);
          color: white;
          font-size: 0.66rem;
          font-weight: 700;
          text-transform: uppercase;
          line-height: 1;
          letter-spacing: 0.04em;
        }

        .pc-decision.accept { --decision-bg: #16a34a; }
        .pc-decision.minor-revisions { --decision-bg: #d97706; }
        .pc-decision.major-revisions { --decision-bg: #ea580c; }
        .pc-decision.reject { --decision-bg: #dc2626; }

        .pc-paper-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-height: 0;
        }

        .pc-paper {
          border: 1px solid rgba(148, 163, 184, 0.26);
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.95);
          padding: 12px;
          cursor: pointer;
          transition:
            border-color 150ms ease,
            box-shadow 150ms ease,
            transform 150ms ease;
        }

        .pc-paper:hover,
        .pc-paper:focus {
          border-color: rgba(59, 130, 246, 0.35);
          box-shadow: 0 10px 20px rgba(15, 23, 42, 0.05);
          transform: translateY(-1px);
          outline: none;
        }

        :host-context(html[data-theme="dark"]) .pc-paper {
          background: rgba(15, 23, 42, 0.88);
          border-color: rgba(71, 85, 105, 0.42);
        }

        .pc-paper-top {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }

        .pc-paper-icon {
          width: 18px;
          height: 18px;
          color: #dc2626;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .pc-paper-main {
          min-width: 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .pc-paper-name-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          min-width: 0;
        }

        .pc-paper-name {
          min-width: 0;
          flex: 1;
          color: var(--color-text, #0f172a);
          font-size: 0.9rem;
          font-weight: 600;
          line-height: 1.35;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .pc-paper-actions {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          opacity: 0;
          margin-left: auto;
          transition: opacity 150ms ease;
        }

        .pc-paper:hover .pc-paper-actions,
        .pc-paper:focus-within .pc-paper-actions {
          opacity: 1;
        }

        .pc-paper-action {
          border: none;
          background: transparent;
          color: var(--color-text-muted, #64748b);
          border-radius: 6px;
          padding: 3px;
          cursor: pointer;
        }

        .pc-paper-action:hover {
          color: var(--color-text, #0f172a);
          background-color: rgba(148, 163, 184, 0.12);
        }

        .pc-paper-delete:hover {
          color: #dc2626;
          background-color: rgba(220, 38, 38, 0.08);
        }

        .pc-paper-meta {
          display: flex;
          align-items: center;
          width: 100%;
          flex-wrap: wrap;
          gap: 10px;
          color: var(--color-text-muted, #64748b);
          font-size: 0.78rem;
        }

        .pc-paper-meta span {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          min-width: 0;
        }

        .pc-paper-footer {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
          color: var(--color-text-secondary, #475569);
          font-size: 0.78rem;
        }

        .pc-paper-footer-left {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          min-width: 0;
        }

        .pc-paper-footer-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
          flex-shrink: 0;
        }

        .pc-paper-updated,
        .pc-paper-due {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
        }

        .pc-paper-meta-decision {
          margin-left: auto;
        }

        .pc-paper-status {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-weight: 600;
        }

        .pc-paper-status.completed {
          color: #16a34a;
        }

        .pc-paper-status.reviewing {
          color: var(--color-primary, #2563eb);
        }

        .pc-paper-add-slot {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 74px;
          border: 1px dashed rgba(148, 163, 184, 0.38);
          border-radius: 16px;
          background: transparent;
          color: var(--color-primary, #2563eb);
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          transition:
            background-color 150ms ease,
            border-color 150ms ease,
            transform 150ms ease;
        }

        .pc-paper-add-slot:hover {
          border-color: rgba(59, 130, 246, 0.4);
          background: rgba(59, 130, 246, 0.06);
          transform: translateY(-1px);
        }

        .pc-card-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: auto;
          padding-top: 2px;
          flex-wrap: wrap;
        }

        .pc-action-btn {
          border: 1px solid rgba(148, 163, 184, 0.28);
          background: rgba(255, 255, 255, 0.88);
          color: var(--color-text-secondary, #475569);
          border-radius: 12px;
          height: 38px;
          padding: 0 14px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-size: 0.84rem;
          font-weight: 600;
          transition:
            transform 150ms ease,
            border-color 150ms ease,
            background-color 150ms ease,
            color 150ms ease,
            box-shadow 150ms ease;
        }

        .pc-action-btn:hover {
          transform: translateY(-1px);
          color: var(--color-text, #0f172a);
          border-color: rgba(59, 130, 246, 0.28);
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 10px 20px rgba(15, 23, 42, 0.04);
        }

        :host-context(html[data-theme="dark"]) .pc-action-btn {
          background: rgba(15, 23, 42, 0.9);
          border-color: rgba(71, 85, 105, 0.42);
          color: var(--color-text-secondary, #94a3b8);
        }

        :host-context(html[data-theme="dark"]) .pc-action-btn:hover {
          color: var(--color-text, #e2e8f0);
          background: rgba(15, 23, 42, 0.98);
        }

        .pc-link-btn {
          margin-left: auto;
        }
      </style>
    `;

    const paperAddSlot = papers.length < 2 ? `
      <button class="pc-paper-add-slot" type="button" title="Add paper">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add a paper
      </button>
    ` : '';

    this.shadowRoot.innerHTML = `
      ${styles}
      <article class="pc-shell">
        <div class="pc-header">
          <div class="pc-project-icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="#EEF4FF"/>
              <path d="M8 10.5C8 9.67157 8.67157 9 9.5 9H14L16 11.4H22.5C23.3284 11.4 24 12.0716 24 12.9V21.5C24 22.3284 23.3284 23 22.5 23H9.5C8.67157 23 8 22.3284 8 21.5V10.5Z" stroke="#0B63FF" stroke-width="1.8" stroke-linejoin="round"/>
              <path d="M8 15H24" stroke="#0B63FF" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </div>
          <div>
            <div class="pc-project-name" title="${this.escape(project.name || 'Untitled project')}">${this.escape(project.name || 'Untitled project')}</div>
            <div class="pc-project-subtitle">Updated ${this.escape(projectUpdatedLabel)}</div>
            ${project.conference ? `<div class="pc-project-submeta" title="${this.escape(project.conference)}">${this.escape(project.conference)}</div>` : ''}
          </div>
          <div class="pc-project-status" title="${completed ? 'Project completed' : 'Project incomplete'}">
            ${completed ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
          </div>
        </div>

        <div class="pc-summary">
          <span class="pc-pill">${papers.length} paper${papers.length !== 1 ? 's' : ''}</span>
          <span class="pc-pill">${totalAnnotations} note${totalAnnotations !== 1 ? 's' : ''}</span>
        </div>

        <div class="pc-paper-list">
          ${papers.map(paper => this.renderPaper(paper)).join('')}
          ${paperAddSlot}
        </div>

        <div class="pc-card-actions">
          <button class="pc-action-btn edit-project-btn" title="Edit project">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
            </svg>
            Edit
          </button>
          <button class="pc-action-btn add-paper-btn" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add a paper
          </button>
          ${project.submission_link ? `
            <button class="pc-action-btn pc-link-btn" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Send review
            </button>
          ` : ''}
        </div>
      </article>
    `;
  }

  renderPaper(paper) {
    const decisionLabels = {
      accept: 'Accept',
      'minor-revisions': 'Minor',
      'major-revisions': 'Major',
      reject: 'Reject'
    };

    const statusLabel = paper.completed === 1 ? 'Completed' : 'In review';
    const statusIcon = paper.completed === 1
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>';
    const dueLabel = paper.review_deadline
      ? `Due ${formatDate(paper.review_deadline)}`
      : '';

    return `
      <div class="pc-paper" tabindex="0" role="button" data-paper-id="${this.escape(paper.id)}" aria-label="Open ${this.escape(paper.name)}">
        <div class="pc-paper-top">
          <span class="pc-paper-icon" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6.5 3H14L18 7V20C18 20.5523 17.5523 21 17 21H6.5C5.94772 21 5.5 20.5523 5.5 20V4C5.5 3.44772 5.94772 3 6.5 3Z" fill="#E11919"/>
              <path d="M14 3V7H18" fill="#F85A5A"/>
              <path d="M8 14.5V10.5H9.35C10.15 10.5 10.65 10.95 10.65 11.65C10.65 12.35 10.15 12.8 9.35 12.8H8.8V14.5H8ZM8.8 12.15H9.25C9.65 12.15 9.85 11.95 9.85 11.65C9.85 11.35 9.65 11.15 9.25 11.15H8.8V12.15Z" fill="white"/>
              <path d="M11.25 14.5V10.5H12.6C13.75 10.5 14.45 11.25 14.45 12.5C14.45 13.75 13.75 14.5 12.6 14.5H11.25ZM12.05 13.8H12.55C13.25 13.8 13.65 13.3 13.65 12.5C13.65 11.7 13.25 11.2 12.55 11.2H12.05V13.8Z" fill="white"/>
              <path d="M15.05 14.5V10.5H17.35V11.2H15.85V12.2H17.15V12.9H15.85V14.5H15.05Z" fill="white"/>
            </svg>
          </span>
          <span class="pc-paper-main">
            <span class="pc-paper-name-row">
              <span class="pc-paper-name" title="${this.escape(paper.name)}">${this.escape(paper.name)}</span>
              <span class="pc-paper-actions">
                <button class="pc-paper-action pc-paper-edit" data-paper="${this.escape(JSON.stringify(paper))}" title="Edit paper" aria-label="Edit ${this.escape(paper.name)}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
                    <path d="M12 20h9"/>
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                  </svg>
                </button>
                <button class="pc-paper-action pc-paper-delete" data-paper-id="${this.escape(paper.id)}" data-paper-name="${this.escape(paper.name)}" title="Remove paper" aria-label="Remove ${this.escape(paper.name)}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </span>
            </span>
            <span class="pc-paper-meta">
              <span>${paper.page_count || 0} pages</span>
              <span>${paper.annotation_count || 0} annotations</span>
              ${paper.review_decision ? `<span class="pc-pill pc-decision pc-paper-meta-decision ${this.escape(paper.review_decision)}">${this.escape(decisionLabels[paper.review_decision] || paper.review_decision)}</span>` : ''}
            </span>
            <span class="pc-paper-footer">
              <span class="pc-paper-footer-left">
                <span class="pc-paper-updated">Updated ${this.escape(formatRelativeTime(paper.updated_at || new Date().toISOString()))}</span>
                ${paper.review_deadline ? `<span class="pc-paper-due">${this.escape(dueLabel)}</span>` : ''}
              </span>
              <span class="pc-paper-footer-right">
                <span class="pc-paper-status ${paper.completed === 1 ? 'completed' : 'reviewing'}">
                  ${statusIcon}
                  ${statusLabel}
                </span>
              </span>
            </span>
          </span>
        </div>
      </div>
    `;
  }

  addEventListeners() {
    this.shadowRoot.querySelectorAll('.pc-paper').forEach(paperEl => {
      const open = () => {
        this.dispatchEvent(new CustomEvent('project-paper-open', {
          bubbles: true,
          composed: true,
          detail: { id: paperEl.dataset.paperId }
        }));
      };

      paperEl.addEventListener('click', open);
      paperEl.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });
    });

    this.shadowRoot.querySelectorAll('.pc-paper-delete').forEach(deleteBtn => {
      deleteBtn.addEventListener('click', event => {
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

    this.shadowRoot.querySelectorAll('.pc-paper-edit').forEach(editBtn => {
      editBtn.addEventListener('click', event => {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent('paper-edit', {
          bubbles: true,
          composed: true,
          detail: { paper: JSON.parse(editBtn.dataset.paper) }
        }));
      });
    });

    this.shadowRoot.querySelectorAll('.pc-paper-add-slot').forEach(addSlot => {
      addSlot.addEventListener('click', event => {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent('project-paper-add', {
          bubbles: true,
          composed: true,
          detail: { projectId: this.project.id }
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

    const linkBtn = this.shadowRoot.querySelector('.pc-link-btn');
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
