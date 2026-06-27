import '../components/project-card.js';
import { debounce } from './utils.js';
import { resetDraggableModal, setupDraggableModals } from './draggable-modals.js';
import * as pdfjsLib from '../../node_modules/pdfjs-dist/legacy/build/pdf.min.mjs';
import ThemeManager from './theme-manager.js';

// Initialize PDF.js worker
const basePath = new URL('..', window.location.href).href;
const workerSrc = `${basePath}node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs`;
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

// Constants
const ITEMS_PER_PAGE = 15;

// State
let allPDFs = [];
let allProjects = [];
let filteredProjects = [];
let currentPage = 1;
let searchQuery = '';
let completionFilter = 'all'; // 'all', 'completed', 'incomplete'
let deleteTargetId = null;
let notFoundPdfId = null;
let pendingNewPath = null;
let pendingProjectFilePath = null;
let editingProjectId = null;
let editingPaperId = null;
let pendingPaperFilePath = null;
let pendingPaperProjectId = null;

// DOM Elements
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const pdfGrid = document.getElementById('pdf-grid');
const pagination = document.getElementById('pagination');
const paginationInfo = document.getElementById('pagination-info');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const searchInput = document.getElementById('search-input');
const dropZone = document.getElementById('drop-zone');
const btnAddPdf = document.getElementById('btn-add-pdf');
const btnAddPdfEmpty = document.getElementById('btn-add-pdf-empty');
const btnSettings = document.getElementById('btn-settings');
const btnThemeToggle = document.getElementById('btn-theme-toggle');
const toastContainer = document.getElementById('toast-container');
const completionFilters = document.getElementById('completion-filters');

const projectModal = document.getElementById('project-modal');
const projectModalTitle = document.getElementById('project-modal-title');
const projectModalClose = document.getElementById('project-modal-close');
const projectModalCancel = document.getElementById('project-modal-cancel');
const projectModalConfirm = document.getElementById('project-modal-confirm');
const projectNameInput = document.getElementById('project-name-input');
const projectConferenceInput = document.getElementById('project-conference-input');
const projectDeadlineInput = document.getElementById('project-deadline-input');
const projectSubmissionLinkInput = document.getElementById('project-submission-link-input');
const projectFirstPaper = document.getElementById('project-first-paper');
const projectFirstPaperName = document.getElementById('project-first-paper-name');

const paperModal = document.getElementById('paper-modal');
const paperModalTitle = document.getElementById('paper-modal-title');
const paperModalClose = document.getElementById('paper-modal-close');
const paperModalCancel = document.getElementById('paper-modal-cancel');
const paperModalConfirm = document.getElementById('paper-modal-confirm');
const paperNameInput = document.getElementById('paper-name-input');
const paperDeadlineInput = document.getElementById('paper-deadline-input');
const paperSourceFile = document.getElementById('paper-source-file');
const paperSourceFileName = document.getElementById('paper-source-file-name');

// Delete Modal Elements
const deleteModal = document.getElementById('delete-modal');
const deleteModalClose = document.getElementById('delete-modal-close');
const deleteModalCancel = document.getElementById('delete-modal-cancel');
const deleteModalConfirm = document.getElementById('delete-modal-confirm');
const deletePdfName = document.getElementById('delete-pdf-name');
const deleteAnnotationsCheckbox = document.getElementById('delete-annotations-checkbox');

// PDF Not Found Modal Elements
const pdfNotFoundModal = document.getElementById('pdf-not-found-modal');
const pdfNotFoundPath = document.getElementById('pdf-not-found-path');
const pdfNotFoundName = document.getElementById('pdf-not-found-name');
const pdfNotFoundClose = document.getElementById('pdf-not-found-close');
const pdfNotFoundCancel = document.getElementById('pdf-not-found-cancel');
const pdfNotFoundReload = document.getElementById('pdf-not-found-reload');

// PDF Name Changed Modal Elements
const pdfNameChangedModal = document.getElementById('pdf-name-changed-modal');
const pdfNameOriginal = document.getElementById('pdf-name-original');
const pdfNameNew = document.getElementById('pdf-name-new');
const pdfNameChangedClose = document.getElementById('pdf-name-changed-close');
const pdfNameChangedCancel = document.getElementById('pdf-name-changed-cancel');
const pdfNameChangedConfirm = document.getElementById('pdf-name-changed-confirm');

