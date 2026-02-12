# PDF Reviewer

Cross-platform Electron desktop app for PDF annotation with categorized comments.

## Features

- Open and view PDF documents with continuous scroll
- Create highlight annotations on selected text
- Categorize annotations (Critical, Major, Minor, Suggestion, Question)
- Bidirectional sync between PDF highlights and annotation panel
- Resizable and collapsible panels
- Search and filter PDFs
- Export annotations as JSON or CSV
- Keyboard shortcuts for efficient workflow

## Installation

```bash
# Install dependencies
npm install

# If you encounter issues with native modules, run:
npm run rebuild
```

**Common installation issues:** See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) if you encounter any errors.

## Development

```bash
# Start the application
npm start

# Start with DevTools open
npm run start:dev
```

## Testing

The project includes a comprehensive test suite with three phases:

### Run All Tests

```bash
npm test
```

This runs:
1. **Installation tests** - Verifies all dependencies are correctly installed
2. **Unit tests** - Tests database operations and utility functions
3. **E2E tests** - Tests the complete application flow using Playwright

### Run Individual Test Suites

```bash
# Installation tests only
npm run test:install

# Unit tests only
npm run test:unit

# E2E tests only
npm run test:e2e

# E2E tests with visible browser
npm run test:e2e:headed
```

### Generate Test Report

```bash
npm run test:report
```

This generates an HTML report at `tests/test-report.html`.

### Test Results

Test results are saved in the `tests/` directory:
- `install-test-results.json` - Installation test results
- `unit-test-results.json` - Unit test results
- `e2e-test-results.json` - E2E test results
- `full-test-results.json` - Combined results
- `test-report.html` - HTML report

## Build

```bash
# Build for current platform
npm run build

# Build for specific platforms
npm run build:mac
npm run build:win
npm run build:linux
```

## Project Structure

```
├── main.js                    # Electron main process
├── preload.js                 # Preload script for IPC
├── src/
│   ├── index.html             # Home page
│   ├── review.html            # Review page
│   ├── css/                   # Stylesheets
│   ├── js/                    # JavaScript modules
│   ├── components/            # Web Components
│   └── database/              # SQLite database
├── tests/
│   ├── install.test.js        # Installation tests
│   ├── unit/                  # Unit tests
│   ├── e2e/                   # E2E tests
│   └── fixtures/              # Test fixtures
└── assets/                    # App icons and assets
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` | Open PDF |
| `Ctrl+F` | Search PDFs / Focus search |
| `H` | Toggle highlight mode |
| `Esc` | Close modal / Deselect |
| `Ctrl+[` | Collapse PDF panel |
| `Ctrl+]` | Collapse annotation panel |
| `Ctrl+\` | Restore both panels |
| `Ctrl+-` | Zoom out |
| `Ctrl++` | Zoom in |

## Technologies

- **Electron** - Cross-platform desktop framework
- **PDF.js** - PDF rendering library
- **better-sqlite3** - SQLite database
- **Playwright** - E2E testing framework

## License

MIT
