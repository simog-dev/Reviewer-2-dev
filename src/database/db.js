const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class DBManager {
  constructor(dbPath) {
    // Ensure the directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.initialize();
    this.prepareStatements();
    this.migrateProjectVenues();
    this.cleanupEmptyProjects();
    this.cleanupUnusedVenues();
  }

  initialize() {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    this.db.exec(schema);

    // Keep the legacy column so older databases can be cleaned up safely.
    try {
      this.db.exec(`ALTER TABLE pdfs ADD COLUMN removed INTEGER DEFAULT 0`);
    } catch (e) {
      // Column already exists, ignore
    }

    // Add category customization columns
    try {
      this.db.exec(`ALTER TABLE categories ADD COLUMN is_active INTEGER DEFAULT 1`);
    } catch (e) { /* already exists */ }
    try {
      this.db.exec(`ALTER TABLE categories ADD COLUMN is_default INTEGER DEFAULT 0`);
    } catch (e) { /* already exists */ }

    // Mark the 5 seed categories as default
    this.db.exec(`UPDATE categories SET is_default = 1 WHERE id <= 5`);

    // Add completion columns for PDFs
    try {
      this.db.exec(`ALTER TABLE pdfs ADD COLUMN completed INTEGER DEFAULT 0`);
    } catch (e) { /* already exists */ }
    try {
      this.db.exec(`ALTER TABLE pdfs ADD COLUMN review_decision TEXT`);
    } catch (e) { /* already exists */ }
    try {
      this.db.exec(`ALTER TABLE pdfs ADD COLUMN completed_at TEXT`);
    } catch (e) { /* already exists */ }
    try {
      this.db.exec(`ALTER TABLE pdfs ADD COLUMN project_id TEXT`);
    } catch (e) { /* already exists */ }
    try {
      this.db.exec(`ALTER TABLE pdfs ADD COLUMN review_deadline TEXT`);
    } catch (e) { /* already exists */ }
    try {
      this.db.exec(`ALTER TABLE pdfs ADD COLUMN review_content TEXT`);
    } catch (e) { /* already exists */ }
    try {
      this.db.exec(`ALTER TABLE pdfs ADD COLUMN review_updated_at TEXT`);
    } catch (e) { /* already exists */ }
    try {
      this.db.exec(`ALTER TABLE projects ADD COLUMN venue_id TEXT`);
    } catch (e) { /* already exists */ }

    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_pdfs_project_id ON pdfs(project_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_projects_venue_id ON projects(venue_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_venues_name_normalized ON venues(name_normalized)`);

    // Migrate old completion_comment to review_decision if column exists
    try {
      const columns = this.db.prepare(`PRAGMA table_info(pdfs)`).all();
      const hasOldColumn = columns.some(col => col.name === 'completion_comment');
      if (hasOldColumn) {
        // Copy data from old column to new column (if any)
        this.db.exec(`UPDATE pdfs SET review_decision = completion_comment WHERE completion_comment IS NOT NULL AND review_decision IS NULL`);
      }
    } catch (e) { /* ignore */ }

    this.migratePDFsToProjects();
  }

  normalizeVenueName(name) {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  ensureVenue(name) {
    if (typeof name !== 'string') return null;

    const displayName = name.trim().replace(/\s+/g, ' ');
    if (!displayName) return null;

    const normalizedName = this.normalizeVenueName(displayName);
    this.stmts.insertVenue.run({
      id: uuidv4(),
      name: displayName,
      nameNormalized: normalizedName
    });

    return this.stmts.getVenueByNormalized.get(normalizedName);
  }

  migrateProjectVenues() {
    const projects = this.db.prepare(`
      SELECT id, conference
      FROM projects
      WHERE conference IS NOT NULL AND trim(conference) != ''
    `).all();

    const assignVenue = this.db.prepare(`UPDATE projects SET venue_id = ? WHERE id = ?`);
    const migrate = this.db.transaction((rows) => {
      rows.forEach(project => {
        const venue = this.ensureVenue(project.conference);
        if (venue) assignVenue.run(venue.id, project.id);
      });
    });

    migrate(projects);
  }

  migratePDFsToProjects() {
    const unmigrated = this.db.prepare(`
      SELECT id, name, created_at, updated_at
      FROM pdfs
      WHERE project_id IS NULL
      ORDER BY created_at ASC, name ASC
    `).all();

    if (unmigrated.length === 0) return;

    const insertProject = this.db.prepare(`
      INSERT INTO projects (id, name, created_at, updated_at)
      VALUES (@id, @name, COALESCE(@createdAt, datetime('now')), COALESCE(@updatedAt, datetime('now')))
    `);
    const assignPDF = this.db.prepare(`
      UPDATE pdfs
      SET project_id = @projectId,
          updated_at = datetime('now')
      WHERE id = @pdfId
    `);

    const migrate = this.db.transaction((pdfs) => {
      pdfs.forEach((pdf, index) => {
        const projectId = uuidv4();
        insertProject.run({
          id: projectId,
          name: `Progetto ${index + 1}`,
          createdAt: pdf.created_at,
          updatedAt: pdf.updated_at
        });
        assignPDF.run({ projectId, pdfId: pdf.id });
      });
    });

    migrate(unmigrated);
  }

  prepareStatements() {
    // PDF statements
    this.stmts = {
      // PDFs
      insertPDF: this.db.prepare(`
        INSERT INTO pdfs (id, project_id, name, path, page_count, review_deadline, created_at, updated_at)
        VALUES (@id, @projectId, @name, @path, @pageCount, @reviewDeadline, datetime('now'), datetime('now'))
      `),
      getAllPDFs: this.db.prepare(`
        SELECT p.*,
               pr.name as project_name,
               pr.conference as project_conference,
               pr.submission_link as project_submission_link,
               (SELECT COUNT(*) FROM annotations WHERE pdf_id = p.id) as annotation_count
        FROM pdfs p
        LEFT JOIN projects pr ON pr.id = p.project_id
        WHERE p.removed = 0
        ORDER BY p.updated_at DESC
      `),
      getPDF: this.db.prepare(`
        SELECT p.*,
               pr.name as project_name,
               pr.conference as project_conference,
               pr.submission_link as project_submission_link,
               (SELECT COUNT(*) FROM annotations WHERE pdf_id = p.id) as annotation_count
        FROM pdfs p
        LEFT JOIN projects pr ON pr.id = p.project_id
        WHERE p.id = ?
      `),
      updatePDF: this.db.prepare(`
        UPDATE pdfs
        SET name = COALESCE(@name, name),
            path = COALESCE(@path, path),
            page_count = COALESCE(@pageCount, page_count),
            review_deadline = CASE
              WHEN @reviewDeadlineSet = 1 THEN @reviewDeadline
              ELSE review_deadline
            END,
            review_content = CASE
              WHEN @reviewContentSet = 1 THEN @reviewContent
              ELSE review_content
            END,
            review_updated_at = CASE
              WHEN @reviewUpdatedAtSet = 1 THEN @reviewUpdatedAt
              ELSE review_updated_at
            END,
            last_opened_at = COALESCE(@lastOpenedAt, last_opened_at),
            updated_at = datetime('now')
        WHERE id = @id
      `),
      deletePDF: this.db.prepare(`DELETE FROM pdfs WHERE id = ?`),
      searchPDFs: this.db.prepare(`
        SELECT p.*,
               pr.name as project_name,
               pr.conference as project_conference,
               pr.submission_link as project_submission_link,
               (SELECT COUNT(*) FROM annotations WHERE pdf_id = p.id) as annotation_count
        FROM pdfs p
        LEFT JOIN projects pr ON pr.id = p.project_id
        WHERE p.removed = 0 AND (p.name LIKE ? OR pr.name LIKE ? OR pr.conference LIKE ?)
        ORDER BY p.updated_at DESC
      `),
      findRemovedPDFByPath: this.db.prepare(`SELECT * FROM pdfs WHERE path = ? AND removed = 1`),
      countActivePDFsForProject: this.db.prepare(`
        SELECT COUNT(*) as count
        FROM pdfs
        WHERE project_id = ? AND removed = 0
      `),

      // Projects
      insertProject: this.db.prepare(`
        INSERT INTO projects (id, name, conference, venue_id, submission_link, created_at, updated_at)
        VALUES (@id, @name, @conference, @venueId, @submissionLink, datetime('now'), datetime('now'))
      `),
      getProject: this.db.prepare(`SELECT * FROM projects WHERE id = ?`),
      updateProject: this.db.prepare(`
        UPDATE projects
        SET name = COALESCE(@name, name),
            conference = @conference,
            venue_id = @venueId,
            submission_link = @submissionLink,
            updated_at = datetime('now')
        WHERE id = @id
      `),
      deleteProject: this.db.prepare(`DELETE FROM projects WHERE id = ?`),
      getPDFsForProject: this.db.prepare(`
        SELECT p.*,
               (SELECT COUNT(*) FROM annotations WHERE pdf_id = p.id) as annotation_count
        FROM pdfs p
        WHERE p.project_id = ? AND p.removed = 0
        ORDER BY p.created_at ASC
      `),
      getEmptyProjectIds: this.db.prepare(`
        SELECT pr.id
        FROM projects pr
        WHERE NOT EXISTS (
          SELECT 1
          FROM pdfs p
          WHERE p.project_id = pr.id AND p.removed = 0
        )
      `),
      deleteAnnotationsForProject: this.db.prepare(`
        DELETE FROM annotations
        WHERE pdf_id IN (
          SELECT id
          FROM pdfs
          WHERE project_id = ?
        )
      `),
      deleteHighlightsForProject: this.db.prepare(`
        DELETE FROM highlights
        WHERE pdf_id IN (
          SELECT id
          FROM pdfs
          WHERE project_id = ?
        )
      `),
      deletePDFsForProject: this.db.prepare(`DELETE FROM pdfs WHERE project_id = ?`),

      // Venues
      insertVenue: this.db.prepare(`
        INSERT INTO venues (id, name, name_normalized, created_at, updated_at)
        VALUES (@id, @name, @nameNormalized, datetime('now'), datetime('now'))
        ON CONFLICT(name_normalized) DO UPDATE SET updated_at = datetime('now')
      `),
      getVenueByNormalized: this.db.prepare(`SELECT * FROM venues WHERE name_normalized = ?`),
      getAllVenues: this.db.prepare(`SELECT * FROM venues ORDER BY name COLLATE NOCASE ASC`),
      deleteUnusedVenues: this.db.prepare(`
        DELETE FROM venues
        WHERE NOT EXISTS (
          SELECT 1
          FROM projects
          WHERE projects.venue_id = venues.id
        )
      `),

      // Annotations
      insertAnnotation: this.db.prepare(`
        INSERT INTO annotations (id, pdf_id, category_id, page_number, selected_text, comment, highlight_rects, created_at, updated_at)
        VALUES (@id, @pdfId, @categoryId, @pageNumber, @selectedText, @comment, @highlightRects, datetime('now'), datetime('now'))
      `),
      getAnnotationsForPDF: this.db.prepare(`
        SELECT a.*, c.name as category_name, c.color as category_color, c.icon as category_icon
        FROM annotations a
        JOIN categories c ON a.category_id = c.id
        WHERE a.pdf_id = ?
        ORDER BY a.page_number ASC, a.created_at ASC
      `),
      getAnnotation: this.db.prepare(`
        SELECT a.*, c.name as category_name, c.color as category_color, c.icon as category_icon
        FROM annotations a
        JOIN categories c ON a.category_id = c.id
        WHERE a.id = ?
      `),
      updateAnnotation: this.db.prepare(`
        UPDATE annotations
        SET category_id = COALESCE(@categoryId, category_id),
            comment = COALESCE(@comment, comment),
            updated_at = datetime('now')
        WHERE id = @id
      `),
      deleteAnnotation: this.db.prepare(`DELETE FROM annotations WHERE id = ?`),
      deleteAnnotationsForPDF: this.db.prepare(`DELETE FROM annotations WHERE pdf_id = ?`),
      getAnnotationCountByCategory: this.db.prepare(`
        SELECT c.id, c.name, c.color, c.icon, COUNT(a.id) as count
        FROM categories c
        LEFT JOIN annotations a ON a.category_id = c.id AND a.pdf_id = ?
        GROUP BY c.id
        ORDER BY c.sort_order
      `),

      // Categories
      getAllCategories: this.db.prepare(`
        SELECT * FROM categories ORDER BY sort_order
      `),
      getActiveCategories: this.db.prepare(`
        SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order
      `),
      getCategory: this.db.prepare(`SELECT * FROM categories WHERE id = ?`),
      insertCategory: this.db.prepare(`
        INSERT INTO categories (name, color, icon, sort_order, is_active, is_default)
        VALUES (@name, @color, @icon, @sortOrder, @isActive, 0)
      `),
      updateCategory: this.db.prepare(`
        UPDATE categories SET name = @name, color = @color, icon = @icon, is_active = @isActive, sort_order = @sortOrder
        WHERE id = @id
      `),
      deleteCategory: this.db.prepare(`DELETE FROM categories WHERE id = ? AND is_default = 0`),
      updateCategoryOrder: this.db.prepare(`UPDATE categories SET sort_order = @sortOrder WHERE id = @id`),
      getCategoryCount: this.db.prepare(`SELECT COUNT(*) as count FROM categories`),
      getActiveCategoryCount: this.db.prepare(`SELECT COUNT(*) as count FROM categories WHERE is_active = 1`),
      getCategoryAnnotationCount: this.db.prepare(`SELECT COUNT(*) as count FROM annotations WHERE category_id = ?`),
      reassignAnnotations: this.db.prepare(`UPDATE annotations SET category_id = @toId, updated_at = datetime('now') WHERE category_id = @fromId`),

      // Settings
      getSetting: this.db.prepare(`SELECT value FROM settings WHERE key = ?`),
      setSetting: this.db.prepare(`
        INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
      `),

      // Highlights
      insertHighlight: this.db.prepare(`
        INSERT INTO highlights (id, pdf_id, page_number, selected_text, highlight_rects, color, created_at)
        VALUES (@id, @pdfId, @pageNumber, @selectedText, @highlightRects, @color, datetime('now'))
      `),
      getHighlightsForPDF: this.db.prepare(`
        SELECT * FROM highlights
        WHERE pdf_id = ?
        ORDER BY page_number ASC, created_at ASC
      `),
      getHighlight: this.db.prepare(`SELECT * FROM highlights WHERE id = ?`),
      deleteHighlight: this.db.prepare(`DELETE FROM highlights WHERE id = ?`),
      deleteHighlightsForPDF: this.db.prepare(`DELETE FROM highlights WHERE pdf_id = ?`)
    };
  }

  // PDF Methods
  addPDF(pdfData) {
    const removed = this.stmts.findRemovedPDFByPath.get(pdfData.path);
    if (removed) {
      this.hardDeletePDFRecord(removed.id);
      if (removed.project_id && this.stmts.countActivePDFsForProject.get(removed.project_id).count === 0) {
        this.hardDeleteProjectRecord(removed.project_id);
        this.cleanupUnusedVenues();
      }
    }

    const existing = this.db.prepare('SELECT * FROM pdfs WHERE path = ? AND removed = 0').get(pdfData.path);
    if (existing) {
      this.updatePDF(existing.id, { lastOpenedAt: new Date().toISOString() });
      return this.getPDF(existing.id);
    }

    const id = uuidv4();
    const data = {
      id,
      projectId: pdfData.projectId || this.createProjectForPDF(pdfData).id,
      name: pdfData.name,
      path: pdfData.path,
      pageCount: pdfData.pageCount || 0,
      reviewDeadline: pdfData.reviewDeadline || null
    };

    try {
      this.stmts.insertPDF.run(data);
      return this.getPDF(id);
    } catch (error) {
      throw error;
    }
  }

  createProjectForPDF(pdfData) {
    const projectId = uuidv4();
    const projectName = pdfData.projectName || pdfData.name;
    const venue = this.ensureVenue(pdfData.conference);
    this.stmts.insertProject.run({
      id: projectId,
      name: projectName,
      conference: venue?.name || null,
      venueId: venue?.id || null,
      submissionLink: pdfData.submissionLink || null
    });
    return this.getProject(projectId);
  }

  addProject(projectData) {
    const id = uuidv4();
    const venue = this.ensureVenue(projectData.conference);
    this.stmts.insertProject.run({
      id,
      name: projectData.name,
      conference: venue?.name || null,
      venueId: venue?.id || null,
      submissionLink: projectData.submissionLink || null
    });
    return this.getProject(id);
  }

  getProject(id) {
    const project = this.stmts.getProject.get(id);
    if (!project) return null;
    return {
      ...project,
      papers: this.stmts.getPDFsForProject.all(id)
    };
  }

  updateProject(id, data) {
    const update = this.db.transaction(() => {
      const venue = this.ensureVenue(data.conference);
      this.stmts.updateProject.run({
        id,
        name: data.name || null,
        conference: venue?.name || null,
        venueId: venue?.id || null,
        submissionLink: data.submissionLink ?? null
      });
      this.cleanupUnusedVenues();
    });

    update();
    return this.getProject(id);
  }

  deleteProject(id) {
    const remove = this.db.transaction(() => {
      const result = this.hardDeleteProjectRecord(id);
      this.cleanupUnusedVenues();
      return result;
    });

    return remove();
  }

  getAllProjects() {
    const rows = this.db.prepare(`
      SELECT
        pr.*,
        COUNT(p.id) as paper_count,
        COALESCE(SUM((SELECT COUNT(*) FROM annotations WHERE pdf_id = p.id)), 0) as annotation_count,
        MIN(CASE WHEN p.review_deadline IS NOT NULL AND p.review_deadline != '' THEN p.review_deadline END) as next_deadline,
        MAX(p.updated_at) as last_paper_updated_at,
        SUM(CASE WHEN p.completed = 1 THEN 1 ELSE 0 END) as completed_paper_count
      FROM projects pr
      LEFT JOIN pdfs p ON p.project_id = pr.id AND p.removed = 0
      GROUP BY pr.id
      HAVING paper_count > 0
      ORDER BY COALESCE(last_paper_updated_at, pr.updated_at) DESC
    `).all();

    return rows.map(project => {
      const papers = this.stmts.getPDFsForProject.all(project.id);
      return {
        ...project,
        papers,
        completed: papers.length > 0 && papers.every(paper => paper.completed === 1) ? 1 : 0,
        updated_at: project.last_paper_updated_at || project.updated_at
      };
    });
  }

  getAllVenues() {
    this.cleanupEmptyProjects();
    this.cleanupUnusedVenues();
    return this.stmts.getAllVenues.all();
  }

  cleanupUnusedVenues() {
    return this.stmts.deleteUnusedVenues.run();
  }

  cleanupEmptyProjects() {
    const remove = this.db.transaction(() => {
      const projectIds = this.stmts.getEmptyProjectIds.all();
      projectIds.forEach(({ id }) => {
        this.hardDeleteProjectRecord(id);
      });
      return { changes: projectIds.length };
    });

    return remove();
  }

  hardDeleteProjectRecord(id) {
    this.stmts.deleteAnnotationsForProject.run(id);
    this.stmts.deleteHighlightsForProject.run(id);
    this.stmts.deletePDFsForProject.run(id);
    return this.stmts.deleteProject.run(id);
  }

  hardDeletePDFRecord(id) {
    this.stmts.deleteAnnotationsForPDF.run(id);
    this.stmts.deleteHighlightsForPDF.run(id);
    return this.stmts.deletePDF.run(id);
  }

  getAllPDFs() {
    return this.stmts.getAllPDFs.all();
  }

  getPDF(id) {
    return this.stmts.getPDF.get(id);
  }

  updatePDF(id, data) {
    this.stmts.updatePDF.run({
      id,
      name: data.name || null,
      path: data.path || null,
      pageCount: data.pageCount || null,
      reviewDeadline: data.reviewDeadline || null,
      reviewDeadlineSet: Object.prototype.hasOwnProperty.call(data, 'reviewDeadline') ? 1 : 0,
      reviewContent: data.reviewContent ?? null,
      reviewContentSet: Object.prototype.hasOwnProperty.call(data, 'reviewContent') ? 1 : 0,
      reviewUpdatedAt: data.reviewUpdatedAt ?? null,
      reviewUpdatedAtSet: Object.prototype.hasOwnProperty.call(data, 'reviewUpdatedAt') ? 1 : 0,
      lastOpenedAt: data.lastOpenedAt || null
    });
    return this.getPDF(id);
  }

  deletePDF(id) {
    const remove = this.db.transaction(() => {
      const pdf = this.getPDF(id);
      if (!pdf) return { changes: 0, projectDeleted: false };

      const result = this.hardDeletePDFRecord(id);
      const projectDeleted = Boolean(pdf.project_id)
        && this.stmts.countActivePDFsForProject.get(pdf.project_id).count === 0;

      if (projectDeleted) {
        this.hardDeleteProjectRecord(pdf.project_id);
      }

      this.cleanupUnusedVenues();
      return { ...result, projectDeleted };
    });

    return remove();
  }

  searchPDFs(query) {
    const pattern = `%${query}%`;
    return this.stmts.searchPDFs.all(pattern, pattern, pattern);
  }

  markPDFCompleted(id, reviewDecision = null) {
    const stmt = this.db.prepare(`
      UPDATE pdfs
      SET completed = 1,
          review_decision = ?,
          completed_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(reviewDecision, id);
    return this.getPDF(id);
  }

  markPDFIncomplete(id) {
    const stmt = this.db.prepare(`
      UPDATE pdfs
      SET completed = 0,
          review_decision = NULL,
          completed_at = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(id);
    return this.getPDF(id);
  }

  // Annotation Methods
  addAnnotation(annotationData) {
    // Validate required fields
    if (!annotationData.pdfId || !annotationData.categoryId || annotationData.pageNumber == null) {
      throw new Error('Missing required fields: pdfId, categoryId, and pageNumber are required');
    }

    // Normalize highlightRects: default to empty array if not provided
    let highlightRects = annotationData.highlightRects;
    if (!highlightRects) {
      highlightRects = [];
    }

    // Ensure highlightRects is a string (JSON)
    let highlightRectsJson;
    if (typeof highlightRects === 'string') {
      highlightRectsJson = highlightRects;
    } else {
      highlightRectsJson = JSON.stringify(highlightRects);
    }

    // Validate JSON format
    try {
      JSON.parse(highlightRectsJson);
    } catch (e) {
      throw new Error('highlightRects must be valid JSON');
    }

    const id = uuidv4();
    const data = {
      id,
      pdfId: annotationData.pdfId,
      categoryId: annotationData.categoryId,
      pageNumber: annotationData.pageNumber,
      selectedText: annotationData.selectedText || null,
      comment: annotationData.comment || null,
      highlightRects: highlightRectsJson
    };

    this.stmts.insertAnnotation.run(data);
    return this.getAnnotation(id);
  }

  getAnnotationsForPDF(pdfId) {
    const annotations = this.stmts.getAnnotationsForPDF.all(pdfId);
    return annotations.map(a => ({
      ...a,
      highlight_rects: JSON.parse(a.highlight_rects)
    }));
  }

  getAnnotation(id) {
    const annotation = this.stmts.getAnnotation.get(id);
    if (annotation) {
      annotation.highlight_rects = JSON.parse(annotation.highlight_rects);
    }
    return annotation;
  }

  updateAnnotation(id, data) {
    this.stmts.updateAnnotation.run({
      id,
      categoryId: data.categoryId || null,
      comment: data.comment !== undefined ? data.comment : null
    });
    return this.getAnnotation(id);
  }

  deleteAnnotation(id) {
    return this.stmts.deleteAnnotation.run(id);
  }

  getAnnotationCountByCategory(pdfId) {
    return this.stmts.getAnnotationCountByCategory.all(pdfId);
  }

  // Category Methods
  getAllCategories() {
    return this.stmts.getAllCategories.all();
  }

  getCategory(id) {
    return this.stmts.getCategory.get(id);
  }

  getActiveCategories() {
    return this.stmts.getActiveCategories.all();
  }

  addCategory(data) {
    const result = this.stmts.insertCategory.run({
      name: data.name,
      color: data.color,
      icon: data.icon || 'label',
      sortOrder: data.sortOrder || 0,
      isActive: data.isActive !== undefined ? data.isActive : 1
    });
    return this.getCategory(result.lastInsertRowid);
  }

  updateCategory(id, data) {
    this.stmts.updateCategory.run({
      id,
      name: data.name,
      color: data.color,
      icon: data.icon,
      isActive: data.isActive,
      sortOrder: data.sortOrder
    });
    return this.getCategory(id);
  }

  deleteCategory(id) {
    const annotationCount = this.stmts.getCategoryAnnotationCount.get(id).count;
    if (annotationCount > 0) {
      throw new Error('Cannot delete category with existing annotations');
    }
    return this.stmts.deleteCategory.run(id);
  }

  updateCategoryOrder(id, sortOrder) {
    return this.stmts.updateCategoryOrder.run({ id, sortOrder });
  }

  getCategoryCount() {
    return this.stmts.getCategoryCount.get().count;
  }

  getActiveCategoryCount() {
    return this.stmts.getActiveCategoryCount.get().count;
  }

  getCategoryAnnotationCount(categoryId) {
    return this.stmts.getCategoryAnnotationCount.get(categoryId).count;
  }

  reassignAnnotations(fromCategoryId, toCategoryId) {
    return this.stmts.reassignAnnotations.run({ fromId: fromCategoryId, toId: toCategoryId });
  }

  // Settings Methods
  getSetting(key) {
    const result = this.stmts.getSetting.get(key);
    if (result) {
      try {
        return JSON.parse(result.value);
      } catch {
        return result.value;
      }
    }
    return null;
  }

  setSetting(key, value) {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    this.stmts.setSetting.run(key, stringValue);
  }

  // Highlight Methods
  addHighlight(highlightData) {
    const id = uuidv4();

    // Ensure highlightRects is a string (JSON)
    let highlightRectsJson;
    if (typeof highlightData.highlightRects === 'string') {
      highlightRectsJson = highlightData.highlightRects;
    } else {
      highlightRectsJson = JSON.stringify(highlightData.highlightRects || []);
    }

    const data = {
      id,
      pdfId: highlightData.pdfId,
      pageNumber: highlightData.pageNumber,
      selectedText: highlightData.selectedText || null,
      highlightRects: highlightRectsJson,
      color: highlightData.color || '#fbbf24'
    };

    this.stmts.insertHighlight.run(data);
    return this.getHighlight(id);
  }

  getHighlightsForPDF(pdfId) {
    const highlights = this.stmts.getHighlightsForPDF.all(pdfId);
    return highlights.map(h => ({
      ...h,
      highlight_rects: JSON.parse(h.highlight_rects)
    }));
  }

  getHighlight(id) {
    const highlight = this.stmts.getHighlight.get(id);
    if (highlight) {
      highlight.highlight_rects = JSON.parse(highlight.highlight_rects);
    }
    return highlight;
  }

  deleteHighlight(id) {
    return this.stmts.deleteHighlight.run(id);
  }

  close() {
    this.db.close();
  }
}

module.exports = DBManager;
