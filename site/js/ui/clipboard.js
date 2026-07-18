/** @type {WeakMap<HTMLElement, number>} */
const resetTimers = new WeakMap();

/** @param {string} text @param {HTMLTextAreaElement} textarea */
export async function copyText(text, textarea) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  if (!document.execCommand('copy')) {
    throw new Error('Clipboard copy failed');
  }
}

/**
 * @param {string} text
 * @param {HTMLElement} button
 * @param {{
 * successText?: string,
 * failText?: string,
 * cssClass?: string,
 * errorClass?: string,
 * duration?: number,
 * textarea?: HTMLTextAreaElement,
 * onError?: ((error: unknown) => void)|null,
 * onSuccess?: (() => void)|null
 * }} [opts]
 */
export async function flashCopyFeedback(text, button, opts = {}) {
  const {
    successText = 'Copied!',
    failText = 'Failed',
    cssClass = 'is-copied',
    errorClass = 'is-error',
    duration = 1500,
    textarea = document.createElement('textarea'),
    onError = null,
    onSuccess = null,
  } = opts;
  const original = button.textContent;
  button.classList.remove(cssClass, errorClass);
  try {
    await copyText(text, textarea);
    button.textContent = successText;
    button.classList.add(cssClass);
    if (typeof onSuccess === 'function') onSuccess();
  } catch (error) {
    button.textContent = failText;
    button.classList.add(errorClass);
    if (typeof onError === 'function') onError(error);
  }

  const previousTimer = resetTimers.get(button);
  if (previousTimer !== undefined) window.clearTimeout(previousTimer);
  resetTimers.set(button, window.setTimeout(() => {
    button.textContent = original;
    button.classList.remove(cssClass, errorClass);
    resetTimers.delete(button);
  }, duration));
}
