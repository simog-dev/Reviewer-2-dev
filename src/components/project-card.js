import { formatDate, formatRelativeTime } from '../js/utils.js';

class ProjectCard extends HTMLElement {
  constructor() {
    super();
    this._project = null;
    this._paperPage = 0;
    this._projectId = null;
  }

  static get observedAttributes() {
    return ['project'];
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
    if (this._projectId !== this._project.id) {
      this._paperPage = 0;
      this._projectId = this._project.id || null;
    }
    this.render();
    this.addEventListeners();
  }

  render() {
    const project = this.project;
    const papers = Array.isArray(project.papers) ? project.papers : [];
    const sortedPapers = this.getSortedPapers(papers);
    const pageSize = 2;
    const pageCount = Math.max(1, Math.ceil(sortedPapers.length / pageSize));
    this._paperPage = Math.min(Math.max(this._paperPage, 0), pageCount - 1);
    const pageStart = this._paperPage * pageSize;
    const visiblePapers = sortedPapers.slice(pageStart, pageStart + pageSize);
    const completed = papers.length > 0 && papers.every(paper => paper.completed === 1);
    const totalAnnotations = papers.reduce((total, paper) => total + (paper.annotation_count || 0), 0);
    const projectUpdatedLabel = formatRelativeTime(project.updated_at || new Date().toISOString());


    const pagination = pageCount > 1 ? `
      <div class="pc-pagination" aria-label="Paper pages">
        <span class="pc-pagination-count">Page ${this._paperPage + 1} of ${pageCount}</span>
        <span class="pc-pagination-actions">
          <button class="pc-page-btn pc-page-prev" type="button" ${this._paperPage === 0 ? 'disabled' : ''} aria-label="Previous papers">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <button class="pc-page-btn pc-page-next" type="button" ${this._paperPage >= pageCount - 1 ? 'disabled' : ''} aria-label="Next papers">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </span>
      </div>
    ` : '';

    const paperAddSlot = papers.length < pageSize ? `
      <button class="pc-paper-add-slot" type="button" title="Add paper">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add a paper
      </button>
    ` : '';

    this.innerHTML = `
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
          <div class="pc-project-status ${completed ? 'completed' : 'incomplete'}" title="${completed ? 'Project completed' : 'Project incomplete'}">
            ${completed ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
          </div>
        </div>

        <div class="pc-summary">
          <span class="pc-pill">${papers.length} paper${papers.length !== 1 ? 's' : ''}</span>
          <span class="pc-pill">${totalAnnotations} note${totalAnnotations !== 1 ? 's' : ''}</span>
        </div>

        <div class="pc-paper-list">
          ${visiblePapers.map(paper => this.renderPaper(paper)).join('')}
          ${paperAddSlot}
        </div>
        ${pagination}

        <div class="pc-card-actions">
          <button class="btn btn--secondary pc-action-btn edit-project-btn" title="Edit project">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
            </svg>
            Edit
          </button>
          <button class="btn btn--secondary pc-action-btn add-paper-btn" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add a paper
          </button>
          ${project.submission_link ? `
            <button class="btn btn--secondary pc-action-btn pc-link-btn" type="button">
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
                ${paper.review_deadline ? `<span class="pc-paper-due"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>${this.escape(dueLabel)}</span>` : ''}
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

  getSortedPapers(papers) {
    return [...papers].sort((left, right) => {
      const leftCreated = Date.parse(left.created_at || '') || 0;
      const rightCreated = Date.parse(right.created_at || '') || 0;
      if (leftCreated !== rightCreated) return rightCreated - leftCreated;

      const leftUpdated = Date.parse(left.updated_at || '') || 0;
      const rightUpdated = Date.parse(right.updated_at || '') || 0;
      if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;

      return String(right.name || '').localeCompare(String(left.name || ''));
    });
  }

  setPaperPage(page) {
    if (page === this._paperPage) return;
    this._paperPage = page;
    this.render();
    this.addEventListeners();
  }

  addEventListeners() {
    this.querySelectorAll('.pc-paper').forEach(paperEl => {
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

    this.querySelectorAll('.pc-paper-delete').forEach(deleteBtn => {
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

    this.querySelectorAll('.pc-paper-edit').forEach(editBtn => {
      editBtn.addEventListener('click', event => {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent('paper-edit', {
          bubbles: true,
          composed: true,
          detail: { paper: JSON.parse(editBtn.dataset.paper) }
        }));
      });
    });

    this.querySelectorAll('.pc-paper-add-slot').forEach(addSlot => {
      addSlot.addEventListener('click', event => {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent('project-paper-add', {
          bubbles: true,
          composed: true,
          detail: { projectId: this.project.id }
        }));
      });
    });

    const prevPageBtn = this.querySelector('.pc-page-prev');
    prevPageBtn?.addEventListener('click', event => {
      event.stopPropagation();
      this.setPaperPage(this._paperPage - 1);
    });

    const nextPageBtn = this.querySelector('.pc-page-next');
    nextPageBtn?.addEventListener('click', event => {
      event.stopPropagation();
      this.setPaperPage(this._paperPage + 1);
    });

    const addPaperBtn = this.querySelector('.add-paper-btn');
    addPaperBtn?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('project-paper-add', {
        bubbles: true,
        composed: true,
        detail: { projectId: this.project.id }
      }));
    });

    const editProjectBtn = this.querySelector('.edit-project-btn');
    editProjectBtn?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('project-edit', {
        bubbles: true,
        composed: true,
        detail: { project: this.project }
      }));
    });

    const linkBtn = this.querySelector('.pc-link-btn');
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
