import { createSubscriptionSet } from './state/subscription-set.js';

/**
 * settings-state.js - Local UI preferences persisted in localStorage.
 */

export const SettingsState = (() => {
  /** @typedef {{defaultLanguage: string, theme: string}} Settings */
  /** @typedef {(settings: Settings) => void} SettingsListener */
  const STORAGE_KEY = 'pokemonHomeTrackerSettings';
  const VALID_THEMES = new Set(['default', 'gen3']);
  const DEFAULTS = Object.freeze({
    defaultLanguage: 'ENG',
    theme: 'default',
  });

  /** @type {Settings} */
  let state = loadState();
  const subscriptions = createSubscriptionSet('SettingsState');

  /** @param {unknown} value */
  function normalizeLanguageCode(value) {
    const code = String(value || '').trim().toUpperCase();
    return code || DEFAULTS.defaultLanguage;
  }

  /** @param {unknown} value */
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
    subscriptions.notify();
  }

  function get() {
    return { ...state };
  }

  function getDefaultLanguage() {
    return state.defaultLanguage;
  }

  /** @param {unknown} value */
  function setDefaultLanguage(value) {
    state = {
      ...state,
      defaultLanguage: normalizeLanguageCode(value),
    };
    persist();
    emit();
    return get();
  }

  /** @param {unknown} value */
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

  /** @param {SettingsListener} listener */
  function subscribe(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    return subscriptions.subscribe(() => listener(get()));
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