// Initialize
async function init() {
  await ThemeManager.init();
  setupThemeToggle();
  setupDraggableModals([
    projectModal,
    paperModal,
    deleteModal,
    pdfNotFoundModal,
    pdfNameChangedModal
  ]);
  await loadPDFs();
  setupEventListeners();
  setupKeyboardShortcuts();
}

// Load PDFs from database
async function loadPDFs() {
  showLoading();
  try {
    allProjects = await window.api.getAllProjects();
    allPDFs = allProjects.flatMap(project => project.papers || []);
    filterAndRender();
  } catch (error) {
    console.error('Error loading projects:', error);
    showToast('Failed to load projects', 'error');
  }
}

// Filter and render PDFs
function filterAndRender() {
  // Apply search filter
  let filtered = [...allProjects];

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter(project =>
      project.name.toLowerCase().includes(query) ||
      (project.conference || '').toLowerCase().includes(query) ||
      (project.papers || []).some(paper => paper.name.toLowerCase().includes(query))
    );
  }

  // Apply completion filter
  if (completionFilter === 'completed') {
    filtered = filtered.filter(project => project.completed === 1);
  } else if (completionFilter === 'incomplete') {
    filtered = filtered.filter(project => project.completed === 0 || !project.completed);
  }

  filteredProjects = filtered;

  // Calculate pagination
  const totalPages = Math.ceil(filteredProjects.length / ITEMS_PER_PAGE);
  currentPage = Math.min(currentPage, Math.max(1, totalPages));

  // Get current page items
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageItems = filteredProjects.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Update UI
  hideLoading();

  if (filteredProjects.length === 0) {
    if (searchQuery) {
      showEmpty('No projects match your search');
    } else {
      showEmpty();
    }
  } else {
    renderProjects(pageItems);
    updatePagination(totalPages);
  }
}

// Render project cards
function renderProjects(projects) {
  emptyState.classList.add('hidden');
  pdfGrid.classList.remove('hidden');

  pdfGrid.innerHTML = '';
  projects.forEach(project => {
    const card = document.createElement('project-card');
    card.project = project;
    pdfGrid.appendChild(card);
  });
}

// Update pagination controls
function updatePagination(totalPages) {
  paginationInfo.textContent = `${currentPage} / ${totalPages}`;
  btnPrev.disabled = currentPage <= 1;
  btnNext.disabled = currentPage >= totalPages;
}

// Show/Hide states
function showLoading() {
  loadingState.classList.remove('hidden');
  emptyState.classList.add('hidden');
  pdfGrid.classList.add('hidden');
}

function hideLoading() {
  loadingState.classList.add('hidden');
}

function showEmpty(message) {
  emptyState.classList.remove('hidden');
  pdfGrid.classList.add('hidden');
  updatePagination(1);

  const titleEl = emptyState.querySelector('.empty-state-title');
  const textEl = emptyState.querySelector('.empty-state-text');

  if (message) {
    titleEl.textContent = message;
    textEl.textContent = 'Try adjusting your search or add a new project.';
  } else {
    titleEl.textContent = 'No projects yet';
    textEl.textContent = 'Drag and drop a PDF file here, or click the "Add Project" button to get started.';
  }
}

// Add PDF handler
async function handleAddPDF() {
  try {
    const filePath = await window.api.openPDFDialog();
    if (!filePath) return;

    showProjectModal(filePath);
  } catch (error) {
    console.error('Error adding project:', error);
    showToast('Failed to add project', 'error');
  }
}

function showProjectModal(filePath) {
  resetDraggableModal(projectModal);
  editingProjectId = null;
  pendingProjectFilePath = filePath;
  projectModalTitle.textContent = 'New Project';
  projectModalConfirm.textContent = 'Create Project';
  projectDeadlineInput.closest('.form-group').classList.remove('hidden');
  projectFirstPaper.classList.remove('hidden');
  projectFirstPaperName.textContent = filePath.split(/[/\\]/).pop();
  projectNameInput.placeholder = 'Defaults to the PDF name';
  projectNameInput.value = '';
  projectConferenceInput.value = '';
  projectDeadlineInput.value = '';
  projectSubmissionLinkInput.value = '';
  projectModal.classList.add('active');
  projectNameInput.focus();
}

