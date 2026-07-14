// Utility functions

/**
 * Generate a UUID v4
 * Uses crypto.randomUUID if available, falls back to manual generation
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Format a date string to a human-readable format
 * @param {string|Date} date - ISO date string or Date object
 * @param {boolean} includeTime - Whether to include time
 * @returns {string} Formatted date string
 */
export function formatDate(date, includeTime = false) {
  const d = typeof date === 'string' ? new Date(date) : date;

  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  };

  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }

  return d.toLocaleDateString('en-US', options);
}

/**
 * Classify a date-only deadline by its distance from a reference day.
 * Date inputs use YYYY-MM-DD, so local calendar dates avoid UTC off-by-one
 * errors around timezone boundaries.
 *
 * @param {string} dueDate A date in YYYY-MM-DD format
 * @param {Date} referenceDate The date used as "today"
 * @returns {'overdue'|'urgent'|'soon'|'upcoming'|'muted'}
 */
export function getDueDateStatus(dueDate, referenceDate = new Date()) {
  if (!dueDate) return 'muted';

  const [year, month, day] = String(dueDate).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return 'muted';

  const deadline = new Date(year, month - 1, day);
  if (
    deadline.getFullYear() !== year ||
    deadline.getMonth() !== month - 1 ||
    deadline.getDate() !== day
  ) {
    return 'muted';
  }

  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const daysUntil = Math.round((deadline - today) / 86_400_000);

  if (daysUntil < 0) return 'overdue';
  if (daysUntil <= 3) return 'urgent';
  if (daysUntil <= 7) return 'soon';
  return 'upcoming';
}

/**
 * Format a relative time string (e.g., "2 hours ago")
 * @param {string|Date} date - ISO date string or Date object
 * @returns {string} Relative time string
 */
export function formatRelativeTime(date) {
  let d;
  if (typeof date === 'string') {
    // SQLite datetime('now') returns UTC without timezone suffix — append 'Z'
    d = new Date(date.endsWith('Z') || date.includes('+') ? date : date + 'Z');
  } else {
    d = date;
  }
  const now = new Date();
  const diffMs = now - d;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  } else {
    return formatDate(d);
  }
}

/**
 * Truncate text to a maximum length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Format file size in human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Debounce a function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle a function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Limit in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Get category icon SVG
 * @param {string} iconName - Icon name
 * @returns {string} SVG string
 */
export function getCategoryIcon(iconName) {
  const icons = {
    label: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.59 13.41 12 22l-9-9V4h9l8.59 8.59a2 2 0 0 1 0 2.82zM7.5 8A1.5 1.5 0 1 0 7.5 5 1.5 1.5 0 0 0 7.5 8z"/></svg>`,
    flag: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 22h2V3H5v19zm4-18v11h6l1-2h4V4h-6l-1 2H9z"/></svg>`,
    star: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 2.9 6.26L22 9.27l-5.2 4.96 1.27 7.05L12 17.86l-6.07 3.42 1.27-7.05L2 9.27l7.1-1.01L12 2z"/></svg>`,
    bookmark: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12a1 1 0 0 1 1 1v18l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.2 16.6 4.9 12.3 3.5 13.7l5.7 5.7L21 7.6 19.6 6.2 9.2 16.6z"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 17.25V21h3.75L18.81 9.94l-3.75-3.75L4 17.25zm17.71-10.04a1 1 0 0 0 0-1.42l-2.5-2.5a1 1 0 0 0-1.42 0l-1.48 1.48 3.75 3.75 1.65-1.31z"/></svg>`,
    attach: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 6.5v9a4.5 4.5 0 1 1-9 0v-10a3 3 0 0 1 6 0v9.5a1.5 1.5 0 0 1-3 0v-8h-2v8a3.5 3.5 0 0 0 7 0V5.5a5 5 0 0 0-10 0v10a6.5 6.5 0 1 0 13 0v-9h-2z"/></svg>`,
    code: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.7 16.6 4.1 12l4.6-4.6L7.3 6 1.3 12l6 6 1.4-1.4zm6.6 0 4.6-4.6-4.6-4.6L16.7 6l6 6-6 6-1.4-1.4zM13.9 4l-5.8 16h2.1L16 4h-2.1z"/></svg>`,
    error: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`,
    info: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`,
    lightbulb: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/></svg>`,
    help: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>`
  };
  return icons[iconName] || icons.info;
}
