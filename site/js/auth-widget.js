/**
 * auth-widget.js — Login/logout button for SWA Easy Auth.
 *
 * Hidden when running locally (no SWA auth headers).
 * Shows user identity + logout when authenticated.
 * Shows login button when not authenticated.
 */
export const AuthWidget = (() => {
  async function init() {
    const container = document.getElementById('auth-widget');
    if (!container) return;

    // Hide auth UI entirely when running locally
    if (!ApiClient.isHosted()) {
      container.style.display = 'none';
      return;
    }

    const principal = await ApiClient.getAuthInfo();
    if (principal) {
      const name = principal.userDetails || principal.userId || 'User';
      container.innerHTML = `
        <span class="auth-user">${escapeHtml(name)}</span>
        <a href="/.auth/logout" class="auth-btn auth-logout">Logout</a>
      `;
    } else {
      container.innerHTML = `
        <a href="/.auth/login/github" class="auth-btn auth-login">Login with GitHub</a>
      `;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { init };
})();

if (typeof window !== 'undefined') {
  window.AuthWidget = AuthWidget;
}
