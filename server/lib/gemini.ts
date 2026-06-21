// Thin Gemini 1.5 Flash client (Google AI Studio free tier). Returns null when no key is
// configured so callers transparently fall back to the offline shortener.

const MODEL = 'gemini-2.5-flash'

export function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

export async function geminiGenerate(prompt: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        // gemini-2.5-flash is a *thinking* model: left unbounded it spends the whole token
        // budget on hidden reasoning, finishes with MAX_TOKENS and returns no visible text —
        // making us silently fall back to the local shortener. Disable thinking so the budget
        // goes to the actual rewrite. (This is the "limit:0" gotcha.)
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  })
  if (!res.ok) {
    console.warn('[GreenPages] Gemini error', res.status, await res.text())
    return null
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    // Empty output (e.g. finishReason MAX_TOKENS) — log so this doesn't fail silently again.
    console.warn('[GreenPages] Gemini returned no text', data.candidates?.[0]?.finishReason)
    return null
  }
  return text.trim()
}
