# Quick Start Guide

## 1. Installation

```bash
cd /Users/simone/Desktop/Programmazione/Reviewer
npm install
```

Wait for installation to complete. This will:
- Install all dependencies
- Rebuild native modules for Electron
- Set up the project structure

## 2. Verify Installation

Run the installation test to make sure everything is set up correctly:

```bash
npm run test:install
```

You should see all tests passing (✓). If any fail, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## 3. Test PDF Loading

Verify PDF.js works correctly:

```bash
npm run test:pdf
```

This should output:
```
✓ PDF loaded successfully!
  Pages: 3
  Page 1 size: 612 x 792
  ...
✅ PDF LOADING TEST PASSED
```

## 4. Run Unit Tests

Test the database and core functionality:

```bash
npm run test:unit
```

Expected output:
```
Database Tests: X passed, 0 failed
Utils Tests: X passed, 0 failed
```

## 5. Launch the Application

Start the app in development mode:

```bash
npm run start:dev
```

This will:
- Open the application window
- Open DevTools for debugging
- Show console logs

### First Time Use

1. **Add a PDF:**
   - Click "Add PDF" button, OR
   - Drag and drop a PDF file into the window

2. **View the PDF:**
   - PDF opens automatically in the review page
   - Use zoom controls (+/-) to adjust size
   - Scroll through pages

3. **Create Annotations:**
   - Click "Highlight" button (or press H)
   - Select text in the PDF
   - Choose a category (Critical, Major, Minor, Suggestion, Question)
   - Add a comment
   - Click "Save"

4. **Manage Annotations:**
   - View all annotations in the right panel
   - Click an annotation to jump to it in the PDF
   - Click a highlight in the PDF to see the annotation
   - Right-click highlights for more options

## 6. Test the Full Application (Optional)

Run end-to-end tests with Playwright:

```bash
npm run test:e2e
```

This will:
- Launch the app automatically
- Test all features
- Generate a report

To watch the tests run:

```bash
npm run test:e2e:headed
```

## 7. View Test Report

Generate an HTML report of all tests:

```bash
npm run test:report
```

Then open `tests/test-report.html` in your browser.

## Common First-Time Issues

### PDF Won't Load
- **Check console:** Press Cmd+Option+I (Mac) or F12 (Windows/Linux)
- **Look for errors:** Red text in console indicates issues
- **Common fix:** Restart the app

### "Module not found" Error
```bash
npm run rebuild
```

### Database Errors
The database is stored in:
- **macOS:** `~/Library/Application Support/pdf-reviewer/`
- **Linux:** `~/.config/pdf-reviewer/`
- **Windows:** `%APPDATA%\pdf-reviewer\`

To reset:
```bash
rm -rf ~/Library/Application\ Support/pdf-reviewer/  # macOS
```

Then restart the app.

## Next Steps

### Keyboard Shortcuts

Learn the shortcuts for faster workflow:

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` | Open PDF |
| `H` | Toggle highlight mode |
| `Ctrl+F` | Search PDFs |
| `Ctrl+[` | Collapse PDF panel |
| `Ctrl+]` | Collapse annotation panel |
| `Ctrl+-` | Zoom out |
| `Ctrl++` | Zoom in |
| `Esc` | Close modal |

### Features to Try

1. **Category Filtering:**
   - Click category chips in the annotation panel
   - Filter annotations by type

2. **Sorting:**
   - Use the "Sort by" dropdown
   - Sort by page, date, or category

3. **Export:**
   - Click "Export" button
   - Choose JSON or CSV format

4. **Search:**
   - Use search bar on home page
   - Find PDFs by name

5. **Panel Resize:**
   - Drag the divider between panels
   - Adjust to your preferred layout
   - Click collapse buttons (◀ ▶)

## Building for Production

When ready to create a distributable app:

```bash
# Build for your current platform
npm run build

# Or specific platforms
npm run build:mac
npm run build:win
npm run build:linux
```

Built apps will be in the `dist/` folder.

## Getting Help

- **Console errors:** Check DevTools console (Cmd+Option+I)
- **Test failures:** Run `npm test` to identify issues
- **Detailed errors:** See `TROUBLESHOOTING.md`
- **Feature questions:** See `README.md`

## Development Tips

### Making Changes

1. Make your code changes
2. Close the app (Cmd+Q)
3. Run `npm start` again
4. Test your changes

### Viewing Database

The SQLite database can be inspected:
```bash
sqlite3 ~/Library/Application\ Support/pdf-reviewer/database.sqlite
.tables
.schema pdfs
SELECT * FROM pdfs;
.quit
```

### Reset Everything

To start completely fresh:
```bash
# Remove installed modules
rm -rf node_modules package-lock.json

# Remove user data
rm -rf ~/Library/Application\ Support/pdf-reviewer

# Reinstall
npm install
npm run rebuild
```

## Success Checklist

- ✓ Installation tests pass
- ✓ PDF loading test passes
- ✓ Unit tests pass
- ✓ App launches successfully
- ✓ Can add and view PDF
- ✓ Can create annotations
- ✓ Can filter and search
- ✓ DevTools shows no errors

If all checks pass, you're ready to use PDF Reviewer!
