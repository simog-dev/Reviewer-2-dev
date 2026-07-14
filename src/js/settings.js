import ThemeManager from './theme-manager.js';
import {
  DEFAULT_PROMPT,
  LLM_PROVIDER_DEFINITIONS,
  getDefaultLLMProviderId,
  getLLMProviderDefinition
} from './llm-config.js';
import { getCategoryIcon } from './utils.js';

const SETTING_KEYS = ['llm_api_key', 'llm_provider', 'llm_model', 'llm_temperature', 'llm_prompt', 'llm_base_url', 'llm_review_style_example'];

const ICON_OPTIONS = [
  { value: 'label', label: 'Label' },
  { value: 'flag', label: 'Flag' },
  { value: 'star', label: 'Star' },
  { value: 'bookmark', label: 'Bookmark' },
  { value: 'check', label: 'Check' },
  { value: 'edit', label: 'Edit' },
  { value: 'attach', label: 'Attach' },
  { value: 'code', label: 'Code' },
  { value: 'error', label: 'Error' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
  { value: 'lightbulb', label: 'Lightbulb' },
  { value: 'help', label: 'Help' }
];

const MAX_TOTAL = 10;
const MAX_ACTIVE = 5;

let showingKey = false;
let allCategories = [];
let dragSourceIndex = null;
let pendingRename = null; // { categoryId, name, color, icon }

function getIconOption(iconValue) {
  return ICON_OPTIONS.find(opt => opt.value === iconValue) || ICON_OPTIONS[0];
}

function renderIconPicker(selectedIcon) {
  const selected = getIconOption(selectedIcon);

  return `
    <div class="category-icon-picker">
      <input type="hidden" class="edit-icon" value="${selected.value}">
      <button
        class="category-icon-picker__trigger"
        type="button"
        aria-label="Choose icon: ${escapeHtml(selected.label)}"
        aria-haspopup="listbox"
        aria-expanded="false"
        title="${escapeHtml(selected.label)}"
      >
        ${getCategoryIcon(selected.value)}
      </button>
      <div class="category-icon-picker__menu" role="listbox" aria-label="Annotation label icons">
        ${ICON_OPTIONS.map(opt => `
          <button
            class="category-icon-picker__option ${opt.value === selected.value ? 'is-selected' : ''}"
            type="button"
            role="option"
            aria-selected="${opt.value === selected.value}"
            aria-label="${escapeHtml(opt.label)}"
            title="${escapeHtml(opt.label)}"
            data-icon="${opt.value}"
          >
            ${getCategoryIcon(opt.value)}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

async function init() {
  await ThemeManager.init();
  setupEventListeners();
  await loadSettings();
  await loadCategories();
}

async function loadSettings() {
  const apiKey = await window.api.getSetting('llm_api_key') || '';
  const savedProvider = await window.api.getSetting('llm_provider') || getDefaultLLMProviderId();
  const provider = getLLMProviderDefinition(savedProvider) ? savedProvider : getDefaultLLMProviderId();
  const providerDefinition = getLLMProviderDefinition(provider);
  const model = await window.api.getSetting('llm_model') || '';
  const temperature = await window.api.getSetting('llm_temperature') || '0.7';
  const prompt = await window.api.getSetting('llm_prompt') || DEFAULT_PROMPT;
  const baseUrl = await window.api.getSetting('llm_base_url') || providerDefinition.defaultBaseUrl || '';
  const reviewStyleExample = await window.api.getSetting('llm_review_style_example') || '';

  renderProviderOptions(provider);

  document.getElementById('api-key-input').value = apiKey;
  document.getElementById('provider-select').value = provider;
  document.getElementById('model-input').value = model || providerDefinition.defaultModel || '';
  document.getElementById('base-url-input').value = baseUrl;
  applyProviderUI(provider);

  const tempSlider = document.getElementById('temperature-slider');
  tempSlider.value = temperature;
  document.getElementById('temperature-value').textContent = parseFloat(temperature).toFixed(1);

  document.getElementById('prompt-input').value = prompt;
  document.getElementById('review-style-example-input').value = reviewStyleExample;
}

function renderProviderOptions(selectedProviderId) {
  const select = document.getElementById('provider-select');
  select.innerHTML = LLM_PROVIDER_DEFINITIONS.map(provider => (
    `<option value="${provider.id}" ${provider.id === selectedProviderId ? 'selected' : ''}>${provider.label}</option>`
  )).join('');
}

function applyProviderUI(providerId) {
  const provider = getLLMProviderDefinition(providerId) || getLLMProviderDefinition(getDefaultLLMProviderId());
  const apiKeyInput = document.getElementById('api-key-input');
  const modelInput = document.getElementById('model-input');
  const baseUrlInput = document.getElementById('base-url-input');
  const baseUrlGroup = document.getElementById('base-url-group');

  apiKeyInput.placeholder = provider.apiKeyPlaceholder || 'Enter your API key...';
  modelInput.placeholder = provider.modelPlaceholder || 'Enter the model ID...';
  baseUrlInput.placeholder = provider.baseUrlPlaceholder || provider.defaultBaseUrl || 'https://api.example.com/v1';

  baseUrlGroup.hidden = !provider.supportsCustomBaseUrl;

  updateHelpText('api-key-hint', provider.apiKeyHelp);
  updateHelpText('model-hint', provider.modelHelp);
  updateHelpText('base-url-hint', provider.baseUrlHelp);
}

function updateHelpText(elementId, help) {
  const element = document.getElementById(elementId);
  if (!element) return;

  if (!help) {
    element.textContent = '';
    return;
  }

  if (help.url && help.label) {
    element.innerHTML = `${escapeHtml(help.text)} <a href="${help.url}" target="_blank">${escapeHtml(help.label)}</a>`;
    return;
  }

  element.textContent = help.text || '';
}

async function loadCategories() {
  allCategories = await window.api.getAllCategories();
  renderCategoryList();
}

function renderCategoryList() {
  const list = document.getElementById('category-list');
  const hint = document.getElementById('category-limits-hint');
  const addBtn = document.getElementById('btn-add-category');

  const activeCount = allCategories.filter(c => c.is_active).length;
  const totalCount = allCategories.length;

  hint.textContent = `${activeCount}/${MAX_ACTIVE} active, ${totalCount}/${MAX_TOTAL} total`;
  addBtn.disabled = totalCount >= MAX_TOTAL;

  list.innerHTML = allCategories.map((cat, index) => `
    <div class="category-row" data-category-id="${cat.id}" data-index="${index}">
      <div class="category-drag-handle" title="Drag to reorder" draggable="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
          <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
          <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
        </svg>
      </div>
      <div class="category-color-dot" style="background-color: ${cat.color}"></div>
      <span class="category-name">${escapeHtml(cat.name)}</span>
      <div class="category-edit-fields">
        <input type="color" value="${cat.color}" class="edit-color">
        <input type="text" value="${escapeHtml(cat.name)}" class="edit-name" maxlength="30">
        ${renderIconPicker(cat.icon)}
        <button class="btn btn--icon btn--success-ghost btn-save-edit" title="Save">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
        <button class="btn btn--icon btn--danger-ghost btn-cancel-edit" title="Cancel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      ${cat.is_default ? '<span class="category-default-badge">default</span>' : ''}
      <div class="category-actions">
        <button class="btn btn--icon btn--ghost btn-edit-category" title="Edit" data-id="${cat.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        ${!cat.is_default ? `<button class="btn btn--icon btn--danger-ghost btn-delete-category" title="Delete" data-id="${cat.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>` : ''}
      </div>
      <label class="category-toggle" title="${cat.is_active ? 'Active' : 'Inactive'}">
        <input type="checkbox" ${cat.is_active ? 'checked' : ''} data-id="${cat.id}">
        <span class="toggle-slider"></span>
      </label>
    </div>
  `).join('');

  // Attach event listeners
  list.querySelectorAll('.btn-edit-category').forEach(btn => {
    btn.addEventListener('click', () => startEditing(parseInt(btn.dataset.id)));
  });

  list.querySelectorAll('.btn-delete-category').forEach(btn => {
    btn.addEventListener('click', () => deleteCategory(parseInt(btn.dataset.id)));
  });

  list.querySelectorAll('.category-toggle input').forEach(toggle => {
    toggle.addEventListener('change', () => toggleCategory(parseInt(toggle.dataset.id), toggle.checked));
  });

  list.querySelectorAll('.btn-save-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.category-row');
      saveEdit(parseInt(row.dataset.categoryId));
    });
  });

  list.querySelectorAll('.btn-cancel-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.category-row');
      row.classList.remove('editing');
    });
  });

  list.querySelectorAll('.category-icon-picker__trigger').forEach(trigger => {
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      const picker = trigger.closest('.category-icon-picker');
      const row = trigger.closest('.category-row');
      const isOpen = picker.classList.contains('is-open');
      closeIconPickers();
      picker.classList.toggle('is-open', !isOpen);
      row?.classList.toggle('has-open-icon-picker', !isOpen);
      trigger.setAttribute('aria-expanded', String(!isOpen));
    });
  });

  list.querySelectorAll('.category-icon-picker__option').forEach(option => {
    option.addEventListener('click', (event) => {
      event.stopPropagation();
      const picker = option.closest('.category-icon-picker');
      const selected = getIconOption(option.dataset.icon);
      const input = picker.querySelector('.edit-icon');
      const trigger = picker.querySelector('.category-icon-picker__trigger');

      input.value = selected.value;
      trigger.innerHTML = getCategoryIcon(selected.value);
      trigger.title = selected.label;
      trigger.setAttribute('aria-label', `Choose icon: ${selected.label}`);

      picker.querySelectorAll('.category-icon-picker__option').forEach(item => {
        const isSelected = item.dataset.icon === selected.value;
        item.classList.toggle('is-selected', isSelected);
        item.setAttribute('aria-selected', String(isSelected));
      });

      closeIconPickers();
    });
  });

  // Drag-and-drop: only the drag handle is draggable
  list.querySelectorAll('.category-drag-handle').forEach(handle => {
    handle.addEventListener('dragstart', handleDragStart);
    handle.addEventListener('dragend', handleDragEnd);
  });

  list.querySelectorAll('.category-row').forEach(row => {
    row.addEventListener('dragover', handleDragOver);
    row.addEventListener('dragleave', handleDragLeave);
    row.addEventListener('drop', handleDrop);
  });
}

function closeIconPickers() {
  document.querySelectorAll('.category-icon-picker.is-open').forEach(picker => {
    picker.classList.remove('is-open');
    picker.querySelector('.category-icon-picker__trigger')?.setAttribute('aria-expanded', 'false');
  });

  document.querySelectorAll('.category-row.has-open-icon-picker').forEach(row => {
    row.classList.remove('has-open-icon-picker');
  });
}

function startEditing(categoryId) {
  const row = document.querySelector(`.category-row[data-category-id="${categoryId}"]`);
  if (row) {
    // Cancel any other editing rows
    document.querySelectorAll('.category-row.editing').forEach(r => r.classList.remove('editing'));
    row.classList.add('editing');
    row.querySelector('.edit-name').focus();
  }
}

async function saveEdit(categoryId) {
  const row = document.querySelector(`.category-row[data-category-id="${categoryId}"]`);
  if (!row) return;

  const name = row.querySelector('.edit-name').value.trim();
  const color = row.querySelector('.edit-color').value;
  const icon = row.querySelector('.edit-icon').value;

  if (!name) {
    showToast('Category name cannot be empty', 'error');
    return;
  }

  const cat = allCategories.find(c => c.id === categoryId);
  if (!cat) return;

  const nameChanged = name !== cat.name;

  try {
    // If name changed, check if category has existing annotations
    if (nameChanged) {
      const annotationCount = await window.api.getCategoryAnnotationCount(categoryId);
      if (annotationCount > 0) {
        // Show confirmation modal
        pendingRename = { categoryId, name, color, icon };
        showRenameModal(cat.name, name, annotationCount);
        return;
      }
    }

    // No annotations or name didn't change → proceed with update
    await window.api.updateCategory(categoryId, {
      name,
      color,
      icon,
      isActive: cat.is_active,
      sortOrder: cat.sort_order
    });
    showToast('Category updated');
    await loadCategories();
  } catch (error) {
    showToast('Failed to update category: ' + error.message, 'error');
  }
}

function showRenameModal(oldName, newName, annotationCount) {
  const modal = document.getElementById('rename-modal');
  const message = document.getElementById('rename-modal-message');

  message.textContent = `The category "${oldName}" has ${annotationCount} existing annotation${annotationCount > 1 ? 's' : ''}. Renaming it to "${newName}" will update all existing annotations to show the new name. Do you want to proceed?`;

  modal.classList.add('active');
}

function hideRenameModal() {
  const modal = document.getElementById('rename-modal');
  modal.classList.remove('active');
  pendingRename = null;

  // Cancel editing mode on the row
  document.querySelectorAll('.category-row.editing').forEach(r => r.classList.remove('editing'));
}

async function confirmRename() {
  if (!pendingRename) return;

  const { categoryId, name, color, icon } = pendingRename;
  const cat = allCategories.find(c => c.id === categoryId);
  if (!cat) return;

  try {
    await window.api.updateCategory(categoryId, {
      name,
      color,
      icon,
      isActive: cat.is_active,
      sortOrder: cat.sort_order
    });
    showToast('Category renamed successfully');
    await loadCategories();
  } catch (error) {
    showToast('Failed to rename category: ' + error.message, 'error');
  }

  hideRenameModal();
}

async function deleteCategory(categoryId) {
  const cat = allCategories.find(c => c.id === categoryId);
  if (!cat) return;

  const annotationCount = await window.api.getCategoryAnnotationCount(categoryId);

  if (annotationCount > 0) {
    showToast(`Cannot delete category with ${annotationCount} existing annotation${annotationCount > 1 ? 's' : ''}`, 'error');
    return;
  }

  if (!confirm(`Delete category "${cat.name}"?`)) return;

  try {
    await window.api.deleteCategory(categoryId);
    showToast('Category deleted');
    await loadCategories();
  } catch (error) {
    showToast('Failed to delete category', 'error');
  }
}

async function toggleCategory(categoryId, checked) {
  const cat = allCategories.find(c => c.id === categoryId);
  if (!cat) return;

  if (checked) {
    const activeCount = allCategories.filter(c => c.is_active).length;
    if (activeCount >= MAX_ACTIVE) {
      showToast(`Maximum ${MAX_ACTIVE} active categories allowed`, 'error');
      // Revert the toggle
      const toggle = document.querySelector(`.category-toggle input[data-id="${categoryId}"]`);
      if (toggle) toggle.checked = false;
      return;
    }
  } else {
    // Disattivazione: controlla che ci sia almeno un'altra categoria attiva
    const activeCount = allCategories.filter(c => c.is_active).length;
    if (activeCount <= 1) {
      showToast('At least one category must be active', 'error');
      // Revert the toggle
      const toggle = document.querySelector(`.category-toggle input[data-id="${categoryId}"]`);
      if (toggle) toggle.checked = true;
      return;
    }
  }

  try {
    await window.api.updateCategory(categoryId, {
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
      isActive: checked ? 1 : 0,
      sortOrder: cat.sort_order
    });
    await loadCategories();
  } catch (error) {
    showToast('Failed to update category', 'error');
  }
}

async function addCategory() {
  const totalCount = allCategories.length;
  if (totalCount >= MAX_TOTAL) {
    showToast(`Maximum ${MAX_TOTAL} categories allowed`, 'error');
    return;
  }

  const activeCount = allCategories.filter(c => c.is_active).length;
  const maxOrder = allCategories.reduce((max, c) => Math.max(max, c.sort_order), 0);

  try {
    await window.api.addCategory({
      name: `Category ${totalCount + 1}`,
      color: '#6b7280',
      icon: 'label',
      sortOrder: maxOrder + 1,
      isActive: activeCount < MAX_ACTIVE ? 1 : 0
    });
    showToast('Category added');
    await loadCategories();

    // Auto-start editing the new category
    const lastCat = allCategories[allCategories.length - 1];
    if (lastCat) startEditing(lastCat.id);
  } catch (error) {
    showToast('Failed to add category: ' + error.message, 'error');
  }
}

// Drag-and-drop handlers
function handleDragStart(e) {
  const row = e.currentTarget.closest('.category-row');
  if (!row) return;

  dragSourceIndex = parseInt(row.dataset.index);
  row.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  const targetIndex = parseInt(e.currentTarget.dataset.index);
  if (dragSourceIndex === null || dragSourceIndex === targetIndex) return;

  // Reorder in-memory
  const [moved] = allCategories.splice(dragSourceIndex, 1);
  allCategories.splice(targetIndex, 0, moved);

  // Update sort_order for all
  const promises = allCategories.map((cat, i) => {
    cat.sort_order = i + 1;
    return window.api.updateCategoryOrder(cat.id, i + 1);
  });
  await Promise.all(promises);

  renderCategoryList();
}

function handleDragEnd(e) {
  const row = e.currentTarget.closest('.category-row');
  if (row) {
    row.classList.remove('dragging');
  }
  dragSourceIndex = null;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function saveSettings() {
  const apiKey = document.getElementById('api-key-input').value.trim();
  const provider = document.getElementById('provider-select').value;
  const model = document.getElementById('model-input').value.trim();
  const baseUrl = document.getElementById('base-url-input').value.trim();
  const temperature = document.getElementById('temperature-slider').value;
  const prompt = document.getElementById('prompt-input').value;
  const reviewStyleExample = document.getElementById('review-style-example-input').value.trim();

  await window.api.setSetting('llm_api_key', apiKey);
  await window.api.setSetting('llm_provider', provider);
  await window.api.setSetting('llm_model', model);
  await window.api.setSetting('llm_base_url', baseUrl);
  await window.api.setSetting('llm_temperature', temperature);
  await window.api.setSetting('llm_prompt', prompt);
  await window.api.setSetting('llm_review_style_example', reviewStyleExample);

  showToast('Settings saved successfully');
}

function toggleKeyVisibility() {
  const input = document.getElementById('api-key-input');
  showingKey = !showingKey;
  input.type = showingKey ? 'text' : 'password';

  const eyeIcon = document.getElementById('eye-icon');
  const slashIcon = document.getElementById('eye-slash-icon');
  eyeIcon.style.display = showingKey ? 'none' : 'block';
  slashIcon.style.display = showingKey ? 'block' : 'none';
}

function setupEventListeners() {
  document.getElementById('btn-back').addEventListener('click', () => {
    window.api.navigateToHome();
  });

  document.getElementById('btn-save').addEventListener('click', saveSettings);

  document.getElementById('btn-toggle-key').addEventListener('click', toggleKeyVisibility);

  document.getElementById('provider-select').addEventListener('change', (e) => {
    const nextProviderId = e.target.value;
    const provider = getLLMProviderDefinition(nextProviderId);

    if (provider) {
      document.getElementById('model-input').value = provider.defaultModel || '';
      document.getElementById('base-url-input').value = provider.defaultBaseUrl || '';
      applyProviderUI(nextProviderId);
    }
  });

  document.getElementById('temperature-slider').addEventListener('input', (e) => {
    document.getElementById('temperature-value').textContent = parseFloat(e.target.value).toFixed(1);
  });

  document.getElementById('btn-add-category').addEventListener('click', addCategory);

  document.addEventListener('click', closeIconPickers);

  // Rename modal
  document.getElementById('rename-modal-close').addEventListener('click', hideRenameModal);
  document.getElementById('rename-modal-cancel').addEventListener('click', hideRenameModal);
  document.getElementById('rename-modal-confirm').addEventListener('click', confirmRename);

  // Close modal on overlay click
  document.getElementById('rename-modal').addEventListener('click', (e) => {
    if (e.target.id === 'rename-modal') {
      hideRenameModal();
    }
  });
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

init();