function showProjectEditModal(project) {
  resetDraggableModal(projectModal);
  editingProjectId = project.id;
  pendingProjectFilePath = null;
  projectModalTitle.textContent = 'Edit Project';
  projectModalConfirm.textContent = 'Save Changes';
  projectDeadlineInput.closest('.form-group').classList.add('hidden');
  projectFirstPaper.classList.add('hidden');
  projectNameInput.placeholder = 'Project name';
  projectNameInput.value = project.name || '';
  projectConferenceInput.value = project.conference || '';
  projectDeadlineInput.value = '';
  projectSubmissionLinkInput.value = project.submission_link || '';
  projectModal.classList.add('active');
  projectNameInput.focus();
  projectNameInput.select();
}

function closeProjectModal() {
  projectModal.classList.remove('active');
  pendingProjectFilePath = null;
  editingProjectId = null;
}

async function confirmProjectModal() {
  if (editingProjectId) {
    await confirmProjectEdit();
  } else {
    await confirmProjectCreate();
  }
}

async function confirmProjectEdit() {
  const projectName = projectNameInput.value.trim();
  if (!projectName) {
    showToast('Project name is required', 'warning');
    projectNameInput.focus();
    return;
  }

  const projectId = editingProjectId;
  const data = {
    name: projectName,
    conference: projectConferenceInput.value.trim() || null,
    submissionLink: projectSubmissionLinkInput.value.trim() || null
  };

  closeProjectModal();

  try {
    await window.api.updateProject(projectId, data);
    await loadPDFs();
    showToast('Project updated successfully', 'success');
  } catch (error) {
    console.error('Error updating project:', error);
    showToast('Failed to update project: ' + error.message, 'error');
  }
}

async function confirmProjectCreate() {
  if (!pendingProjectFilePath) return;

  const filePath = pendingProjectFilePath;
  const options = {
    projectName: projectNameInput.value.trim() || null,
    conference: projectConferenceInput.value.trim() || null,
    reviewDeadline: projectDeadlineInput.value || null,
    submissionLink: projectSubmissionLinkInput.value.trim() || null
  };

  closeProjectModal();

  try {
    await addPDFFromPath(filePath, options);
  } catch (error) {
    console.error('Error creating project:', error);
    showToast('Failed to create project: ' + error.message, 'error');
  }
}

function showPaperEditModal(paper) {
  resetDraggableModal(paperModal);
  editingPaperId = paper.id;
  pendingPaperFilePath = null;
  pendingPaperProjectId = null;
  paperModalTitle.textContent = 'Edit Paper';
  paperModalConfirm.textContent = 'Save Changes';
  paperSourceFile.classList.add('hidden');
  paperNameInput.value = paper.name || '';
  paperDeadlineInput.value = paper.review_deadline || '';
  paperModal.classList.add('active');
  paperNameInput.focus();
  paperNameInput.select();
}

function showPaperAddModal(filePath, projectId) {
  resetDraggableModal(paperModal);
  editingPaperId = null;
  pendingPaperFilePath = filePath;
  pendingPaperProjectId = projectId;
  paperModalTitle.textContent = 'Add Paper';
  paperModalConfirm.textContent = 'Add Paper';
  paperSourceFile.classList.remove('hidden');
  paperSourceFileName.textContent = filePath.split(/[/\\]/).pop();
  paperNameInput.value = filePath.split(/[/\\]/).pop();
  paperDeadlineInput.value = '';
  paperModal.classList.add('active');
  paperNameInput.focus();
  paperNameInput.select();
}

function closePaperModal() {
  paperModal.classList.remove('active');
  editingPaperId = null;
  pendingPaperFilePath = null;
  pendingPaperProjectId = null;
}

async function confirmPaperModal() {
  if (editingPaperId) {
    await confirmPaperEdit();
  } else {
    await confirmPaperAdd();
  }
}

async function confirmPaperEdit() {
  const paperName = paperNameInput.value.trim();
  if (!paperName) {
    showToast('Paper name is required', 'warning');
    paperNameInput.focus();
    return;
  }

  const paperId = editingPaperId;
  const data = {
    name: paperName,
    reviewDeadline: paperDeadlineInput.value || null
  };

  closePaperModal();

  try {
    await window.api.updatePDF(paperId, data);
    await loadPDFs();
    showToast('Paper updated successfully', 'success');
  } catch (error) {
    console.error('Error updating paper:', error);
    showToast('Failed to update paper: ' + error.message, 'error');
  }
}

async function confirmPaperAdd() {
  if (!pendingPaperFilePath || !pendingPaperProjectId) return;

  const paperName = paperNameInput.value.trim();
  if (!paperName) {
    showToast('Paper name is required', 'warning');
    paperNameInput.focus();
    return;
  }

  const filePath = pendingPaperFilePath;
  const projectId = pendingPaperProjectId;
  const options = {
    projectId,
    paperName,
    reviewDeadline: paperDeadlineInput.value || null
  };

  closePaperModal();

  try {
    await addPDFFromPath(filePath, options);
  } catch (error) {
    console.error('Error adding paper:', error);
    showToast('Failed to add paper: ' + error.message, 'error');
  }
}

