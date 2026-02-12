import { formatDate } from './utils.js';

export class AnnotationManager {
  constructor(options = {}) {
    this.pdfId = options.pdfId;
    this.annotations = [];
    this.categories = [];
    this.activeFilters = new Set();
    this.sortBy = 'page';

    this.onAnnotationCreated = options.onAnnotationCreated || (() => {});
    this.onAnnotationUpdated = options.onAnnotationUpdated || (() => {});
    this.onAnnotationDeleted = options.onAnnotationDeleted || (() => {});
    this.onAnnotationsFiltered = options.onAnnotationsFiltered || (() => {});
  }

  async loadCategories() {
    this.categories = await window.api.getAllCategories();
    return this.categories;
  }

  async loadAnnotations() {
    if (!this.pdfId) return [];

    this.annotations = await window.api.getAnnotationsForPDF(this.pdfId);
    return this.getFilteredAndSorted();
  }

  async createAnnotation(data) {
    console.log('AnnotationManager.createAnnotation called with:', data);
    console.log('pdfId:', this.pdfId);

    const annotationData = {
      pdfId: this.pdfId,
      categoryId: data.categoryId,
      pageNumber: data.pageNumber,
      selectedText: data.selectedText,
      comment: data.comment,
      highlightRects: data.highlightRects
    };
    console.log('Sending to API:', annotationData);

    const annotation = await window.api.addAnnotation(annotationData);
    console.log('Received from API:', annotation);

    this.annotations.push(annotation);
    console.log('Annotations array now has', this.annotations.length, 'items');

    this.onAnnotationCreated(annotation);

    return annotation;
  }

  async updateAnnotation(id, data) {
    const annotation = await window.api.updateAnnotation(id, data);

    const index = this.annotations.findIndex(a => a.id === id);
    if (index !== -1) {
      this.annotations[index] = annotation;
    }

    this.onAnnotationUpdated(annotation);
    return annotation;
  }

  async deleteAnnotation(id) {
    await window.api.deleteAnnotation(id);

    this.annotations = this.annotations.filter(a => a.id !== id);
    this.onAnnotationDeleted(id);
  }

  getAnnotation(id) {
    return this.annotations.find(a => a.id === id);
  }

  setFilters(categoryIds) {
    this.activeFilters = new Set(categoryIds);
    this.onAnnotationsFiltered(this.getFilteredAndSorted());
  }

  toggleFilter(categoryId) {
    if (this.activeFilters.has(categoryId)) {
      this.activeFilters.delete(categoryId);
    } else {
      this.activeFilters.add(categoryId);
    }
    this.onAnnotationsFiltered(this.getFilteredAndSorted());
  }

  clearFilters() {
    this.activeFilters.clear();
    this.onAnnotationsFiltered(this.getFilteredAndSorted());
  }

  setSortBy(sortBy) {
    this.sortBy = sortBy;
    this.onAnnotationsFiltered(this.getFilteredAndSorted());
  }

  getFilteredAndSorted() {
    let result = [...this.annotations];

    // Apply filters
    if (this.activeFilters.size > 0) {
      result = result.filter(a => this.activeFilters.has(a.category_id));
    }

    // Apply sorting
    switch (this.sortBy) {
      case 'page':
        result.sort((a, b) => {
          if (a.page_number !== b.page_number) {
            return a.page_number - b.page_number;
          }
          return new Date(a.created_at) - new Date(b.created_at);
        });
        break;
      case 'date':
        result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        break;
      case 'category':
        result.sort((a, b) => {
          const catA = this.categories.find(c => c.id === a.category_id);
          const catB = this.categories.find(c => c.id === b.category_id);
          if (catA?.sort_order !== catB?.sort_order) {
            return (catA?.sort_order || 0) - (catB?.sort_order || 0);
          }
          return a.page_number - b.page_number;
        });
        break;
    }

    return result;
  }

  getCategoryCounts() {
    const counts = {};
    this.categories.forEach(cat => {
      counts[cat.id] = 0;
    });

    this.annotations.forEach(a => {
      if (counts[a.category_id] === undefined) {
        counts[a.category_id] = 0;
      }
      counts[a.category_id]++;
    });

    return counts;
  }

  async exportAsJSON() {
    // Get highlights for this PDF
    const highlights = await window.api.getHighlightsForPDF(this.pdfId);

    const data = {
      exportedAt: new Date().toISOString(),
      pdfId: this.pdfId,
      totalAnnotations: this.annotations.length,
      annotations: this.annotations.map(a => ({
        id: a.id,
        category: a.category_name,
        pageNumber: a.page_number,
        selectedText: a.selected_text,
        comment: a.comment,
        createdAt: a.created_at,
        updatedAt: a.updated_at
      })),
      totalHighlights: highlights.length,
      highlights: highlights.map(h => ({
        id: h.id,
        pageNumber: h.page_number,
        selectedText: h.selected_text,
        createdAt: h.created_at
      }))
    };

    return JSON.stringify(data, null, 2);
  }

  async exportAsCSV() {
    // Get highlights for this PDF
    const highlights = await window.api.getHighlightsForPDF(this.pdfId);

    const headers = ['Type', 'Category', 'Page', 'Selected Text', 'Comment', 'Created At'];

    // Annotation rows
    const annotationRows = this.annotations.map(a => [
      'Annotation',
      a.category_name,
      a.page_number,
      `"${(a.selected_text || '').replace(/"/g, '""')}"`,
      `"${(a.comment || '').replace(/"/g, '""')}"`,
      formatDate(a.created_at, true)
    ]);

    // Highlight rows
    const highlightRows = highlights.map(h => [
      'Highlight',
      '',
      h.page_number,
      `"${(h.selected_text || '').replace(/"/g, '""')}"`,
      '',
      formatDate(h.created_at, true)
    ]);

    const allRows = [...annotationRows, ...highlightRows];
    return [headers.join(','), ...allRows.map(r => r.join(','))].join('\n');
  }
}

export default AnnotationManager;
