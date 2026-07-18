/**
 * data/api-client.js - Minimal JSON HTTP client for the data layer.
 *
 * Handles:
 * - 401 → redirect to SWA Easy Auth login (when hosted)
 * - 412 → ETag conflict notification
 * - Generic errors with descriptive messages
 */
export const ApiClient = (() => {
  function isHosted() {
    // SWA serves on azurestaticapps.net or custom domains; local dev uses localhost
    return !location.hostname.match(/^(localhost|127\.0\.0\.1)$/);
  }

  /**
   * @param {string} method
   * @param {string} url
   * @param {object|undefined} body
   */
  async function request(method, url, body = undefined) {
    /** @type {RequestInit} */
    const options = { method };
    if (body !== undefined) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }

    const resp = await fetch(url, options);

    if (resp.status === 401 && isHosted()) {
      // SWA Easy Auth — redirect to login
      window.location.href = '/.auth/login/github';
      throw new Error('Authentication required — redirecting to login');
    }

    if (resp.status === 412) {
      throw new Error('Data conflict: another change was made. Please refresh and try again.');
    }

    if (!resp.ok) {
      let text = '';
      try { text = await resp.text(); } catch {}
      throw new Error(`${method} ${url} failed: ${resp.status} ${resp.statusText}${text ? ` — ${text}` : ''}`);
    }

    return resp;
  }

  /**
   * JSON is validated and specialized by the data service that owns each URL.
   * @template T
   * @param {string} url
   * @returns {Promise<T>}
   */
  async function getJson(url) {
    const resp = await request('GET', url);
    return /** @type {T} */ (await resp.json());
  }

  /** @template T @param {string} url @param {object} body @returns {Promise<T>} */
  async function post(url, body) {
    const resp = await request('POST', url, body);
    return /** @type {T} */ (await resp.json());
  }

  /** @template T @param {string} url @param {object} body @returns {Promise<T>} */
  async function put(url, body) {
    const resp = await request('PUT', url, body);
    return /** @type {T} */ (await resp.json());
  }

  /** @template T @param {string} url @returns {Promise<T>} */
  async function remove(url) {
    const resp = await request('DELETE', url);
    return /** @type {T} */ (await resp.json());
  }

  /** Check if the current user is authenticated (SWA Easy Auth). */
  async function getAuthInfo() {
    if (!isHosted()) return null;
    try {
      const resp = await fetch('/.auth/me');
      if (!resp.ok) return null;
      const data = await resp.json();
      return data?.clientPrincipal || null;
    } catch (error) {
      console.warn('[ApiClient] failed to load auth info', error);
      return null;
    }
  }

  return {
    getJson,
    post,
    put,
    delete: remove,
    getAuthInfo,
    isHosted,
  };
})();