// Add PDF from file path
async function addPDFFromPath(filePath, options = {}) {
  try {
    // Get metadata
    const metadata = await window.api.getPDFMetadata(filePath);

    // Read PDF to get page count
    const pdfData = await window.api.readPDFFile(filePath);
    const pageCount = await getPDFPageCount(pdfData);

    // Save to database
    const pdf = await window.api.addPDF({
      name: options.paperName || metadata.name,
      path: filePath,
      pageCount: pageCount,
      projectId: options.projectId || null,
      projectName: options.projectName || metadata.name,
      conference: options.conference || null,
      reviewDeadline: options.reviewDeadline || null,
      submissionLink: options.submissionLink || null
    });

    if (findPaper(pdf.id)) {
      showToast('PDF already exists, opening...', 'success');
    } else {
      showToast(options.projectId ? 'Paper added successfully' : 'Project created successfully', 'success');
    }

    await loadPDFs();

    // Navigate to review page
    await window.api.navigateToReview(pdf.id);
  } catch (error) {
    console.error('Error adding PDF:', error);
    throw error;
  }
}

// Get PDF page count using PDF.js
async function getPDFPageCount(data) {
  // Ensure data is Uint8Array
  let pdfData = data;
  if (ArrayBuffer.isView(data)) {
    pdfData = new Uint8Array(data.buffer || data);
  } else if (data instanceof ArrayBuffer) {
    pdfData = new Uint8Array(data);
  } else if (typeof data === 'object' && data.data) {
    // Handle serialized Buffer from IPC
    pdfData = new Uint8Array(data.data);
  }

  const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  const pdf = await loadingTask.promise;
  return pdf.numPages;
}

// Delete PDF handler
function handleDeletePDF(id, name) {
  resetDraggableModal(deleteModal);
  deleteTargetId = id;
  deletePdfName.textContent = name;
  deleteAnnotationsCheckbox.checked = true;
  deleteModal.classList.add('active');
}

async function confirmDelete() {
  if (!deleteTargetId) return;

  try {
    const deleteAnnotations = deleteAnnotationsCheckbox.checked;
    await window.api.deletePDF(deleteTargetId, deleteAnnotations);

    closeDeleteModal();
    await loadPDFs();
    showToast('PDF removed successfully', 'success');
  } catch (error) {
    console.error('Error deleting PDF:', error);
    showToast('Failed to remove PDF', 'error');
  }
}

function closeDeleteModal() {
  deleteModal.classList.remove('active');
  deleteTargetId = null;
}

// PDF Not Found Modal Functions
function showPDFNotFoundModal(id, name, path) {
  resetDraggableModal(pdfNotFoundModal);
  notFoundPdfId = id;
  pdfNotFoundName.textContent = `PDF: "${name}"`;
  pdfNotFoundPath.textContent = path;
  pdfNotFoundModal.classList.add('active');
}

function closePDFNotFoundModal() {
  pdfNotFoundModal.classList.remove('active');
  notFoundPdfId = null;
}

async function handlePDFNotFoundReload() {
  if (!notFoundPdfId) return;

  try {
    // Open file dialog to select new PDF
    const newPath = await window.api.openPDFDialog();
    if (!newPath) {
      return; // User canceled
    }

    // Get original PDF data
    const pdf = findPaper(notFoundPdfId);
    if (!pdf) {
      showToast('PDF not found', 'error');
      return;
    }

    // Extract filenames
    const originalName = pdf.name;
    const newName = newPath.split(/[/\\]/).pop(); // Get filename from path

    // Check if name has changed
    if (originalName !== newName) {
      // Show warning modal
      pendingNewPath = newPath;
      pdfNameOriginal.textContent = originalName;
      pdfNameNew.textContent = newName;
      pdfNotFoundModal.classList.remove('active');
      resetDraggableModal(pdfNameChangedModal);
      pdfNameChangedModal.classList.add('active');
      return;
    }

    // Name is the same, proceed with update
    await updatePDFPath(notFoundPdfId, newPath);
  } catch (error) {
    console.error('Error reloading PDF:', error);
    showToast('Failed to reload PDF', 'error');
  }
}

