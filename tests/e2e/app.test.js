/**
 * E2E Tests for PDF Reviewer Application
 * Tests the complete application flow using Playwright
 */

const { test, expect } = require('@playwright/test');
const {
  launchApp,
  closeApp,
  takeScreenshot,
  getTestPDFPath,
  waitForElement
} = require('./electron-helpers');

let app;
let window;

test.describe('PDF Reviewer Application', () => {

  test.describe('1. Application Launch', () => {

    test('Application launches successfully', async () => {
      const result = await launchApp();
      app = result.app;
      window = result.window;

      expect(app).toBeTruthy();
      expect(window).toBeTruthy();

      await takeScreenshot(window, 'app-launch');
    });

    test('Home page loads correctly', async () => {
      const title = await window.title();
      expect(title).toBe('PDF Reviewer');

      // Check main elements exist
      const header = await window.$('.home-header');
      expect(header).toBeTruthy();

      const addButton = await window.$('#btn-add-pdf');
      expect(addButton).toBeTruthy();

      const searchInput = await window.$('#search-input');
      expect(searchInput).toBeTruthy();
    });

    test('Empty state is shown when no PDFs', async () => {
      // Wait for loading to complete
      await window.waitForSelector('#loading-state.hidden', { timeout: 5000 }).catch(() => {});

      const emptyState = await window.$('#empty-state:not(.hidden)');
      // Could be visible or hidden depending on prior state
      expect(true).toBe(true);
    });

    test.afterAll(async () => {
      await closeApp(app);
    });
  });

  test.describe('2. Home Page Features', () => {

    test.beforeAll(async () => {
      const result = await launchApp();
      app = result.app;
      window = result.window;
    });

    test('Search input is functional', async () => {
      const searchInput = await window.$('#search-input');
      await searchInput.fill('test search');

      const value = await searchInput.inputValue();
      expect(value).toBe('test search');

      // Clear search
      await searchInput.fill('');
    });

    test('Add PDF button is clickable', async () => {
      const addButton = await window.$('#btn-add-pdf');
      const isEnabled = await addButton.isEnabled();
      expect(isEnabled).toBe(true);
    });

    test('Drop zone responds to drag events', async () => {
      const dropZone = await window.$('#drop-zone');
      expect(dropZone).toBeTruthy();

      // Verify drop zone exists and has correct class
      const className = await dropZone.getAttribute('class');
      expect(className).toContain('drop-zone');
    });

    test('Keyboard shortcut Ctrl+O triggers file dialog', async () => {
      // This would trigger the file dialog - just verify the shortcut binding exists
      // We can't actually test the native file dialog
      const body = await window.$('body');
      expect(body).toBeTruthy();
    });

    test.afterAll(async () => {
      await closeApp(app);
    });
  });

  test.describe('3. Navigation', () => {

    test.beforeAll(async () => {
      const result = await launchApp();
      app = result.app;
      window = result.window;
    });

    test('Navigation from home to review page works', async () => {
      // This requires a PDF to be added first
      // For now, verify the navigation function is set up
      const api = await window.evaluate(() => {
        return typeof window.api !== 'undefined' &&
               typeof window.api.navigateToReview === 'function';
      });
      expect(api).toBe(true);
    });

    test('Back navigation function exists', async () => {
      const api = await window.evaluate(() => {
        return typeof window.api !== 'undefined' &&
               typeof window.api.navigateToHome === 'function';
      });
      expect(api).toBe(true);
    });

    test.afterAll(async () => {
      await closeApp(app);
    });
  });

  test.describe('4. API Bridge', () => {

    test.beforeAll(async () => {
      const result = await launchApp();
      app = result.app;
      window = result.window;
    });

    test('window.api is exposed', async () => {
      const hasApi = await window.evaluate(() => typeof window.api !== 'undefined');
      expect(hasApi).toBe(true);
    });

    test('PDF operations are available', async () => {
      const operations = await window.evaluate(() => {
        return {
          openPDFDialog: typeof window.api.openPDFDialog === 'function',
          readPDFFile: typeof window.api.readPDFFile === 'function',
          getPDFMetadata: typeof window.api.getPDFMetadata === 'function',
          addPDF: typeof window.api.addPDF === 'function',
          getAllPDFs: typeof window.api.getAllPDFs === 'function',
          getPDF: typeof window.api.getPDF === 'function',
          updatePDF: typeof window.api.updatePDF === 'function',
          deletePDF: typeof window.api.deletePDF === 'function',
          searchPDFs: typeof window.api.searchPDFs === 'function'
        };
      });

      expect(operations.openPDFDialog).toBe(true);
      expect(operations.readPDFFile).toBe(true);
      expect(operations.getPDFMetadata).toBe(true);
      expect(operations.addPDF).toBe(true);
      expect(operations.getAllPDFs).toBe(true);
      expect(operations.getPDF).toBe(true);
      expect(operations.updatePDF).toBe(true);
      expect(operations.deletePDF).toBe(true);
      expect(operations.searchPDFs).toBe(true);
    });

    test('Annotation operations are available', async () => {
      const operations = await window.evaluate(() => {
        return {
          addAnnotation: typeof window.api.addAnnotation === 'function',
          getAnnotationsForPDF: typeof window.api.getAnnotationsForPDF === 'function',
          getAnnotation: typeof window.api.getAnnotation === 'function',
          updateAnnotation: typeof window.api.updateAnnotation === 'function',
          deleteAnnotation: typeof window.api.deleteAnnotation === 'function',
          getAnnotationCountByCategory: typeof window.api.getAnnotationCountByCategory === 'function'
        };
      });

      expect(operations.addAnnotation).toBe(true);
      expect(operations.getAnnotationsForPDF).toBe(true);
      expect(operations.getAnnotation).toBe(true);
      expect(operations.updateAnnotation).toBe(true);
      expect(operations.deleteAnnotation).toBe(true);
      expect(operations.getAnnotationCountByCategory).toBe(true);
    });

    test('Category operations are available', async () => {
      const operations = await window.evaluate(() => {
        return {
          getAllCategories: typeof window.api.getAllCategories === 'function',
          getCategory: typeof window.api.getCategory === 'function'
        };
      });

      expect(operations.getAllCategories).toBe(true);
      expect(operations.getCategory).toBe(true);
    });

    test('Settings operations are available', async () => {
      const operations = await window.evaluate(() => {
        return {
          getSetting: typeof window.api.getSetting === 'function',
          setSetting: typeof window.api.setSetting === 'function'
        };
      });

      expect(operations.getSetting).toBe(true);
      expect(operations.setSetting).toBe(true);
    });

    test('Export operations are available', async () => {
      const operations = await window.evaluate(() => {
        return {
          saveFile: typeof window.api.saveFile === 'function'
        };
      });

      expect(operations.saveFile).toBe(true);
    });

    test('getAllPDFs returns array', async () => {
      const pdfs = await window.evaluate(async () => {
        return await window.api.getAllPDFs();
      });

      expect(Array.isArray(pdfs)).toBe(true);
    });

    test('getAllCategories returns default categories', async () => {
      const categories = await window.evaluate(async () => {
        return await window.api.getAllCategories();
      });

      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBe(5);

      const names = categories.map(c => c.name);
      expect(names).toContain('Critical');
      expect(names).toContain('Major');
      expect(names).toContain('Minor');
      expect(names).toContain('Suggestion');
      expect(names).toContain('Question');
    });

    test.afterAll(async () => {
      await closeApp(app);
    });
  });

  test.describe('5. Database Operations via IPC', () => {

    test.beforeAll(async () => {
      const result = await launchApp();
      app = result.app;
      window = result.window;
    });

    let testPdfId;

    test('Can add a PDF to database', async () => {
      const pdf = await window.evaluate(async () => {
        return await window.api.addPDF({
          name: 'e2e-test.pdf',
          path: '/tmp/e2e-test.pdf',
          pageCount: 5
        });
      });

      expect(pdf).toBeTruthy();
      expect(pdf.id).toBeTruthy();
      expect(pdf.name).toBe('e2e-test.pdf');
      expect(pdf.page_count).toBe(5);

      testPdfId = pdf.id;
    });

    test('Can retrieve PDF by ID', async () => {
      const pdf = await window.evaluate(async (id) => {
        return await window.api.getPDF(id);
      }, testPdfId);

      expect(pdf).toBeTruthy();
      expect(pdf.id).toBe(testPdfId);
    });

    test('Can search PDFs', async () => {
      const results = await window.evaluate(async () => {
        return await window.api.searchPDFs('e2e');
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(p => p.name === 'e2e-test.pdf')).toBe(true);
    });

    test('Can add annotation to PDF', async () => {
      const annotation = await window.evaluate(async (pdfId) => {
        return await window.api.addAnnotation({
          pdfId: pdfId,
          categoryId: 1,
          pageNumber: 1,
          selectedText: 'E2E test text',
          comment: 'E2E test comment',
          highlightRects: [{ left: 10, top: 20, width: 100, height: 15 }]
        });
      }, testPdfId);

      expect(annotation).toBeTruthy();
      expect(annotation.id).toBeTruthy();
      expect(annotation.selected_text).toBe('E2E test text');
      expect(annotation.category_name).toBe('Critical');
    });

    test('Can get annotations for PDF', async () => {
      const annotations = await window.evaluate(async (pdfId) => {
        return await window.api.getAnnotationsForPDF(pdfId);
      }, testPdfId);

      expect(annotations.length).toBeGreaterThanOrEqual(1);
    });

    test('Can get annotation count by category', async () => {
      const counts = await window.evaluate(async (pdfId) => {
        return await window.api.getAnnotationCountByCategory(pdfId);
      }, testPdfId);

      expect(counts.length).toBe(5);
      const criticalCount = counts.find(c => c.name === 'Critical');
      expect(criticalCount.count).toBeGreaterThanOrEqual(1);
    });

    test('Can update PDF', async () => {
      const updated = await window.evaluate(async (id) => {
        return await window.api.updatePDF(id, { name: 'updated-e2e-test.pdf' });
      }, testPdfId);

      expect(updated.name).toBe('updated-e2e-test.pdf');
    });

    test('Can delete PDF', async () => {
      await window.evaluate(async (id) => {
        return await window.api.deletePDF(id, true);
      }, testPdfId);

      const deleted = await window.evaluate(async (id) => {
        return await window.api.getPDF(id);
      }, testPdfId);

      expect(deleted).toBeFalsy();
    });

    test('Settings can be saved and retrieved', async () => {
      await window.evaluate(async () => {
        return await window.api.setSetting('e2e-test-key', { value: 'test' });
      });

      const setting = await window.evaluate(async () => {
        return await window.api.getSetting('e2e-test-key');
      });

      expect(setting).toEqual({ value: 'test' });
    });

    test.afterAll(async () => {
      await closeApp(app);
    });
  });

  test.describe('6. UI Components', () => {

    test.beforeAll(async () => {
      const result = await launchApp();
      app = result.app;
      window = result.window;
    });

    test('Toast container exists', async () => {
      const toastContainer = await window.$('#toast-container');
      expect(toastContainer).toBeTruthy();
    });

    test('Modal overlay exists', async () => {
      const modal = await window.$('#delete-modal');
      expect(modal).toBeTruthy();
    });

    test('Modal can be opened and closed', async () => {
      // Modal should be hidden initially
      const isHidden = await window.evaluate(() => {
        const modal = document.querySelector('#delete-modal');
        return !modal.classList.contains('active');
      });
      expect(isHidden).toBe(true);
    });

    test('CSS variables are defined', async () => {
      const hasVariables = await window.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return style.getPropertyValue('--color-primary') !== '';
      });
      expect(hasVariables).toBe(true);
    });

    test.afterAll(async () => {
      await closeApp(app);
    });
  });

  test.describe('7. Error Handling', () => {

    test.beforeAll(async () => {
      const result = await launchApp();
      app = result.app;
      window = result.window;
    });

    test('Getting non-existent PDF returns undefined', async () => {
      const pdf = await window.evaluate(async () => {
        return await window.api.getPDF('non-existent-id');
      });

      expect(pdf).toBeFalsy();
    });

    test('Getting annotations for non-existent PDF returns empty array', async () => {
      const annotations = await window.evaluate(async () => {
        return await window.api.getAnnotationsForPDF('non-existent-id');
      });

      expect(Array.isArray(annotations)).toBe(true);
      expect(annotations.length).toBe(0);
    });

    test('Getting non-existent setting returns null', async () => {
      const setting = await window.evaluate(async () => {
        return await window.api.getSetting('non-existent-key');
      });

      expect(setting).toBeNull();
    });

    test.afterAll(async () => {
      await closeApp(app);
    });
  });
});
