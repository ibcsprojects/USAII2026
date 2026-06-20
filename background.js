const DOCS_API_BASE = 'https://docs.googleapis.com/v1/documents';

function getAccessToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'No token returned'));
        return;
      }
      resolve(token);
    });
  });
}

async function handleFetchSnapshot(documentId) {
  const token = await getAccessToken();
  const res = await fetch(`${DOCS_API_BASE}/${documentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Docs API documents.get failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

async function handleBatchUpdate(documentId, requests) {
  const token = await getAccessToken();
  const res = await fetch(`${DOCS_API_BASE}/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) {
    throw new Error(`Docs API batchUpdate failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GREENPAGES_BG_FETCH_SNAPSHOT') {
    handleFetchSnapshot(message.documentId)
      .then((doc) => sendResponse({ doc }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
  if (message?.type === 'GREENPAGES_BG_BATCH_UPDATE') {
    handleBatchUpdate(message.documentId, message.requests)
      .then((result) => sendResponse({ result }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
  return undefined;
});
