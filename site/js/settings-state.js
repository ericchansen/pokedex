/**
 * settings-state.js - Local UI preferences persisted in localStorage.
 */

export const SettingsState = (() => {
  const STORAGE_KEY = 'pokemonHomeTrackerSettings';
  const VALID_THEMES = new Set(['default', 'gen3']);
  const DEFAULTS = Object.freeze({
    defaultLanguage: 'ENG',
    theme: 'default',
  });

  let state = loadState();
  const listeners = new Set();

  function normalizeLanguageCode(value) {
    const code = String(value || '').trim().toUpperCase();
    return code || DEFAULTS.defaultLanguage;
  }

  function normalizeTheme(value) {
    const t = String(value || '').trim().toLowerCase();
    if (t === 'frlg') return 'gen3'; // backward-compat migration
    return VALID_THEMES.has(t) ? t : DEFAULTS.theme;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw);
      return {
        defaultLanguage: normalizeLanguageCode(parsed?.defaultLanguage),
        theme: normalizeTheme(parsed?.theme),
      };
    } catch (err) {
      console.warn('[SettingsState] failed to load settings', err);
      return { ...DEFAULTS };
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('[SettingsState] failed to persist settings', err);
    }
  }

  function emit() {
    const snapshot = { ...state };
    for (const listener of [...listeners]) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('[SettingsState] listener failed', err);
      }
    }
  }

  function get() {
    return { ...state };
  }

  function getDefaultLanguage() {
    return state.defaultLanguage;
  }

  function setDefaultLanguage(value) {
    state = {
      ...state,
      defaultLanguage: normalizeLanguageCode(value),
    };
    persist();
    emit();
    return get();
  }

  function setTheme(value) {
    const theme = normalizeTheme(value);
    state = { ...state, theme };
    persist();
    emit();
    document.documentElement.dataset.theme = theme;
    return get();
  }

  function reset() {
    state = { ...DEFAULTS };
    persist();
    emit();
    document.documentElement.dataset.theme = DEFAULTS.theme;
    return get();
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    state = loadState();
    emit();
  });

  return {
    DEFAULTS,
    get,
    getDefaultLanguage,
    setDefaultLanguage,
    setTheme,
    reset,
    subscribe,
    normalizeLanguageCode,
  };
})();

if (typeof window !== 'undefined') {
  window.SettingsState = SettingsState;
}
