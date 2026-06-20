(function () {
  const TEXT_CONTAINER_SELECTOR = '.kix-appview-editor';
  const COLOR_BY_TYPE = {
    HIGHLIGHT_TO_ITALIC: 'var(--gp-amber)',
    FONT_SIZE: 'var(--gp-coral)',
    EXCESS_WHITESPACE: 'var(--gp-green)',
    BULLET_TO_TABLE: 'var(--gp-amber)',
    REDUNDANT_TEXT: 'var(--gp-green-dark)',
    PAGE_BREAK_TO_DIVIDER: 'var(--gp-coral)',
    IMAGE_RESIZE: 'var(--gp-amber)',
  };

  let containerEl = null;
  let cardEl = null;
  let rafHandle = null;

  function collectTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.nodeValue && node.nodeValue.length > 0
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  function findRangeForText(searchText, occurrenceIndex) {
    if (!searchText) return null;
    const root = document.querySelector(TEXT_CONTAINER_SELECTOR) || document.body;
    const nodes = collectTextNodes(root);
    if (nodes.length === 0) return null;
    const located = window.GreenPagesTextAnchor.locateText(
      nodes.map((n) => n.nodeValue),
      searchText,
      occurrenceIndex || 0
    );
    if (!located) return null;
    const range = document.createRange();
    range.setStart(nodes[located.start.nodeIndex], located.start.localOffset);
    range.setEnd(nodes[located.end.nodeIndex], located.end.localOffset);
    return range;
  }

  // Flags only carry a paragraphId + relative offsets (or, for REDUNDANT_TEXT,
  // the literal original text). Resolve that into a literal substring to
  // search for in the live DOM, since Kix doesn't expose paragraphId as a
  // queryable DOM attribute.
  function resolveFlagText(flag) {
    if (flag.type === 'REDUNDANT_TEXT' && flag.original) return flag.original;
    const snapshot = window.GreenPagesDocsApi.getLastSnapshot();
    const paragraph = snapshot && snapshot[flag.paragraphId];
    if (!paragraph) return null;
    if (flag.startOffset != null && flag.endOffset != null) {
      return paragraph.text.slice(flag.startOffset, flag.endOffset);
    }
    return paragraph.text.trim() ? paragraph.text : null;
  }

  function clearUnderlines() {
    if (containerEl) containerEl.innerHTML = '';
  }

  function ensureContainer() {
    if (containerEl) return containerEl;
    containerEl = document.createElement('div');
    containerEl.id = 'greenpages-underline-layer';
    document.body.appendChild(containerEl);
    return containerEl;
  }

  function buildUnderlineEl(rect, flag, index) {
    const el = document.createElement('div');
    el.className = 'gp-underline';
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.bottom - 2}px`;
    el.style.width = `${rect.width}px`;
    el.style.background = COLOR_BY_TYPE[flag.type] || 'var(--gp-green)';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openFlagCard(flag, index, rect);
    });
    return el;
  }

  function rebuildUnderlines() {
    const container = ensureContainer();
    clearUnderlines();
    const state = window.GreenPagesFlagStore.getState();
    state.flags.forEach((flag, index) => {
      const searchText = resolveFlagText(flag);
      if (!searchText) return;
      const range = findRangeForText(searchText);
      if (!range) return;
      Array.from(range.getClientRects()).forEach((rect) => {
        if (rect.width <= 0) return;
        container.appendChild(buildUnderlineEl(rect, flag, index));
      });
    });
  }

  function scheduleResync() {
    if (rafHandle) return;
    rafHandle = requestAnimationFrame(() => {
      rafHandle = null;
      rebuildUnderlines();
    });
  }

  function closeFlagCard() {
    if (!cardEl) return;
    cardEl.remove();
    cardEl = null;
    document.documentElement.classList.remove('greenpages-scroll-lock');
  }

  function openFlagCard(flag, index, rect) {
    closeFlagCard();
    document.documentElement.classList.add('greenpages-scroll-lock');
    cardEl = window.GreenPagesFlagCard.render(flag, index, {
      tag: 'div',
      className: 'gp-card gp-mode2-card',
      showCloseButton: true,
      onClose: closeFlagCard,
      onResolved: closeFlagCard,
    });
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - 328);
    const top = Math.min(rect.bottom + 8, window.innerHeight - 220);
    cardEl.style.left = `${left}px`;
    cardEl.style.top = `${top}px`;
    document.body.appendChild(cardEl);
  }

  function mount() {
    ensureContainer();
    window.addEventListener('scroll', scheduleResync, true);
    window.addEventListener('resize', scheduleResync);
    document.addEventListener('click', closeFlagCard);
    window.GreenPagesFlagStore.subscribe(rebuildUnderlines);
    rebuildUnderlines();
  }

  window.GreenPagesOverlay = { mount, rebuildUnderlines, findRangeForText, resolveFlagText, closeFlagCard };
})();
