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

expectMatch(
  'site/js/views/home.js',
  /setAttribute\('role', 'gridcell'\)/,
  'Boxes slots must expose gridcell semantics'
);
expectMatch(
  'site/js/views/home.js',
  /slot\.setAttribute\('aria-label', subject\)/,
  'Boxes slots must expose their computed subject as an accessible name'
);
expectMatch(
  'site/js/views/home.js',
  /function mount\(container\)[\s\S]*?rovingSlot = \{ boxId: 0, slotIdx: 0 \};[\s\S]*?renderAllBoxPlaceholders\(\)[\s\S]*?ensureBoxRendered\(rovingBoxEl, rovingSlot\.boxId\)/,
  'Boxes mount must restore a rendered slot as the roving tab stop'
);
expectMatch(
  'site/js/views/home.js',
  /event\.key === 'ArrowDown'[\s\S]*event\.key === 'Enter'[\s\S]*event\.key === ' '/,
  'Boxes slots must support arrow navigation, Enter activation, and Space selection'
);
expectMatch(
  'site/js/views/home.js',
  /wantsSelection && !slot\.classList\.contains\('occupied'\)/,
  'Boxes selection mode must ignore empty slots'
);
expectMatch(
  'site/js/views/home.js',
  /function closePlacement\(\)[\s\S]*?focusRovingSlot\(target\.boxId, target\.slotIdx\)/,
  'closing placement must restore focus to the originating slot'
);
expectMatch(
  'site/js/views/home.js',
  /showConfirm\(`Remove \$\{name\} from Box/,
  'single-slot removal must use the shared confirmation dialog'
);
for (const stateAttribute of ['data-preset', 'data-border', 'data-trained']) {
  expectMatch(
    'site/js/views/home.js',
    new RegExp(`class="slot boxes-state-key__sample"[^>]*${stateAttribute}`),
    `Boxes state key must reuse production slot ${stateAttribute} effects`
  );
}
expectNoMatch(
  'site/css/styles.css',
  /\.boxes-state-key[^{]*\[(?:data-state|data-preset|data-border|data-trained)=/,
  'Boxes state key must not duplicate production slot state effects'
);
expectMatch(
  'site/js/ui/sections/filter-toolbar.js',
  /data-browser-secondary/,
  'shared toolbar must expose the responsive secondary-filter disclosure'
);
expectMatch(
  'site/js/ui-shared.js',
  /_panelReturnFocus = document\.activeElement[\s\S]*returnFocus\?\.isConnected[\s\S]*returnFocus\.focus\(\)/,
  'shared detail panels must restore focus to their opening control'
);

if (failures.length) {
  console.error('Browser surface contract validation failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Browser surface contract validation passed.');