// PDF Name Changed Modal Functions
function closePDFNameChangedModal() {
  pdfNameChangedModal.classList.remove('active');
  pendingNewPath = null;
  // Re-show the PDF not found modal
  resetDraggableModal(pdfNotFoundModal);
  pdfNotFoundModal.classList.add('active');
}

async function confirmPDFNameChanged() {
  if (!notFoundPdfId || !pendingNewPath) return;

  try {
    await updatePDFPath(notFoundPdfId, pendingNewPath);
    pdfNameChangedModal.classList.remove('active');
    pendingNewPath = null;
  } catch (error) {
    console.error('Error updating PDF path:', error);
    showToast('Failed to update PDF path', 'error');
  }
}

// Update PDF path in database and navigate
async function updatePDFPath(pdfId, newPath) {
  try {
    // Extract new filename
    const newName = newPath.split(/[/\\]/).pop();

    // Update the PDF path and name in the database
    await window.api.updatePDF(pdfId, { path: newPath, name: newName });

    await loadPDFs();

    closePDFNotFoundModal();
    showToast('PDF path updated successfully', 'success');

    // Navigate to review with the updated PDF
    await window.api.navigateToReview(pdfId);
  } catch (error) {
    console.error('Error updating PDF path:', error);
    throw error;
  }
}

// Drag and drop handlers
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('drag-over');
}

async function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('drag-over');

  const files = Array.from(e.dataTransfer.files);
  const pdfFiles = files.filter(file => file.type === 'application/pdf' || file.name.endsWith('.pdf'));

  if (pdfFiles.length === 0) {
    showToast('Please drop a PDF file', 'warning');
    return;
  }

  const file = pdfFiles[0];

  // If file.path is available (non-sandboxed), use it directly
  if (file.path) {
    try {
      showProjectModal(file.path);
      return;
    } catch (error) {
      console.error('Error adding PDF from path:', error);
      showToast('Failed to add PDF: ' + error.message, 'error');
      return;
    }
  }

  // Otherwise read file data via FileReader and send to main process
  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    // Save file to app storage via main process, get back the path
    const savedPath = await window.api.addPDFFromData(file.name, data);
    showProjectModal(savedPath);
  } catch (error) {
    console.error('Error adding dropped PDF:', error);
    showToast('Failed to add PDF: ' + error.message, 'error');
  }
}

// Search handler
const handleSearch = debounce((query) => {
  searchQuery = query;
  currentPage = 1;
  filterAndRender();
}, 300);

// Toast notification
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-message">${message}</span>
    <button class="toast-close" aria-label="Close">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  `;

  toastContainer.appendChild(toast);

  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => toast.remove());

  // Auto remove after 4 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      toast.remove();
    }
  }, 4000);
}

// Theme toggle setup
function setupThemeToggle() {
  updateThemeIcon();

  // Listen for theme changes
  ThemeManager.addListener(() => {
    updateThemeIcon();
  });

  // Toggle button click
  btnThemeToggle.addEventListener('click', async () => {
    await ThemeManager.cycle();
  });
}

function updateThemeIcon() {
  const preference = ThemeManager.getPreference();
  const currentTheme = ThemeManager.getCurrentTheme();

  let icon, title;

  // Show icon representing the CURRENT active theme
  if (currentTheme === 'light') {
    icon = getSunIcon();
    title = preference === 'auto' ? 'Theme: Auto (Light)' : 'Theme: Light';
  } else {
    icon = getMoonIcon();
    title = preference === 'auto' ? 'Theme: Auto (Dark)' : 'Theme: Dark';
  }

  btnThemeToggle.innerHTML = icon;
  btnThemeToggle.title = title;
}

function getSunIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  `;
}

function getMoonIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  `;
}

// Event Listeners
function setupEventListeners() {
  // Settings button
  btnSettings.addEventListener('click', () => window.api.navigateToSettings());

  // Add PDF buttons
  btnAddPdf.addEventListener('click', handleAddPDF);
  btnAddPdfEmpty.addEventListener('click', handleAddPDF);

  // Search
  searchInput.addEventListener('input', (e) => handleSearch(e.target.value));

  // Pagination
  btnPrev.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      filterAndRender();
    }
  });

  btnNext.addEventListener('click', () => {
    const totalPages = Math.ceil(filteredProjects.length / ITEMS_PER_PAGE);
    if (currentPage < totalPages) {
      currentPage++;
      filterAndRender();
    }
  });

  // Drag and drop
  dropZone.addEventListener('dragover', handleDragOver);
  dropZone.addEventListener('dragleave', handleDragLeave);
  dropZone.addEventListener('drop', handleDrop);

  // Delete modal
  deleteModalClose.addEventListener('click', closeDeleteModal);
  deleteModalCancel.addEventListener('click', closeDeleteModal);
  deleteModalConfirm.addEventListener('click', confirmDelete);
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) closeDeleteModal();
  });

  // Project modal
  projectModalClose.addEventListener('click', closeProjectModal);
  projectModalCancel.addEventListener('click', closeProjectModal);
  projectModalConfirm.addEventListener('click', confirmProjectModal);
  projectModal.addEventListener('click', (e) => {
    if (e.target === projectModal) closeProjectModal();
  });

  // Paper modal
  paperModalClose.addEventListener('click', closePaperModal);
  paperModalCancel.addEventListener('click', closePaperModal);
  paperModalConfirm.addEventListener('click', confirmPaperModal);
  paperModal.addEventListener('click', (e) => {
    if (e.target === paperModal) closePaperModal();
  });

  // PDF Not Found modal
  pdfNotFoundClose.addEventListener('click', closePDFNotFoundModal);
  pdfNotFoundCancel.addEventListener('click', closePDFNotFoundModal);
  pdfNotFoundReload.addEventListener('click', handlePDFNotFoundReload);
  pdfNotFoundModal.addEventListener('click', (e) => {
    if (e.target === pdfNotFoundModal) closePDFNotFoundModal();
  });

  // PDF Name Changed modal
  pdfNameChangedClose.addEventListener('click', closePDFNameChangedModal);
  pdfNameChangedCancel.addEventListener('click', closePDFNameChangedModal);
  pdfNameChangedConfirm.addEventListener('click', confirmPDFNameChanged);
  pdfNameChangedModal.addEventListener('click', (e) => {
    if (e.target === pdfNameChangedModal) closePDFNameChangedModal();
  });

  // Project card events (delegated)
  document.addEventListener('project-paper-open', async (e) => {
    const { id } = e.detail;

    // Get PDF data to check if file exists
    const pdf = findPaper(id);
    if (!pdf) {
      showToast('PDF not found', 'error');
      return;
    }

    // Check if file exists before navigating
    const fileExists = await window.api.checkPDFExists(pdf.path);
    if (!fileExists) {
      showPDFNotFoundModal(id, pdf.name, pdf.path);
      return;
    }

    // File exists, navigate to review
    await window.api.navigateToReview(id);
  });

  document.addEventListener('project-paper-add', async (e) => {
    const filePath = await window.api.openPDFDialog();
    if (!filePath) return;

    showPaperAddModal(filePath, e.detail.projectId);
  });

  document.addEventListener('project-edit', (e) => {
    showProjectEditModal(e.detail.project);
  });

  document.addEventListener('paper-edit', (e) => {
    showPaperEditModal(e.detail.paper);
  });

  document.addEventListener('project-platform-open', (e) => {
    if (e.detail.url) {
      window.api.openExternal(e.detail.url);
    }
  });

  document.addEventListener('pdf-delete', (e) => {
    const { id, name } = e.detail;
    handleDeletePDF(id, name);
  });

  // Completion filter buttons
  const filterButtons = completionFilters.querySelectorAll('.filter-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      completionFilter = filter;
      currentPage = 1;

      // Update active state
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Re-render
      filterAndRender();
    });
  });
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const isTyping = isTypingTarget(e.target);

    // Ctrl+O: Open PDF
    if (!isTyping && (e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      handleAddPDF();
    }

    // Escape: Close modal
    if (e.key === 'Escape') {
      if (pdfNameChangedModal.classList.contains('active')) {
        closePDFNameChangedModal();
      } else if (pdfNotFoundModal.classList.contains('active')) {
        closePDFNotFoundModal();
      } else if (deleteModal.classList.contains('active')) {
        closeDeleteModal();
      } else if (projectModal.classList.contains('active')) {
        closeProjectModal();
      } else if (paperModal.classList.contains('active')) {
        closePaperModal();
      }
    }

    // Focus search: Ctrl+F or /
    if (!isTyping && (e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      searchInput.focus();
    }
    if (!isTyping && e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
  });
}

function isTypingTarget(target) {
  return target?.matches?.('input, textarea, select, [contenteditable="true"]');
}

function findPaper(id) {
  return allProjects
    .flatMap(project => project.papers || [])
    .find(paper => paper.id === id);
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);
