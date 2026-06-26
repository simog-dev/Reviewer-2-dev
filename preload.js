const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // PDF Operations
  openPDFDialog: () => ipcRenderer.invoke('dialog:openPDF'),
  readPDFFile: (filePath) => ipcRenderer.invoke('pdf:readFile', filePath),
  getPDFMetadata: (filePath) => ipcRenderer.invoke('pdf:getMetadata', filePath),
  addPDFFromData: (name, data) => ipcRenderer.invoke('pdf:addFromData', name, data),
  checkPDFExists: (filePath) => ipcRenderer.invoke('pdf:fileExists', filePath),

  // Database Operations - PDFs
  addPDF: (pdfData) => ipcRenderer.invoke('db:addPDF', pdfData),
  getAllPDFs: () => ipcRenderer.invoke('db:getAllPDFs'),
  getPDF: (id) => ipcRenderer.invoke('db:getPDF', id),
  updatePDF: (id, data) => ipcRenderer.invoke('db:updatePDF', id, data),
  deletePDF: (id, deleteAnnotations) => ipcRenderer.invoke('db:deletePDF', id, deleteAnnotations),
  searchPDFs: (query) => ipcRenderer.invoke('db:searchPDFs', query),
  markPDFCompleted: (id, reviewDecision) => ipcRenderer.invoke('db:markPDFCompleted', id, reviewDecision),
  markPDFIncomplete: (id) => ipcRenderer.invoke('db:markPDFIncomplete', id),

  // Database Operations - Annotations
  addAnnotation: (annotationData) => ipcRenderer.invoke('db:addAnnotation', annotationData),
  getAnnotationsForPDF: (pdfId) => ipcRenderer.invoke('db:getAnnotationsForPDF', pdfId),
  getAnnotation: (id) => ipcRenderer.invoke('db:getAnnotation', id),
  updateAnnotation: (id, data) => ipcRenderer.invoke('db:updateAnnotation', id, data),
  deleteAnnotation: (id) => ipcRenderer.invoke('db:deleteAnnotation', id),
  getAnnotationCountByCategory: (pdfId) => ipcRenderer.invoke('db:getAnnotationCountByCategory', pdfId),

  // Database Operations - Highlights
  addHighlight: (highlightData) => ipcRenderer.invoke('db:addHighlight', highlightData),
  getHighlightsForPDF: (pdfId) => ipcRenderer.invoke('db:getHighlightsForPDF', pdfId),
  deleteHighlight: (id) => ipcRenderer.invoke('db:deleteHighlight', id),

  // Database Operations - Categories
  getAllCategories: () => ipcRenderer.invoke('db:getAllCategories'),
  getActiveCategories: () => ipcRenderer.invoke('db:getActiveCategories'),
  getCategory: (id) => ipcRenderer.invoke('db:getCategory', id),
  addCategory: (data) => ipcRenderer.invoke('db:addCategory', data),
  updateCategory: (id, data) => ipcRenderer.invoke('db:updateCategory', id, data),
  deleteCategory: (id) => ipcRenderer.invoke('db:deleteCategory', id),
  updateCategoryOrder: (id, sortOrder) => ipcRenderer.invoke('db:updateCategoryOrder', id, sortOrder),
  getCategoryCount: () => ipcRenderer.invoke('db:getCategoryCount'),
  getActiveCategoryCount: () => ipcRenderer.invoke('db:getActiveCategoryCount'),
  getCategoryAnnotationCount: (categoryId) => ipcRenderer.invoke('db:getCategoryAnnotationCount', categoryId),
  reassignAnnotations: (fromId, toId) => ipcRenderer.invoke('db:reassignAnnotations', fromId, toId),

  // Export Operations
  saveFile: (options) => ipcRenderer.invoke('export:saveFile', options),
  openImportFile: () => ipcRenderer.invoke('import:openFile'),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  // Navigation
  navigateToReview: (pdfId) => ipcRenderer.invoke('navigate:review', pdfId),
  navigateToHome: () => ipcRenderer.invoke('navigate:home'),
  navigateToSettings: () => ipcRenderer.invoke('navigate:settings'),

  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (event, info) => callback(info)),
  onUpdateDownloadProgress: (callback) => ipcRenderer.on('update-download-progress', (event, progress) => callback(progress)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (event, info) => callback(info))
});
