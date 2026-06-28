const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const vendorDir = path.join(rootDir, 'src', 'vendor');

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyDir(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(to, { recursive: true });

  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);

    if (entry.isDirectory()) {
      copyDir(source, target);
    } else if (entry.isFile()) {
      copyFile(source, target);
    }
  }
}

function vendorPdfJs() {
  const pdfjsRoot = path.join(rootDir, 'node_modules', 'pdfjs-dist');
  const targetRoot = path.join(vendorDir, 'pdfjs-dist');

  copyFile(
    path.join(pdfjsRoot, 'legacy', 'build', 'pdf.min.mjs'),
    path.join(targetRoot, 'legacy', 'build', 'pdf.min.mjs')
  );
  copyFile(
    path.join(pdfjsRoot, 'legacy', 'build', 'pdf.worker.min.mjs'),
    path.join(targetRoot, 'legacy', 'build', 'pdf.worker.min.mjs')
  );
  copyDir(path.join(pdfjsRoot, 'cmaps'), path.join(targetRoot, 'cmaps'));
  copyDir(path.join(pdfjsRoot, 'standard_fonts'), path.join(targetRoot, 'standard_fonts'));
}

function vendorGoogleGenerativeAi() {
  copyFile(
    path.join(rootDir, 'node_modules', '@google', 'generative-ai', 'dist', 'index.mjs'),
    path.join(vendorDir, '@google', 'generative-ai', 'index.mjs')
  );
}

vendorPdfJs();
vendorGoogleGenerativeAi();
