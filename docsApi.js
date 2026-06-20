(function (root) {
  function getDocumentIdFromUrl() {
    const match = window.location.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  // chrome.identity isn't available to content scripts, so the actual token +
  // fetch calls run in background.js (a privileged extension context); this
  // just relays the request there and waits for the response.
  function sendToBackground(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response && response.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response);
      });
    });
  }

  let lastSnapshot = null;

  function getLastSnapshot() {
    return lastSnapshot;
  }

  // Mirrors the official documents.get response shape:
  // body.content[] StructuralElement -> paragraph.elements[] ParagraphElement -> textRun.
  // The API doesn't expose a "kix.xxx"-style paragraph id, so we synthesize a
  // stable-for-this-snapshot id from each paragraph's absolute startIndex.
  function parseSnapshot(doc) {
    const snapshot = {};
    const content = (doc && doc.body && doc.body.content) || [];
    content.forEach((el) => {
      if (!el.paragraph) return;
      const paragraphId = `p-${el.startIndex}`;
      let text = '';
      let maxFontSize = null;
      let hasHighlight = false;
      (el.paragraph.elements || []).forEach((pe) => {
        if (!pe.textRun) return;
        text += pe.textRun.content || '';
        const style = pe.textRun.textStyle || {};
        if (style.fontSize && typeof style.fontSize.magnitude === 'number') {
          maxFontSize = Math.max(maxFontSize || 0, style.fontSize.magnitude);
        }
        if (style.backgroundColor && style.backgroundColor.color) {
          hasHighlight = true;
        }
      });
      snapshot[paragraphId] = {
        paragraphId,
        text,
        startIndex: el.startIndex,
        endIndex: el.endIndex,
        maxFontSize,
        hasHighlight,
        isBullet: !!el.paragraph.bullet,
      };
    });
    return snapshot;
  }

  async function fetchSnapshot() {
    const documentId = getDocumentIdFromUrl();
    if (!documentId) throw new Error('Could not resolve a document ID from the current URL');
    const { doc } = await sendToBackground({ type: 'GREENPAGES_BG_FETCH_SNAPSHOT', documentId });
    lastSnapshot = parseSnapshot(doc);
    return lastSnapshot;
  }

  // Flags carry either absolute startIndex/endIndex already, or a
  // paragraphId + paragraph-relative startOffset/endOffset that needs the
  // paragraph's absolute startIndex (from the last fetched snapshot) added on.
  function resolveAbsoluteRange(flag) {
    if (flag.startIndex != null && flag.endIndex != null) {
      return { startIndex: flag.startIndex, endIndex: flag.endIndex };
    }
    const paragraph = lastSnapshot && lastSnapshot[flag.paragraphId];
    if (!paragraph || flag.startOffset == null || flag.endOffset == null) return null;
    return {
      startIndex: paragraph.startIndex + flag.startOffset,
      endIndex: paragraph.startIndex + flag.endOffset,
    };
  }

  function buildRequests(flag, range) {
    switch (flag.type) {
      case 'HIGHLIGHT_TO_ITALIC':
        return [{
          updateTextStyle: {
            range: { startIndex: range.startIndex, endIndex: range.endIndex },
            textStyle: { backgroundColor: {}, italic: true },
            fields: 'backgroundColor,italic',
          },
        }];
      case 'FONT_SIZE':
        return [{
          updateTextStyle: {
            range: { startIndex: range.startIndex, endIndex: range.endIndex },
            textStyle: { fontSize: { magnitude: flag.suggestedSize, unit: 'PT' } },
            fields: 'fontSize',
          },
        }];
      case 'EXCESS_WHITESPACE':
        return [{
          deleteContentRange: { range: { startIndex: range.startIndex, endIndex: range.endIndex } },
        }];
      case 'REDUNDANT_TEXT':
        return [
          { deleteContentRange: { range: { startIndex: range.startIndex, endIndex: range.endIndex } } },
          { insertText: { location: { index: range.startIndex }, text: flag.condensed || '' } },
        ];
      case 'PAGE_BREAK_TO_DIVIDER':
        return [
          { deleteContentRange: { range: { startIndex: range.startIndex, endIndex: range.endIndex } } },
          { insertText: { location: { index: range.startIndex }, text: '———' } },
        ];
      default:
        return null;
    }
  }

  async function applyFix(flag) {
    if (!['HIGHLIGHT_TO_ITALIC', 'FONT_SIZE', 'EXCESS_WHITESPACE', 'REDUNDANT_TEXT', 'PAGE_BREAK_TO_DIVIDER'].includes(flag.type)) {
      throw new Error(`${flag.type} is suggestion-only — there is no Docs API write operation for it`);
    }
    const range = resolveAbsoluteRange(flag);
    if (!range) {
      throw new Error(`Could not resolve a document range for ${flag.type} (paragraphId=${flag.paragraphId}) — fetch a fresh snapshot first`);
    }
    const requests = buildRequests(flag, range);
    const documentId = getDocumentIdFromUrl();
    if (!documentId) throw new Error('Could not resolve a document ID from the current URL');
    const { result } = await sendToBackground({ type: 'GREENPAGES_BG_BATCH_UPDATE', documentId, requests });
    return result;
  }

  const api = {
    applyFix,
    buildRequests,
    resolveAbsoluteRange,
    fetchSnapshot,
    getLastSnapshot,
    parseSnapshot,
    getDocumentIdFromUrl,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.GreenPagesDocsApi = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
