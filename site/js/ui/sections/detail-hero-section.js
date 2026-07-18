import { UIShared } from '../../ui-shared.js';

/**
 * ui/sections/detail-hero-section.js - Shared detail hero/header rendering.
 */
export const DetailHeroSection = (() => {
  /**
   * @param {{
   * slug: string, speciesName: string, dexId: string|number,
   * speciesEntry?: object|null
   * }} subject
   * @param {{submetaHtml?: string, pillsHtml?: string}} [options]
   */
  function renderPokemon(subject, options = {}) {
    const {
      submetaHtml = '',
      pillsHtml = '',
    } = options;
    const { spriteImgHtml, escapeHtml } = UIShared;

    let html = `
      ${spriteImgHtml(subject.slug, subject.speciesName, { cls: 'detail-artwork' })}
      <h2 class="detail-name">${escapeHtml(subject.speciesName)}</h2>`;

    if (subject.dexId) {
      html += `<p class="detail-dex">#${String(subject.dexId).padStart(4, '0')}</p>`;
    }

    const types = subject.speciesEntry && 'types' in subject.speciesEntry
      && Array.isArray(subject.speciesEntry.types)
      ? /** @type {string[]} */ (subject.speciesEntry.types)
      : [];
    if (types.length) {
      html += `<div class="type-badges">${types.map((type) => `<span class="type-badge type-${escapeHtml(type.toLowerCase())}">${escapeHtml(type)}</span>`).join('')}</div>`;
    }

    if (submetaHtml) html += submetaHtml;
    if (pillsHtml) html += pillsHtml;

    return html;
  }

  /** @param {{title?: string, subtitleHtml?: string, pillsHtml?: string, artworkHtml?: string}} [options] */
  function renderSimple(options = {}) {
    const {
      title = '—',
      subtitleHtml = '',
      pillsHtml = '',
      artworkHtml = '',
    } = options;
    const { escapeHtml } = UIShared;

    let html = '';
    if (artworkHtml) html += artworkHtml;
    html += `<h2 class="detail-name">${escapeHtml(title)}</h2>`;
    if (subtitleHtml) html += subtitleHtml;
    if (pillsHtml) html += pillsHtml;
    return html;
  }

  return {
    renderPokemon,
    renderSimple,
  };
})();
