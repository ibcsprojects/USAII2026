(function () {
  const STORAGE_KEY = 'greenpages_impact';
  const GRAMS_PER_SHEET = 4.5;
  const SHEETS_PER_TREE = 8333;

  const listeners = new Set();
  let flags = [];
  let docMeta = { ecoScore: 100, estimatedPages: 0, potentialPages: 0 };

  function notify() {
    const state = getState();
    listeners.forEach((fn) => fn(state));
  }

  function getState() {
    return {
      flags: flags.slice(),
      ecoScore: docMeta.ecoScore,
      estimatedPages: docMeta.estimatedPages,
      potentialPages: docMeta.potentialPages,
    };
  }

  function setFlags(nextFlags) {
    flags = Array.isArray(nextFlags) ? nextFlags : [];
    notify();
  }

  function setDocMeta(partialMeta) {
    docMeta = Object.assign({}, docMeta, partialMeta);
    notify();
  }

  function removeFlag(index) {
    flags = flags.filter((_, i) => i !== index);
    notify();
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function recordPrintImpact({ pagesPrinted, pagesIfFixed }) {
    const sheetsCouldHaveSaved = Math.max(0, pagesPrinted - pagesIfFixed);
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const prev = result[STORAGE_KEY] || { docsGuarded: 0, sheetsCouldHaveSaved: 0, sheetsPrinted: 0 };
      chrome.storage.local.set({
        [STORAGE_KEY]: {
          docsGuarded: prev.docsGuarded + 1,
          sheetsCouldHaveSaved: prev.sheetsCouldHaveSaved + sheetsCouldHaveSaved,
          sheetsPrinted: prev.sheetsPrinted + pagesPrinted,
        },
      });
    });
  }

  function getImpactStats(callback) {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const stats = result[STORAGE_KEY] || { docsGuarded: 0, sheetsCouldHaveSaved: 0, sheetsPrinted: 0 };
      callback({
        ...stats,
        gramsCouldHaveSaved: Math.round(stats.sheetsCouldHaveSaved * GRAMS_PER_SHEET),
        treesCouldHaveSaved: stats.sheetsCouldHaveSaved / SHEETS_PER_TREE,
      });
    });
  }

  // Placeholder flags until Person 1 (overlay) wires real diffs and Person 3's
  // Gemini backend returns live JSON via setFlags()/setDocMeta().
  setFlags([
    {
      type: 'HIGHLIGHT_TO_ITALIC',
      paragraphId: 'kix.demo1',
      description: 'Yellow highlight detected — switch to italic to save ink',
      autoFixable: true,
    },
    {
      type: 'FONT_SIZE',
      paragraphId: 'kix.demo2',
      currentSize: 14,
      suggestedSize: 11,
      description: 'Body text is 14pt — 11pt reads fine and saves space',
      autoFixable: true,
    },
    {
      type: 'EXCESS_WHITESPACE',
      paragraphId: 'kix.demo3',
      description: 'Double spacing detected across 4 paragraphs',
      autoFixable: true,
    },
    {
      type: 'BULLET_TO_TABLE',
      paragraphId: 'kix.demo4',
      description: '8 short bullet points — a table would use 40% less space',
      autoFixable: false,
    },
    {
      type: 'REDUNDANT_TEXT',
      paragraphId: 'kix.demo5',
      original: 'In order to be able to fully understand the topic at hand, it is important to first consider...',
      condensed: 'To understand this topic, first consider...',
      autoFixable: true,
    },
    {
      type: 'IMAGE_RESIZE',
      paragraphId: 'kix.demo6',
      currentWidth: 600,
      suggestedWidth: 400,
      description: 'Image is larger than the text column it sits in',
      autoFixable: false,
    },
  ]);
  setDocMeta({ ecoScore: 54, estimatedPages: null, potentialPages: 3 });

  window.GreenPagesFlagStore = {
    getState,
    setFlags,
    setDocMeta,
    removeFlag,
    subscribe,
    recordPrintImpact,
    getImpactStats,
    STORAGE_KEY,
  };
})();
