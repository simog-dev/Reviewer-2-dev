const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const Database = require('./src/database/db');

let mainWindow;
let db;

// Get user data path for database storage
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'database.sqlite');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'src/logo/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    },
    titleBarStyle: 'default',
    show: false
  });

  mainWindow.loadFile('src/index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  // Initialize database
  db = new Database(dbPath);

  createWindow();

  // Set a standard browser User-Agent for webviews (e.g., the search panel)
  // so that sites like IEEE don't reject requests from the Electron default UA
  app.on('web-contents-created', (event, contents) => {
    if (contents.getType() === 'webview') {
      const chromeVersion = process.versions.chrome;
      contents.setUserAgent(`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`);
    }
  });

  // Configure auto-updater
  autoUpdater.autoDownload = false; // Ask user before downloading
  autoUpdater.autoInstallOnAppQuit = true;

  // Set update feed to GitHub Releases
  if (!process.argv.includes('--dev')) {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'YOUR_GITHUB_USERNAME',  // REPLACE with your GitHub username
      repo: 'reviewer'
    });
  }

  // Check for updates after app is ready (skip in dev mode)
  if (!process.argv.includes('--dev')) {
    setTimeout(() => {
      autoUpdater.checkForUpdates();
    }, 3000); // Wait 3 seconds to avoid blocking startup
  }

  // Auto-updater events
  autoUpdater.on('update-available', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info);
    }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('App is up to date');
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-download-progress', progress);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', info);
    }
  });

  autoUpdater.on('error', (error) => {
    console.error('Auto-updater error:', error);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (db) {
    db.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

// Auto-updater handlers
ipcMain.handle('updater:check', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return result;
  } catch (error) {
    console.error('Error checking for updates:', error);
    return null;
  }
});

ipcMain.handle('updater:download', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return true;
  } catch (error) {
    console.error('Error downloading update:', error);
    return false;
  }
});

ipcMain.handle('updater:install', () => {
  autoUpdater.quitAndInstall(false, true);
});

// PDF Operations
ipcMain.handle('dialog:openPDF', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('pdf:fileExists', async (event, filePath) => {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    console.error('Error checking file existence:', error);
    return false;
  }
});

ipcMain.handle('pdf:readFile', async (event, filePath) => {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      const error = new Error(`FILE_NOT_FOUND:${filePath}`);
      error.code = 'FILE_NOT_FOUND';
      error.path = filePath;
      throw error;
    }
    const buffer = fs.readFileSync(filePath);
    // Convert Buffer to Uint8Array for proper IPC serialization
    return new Uint8Array(buffer);
  } catch (error) {
    console.error('Error reading PDF file:', error);
    throw error;
  }
});

ipcMain.handle('pdf:addFromData', async (event, name, data) => {
  try {
    // Save dropped file to userData directory
    const pdfDir = path.join(userDataPath, 'pdfs');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    let destPath = path.join(pdfDir, safeName);

    // Avoid overwriting: append a number if file exists
    let counter = 1;
    while (fs.existsSync(destPath)) {
      const ext = path.extname(safeName);
      const base = path.basename(safeName, ext);
      destPath = path.join(pdfDir, `${base}_${counter}${ext}`);
      counter++;
    }

    fs.writeFileSync(destPath, Buffer.from(data));
    return destPath;
  } catch (error) {
    console.error('Error saving dropped PDF:', error);
    throw error;
  }
});

ipcMain.handle('pdf:getMetadata', async (event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return {
      name: path.basename(filePath),
      path: filePath,
      size: stats.size,
      lastModified: stats.mtime.toISOString()
    };
  } catch (error) {
    console.error('Error getting PDF metadata:', error);
    throw error;
  }
});

// Database Operations - PDFs
ipcMain.handle('db:addPDF', async (event, pdfData) => {
  return db.addPDF(pdfData);
});

ipcMain.handle('db:getAllPDFs', async () => {
  return db.getAllPDFs();
});

ipcMain.handle('db:getPDF', async (event, id) => {
  return db.getPDF(id);
});

ipcMain.handle('db:updatePDF', async (event, id, data) => {
  return db.updatePDF(id, data);
});

