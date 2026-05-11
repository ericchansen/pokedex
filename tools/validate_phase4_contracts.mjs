import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function scriptOffset(html, scriptPath) {
  const escapedPath = scriptPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`<script\\b[^>]*\\bsrc="${escapedPath}"[^>]*><\\/script>`));
  return match ? match.index : -1;
}

function main() {
  const renderPath = path.join(ROOT, 'site', 'js', 'render.js');
  assert(!fs.existsSync(renderPath), 'site/js/render.js should be deleted once Phase 4 is complete');

  const indexPath = path.join(ROOT, 'site', 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  assert(!html.includes('js/render.js'), 'site/index.html must not load js/render.js');

  const requiredOrder = [
    'js/progress-indicator.js',
    'js/route-refresh.js',
    'js/build-ui-helpers.js',
    'js/export-ui.js',
    'js/build-editor.js',
    'js/pokemon-viewer.js',
    'js/team-surfaces.js',
    'js/views/home.js',
    'js/views/inventory.js',
    'js/views/teams.js',
  ];

  let lastOffset = -1;
  for (const scriptPath of requiredOrder) {
    const offset = scriptOffset(html, scriptPath);
    assert(offset !== -1, `site/index.html is missing required script ${scriptPath}`);
    assert(offset > lastOffset, `site/index.html loads ${scriptPath} out of order`);
    lastOffset = offset;
  }

  console.log('Phase 4 contract validation passed.');
}

main();
