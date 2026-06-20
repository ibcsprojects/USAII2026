(function () {
  // Update after deploying the Vercel project (see README) — until then,
  // analysis passes fetch a live snapshot but skip the backend call.
  const BACKEND_URL = 'https://YOUR-VERCEL-PROJECT.vercel.app/api/analyze';
  const DEBOUNCE_MS = 8000;
  const EDITOR_SELECTOR = '.kix-appview-editor';

  let debounceTimer = null;
  let previousSnapshot = null;
  let previousFlags = [];
  let running = false;
  let warnedNotConfigured = false;

  function isBackendConfigured() {
    return !BACKEND_URL.includes('YOUR-VERCEL-PROJECT');
  }

  async function runAnalysis() {
    if (running) return;
    running = true;
    try {
      const currentSnapshot = await window.GreenPagesDocsApi.fetchSnapshot();
      if (!isBackendConfigured()) {
        if (!warnedNotConfigured) {
          console.info('[GreenPages] BACKEND_URL not configured yet — skipping analyze call. See README.');
          warnedNotConfigured = true;
        }
        previousSnapshot = currentSnapshot;
        return;
      }
      const res = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentSnapshot, previousSnapshot, previousFlags }),
      });
      if (!res.ok) throw new Error(`backend responded ${res.status}`);
      const result = await res.json();
      window.GreenPagesFlagStore.setFlags(result.flags || []);
      window.GreenPagesFlagStore.setDocMeta({ ecoScore: typeof result.ecoScore === 'number' ? result.ecoScore : 100 });
      previousSnapshot = currentSnapshot;
      previousFlags = result.flags || [];
    } catch (err) {
      console.warn('[GreenPages] Analysis pass failed (expected until OAuth + the Vercel backend are configured):', err.message);
    } finally {
      running = false;
    }
  }

  function scheduleAnalysis() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runAnalysis, DEBOUNCE_MS);
  }

  function start() {
    const editor = document.querySelector(EDITOR_SELECTOR) || document.body;
    const observer = new MutationObserver(scheduleAnalysis);
    observer.observe(editor, { childList: true, subtree: true, characterData: true });
  }

  window.GreenPagesAnalysis = { start, runNow: runAnalysis };
})();
