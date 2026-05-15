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

// ── Helpers ─────────────────────────────────────────────────────────

/** Strip comments and string literals so regex scanning avoids phantoms. */
function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\/.*$/gm, '')           // line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/'[^']*'/g, '""')          // single-quoted strings
    .replace(/"[^"]*"/g, '""')          // double-quoted strings
    .replace(/`[^`]*`/g, '""');         // template literals (simple)
}

// ── Scan each script for provides/depends ──────────────────────────

const provideRe = /\bwindow\.(\w+)\s*=/g;
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

  // Strip comments/strings before scanning for provides (avoids phantom
  // registrations from commented-out `// window.Foo = ...` lines).
  const stripped = stripCommentsAndStrings(content);
  const provides = new Set();
  let pm;
  while ((pm = provideRe.exec(stripped)) !== null) {
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
// Heuristic: classic scripts use `window.X = { methods... }` namespaces.
// References inside method/function bodies are deferred (safe). We flag
// references that execute immediately during script parse:
//   depth 0: true top-level statements
//   depth 1: property initializers inside `window.X = { key: VALUE }`
//            (these execute immediately UNLESS inside a function body)
//
// At depth ≥ 1 we track whether we're inside a function/method body
// (line contains `function` or `=>` or `() {` pattern). Property
// initializers like `dep: OtherGlobal.value` ARE immediate at depth 1.

const allGlobals = [...providesMap.keys()];
const errors = [];

/**
 * Check if a reference to `globalName` appears in an immediate context
 * (executed during script parse, not deferred to a later call).
 */
function hasImmediateUse(content, globalName) {
  const lines = content.split('\n');
  let depth = 0;
  let funcDepth = Infinity; // brace depth where current function body starts

  for (const line of lines) {
    const trimmed = line.trim();
    const prevDepth = depth;

    // Track brace depth
    for (const ch of trimmed) {
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        // Leaving a function body?
        if (depth < funcDepth) funcDepth = Infinity;
      }
    }

    // Detect function/method body entry: `function`, `=>`, or `name() {`
    if (/\bfunction\b/.test(trimmed) || /=>/.test(trimmed) ||
        /\w+\s*\([^)]*\)\s*\{/.test(trimmed)) {
      // If this line opened a brace, mark that depth as a function body
      if (depth > prevDepth) {
        funcDepth = Math.min(funcDepth, prevDepth + 1);
      }
    }

    // Skip lines inside function/method bodies (deferred execution)
    if (depth >= funcDepth) continue;

    // At depth 0–1 outside function bodies, references are immediate
    const re = new RegExp(`\\b${globalName}\\b`);
    if (re.test(trimmed)) {
      // Skip own declarations
      if (new RegExp(`^window\\.${globalName}\\s*=`).test(trimmed)) continue;
      return true;
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

  const stripped = stripCommentsAndStrings(content);

  for (const globalName of allGlobals) {
    if (scriptProvides[i].has(globalName)) continue;

    const useRe = new RegExp(`\\b${globalName}\\b`, 'g');
    if (!useRe.test(stripped)) continue;

    const providerIdx = providesMap.get(globalName);
    if (providerIdx > i) {
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
