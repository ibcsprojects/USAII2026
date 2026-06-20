(function () {
  const PAGE_SELECTOR = '.kix-page-paginated, .kix-page, .kix-appview-editor .kix-page';
  const CHARS_PER_PAGE_ESTIMATE = 3000;
  const MANY_PAGES_THRESHOLD = 10;
  const originalPrint = window.print.bind(window);

  let modalEl = null;
  let lastFocusedEl = null;

  function estimatePageCount() {
    const pages = document.querySelectorAll(PAGE_SELECTOR);
    if (pages.length > 0) return pages.length;
    const editor = document.querySelector('.kix-appview-editor');
    const text = (editor || document.body).innerText || '';
    return Math.max(1, Math.ceil(text.length / CHARS_PER_PAGE_ESTIMATE));
  }

  function estimatePotentialPages(actualPages, flags) {
    const autoFixableCount = flags.filter((f) => f.autoFixable).length;
    const reduction = Math.floor(autoFixableCount / 3);
    return Math.max(1, actualPages - reduction);
  }

  function formatFlagType(type) {
    return String(type || '').replace(/_/g, ' ').toLowerCase();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  function buildModal(state) {
    const overlay = document.createElement('div');
    overlay.id = 'greenpages-print-guard-overlay';
    overlay.innerHTML = `
      <div class="gp-modal" role="dialog" aria-modal="true" aria-labelledby="gp-modal-title">
        <header class="gp-modal-header">
          <span class="gp-modal-leaf" aria-hidden="true">🌿</span>
          <h2 id="gp-modal-title">Before you print&hellip;</h2>
        </header>
        <div class="gp-modal-body">
          ${state.pagesPrinted > MANY_PAGES_THRESHOLD ? `
            <div class="gp-banner-warn">
              You're about to print <strong>${state.pagesPrinted} pages</strong>. Are you sure?
            </div>
          ` : ''}
          <div class="gp-score-row">
            <div class="gp-score-badge" data-tier="${scoreTier(state.ecoScore)}">${state.ecoScore}</div>
            <div class="gp-score-copy">
              <strong>${state.pagesPrinted} page${state.pagesPrinted === 1 ? '' : 's'}</strong> estimated
              ${state.pagesIfFixed < state.pagesPrinted ? `<span class="gp-score-sub">could be ${state.pagesIfFixed} if the flags below are fixed first</span>` : ''}
            </div>
          </div>
          ${state.flags.length > 0 ? `
            <div class="gp-flag-section">
              <p class="gp-flag-heading">${state.flags.length} unresolved issue${state.flags.length === 1 ? '' : 's'}</p>
              <ul class="gp-flag-list">
                ${state.flags.slice(0, 5).map((f) => `
                  <li class="gp-flag-item">
                    <span class="gp-flag-type">${formatFlagType(f.type)}</span>
                    ${f.description ? `<span class="gp-flag-desc">${escapeHtml(f.description)}</span>` : ''}
                  </li>
                `).join('')}
                ${state.flags.length > 5 ? `<li class="gp-flag-item gp-flag-more">+${state.flags.length - 5} more &mdash; open the summary sidebar</li>` : ''}
              </ul>
            </div>
          ` : `<p class="gp-flag-clean">No unresolved flags &mdash; nice work.</p>`}
          <ul class="gp-reminder-list">
            <li class="gp-reminder">Print double-sided if your printer supports it</li>
            <li class="gp-reminder">Check the paper size/tray matches this document</li>
            <li class="gp-reminder">Double check the destination printer and pickup location</li>
          </ul>
        </div>
        <footer class="gp-modal-footer">
          <button type="button" class="gp-btn gp-btn-primary" id="gp-btn-edit">Go Back &amp; Edit</button>
          <button type="button" class="gp-btn gp-btn-secondary" id="gp-btn-print">Print Anyway</button>
        </footer>
      </div>
    `;
    return overlay;
  }

  function scoreTier(score) {
    if (score >= 70) return 'good';
    if (score >= 40) return 'mid';
    return 'poor';
  }

  function closeModal() {
    if (!modalEl) return;
    modalEl.remove();
    modalEl = null;
    document.documentElement.classList.remove('greenpages-scroll-lock');
    document.removeEventListener('keydown', onModalKeydown, true);
    if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') lastFocusedEl.focus();
  }

  function onModalKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  }

  function openPrintGuard() {
    if (modalEl) return;
    const store = window.GreenPagesFlagStore;
    const state = store.getState();
    const pagesPrinted = estimatePageCount();
    const pagesIfFixed = state.flags.length ? estimatePotentialPages(pagesPrinted, state.flags) : pagesPrinted;
    store.setDocMeta({ estimatedPages: pagesPrinted, potentialPages: pagesIfFixed });

    lastFocusedEl = document.activeElement;
    modalEl = buildModal({ ...state, pagesPrinted, pagesIfFixed });
    document.body.appendChild(modalEl);
    document.documentElement.classList.add('greenpages-scroll-lock');
    document.addEventListener('keydown', onModalKeydown, true);

    modalEl.querySelector('#gp-btn-edit').addEventListener('click', closeModal);
    modalEl.querySelector('#gp-btn-print').addEventListener('click', () => {
      store.recordPrintImpact({ pagesPrinted, pagesIfFixed });
      closeModal();
      originalPrint();
    });
    modalEl.querySelector('#gp-btn-edit').focus();
  }

  // Ctrl+P fires before Chrome's native print dialog opens; a capture-phase
  // listener on document runs ahead of any handler Docs attaches lower in
  // the tree, so preventDefault here actually stops the dialog.
  document.addEventListener('keydown', (e) => {
    const isPrintShortcut = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p';
    if (isPrintShortcut) {
      e.preventDefault();
      e.stopImmediatePropagation();
      openPrintGuard();
    }
  }, true);

  // Catches File > Print and any other path that calls window.print() directly.
  window.print = openPrintGuard;

  window.GreenPagesPrintIntercept = { openPrintGuard, closeModal, estimatePageCount };
})();
