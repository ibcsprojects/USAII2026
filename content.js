function init() {
  window.GreenPagesSummarySidebar.mount();
  window.GreenPagesOverlay.mount();
  window.GreenPagesAnalysis.start();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GREENPAGES_GET_STATE') {
    sendResponse(window.GreenPagesFlagStore.getState());
  } else if (message?.type === 'GREENPAGES_OPEN_SIDEBAR') {
    window.GreenPagesSummarySidebar.open();
    sendResponse({ ok: true });
  } else if (message?.type === 'GREENPAGES_PREVIEW_PRINT_GUARD') {
    window.GreenPagesPrintIntercept.openPrintGuard();
    sendResponse({ ok: true });
  } else if (message?.type === 'GREENPAGES_FORCE_ANALYZE') {
    window.GreenPagesAnalysis.runNow().then(() => sendResponse({ ok: true }));
    return true;
  }
});

init();