ipcMain.handle('db:deletePDF', async (event, id, deleteAnnotations) => {
  // Get PDF info before deleting to clean up any copied file
  const pdf = db.getPDF(id);
  const result = db.deletePDF(id, deleteAnnotations);

  // Only delete the file copy when fully removing (with annotations)
  if (deleteAnnotations && pdf && pdf.path) {
    const pdfDir = path.join(userDataPath, 'pdfs');
    if (pdf.path.startsWith(pdfDir)) {
      try {
        fs.unlinkSync(pdf.path);
      } catch (err) {
        console.error('Error deleting PDF file copy:', err);
      }
    }
  }

  return result;
});

ipcMain.handle('db:searchPDFs', async (event, query) => {
  return db.searchPDFs(query);
});

ipcMain.handle('db:markPDFCompleted', async (event, id, reviewDecision) => {
  return db.markPDFCompleted(id, reviewDecision);
});

ipcMain.handle('db:markPDFIncomplete', async (event, id) => {
  return db.markPDFIncomplete(id);
});

// Database Operations - Annotations
ipcMain.handle('db:addAnnotation', async (event, annotationData) => {
  return db.addAnnotation(annotationData);
});

ipcMain.handle('db:getAnnotationsForPDF', async (event, pdfId) => {
  return db.getAnnotationsForPDF(pdfId);
});

ipcMain.handle('db:getAnnotation', async (event, id) => {
  return db.getAnnotation(id);
});

ipcMain.handle('db:updateAnnotation', async (event, id, data) => {
  return db.updateAnnotation(id, data);
});

ipcMain.handle('db:deleteAnnotation', async (event, id) => {
  return db.deleteAnnotation(id);
});

ipcMain.handle('db:getAnnotationCountByCategory', async (event, pdfId) => {
  return db.getAnnotationCountByCategory(pdfId);
});

// Database Operations - Categories
ipcMain.handle('db:getAllCategories', async () => {
  return db.getAllCategories();
});

ipcMain.handle('db:getCategory', async (event, id) => {
  return db.getCategory(id);
});

ipcMain.handle('db:getActiveCategories', async () => {
  return db.getActiveCategories();
});

ipcMain.handle('db:addCategory', async (event, data) => {
  return db.addCategory(data);
});

ipcMain.handle('db:updateCategory', async (event, id, data) => {
  return db.updateCategory(id, data);
});

ipcMain.handle('db:deleteCategory', async (event, id) => {
  return db.deleteCategory(id);
});

ipcMain.handle('db:updateCategoryOrder', async (event, id, sortOrder) => {
  return db.updateCategoryOrder(id, sortOrder);
});

ipcMain.handle('db:getCategoryCount', async () => {
  return db.getCategoryCount();
});

ipcMain.handle('db:getActiveCategoryCount', async () => {
  return db.getActiveCategoryCount();
});

ipcMain.handle('db:getCategoryAnnotationCount', async (event, categoryId) => {
  return db.getCategoryAnnotationCount(categoryId);
});

ipcMain.handle('db:reassignAnnotations', async (event, fromCategoryId, toCategoryId) => {
  return db.reassignAnnotations(fromCategoryId, toCategoryId);
});

// Export Operations
ipcMain.handle('export:saveFile', async (event, { defaultName, filters, content }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: filters
  });

  if (result.canceled) {
    return { success: false, canceled: true };
  }

  try {
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { success: true, filePath: result.filePath };
  } catch (error) {
    console.error('Error saving file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('import:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  });

  if (result.canceled) {
    return { success: false, canceled: true };
  }

  try {
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, filePath, content };
  } catch (error) {
    console.error('Error reading import file:', error);
    return { success: false, error: error.message };
  }
});

// Settings/Preferences
ipcMain.handle('settings:get', async (event, key) => {
  return db.getSetting(key);
});

ipcMain.handle('settings:set', async (event, key, value) => {
  return db.setSetting(key, value);
});

// Database Operations - Highlights
ipcMain.handle('db:addHighlight', async (event, highlightData) => {
  return db.addHighlight(highlightData);
});

ipcMain.handle('db:getHighlightsForPDF', async (event, pdfId) => {
  return db.getHighlightsForPDF(pdfId);
});

ipcMain.handle('db:deleteHighlight', async (event, id) => {
  return db.deleteHighlight(id);
});

// Navigation
ipcMain.handle('navigate:review', async (event, pdfId) => {
  mainWindow.loadFile('src/review.html', { query: { id: pdfId } });
});

ipcMain.handle('navigate:home', async () => {
  mainWindow.loadFile('src/index.html');
});

ipcMain.handle('navigate:settings', async () => {
  mainWindow.loadFile('src/settings.html');
});
