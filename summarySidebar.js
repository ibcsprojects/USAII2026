(function () {
  let panelEl = null;
  let toggleEl = null;
  let isOpen = false;

  function scoreTier(score) {
    if (score >= 70) return 'good';
    if (score >= 40) return 'mid';
    return 'poor';
  }

  function render(state) {
    if (!panelEl) return;
    toggleEl.querySelector('.gp-toggle-score').textContent = state.ecoScore;
    toggleEl.dataset.tier = scoreTier(state.ecoScore);

    const list = panelEl.querySelector('.gp-sidebar-list');
    const countEl = panelEl.querySelector('.gp-sidebar-count');
    countEl.textContent = `${state.flags.length} flag${state.flags.length === 1 ? '' : 's'}`;
    list.innerHTML = '';
    if (state.flags.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'gp-flag-clean';
      empty.textContent = 'No unresolved flags — nice work.';
      list.appendChild(empty);
      return;
    }
    state.flags.forEach((flag, index) => list.appendChild(window.GreenPagesFlagCard.render(flag, index, { tag: 'li', className: 'gp-card' })));
  }

  function open() {
    isOpen = true;
    panelEl.classList.add('gp-sidebar-open');
    panelEl.setAttribute('aria-hidden', 'false');
  }

  function close() {
    isOpen = false;
    panelEl.classList.remove('gp-sidebar-open');
    panelEl.setAttribute('aria-hidden', 'true');
  }

  function toggle() {
    isOpen ? close() : open();
  }

  function mount() {
    if (panelEl) return;

    toggleEl = document.createElement('button');
    toggleEl.type = 'button';
    toggleEl.id = 'greenpages-toggle';
    toggleEl.setAttribute('aria-label', 'Open GreenPages summary');
    toggleEl.innerHTML = '<span class="gp-toggle-leaf" aria-hidden="true">🌿</span><span class="gp-toggle-score">100</span>';
    toggleEl.addEventListener('click', toggle);
    document.body.appendChild(toggleEl);

    panelEl = document.createElement('aside');
    panelEl.id = 'greenpages-sidebar';
    panelEl.setAttribute('aria-hidden', 'true');
    panelEl.innerHTML = `
      <div class="gp-sidebar-header">
        <h2>GreenPages</h2>
        <span class="gp-sidebar-count">0 flags</span>
        <button type="button" class="gp-sidebar-close" aria-label="Close summary">×</button>
      </div>
      <ul class="gp-sidebar-list"></ul>
      <div class="gp-sidebar-footer">
        <button type="button" class="gp-btn gp-btn-secondary gp-btn-sm" id="gp-sidebar-preview-print">Preview print guard</button>
      </div>
    `;
    document.body.appendChild(panelEl);

    panelEl.querySelector('.gp-sidebar-close').addEventListener('click', close);
    panelEl.querySelector('#gp-sidebar-preview-print').addEventListener('click', () => {
      window.GreenPagesPrintIntercept.openPrintGuard();
    });

    window.GreenPagesFlagStore.subscribe(render);
    render(window.GreenPagesFlagStore.getState());
  }

  window.GreenPagesSummarySidebar = { mount, open, close, toggle };
})();
