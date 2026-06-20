(function (root) {
  const DOCS_API_BASE = 'https://docs.googleapis.com/v1/documents';

  function getDocumentIdFromUrl() {
    const match = window.location.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  function getAccessToken() {
    return new Promise((resolve, reject) => {
      if (!chrome.identity || !chrome.identity.getAuthToken) {
        reject(new Error('chrome.identity unavailable — add an oauth2 client_id to manifest.json (see README)'));
        return;
      }
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'No token returned'));
          return;
        }
        resolve(token);
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
    const token = await getAccessToken();
    const res = await fetch(`${DOCS_API_BASE}/${documentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Docs API documents.get failed (${res.status}): ${body}`);
    }
    const doc = await res.json();
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
    const token = await getAccessToken();
    const res = await fetch(`${DOCS_API_BASE}/${documentId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Docs API batchUpdate failed (${res.status}): ${body}`);
    }
    return res.json();
  }

  const api = {
    applyFix,
    buildRequests,
    resolveAbsoluteRange,
    fetchSnapshot,
    getLastSnapshot,
    parseSnapshot,
    getDocumentIdFromUrl,
    getAccessToken,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.GreenPagesDocsApi = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
