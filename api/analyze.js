const ALLOWED_TYPES = new Set([
  'HIGHLIGHT_TO_ITALIC',
  'FONT_SIZE',
  'EXCESS_WHITESPACE',
  'BULLET_TO_TABLE',
  'REDUNDANT_TEXT',
  'PAGE_BREAK_TO_DIVIDER',
  'IMAGE_RESIZE',
]);

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const SYSTEM_PROMPT = `You are GreenPages, an eco-formatting analyzer for student documents in Google Docs.
You will receive a JSON array of paragraphs, each with: paragraphId, text, maxFontSize, hasHighlight, isBullet.
Decide which paragraphs contain wasteful PRINT formatting and respond with ONLY valid JSON — no prose, no markdown fences, no explanation, no trailing commentary.

Flag types and exactly when to use them:
- "HIGHLIGHT_TO_ITALIC": hasHighlight is true for that paragraph.
- "FONT_SIZE": maxFontSize is greater than 12. Include "currentSize" (the maxFontSize you were given) and "suggestedSize": 11.
- "EXCESS_WHITESPACE": the paragraph's text is empty or only whitespace.
- "BULLET_TO_TABLE": isBullet is true and the paragraph text is short (under ~8 words). autoFixable must be false.
- "REDUNDANT_TEXT": the paragraph is wordy/verbose for an academic document. Include "original" (the exact input text) and "condensed" (your rewrite, same meaning, at least 30% shorter). Do not include "description" on this type.
- "PAGE_BREAK_TO_DIVIDER": the paragraph text contains a form-feed character (\\f).

Every flag object must include "type", "paragraphId" (copied exactly from the input), and "autoFixable" (boolean — true for every type above except BULLET_TO_TABLE, which is always false).
Add a short human-readable "description" for every type except REDUNDANT_TEXT.
Only emit a flag when the paragraph you were given actually matches — never invent issues, and never emit more than one flag of the same type for the same paragraphId.
Do not emit IMAGE_RESIZE; no image data is provided to you.

Respond with exactly this JSON shape and nothing else, no matter how many or few flags you find:
{"flags": [ { "type": "...", "paragraphId": "...", "autoFixable": true } ]}`;

function diffParagraphIds(previousSnapshot, currentSnapshot) {
  const prev = previousSnapshot || {};
  return Object.keys(currentSnapshot).filter(
    (id) => !prev[id] || prev[id].text !== currentSnapshot[id].text
  );
}

function validateFlags(rawFlags, currentSnapshot) {
  if (!Array.isArray(rawFlags)) return [];
  return rawFlags
    .filter((f) => f && typeof f === 'object' && ALLOWED_TYPES.has(f.type) && currentSnapshot[f.paragraphId])
    .map((f) => {
      const flag = {
        type: f.type,
        paragraphId: f.paragraphId,
        autoFixable: Boolean(f.autoFixable),
      };
      if (typeof f.description === 'string') flag.description = f.description;
      if (typeof f.original === 'string') flag.original = f.original;
      if (typeof f.condensed === 'string') flag.condensed = f.condensed;
      if (typeof f.currentSize === 'number') flag.currentSize = f.currentSize;
      if (typeof f.suggestedSize === 'number') flag.suggestedSize = f.suggestedSize;
      return flag;
    });
}

async function callGemini(paragraphs, apiKey, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const res = await doFetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(paragraphs) }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini request failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  const text = data && data.candidates && data.candidates[0]
    && data.candidates[0].content && data.candidates[0].content.parts
    && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
  if (!text) throw new Error('Gemini returned no content');
  return JSON.parse(text);
}

async function analyze(payload, apiKey, fetchImpl) {
  const { currentSnapshot, previousSnapshot, previousFlags } = payload || {};
  if (!currentSnapshot || typeof currentSnapshot !== 'object') {
    throw new Error('currentSnapshot is required');
  }

  const changedIds = diffParagraphIds(previousSnapshot, currentSnapshot);
  const carriedFlags = (previousFlags || []).filter(
    (f) => f && !changedIds.includes(f.paragraphId) && currentSnapshot[f.paragraphId]
  );

  let freshFlags = [];
  if (changedIds.length > 0) {
    const paragraphsToAnalyze = changedIds
      .map((id) => currentSnapshot[id])
      .filter(Boolean)
      .map((p) => ({
        paragraphId: p.paragraphId,
        text: p.text,
        maxFontSize: p.maxFontSize,
        hasHighlight: p.hasHighlight,
        isBullet: p.isBullet,
      }));
    const geminiResult = await callGemini(paragraphsToAnalyze, apiKey, fetchImpl);
    freshFlags = validateFlags(geminiResult.flags, currentSnapshot);
  }

  const flags = [...carriedFlags, ...freshFlags];
  const ecoScore = Math.max(0, 100 - flags.length * 8);
  return { flags, ecoScore, changedIds };
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server' });
    return;
  }
  try {
    const result = await analyze(req.body || {}, apiKey);
    res.status(200).json({ flags: result.flags, ecoScore: result.ecoScore });
  } catch (err) {
    const status = err.message === 'currentSnapshot is required' ? 400 : 502;
    res.status(status).json({ error: err.message });
  }
}

module.exports = handler;
module.exports.analyze = analyze;
module.exports.diffParagraphIds = diffParagraphIds;
module.exports.validateFlags = validateFlags;
module.exports.SYSTEM_PROMPT = SYSTEM_PROMPT;
