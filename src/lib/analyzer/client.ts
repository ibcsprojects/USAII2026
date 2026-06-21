// Analysis entry point. Switches between the offline rules engine (default, no creds)
// and the Gemini-backed serverless endpoint (when a backendUrl + AI are configured).
// Both return the identical Flag[] shape, so callers never branch on the source.

import type { DocModel } from '../docModel'
import { flatten } from '../docModel'
import type { Flag } from './types'
import { analyzeDoc } from './rules'

export interface AnalyzeOptions {
  useAI: boolean
  backendUrl: string
}

export async function analyze(doc: DocModel, opts: AnalyzeOptions): Promise<Flag[]> {
  if (opts.useAI && opts.backendUrl) {
    try {
      return await analyzeViaBackend(doc, opts.backendUrl)
    } catch (err) {
      // Network/key failure should never break the product — fall back to local rules.
      console.warn('[GreenPages] backend analyze failed, using local rules:', err)
    }
  }
  return analyzeDoc(doc)
}

async function analyzeViaBackend(doc: DocModel, backendUrl: string): Promise<Flag[]> {
  const res = await fetch(`${backendUrl.replace(/\/$/, '')}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ doc, text: flatten(doc) }),
  })
  if (!res.ok) throw new Error(`analyze ${res.status}`)
  const data = (await res.json()) as { flags: Flag[] }
  return data.flags
}

/** Ask the backend (Gemini) to condense text; falls back to the local shortener. */
export async function condenseViaBackend(
  text: string,
  backendUrl: string,
): Promise<string> {
  const res = await fetch(`${backendUrl.replace(/\/$/, '')}/api/condense`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error(`condense ${res.status}`)
  const data = (await res.json()) as { text: string }
  return data.text
}
