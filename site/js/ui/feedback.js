import { escapeHtml } from './dom.js';

/** @param {HTMLElement} container */
function focusableElements(container) {
  const elements = [...container.querySelectorAll('button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])')]
    .filter((element) => element instanceof HTMLElement && !element.hasAttribute('disabled'));
  return /** @type {HTMLElement[]} */ (elements);
}

/**
 * @template T
 * @param {{html: string, role: string, label: string, focusSelector: string, readValue: () => T, submitOnEnterSelector?: string}} options
 * @returns {Promise<T|null>}
 */
function mountDialog({ html, role, label, focusSelector, readValue, submitOnEnterSelector }) {
  return new Promise((resolve) => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overlay = document.createElement('div');
    overlay.className = 'dialog-backdrop';

    const modal = document.createElement('div');
    modal.className = 'dialog-modal';
    modal.setAttribute('role', role);
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', label);
    modal.innerHTML = html;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const confirmButton = modal.querySelector('.dialog-confirm');
    const cancelButton = modal.querySelector('.dialog-cancel');
    if (!(confirmButton instanceof HTMLButtonElement) || !(cancelButton instanceof HTMLButtonElement)) {
      overlay.remove();
      throw new Error('Dialog actions are missing');
    }

    let closed = false;
    /** @param {KeyboardEvent} event */
    function handleEscape(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close(null);
    }
    /** @param {T|null} result */
    function close(result) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', handleEscape, true);
      overlay.classList.remove('dialog-backdrop--visible');
      setTimeout(() => {
        overlay.remove();
        if (returnFocus?.isConnected) returnFocus.focus();
      }, 200);
      resolve(result);
    }

    confirmButton.addEventListener('click', () => close(readValue()));
    cancelButton.addEventListener('click', () => close(null));
    document.addEventListener('keydown', handleEscape, true);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(null);
    });
    overlay.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const focusable = focusableElements(modal);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    const submitOnEnter = submitOnEnterSelector
      ? modal.querySelector(submitOnEnterSelector)
      : null;
    submitOnEnter?.addEventListener('keydown', (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        close(readValue());
      }
    });

    requestAnimationFrame(() => overlay.classList.add('dialog-backdrop--visible'));
    queueMicrotask(() => {
      const focusTarget = modal.querySelector(focusSelector);
      if (focusTarget instanceof HTMLElement) {
        focusTarget.focus();
        if (focusTarget instanceof HTMLInputElement) focusTarget.select();
      }
    });
  });
}

/** @param {string} message @param {number} [durationMs] */
function showToast(message, durationMs = 3000) {
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, durationMs);
}

/**
 * @param {string} message
 * @param {{title?: string, confirmLabel?: string, cancelLabel?: string, detail?: string}} [opts]
 */
function showConfirm(message, opts = {}) {
  const { title = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', detail = '' } = opts;
  const html = `
    ${title ? `<div class="dialog-title">${escapeHtml(title)}</div>` : ''}
    <div class="dialog-body">
      <p class="dialog-message">${escapeHtml(message)}</p>
      ${detail ? `<p class="dialog-detail">${escapeHtml(detail)}</p>` : ''}
    </div>
    <div class="dialog-actions">
      <button type="button" class="btn dialog-cancel">${escapeHtml(cancelLabel)}</button>
      <button type="button" class="btn btn-primary dialog-confirm">${escapeHtml(confirmLabel)}</button>
    </div>`;
  return mountDialog({
    html,
    role: 'alertdialog',
    label: title || message,
    focusSelector: '.dialog-confirm',
    readValue: () => true,
  }).then(Boolean);
}

/**
 * @param {string} message
 * @param {string} [defaultValue]
 * @param {{placeholder?: string, label?: string}} [opts]
 */
function showPrompt(message, defaultValue = '', opts = {}) {
  const { placeholder = '', label = '' } = opts;
  const inputId = `dialog-input-${Date.now()}`;
  const html = `
    <div class="dialog-body">
      ${label
        ? `<label for="${inputId}" class="dialog-label">${escapeHtml(label)}</label>`
        : `<label for="${inputId}" class="dialog-message">${escapeHtml(message)}</label>`}
      <input id="${inputId}" class="dialog-input" type="text" value="${escapeHtml(defaultValue)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off">
    </div>
    <div class="dialog-actions">
      <button type="button" class="btn dialog-cancel">Cancel</button>
      <button type="button" class="btn btn-primary dialog-confirm">OK</button>
    </div>`;
  return mountDialog({
    html,
    role: 'dialog',
    label: label || message,
    focusSelector: '.dialog-input',
    submitOnEnterSelector: '.dialog-input',
    readValue: () => {
      const input = document.getElementById(inputId);
      return input instanceof HTMLInputElement ? input.value : '';
    },
  });
}

export const Feedback = {
  showConfirm,
  showPrompt,
  showToast,
};
