/** @param {import('../types/contracts.js').InputValue} value */
export function normalizeDisplayText(value) {
  return String(value ?? '')
    .replace(/\u00e2\u20ac\u201d/g, '\u2014')
    .replace(/\u00e2\u20ac\u201c/g, '\u2013')
    .replace(/\u00e2\u20ac\u0153/g, '\u201c')
    .replace(/\u00e2\u20ac\u009d/g, '\u201d')
    .replace(/\u00e2\u20ac\u2122/g, '\u2019');
}

/** @param {import('../types/contracts.js').InputValue} value */
export function escapeHtml(value) {
  return normalizeDisplayText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** @param {import('../types/contracts.js').InputValue} value */
export function titleCase(value) {
  return String(value || '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * @param {number} count
 * @param {string} singular
 * @param {string} [plural]
 */
export function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

/** @param {ParentNode} root @param {string} selector */
export function requireElement(root, selector) {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing element: ${selector}`);
  return element;
}

/** @param {ParentNode} root @param {string} selector */
export function requireInput(root, selector) {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLInputElement)) throw new Error(`Missing input: ${selector}`);
  return element;
}

/** @param {ParentNode} root @param {string} selector */
export function requireSelect(root, selector) {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLSelectElement)) throw new Error(`Missing select: ${selector}`);
  return element;
}

/** @param {ParentNode} root @param {string} selector */
export function requireFormField(root, selector) {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLInputElement)
    && !(element instanceof HTMLTextAreaElement)
    && !(element instanceof HTMLSelectElement)) {
    throw new Error(`Missing form field: ${selector}`);
  }
  return element;
}
