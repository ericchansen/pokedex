import { SettingsState } from '../settings-state.js';
import { UIShared } from '../ui-shared.js';
import { Feedback } from '../ui/feedback.js';

/**
 * views/settings.js - Local browser settings.
 */



const SettingsView = (() => {
  /** @param {HTMLElement} container */
  function mount(container) {
    const state = SettingsState.get();
    const defaultLanguageName = UIShared.getLanguageName(state.defaultLanguage);

    container.innerHTML = `
      <section class="settings-page">
        <div class="settings-card">
          <div class="settings-card-header">
            <h2>Settings</h2>
            <p class="settings-help">Local display preferences for this browser.</p>
          </div>

          <div class="form-group">
            <label for="settings-theme">Theme</label>
            <p class="settings-help">Visual appearance of the tracker.</p>
            <select id="settings-theme" class="settings-select">
              <option value="default">Default (Dark)</option>
              <option value="gen3">Gen III — GBA Era</option>
            </select>
          </div>

          <div class="form-group">
            <label for="settings-default-language">Default language</label>
            <p class="settings-help">
              Instance language can stay on the default option in the editor. Only Pokemon with a
              different explicit language will show a language badge in Boxes, Inventory, and the viewer.
            </p>
            <select id="settings-default-language" class="settings-select">
              ${UIShared.renderLanguageOptions(state.defaultLanguage, { includeBlank: false })}
            </select>
          </div>

          <div class="settings-summary" id="settings-language-summary">
            Current default: <strong>${UIShared.escapeHtml(defaultLanguageName)}</strong>
          </div>

        </div>
      </section>
    `;

    const themeSelect = container.querySelector('#settings-theme');
    if (!(themeSelect instanceof HTMLSelectElement)) return;
    themeSelect.value = state.theme;
    themeSelect.addEventListener('change', () => {
      SettingsState.setTheme(themeSelect.value);
      Feedback.showToast('Theme updated');
    });

    const select = container.querySelector('#settings-default-language');
    const summary = container.querySelector('#settings-language-summary');
    if (!(select instanceof HTMLSelectElement) || !(summary instanceof HTMLElement)) return;
    const summaryElement = summary;

    /** @param {string} code */
    function updateSummary(code) {
      summaryElement.innerHTML = `Current default: <strong>${UIShared.escapeHtml(UIShared.getLanguageName(code))}</strong>`;
    }

    select.addEventListener('change', () => {
      const next = SettingsState.setDefaultLanguage(select.value);
      updateSummary(next.defaultLanguage);
      Feedback.showToast(`Default language set to ${UIShared.getLanguageName(next.defaultLanguage)}`);
    });
  }

  function unmount() {}

  return { mount, unmount };
})();

export { SettingsView };
