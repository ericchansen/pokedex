/**
 * export-ui.js - Bulk export UI decoupled from route renderers.
 */

const ExportUI = (() => {
  const { escapeHtml } = UIShared;

  function openBulkExportModal(builds, opts) {
    const list = (builds || []).filter(Boolean);
    if (!list.length) return;
    const title = (opts && opts.title)
      || `Export ${list.length} build${list.length === 1 ? '' : 's'}`;

    const allChampionsNative = list.every((build) => {
      const systems = DomainMappers.getEvSystems(build);
      return systems.length === 1 && systems[0] === 'champions';
    });
    let target = allChampionsNative ? 'champions' : 'classic';

    const overlay = document.createElement('div');
    overlay.className = 'showdown-paste-overlay bulk-export-overlay';
    overlay.innerHTML = `
      <div class="showdown-paste-modal bulk-export-modal">
        <div class="bulk-export-header">
          <h3>${escapeHtml(title)}</h3>
          <button type="button" class="bulk-export-close" aria-label="Close">×</button>
        </div>
        <div class="bulk-export-target">
          <p class="bulk-export-target-label">Target game</p>
          <label class="bulk-export-radio">
            <input type="radio" name="bulk-export-target" value="classic" ${target === 'classic' ? 'checked' : ''}>
            <span><strong>Scarlet/Violet &amp; older</strong> <span class="muted">— 0–252 EVs, IVs, Tera Type</span></span>
          </label>
          <label class="bulk-export-radio">
            <input type="radio" name="bulk-export-target" value="champions" ${target === 'champions' ? 'checked' : ''}>
            <span><strong>Pokémon Champions</strong> <span class="muted">— 0–32 SP, no IVs, no Tera</span></span>
          </label>
        </div>
        <div class="bulk-export-warnings" id="bulk-export-warnings"></div>
        <textarea id="bulk-export-textarea" rows="14" readonly></textarea>
        <div class="showdown-paste-actions bulk-export-actions">
          <button type="button" class="btn btn-primary" id="bulk-export-copy">Copy to Clipboard</button>
          <button type="button" class="btn btn-secondary" id="bulk-export-download">Download .txt</button>
          <button type="button" class="btn btn-secondary" id="bulk-export-cancel">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const textarea = overlay.querySelector('#bulk-export-textarea');
    const warnBox = overlay.querySelector('#bulk-export-warnings');
    const copyBtn = overlay.querySelector('#bulk-export-copy');
    const downloadBtn = overlay.querySelector('#bulk-export-download');

    function rebuild() {
      try {
        const blocks = [];
        const warnings = [];
        for (const build of list) {
          const { member, conversion } = EvConvert.memberForTarget(build, target);
          blocks.push(TeamExportFormatter.formatMember(member, target));
          if (conversion.converted) {
            const name = build.form ? `${build.species}-${build.form}` : (build.species || build.slug || 'build');
            warnings.push({ name, note: conversion.note });
          }
        }
        textarea.value = blocks.join('\n\n');

        if (!warnings.length) {
          warnBox.innerHTML = '';
          return;
        }

        const items = warnings
          .map((warning) => `<li><strong>${escapeHtml(warning.name)}</strong>: ${escapeHtml(warning.note)}</li>`)
          .join('');
        warnBox.innerHTML = `
          <div class="bulk-export-warning-banner">
            <p class="bulk-export-warning-title">⚠ ${warnings.length} build${warnings.length === 1 ? '' : 's'} converted between scales</p>
            <ul class="bulk-export-warning-list">${items}</ul>
          </div>`;
      } catch (err) {
        console.error('[Export] rebuild failed:', err);
        warnBox.innerHTML = `<div class="bulk-export-warning-banner"><p class="bulk-export-warning-title">⚠ Export error: ${escapeHtml(err.message)}</p></div>`;
      }
    }

    rebuild();

    overlay.querySelectorAll('input[name="bulk-export-target"]').forEach((radio) => {
      radio.addEventListener('change', (event) => {
        target = event.target.value;
        rebuild();
      });
    });

    function close() {
      overlay.remove();
    }

    overlay.querySelector('.bulk-export-close').addEventListener('click', close);
    overlay.querySelector('#bulk-export-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });

    copyBtn.addEventListener('click', async () => {
      await UIShared.flashCopyFeedback(textarea.value, copyBtn, { successText: '✓ Copied', cssClass: 'copied' });
    });

    downloadBtn.addEventListener('click', () => {
      const blob = new Blob([textarea.value], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.href = url;
      link.download = `pokemon-export-${target}-${stamp}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  return { openBulkExportModal };
})();

if (typeof window !== 'undefined') {
  window.ExportUI = ExportUI;
}
