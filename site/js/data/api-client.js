/**
 * data/api-client.js - Minimal JSON HTTP client for the data layer.
 */
const ApiClient = (() => {
  async function request(method, url, body) {
    const options = { method };
    if (body !== undefined) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }

    const resp = await fetch(url, options);
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

  return {
    getJson,
    post,
    put,
    delete: remove,
  };
})();

if (typeof window !== 'undefined') {
  window.ApiClient = ApiClient;
}
