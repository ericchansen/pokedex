/**
 * ui/widgets/form-errors.js - Shared form error rendering.
 */
export const FormErrors = (() => {
  /** @param {HTMLElement} input */
  function clearFieldError(input) {
    input.classList.remove('field-error');
    const existing = input.parentElement?.querySelector('.field-error-msg');
    if (existing) existing.remove();
  }

  /** @param {HTMLElement} input @param {string} message */
  function showFieldError(input, message) {
    clearFieldError(input);
    input.classList.add('field-error');
    const errorEl = document.createElement('div');
    errorEl.className = 'field-error-msg';
    errorEl.textContent = message;
    input.parentElement?.appendChild(errorEl);
    const handler = () => {
      clearFieldError(input);
      input.removeEventListener('input', handler);
      input.removeEventListener('change', handler);
    };
    input.addEventListener('input', handler);
    input.addEventListener('change', handler);
  }

  /** @param {HTMLElement} form @param {Array<{input?: HTMLElement|null, message: string}>} fieldErrors */
  function showFormErrors(form, fieldErrors) {
    form.querySelectorAll('.field-error').forEach((el) => el.classList.remove('field-error'));
    form.querySelectorAll('.field-error-msg').forEach((el) => el.remove());
    form.querySelectorAll('.form-error-banner').forEach((el) => el.remove());

    if (fieldErrors.length === 0) return true;

    for (const { input, message } of fieldErrors) {
      if (input) showFieldError(input, message);
    }

    const banner = document.createElement('div');
    banner.className = 'form-error-banner';
    banner.textContent = `${fieldErrors.length} validation error${fieldErrors.length > 1 ? 's' : ''} — please fix before saving`;
    form.prepend(banner);
    banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    return false;
  }

  /** @param {HTMLElement} form @param {string} message */
  function showFormApiBanner(form, message) {
    form.querySelectorAll('.form-error-banner').forEach((el) => el.remove());
    const banner = document.createElement('div');
    banner.className = 'form-error-banner';
    banner.textContent = message;
    form.prepend(banner);
    banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  return {
    clearFieldError,
    showFieldError,
    showFormErrors,
    showFormApiBanner,
  };
})();
