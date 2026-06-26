import { formatDate } from './utils.js';

export class AnnotationManager {
  constructor(options = {}) {
    this.pdfId = options.pdfId;
    this.annotations = [];
    this.categories = [];
    this.activeFilters = new Set();
    this.sortBy = 'page';
    this.pdfMetadata = options.pdfMetadata || null;

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

  setPDFMetadata(pdfMetadata) {
    this.pdfMetadata = pdfMetadata;
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
      format: 'reviewer-annotations',
      version: 2,
      exportedAt: new Date().toISOString(),
      pdfId: this.pdfId,
      pdf: {
        id: this.pdfId,
        name: this.pdfMetadata?.name || null,
        pageCount: this.pdfMetadata?.page_count || null,
        size: this.pdfMetadata?.size || null,
        lastModified: this.pdfMetadata?.last_modified || null
      },
      totalAnnotations: this.annotations.length,
      annotations: this.annotations.map(a => ({
        id: a.id,
        category: a.category_name,
        categoryName: a.category_name,
        categoryColor: a.category_color,
        categoryIcon: a.category_icon,
        pageNumber: a.page_number,
        selectedText: a.selected_text,
        comment: a.comment,
        highlightRects: a.highlight_rects || [],
        createdAt: a.created_at,
        updatedAt: a.updated_at
      })),
      totalHighlights: highlights.length,
      highlights: highlights.map(h => ({
        id: h.id,
        pageNumber: h.page_number,
        selectedText: h.selected_text,
        highlightRects: h.highlight_rects || [],
        color: h.color,
        createdAt: h.created_at
      }))
    };

    return JSON.stringify(data, null, 2);
  }

  async importFromJSON(importData, options = {}) {
    const parsed = this.normalizeImportData(importData);
    const createdCategories = [];
    const categoryResolver = await this.createCategoryResolver(createdCategories);
    const importedAnnotations = [];
    const importedHighlights = [];

    try {
      for (const annotation of parsed.annotations) {
        const categoryId = await categoryResolver(annotation);
        const imported = await window.api.addAnnotation({
          pdfId: this.pdfId,
          categoryId,
          pageNumber: annotation.pageNumber,
          selectedText: annotation.selectedText,
          comment: annotation.comment,
          highlightRects: annotation.highlightRects
        });
        importedAnnotations.push(imported);
      }

      for (const highlight of parsed.highlights) {
        const imported = await window.api.addHighlight({
          pdfId: this.pdfId,
          pageNumber: highlight.pageNumber,
          selectedText: highlight.selectedText,
          highlightRects: highlight.highlightRects,
          color: highlight.color
        });
        importedHighlights.push(imported);
      }
    } catch (error) {
      await this.rollbackImport(importedAnnotations, importedHighlights, createdCategories);
      throw error;
    }

    await this.loadCategories();
    await this.loadAnnotations();

    if (options.notify !== false) {
      this.onAnnotationsFiltered(this.getFilteredAndSorted());
    }

    return {
      annotations: importedAnnotations,
      highlights: importedHighlights,
      categories: createdCategories,
      parsed
    };
  }

  normalizeImportData(importData) {
    if (!importData || typeof importData !== 'object') {
      throw new Error('Import file must contain a JSON object');
    }

    const annotations = Array.isArray(importData.annotations) ? importData.annotations : [];
    const highlights = Array.isArray(importData.highlights) ? importData.highlights : [];

    if (annotations.length === 0 && highlights.length === 0) {
      throw new Error('No annotations or highlights found in import file');
    }

    return {
      metadata: {
        format: importData.format || null,
        version: importData.version || 1,
        pdf: importData.pdf || null,
        pdfId: importData.pdfId || null,
        exportedAt: importData.exportedAt || null
      },
      annotations: annotations.map((annotation, index) => this.normalizeImportedAnnotation(annotation, index)),
      highlights: highlights.map((highlight, index) => this.normalizeImportedHighlight(highlight, index))
    };
  }

  normalizeImportedAnnotation(annotation, index) {
    const pageNumber = Number(annotation.pageNumber ?? annotation.page_number);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw new Error(`Annotation ${index + 1} has an invalid page number`);
    }

    return {
      categoryName: this.normalizeCategoryName(annotation.categoryName || annotation.category),
      categoryColor: annotation.categoryColor || annotation.category_color || '#2563eb',
      categoryIcon: annotation.categoryIcon || annotation.category_icon || 'lightbulb',
      pageNumber,
      selectedText: annotation.selectedText ?? annotation.selected_text ?? null,
      comment: annotation.comment ?? null,
      highlightRects: this.normalizeHighlightRects(annotation.highlightRects ?? annotation.highlight_rects)
    };
  }

  normalizeCategoryName(categoryName) {
    const normalized = String(categoryName || '').trim();
    return normalized || 'Suggestion';
  }

  normalizeImportedHighlight(highlight, index) {
    const pageNumber = Number(highlight.pageNumber ?? highlight.page_number);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw new Error(`Highlight ${index + 1} has an invalid page number`);
    }

    return {
      pageNumber,
      selectedText: highlight.selectedText ?? highlight.selected_text ?? null,
      highlightRects: this.normalizeHighlightRects(highlight.highlightRects ?? highlight.highlight_rects),
      color: highlight.color || '#fbbf24'
    };
  }

  normalizeHighlightRects(rects) {
    if (!rects) return [];
    if (typeof rects === 'string') {
      return JSON.parse(rects);
    }
    if (!Array.isArray(rects)) {
      throw new Error('Highlight rectangles must be an array');
    }
    return rects;
  }

  async createCategoryResolver(createdCategories) {
    const categoriesByName = new Map(this.categories.map(category => [
      category.name.trim().toLowerCase(),
      category
    ]));
    let nextSortOrder = this.categories.reduce((max, category) => Math.max(max, category.sort_order || 0), 0) + 1;

    return async (annotation) => {
      const key = annotation.categoryName.trim().toLowerCase();
      if (categoriesByName.has(key)) {
        return categoriesByName.get(key).id;
      }

      const created = await window.api.addCategory({
        name: annotation.categoryName,
        color: annotation.categoryColor,
        icon: annotation.categoryIcon,
        sortOrder: nextSortOrder++,
        isActive: 1
      });
      categoriesByName.set(key, created);
      this.categories.push(created);
      createdCategories.push(created);
      return created.id;
    };
  }

  async rollbackImport(importedAnnotations, importedHighlights, importedCategories = []) {
    await Promise.allSettled([
      ...importedAnnotations.map(annotation => window.api.deleteAnnotation(annotation.id)),
      ...importedHighlights.map(highlight => window.api.deleteHighlight(highlight.id))
    ]);

    await Promise.allSettled(
      importedCategories.map(category => window.api.deleteCategory(category.id))
    );

    await this.loadCategories();
    await this.loadAnnotations();
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
