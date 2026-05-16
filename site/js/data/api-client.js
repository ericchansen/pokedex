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

  async function request(method, url, body) {
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
      try { text = await resp.text(); } catch (_) {}
      throw new Error(`${method} ${url} failed: ${resp.status} ${resp.statusText}${text ? ` — ${text}` : ''}`);
    }

    return resp;
  }

  async function getJson(url) {
    const resp = await request('GET', url);
    return resp.json();
  }

  async function post(url, body) {
    const resp = await request('POST', url, body);
    return resp.json();
  }

  async function put(url, body) {
    const resp = await request('PUT', url, body);
    return resp.json();
  }

  async function remove(url) {
    const resp = await request('DELETE', url);
    return resp.json();
  }

  /** Check if the current user is authenticated (SWA Easy Auth). */
  async function getAuthInfo() {
    if (!isHosted()) return null;
    try {
      const resp = await fetch('/.auth/me');
      if (!resp.ok) return null;
      const data = await resp.json();
      return data?.clientPrincipal || null;
    } catch (_) {
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

if (typeof window !== 'undefined') {
  window.ApiClient = ApiClient;
}
