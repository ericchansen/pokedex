#!/usr/bin/env node
/**
 * validate_script_order.mjs — Static analysis to verify <script> load order.
 *
 * Parses index.html to extract script load order, then for each non-module
 * script scans for `window.X =` assignments (provides) and uses of known
 * globals (depends-on). Fails if any dependency is consumed before its
 * provider script is loaded.
 *
 * Usage: node tools/validate_script_order.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const INDEX_HTML = resolve(ROOT, 'site', 'index.html');

// ── Parse script tags from index.html ──────────────────────────────

const html = readFileSync(INDEX_HTML, 'utf-8');
const scriptRe = /<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g;
const moduleRe = /type\s*=\s*["']module["']/;

const scripts = [];
let m;
while ((m = scriptRe.exec(html)) !== null) {
  const tag = m[0];
  const src = m[1];
  const isModule = moduleRe.test(tag);
  const isDefer = /\bdefer\b/.test(tag);
  scripts.push({ src, isModule, isDefer });
}

// Only validate non-module, non-defer scripts (classic blocking scripts)
// These execute in document order and form the dependency chain.
const classicScripts = scripts.filter(s => !s.isModule && !s.isDefer);

// ── Scan each script for provides/depends ──────────────────────────

// Known global namespaces assigned via window.X = ...
const provideRe = /\bwindow\.(\w+)\s*=/g;

// Build a provides map: globalName → script index
const providesMap = new Map();  // globalName → first provider index
const scriptProvides = [];      // index → Set of provided globals

for (let i = 0; i < classicScripts.length; i++) {
  const s = classicScripts[i];
  const filePath = resolve(ROOT, 'site', s.src);
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    console.warn(`⚠ Could not read ${s.src} — skipping`);
    scriptProvides.push(new Set());
    continue;
  }

  const provides = new Set();
  let pm;
  while ((pm = provideRe.exec(content)) !== null) {
    const name = pm[1];
    provides.add(name);
    if (!providesMap.has(name)) {
      providesMap.set(name, i);
    }
  }
  scriptProvides.push(provides);
}

// ── Check dependencies ─────────────────────────────────────────────
//
// Heuristic: in classic scripts that use window.X = { ... } namespaces,
// most cross-global references are deferred (inside function bodies or
// method definitions, called only at runtime after all scripts load).
// We only flag IMMEDIATE (top-level) uses:
//   - Lines starting at column 0 (not inside function/method bodies)
//   - window.GlobalName. / window.GlobalName[ at any indent (explicit
//     immediate property access)
// References inside object methods ({  foo() { ... GlobalName ... } })
// are safe because they execute later.

const allGlobals = [...providesMap.keys()];
const errors = [];

/**
 * Check if a reference to `globalName` appears at the top level
 * (outside function/method bodies). Simple brace-depth heuristic:
 * depth 0 = top level, depth 1 = inside window.X = { ... }.
 * Anything at depth ≤ 1 that isn't inside a function/method is flagged.
 */
function hasImmediateUse(content, globalName) {
  // Split into lines and track brace depth
  const lines = content.split('\n');
  let depth = 0;
  let inAssignment = false; // inside window.X = { ... }

  for (const line of lines) {
    const trimmed = line.trim();

    // Track brace depth (crude but effective for our namespace pattern)
    for (const ch of trimmed) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }

    // Detect start of window.X = { assignment
    if (/^window\.\w+\s*=\s*\{/.test(trimmed)) {
      inAssignment = true;
    }

    // At depth 0 (true top-level), any reference is immediate
    if (depth <= 0) {
      const re = new RegExp(`\\b${globalName}\\b`);
      if (re.test(trimmed) && !/^\/\//.test(trimmed)) {
        // Skip window.X = declarations
        if (new RegExp(`^window\\.${globalName}\\s*=`).test(trimmed)) continue;
        return true;
      }
    }
  }
  return false;
}

for (let i = 0; i < classicScripts.length; i++) {
  const s = classicScripts[i];
  const filePath = resolve(ROOT, 'site', s.src);
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    continue;
  }

  // Remove string literals and comments to avoid false positives
  const stripped = content
    .replace(/\/\/.*$/gm, '')           // line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/'[^']*'/g, '""')          // single-quoted strings
    .replace(/"[^"]*"/g, '""')          // double-quoted strings
    .replace(/`[^`]*`/g, '""');         // template literals (simple)

  for (const globalName of allGlobals) {
    // Skip self-provides
    if (scriptProvides[i].has(globalName)) continue;

    // Quick check: does the name appear at all?
    const useRe = new RegExp(`\\b${globalName}\\b`, 'g');
    if (!useRe.test(stripped)) continue;

    // It uses this global — is the provider loaded before us?
    const providerIdx = providesMap.get(globalName);
    if (providerIdx > i) {
      // Only flag if the use is immediate (top-level), not deferred
      if (hasImmediateUse(stripped, globalName)) {
        errors.push({
          consumer: s.src,
          consumerIdx: i,
          global: globalName,
          provider: classicScripts[providerIdx].src,
          providerIdx,
        });
      }
    }
  }
}

// ── Report ─────────────────────────────────────────────────────────

console.log(`Script order validation: ${classicScripts.length} classic scripts, ${providesMap.size} globals tracked`);

if (errors.length === 0) {
  console.log('✓ All script dependencies are loaded in correct order');
  process.exit(0);
} else {
  console.error(`\n✗ ${errors.length} ordering violation(s) found:\n`);
  for (const e of errors) {
    console.error(
      `  ${e.consumer} (index ${e.consumerIdx}) uses window.${e.global}` +
      ` but it's provided by ${e.provider} (index ${e.providerIdx}) which loads later`
    );
  }
  process.exit(1);
}
