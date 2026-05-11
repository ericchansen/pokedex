import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

const failures = [];

function expectMatch(relativePath, pattern, message) {
  const content = read(relativePath);
  if (!pattern.test(content)) failures.push(`${relativePath}: ${message}`);
}

function expectNoMatch(relativePath, pattern, message) {
  const content = read(relativePath);
  if (pattern.test(content)) failures.push(`${relativePath}: ${message}`);
}

const routeFiles = [
  'site/js/views/home.js',
  'site/js/views/inventory.js',
];

for (const file of routeFiles) {
  expectMatch(file, /\bBrowserSurface\.mountToolbar\b/, 'route must mount shared browser toolbar through BrowserSurface');
  expectNoMatch(
    file,
    /['"`](Games:?|Type|Generation|Transferred|Owned only|View)['"`]/,
    'route must not hardcode shared toolbar labels'
  );
  expectNoMatch(
    file,
    /\bfilter-bar\b|\binventory-toolbar\b|\btoolbar-group\b|\binventory-filter-check\b|\binventory-filter-select\b|\binventory-filter-search\b|\bfilter-group\b|\bfilter-label\b/,
    'route must not reference legacy toolbar CSS classes'
  );
}

expectMatch(
  'site/js/views/inventory.js',
  /\bBrowserSurface\.createEmptyState\b/,
  'inventory/builds route must use shared browser empty-state rendering'
);

expectNoMatch(
  'site/css/styles.css',
  /\.filter-bar\b|\.inventory-toolbar\b|\.toolbar-group\b|\.inventory-filter-check\b|\.inventory-filter-select\b|\.inventory-filter-search\b|\.filter-group\b|\.filter-label\b/,
  'legacy toolbar CSS namespaces must be removed'
);

for (const file of [
  'site/js/ui-shared.js',
  'site/js/ui/sections/filter-toolbar.js',
]) {
  expectNoMatch(
    file,
    /\brenderGameFilterHtml\b|\brenderTypeFilterHtml\b|\brenderGenFilterHtml\b|\bwireFilterControls\b/,
    'legacy fragment-only filter toolbar API must be removed'
  );
}

if (failures.length) {
  console.error('Browser surface contract validation failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Browser surface contract validation passed.');
