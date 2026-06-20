const STORAGE_KEY = 'greenpages_impact';
const SHEETS_PER_TREE = 8333;

function scoreTier(score) {
  if (score >= 70) return 'good';
  if (score >= 40) return 'mid';
  return 'poor';
}

function renderDocSection(tabId, state) {
  const container = document.getElementById('gp-popup-doc');
  if (!state) {
    container.innerHTML = '<p class="gp-popup-empty">Open a Google Doc to see live flags.</p>';
    return;
  }
  container.innerHTML = `
    <div class="gp-doc-score-row">
      <div class="gp-doc-score-badge" data-tier="${scoreTier(state.ecoScore)}">${state.ecoScore}</div>
      <div class="gp-doc-score-copy">
        <strong>${state.flags.length}</strong> unresolved flag${state.flags.length === 1 ? '' : 's'}
      </div>
    </div>
    <div class="gp-doc-actions">
      <button type="button" class="gp-popup-btn" id="gp-open-sidebar">Open summary</button>
      <button type="button" class="gp-popup-btn gp-popup-btn-secondary" id="gp-preview-print">Preview print guard</button>
    </div>
    <button type="button" class="gp-popup-btn gp-popup-btn-secondary gp-popup-btn-wide" id="gp-rescan">Re-scan now</button>
  `;

  document.getElementById('gp-open-sidebar').addEventListener('click', () => {
    chrome.tabs.sendMessage(tabId, { type: 'GREENPAGES_OPEN_SIDEBAR' });
    window.close();
  });

  document.getElementById('gp-preview-print').addEventListener('click', () => {
    chrome.tabs.sendMessage(tabId, { type: 'GREENPAGES_PREVIEW_PRINT_GUARD' });
    window.close();
  });

  document.getElementById('gp-rescan').addEventListener('click', (e) => {
    e.target.textContent = 'Scanning…';
    e.target.disabled = true;
    chrome.tabs.sendMessage(tabId, { type: 'GREENPAGES_FORCE_ANALYZE' }, () => {
      loadDocState();
    });
  });
}

function loadDocState() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes('docs.google.com/document')) {
      renderDocSection(null, null);
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: 'GREENPAGES_GET_STATE' }, (state) => {
      if (chrome.runtime.lastError || !state) {
        renderDocSection(null, null);
        return;
      }
      renderDocSection(tab.id, state);
    });
  });
}

function loadImpactStats() {
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    const stats = result[STORAGE_KEY] || { docsGuarded: 0, sheetsCouldHaveSaved: 0, sheetsPrinted: 0 };
    document.getElementById('gp-stat-docs').textContent = stats.docsGuarded;
    document.getElementById('gp-stat-sheets').textContent = stats.sheetsCouldHaveSaved;
    const treePct = Math.min(100, Math.round((stats.sheetsCouldHaveSaved / SHEETS_PER_TREE) * 100));
    document.getElementById('gp-stat-trees').textContent = `${treePct}%`;
  });
}

loadDocState();
loadImpactStats();
