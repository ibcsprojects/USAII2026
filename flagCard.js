(function () {
  function formatFlagType(type) {
    return String(type || '').replace(/_/g, ' ').toLowerCase();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  // options: { tag, className, showCloseButton, onClose, onResolved }
  function render(flag, index, options) {
    const opts = options || {};
    const card = document.createElement(opts.tag || 'li');
    card.className = opts.className || 'gp-card';
    card.innerHTML = `
      <div class="gp-card-head">
        <span class="gp-card-type">${formatFlagType(flag.type)}</span>
        ${flag.autoFixable ? '<span class="gp-card-autofix">auto-fixable</span>' : '<span class="gp-card-suggestion">suggestion only</span>'}
        ${opts.showCloseButton ? '<button type="button" class="gp-card-x" data-action="close" aria-label="Close">&times;</button>' : ''}
      </div>
      ${flag.type === 'REDUNDANT_TEXT' ? `
        <div class="gp-compare">
          <div class="gp-compare-col">
            <p class="gp-compare-label">Original</p>
            <p class="gp-compare-text">${escapeHtml(flag.original)}</p>
          </div>
          <div class="gp-compare-col">
            <p class="gp-compare-label">Condensed</p>
            <p class="gp-compare-text">${escapeHtml(flag.condensed)}</p>
          </div>
        </div>
      ` : `<p class="gp-card-desc">${escapeHtml(flag.description || '')}</p>`}
      <div class="gp-card-actions">
        ${flag.autoFixable ? '<button type="button" class="gp-btn gp-btn-primary gp-btn-sm" data-action="apply">Apply</button>' : ''}
        <button type="button" class="gp-btn gp-btn-secondary gp-btn-sm" data-action="dismiss">Dismiss</button>
        <span class="gp-card-status" aria-live="polite"></span>
      </div>
    `;

    const statusEl = card.querySelector('.gp-card-status');
    const applyBtn = card.querySelector('[data-action="apply"]');
    if (applyBtn) {
      applyBtn.addEventListener('click', async () => {
        applyBtn.disabled = true;
        statusEl.textContent = 'Applying…';
        try {
          await window.GreenPagesDocsApi.applyFix(flag);
          statusEl.textContent = 'Applied';
          window.GreenPagesFlagStore.removeFlag(index);
          if (opts.onResolved) opts.onResolved();
        } catch (err) {
          applyBtn.disabled = false;
          statusEl.textContent = err.message;
          statusEl.classList.add('gp-card-status-error');
        }
      });
    }

    card.querySelector('[data-action="dismiss"]').addEventListener('click', () => {
      window.GreenPagesFlagStore.removeFlag(index);
      if (opts.onResolved) opts.onResolved();
    });

    const closeBtn = card.querySelector('[data-action="close"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (opts.onClose) opts.onClose();
      });
    }

    return card;
  }

  window.GreenPagesFlagCard = { render };
})();
