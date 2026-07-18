#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptsRoot = path.join(root, 'site', 'js');
const indexPath = path.join(root, 'site', 'index.html');
const files = [];
const errors = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (entry.name.endsWith('.js')) files.push(fullPath);
  }
}

function visit(node, callback) {
  if (!node || typeof node !== 'object') return;
  callback(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => visit(child, callback));
    else if (value && typeof value === 'object' && typeof value.type === 'string') visit(value, callback);
  }
}

function resolveLocalImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const resolved = path.resolve(path.dirname(fromFile), specifier);
  return path.extname(resolved) ? resolved : `${resolved}.js`;
}

walk(scriptsRoot);
const graph = new Map();

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const relative = path.relative(root, file);
  if (/(?:window|globalThis)\.[A-Z][A-Za-z0-9_$]*\s*=/.test(source)) {
    errors.push(`${relative}: publishes an application global`);
  }
  if (/=\s*globalThis\s*;/.test(source)) {
    errors.push(`${relative}: consumes dependencies through globalThis`);
  }

  let ast;
  try {
    ast = espree.parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
    });
  } catch (error) {
    errors.push(`${relative}: ${error.message}`);
    continue;
  }

  const staticDependencies = [];
  visit(ast, (node) => {
    if (node.type !== 'ImportDeclaration' && node.type !== 'ExportNamedDeclaration') return;
    if (!node.source?.value) return;
    const dependency = resolveLocalImport(file, node.source.value);
    if (!dependency) return;
    if (!statSafe(dependency)) {
      errors.push(`${relative}: missing import ${node.source.value}`);
      return;
    }
    staticDependencies.push(dependency);
  });
  graph.set(file, [...new Set(staticDependencies)]);
}

function statSafe(file) {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

const active = new Set();
const visited = new Set();
const stack = [];
const reportedCycles = new Set();

function detectCycles(file) {
  if (active.has(file)) {
    const index = stack.indexOf(file);
    const cycle = [...stack.slice(index), file]
      .map((entry) => path.relative(scriptsRoot, entry).replaceAll('\\', '/'))
      .join(' -> ');
    if (!reportedCycles.has(cycle)) {
      reportedCycles.add(cycle);
      errors.push(`Static import cycle: ${cycle}`);
    }
    return;
  }
  if (visited.has(file)) return;
  active.add(file);
  stack.push(file);
  for (const dependency of graph.get(file) || []) detectCycles(dependency);
  stack.pop();
  active.delete(file);
  visited.add(file);
}

for (const file of files) detectCycles(file);

const html = readFileSync(indexPath, 'utf8');
const moduleScripts = [...html.matchAll(/<script\b[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*>/g)]
  .map((match) => match[1]);
if (moduleScripts.length !== 1 || moduleScripts[0] !== 'js/app.js') {
  errors.push(`site/index.html must load exactly one application module entry (found: ${moduleScripts.join(', ') || 'none'})`);
}

if (errors.length) {
  console.error(`Module graph validation failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Module graph validation passed: ${files.length} modules, one application entry, no static cycles or app globals.`);
