const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const assetsDir = path.join(repoRoot, 'assets');
const sourceRoots = ['src', 'App.tsx', 'index.ts'].map((entry) => path.join(repoRoot, entry));
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const problems = [];

function walk(target, visit) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(target)) {
      walk(path.join(target, child), visit);
    }
    return;
  }
  if (stat.isFile()) visit(target);
}

walk(assetsDir, (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (!imageExtensions.has(ext)) return;
  const relativePath = path.relative(repoRoot, filePath);
  if (/\s/.test(path.basename(filePath))) {
    problems.push(`Asset filename contains whitespace: ${relativePath}`);
  }
});

const assetImportPattern = /(?:require\(|from\s+)["'`]([^"'`]*assets\/[^"'`]+)["'`]/g;

for (const root of sourceRoots) {
  walk(root, (filePath) => {
    if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) return;
    const source = fs.readFileSync(filePath, 'utf8');
    let match;
    while ((match = assetImportPattern.exec(source))) {
      const importPath = match[1];
      const assetName = path.basename(importPath);
      if (/\s/.test(assetName)) {
        problems.push(
          `Asset import path contains whitespace: ${path.relative(repoRoot, filePath)} -> ${importPath}`
        );
      }
    }
  });
}

if (problems.length > 0) {
  console.error('[check-assets] React Native asset naming check failed:');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error('\nUse kebab-case filenames like N-card-cutout.png. Avoid spaces in image filenames and import paths.');
  process.exit(1);
}

console.log('[check-assets] Asset filenames and imports look safe.');
