// POST /api/condense  { text } -> { text, source: 'gemini' | 'local' }
// Gemini 1.5 Flash shortens the paragraph; falls back to the offline shortener so the
// endpoint always returns something useful even without a key.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { geminiGenerate } from '../server/lib/gemini.js'
import { condensePrompt, setCors } from '../server/lib/prompt.js'
import { condenseLocally } from '../src/lib/analyzer/condense.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { text } = parseBody<{ text?: string }>(req.body)
  if (!text) return res.status(400).json({ error: 'missing text' })

  const ai = await geminiGenerate(condensePrompt(text)).catch(() => null)
  if (ai) return res.status(200).json({ text: ai, source: 'gemini' })
  return res.status(200).json({ text: condenseLocally(text), source: 'local' })
}

function parseBody<T>(body: unknown): T {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body || '{}') as T
    } catch {
      return {} as T
    }
  }
  return (body ?? {}) as T
}
