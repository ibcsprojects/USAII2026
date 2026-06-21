// Google Docs API integration: OAuth token handling, reading a live document into our
// DocModel (with Docs index anchors for write-back), and pushing batchUpdate edits.
// All Chrome/identity specifics live here so docBackend stays a pure edit-translation layer.

import type { DocModel, Paragraph, TextRun } from './docModel'
import { rebuildOffsets } from './docModel'

const DOCS_GET = (id: string) => `https://docs.googleapis.com/v1/documents/${id}`
const DOCS_BATCH = (id: string) =>
  `https://docs.googleapis.com/v1/documents/${id}:batchUpdate`

const DEFAULT_FONT = 11

/** Parse the document id out of the active Google Docs tab, or null if not on a doc. */
export async function getActiveGoogleDocId(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  const m = (tab?.url ?? '').match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : null
}

/** Tab id of the active Google Doc, for messaging its content script directly. */
export async function getActiveDocsTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (tab?.id == null || !/\/document\/d\//.test(tab.url ?? '')) return null
  return tab.id
}

// --- OAuth -----------------------------------------------------------------
// getAuthToken caches internally, so interactive:true only shows UI the first time;
// afterwards it resolves silently with the cached token.
function getToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (result: unknown) => {
      const err = chrome.runtime.lastError
      // Newer Chrome returns { token }, older returns a bare string.
      const token =
        typeof result === 'string'
          ? result
          : (result as { token?: string } | undefined)?.token
      if (err || !token) return reject(new Error(err?.message ?? 'no auth token'))
      resolve(token)
    })
  })
}

function invalidate(token: string): Promise<void> {
  return new Promise((resolve) =>
    chrome.identity.removeCachedAuthToken({ token }, () => resolve()),
  )
}

/** Fetch with the Docs OAuth token; refreshes the token once on a 401 (expired/revoked). */
async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let token = await getToken(true)
  const call = (t: string) =>
    fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` },
    })
  let res = await call(token)
  if (res.status === 401) {
    await invalidate(token)
    token = await getToken(true)
    res = await call(token)
  }
  return res
}

// --- Read ------------------------------------------------------------------
export async function fetchGoogleDoc(docId: string): Promise<DocModel> {
  const res = await authedFetch(DOCS_GET(docId))
  if (!res.ok) throw new Error(`documents.get ${res.status}`)
  return mapApiDoc(docId, (await res.json()) as ApiDoc)
}

// --- Write -----------------------------------------------------------------
export async function pushBatchUpdate(docId: string, requests: unknown[]): Promise<void> {
  if (requests.length === 0) return
  const res = await authedFetch(DOCS_BATCH(docId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  if (!res.ok) throw new Error(`batchUpdate ${res.status}: ${await res.text()}`)
}

// --- Mapping: Docs API document -> DocModel --------------------------------
// We read only the handful of fields we model. Each run carries its Docs startIndex and
// each paragraph its [startIndex, endIndex) so docBackend can translate edits back.
interface ApiRgb {
  red?: number
  green?: number
  blue?: number
}
interface ApiTextStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontSize?: { magnitude?: number }
  backgroundColor?: { color?: { rgbColor?: ApiRgb } }
}
interface ApiElement {
  startIndex?: number
  endIndex?: number
  textRun?: { content?: string; textStyle?: ApiTextStyle }
  pageBreak?: unknown
  inlineObjectElement?: { inlineObjectId: string }
}
interface ApiParagraph {
  elements?: ApiElement[]
  paragraphStyle?: { namedStyleType?: string }
  bullet?: unknown
}
interface ApiStructural {
  startIndex?: number
  endIndex?: number
  paragraph?: ApiParagraph
}
interface ApiDimension {
  magnitude?: number
  unit?: string
}
interface ApiInlineObject {
  inlineObjectProperties?: {
    embeddedObject?: {
      size?: { width?: ApiDimension; height?: ApiDimension }
    }
  }
}
interface ApiDoc {
  title?: string
  body?: { content?: ApiStructural[] }
  inlineObjects?: Record<string, ApiInlineObject>
}

function mapApiDoc(docId: string, api: ApiDoc): DocModel {
  const inlineObjects = api.inlineObjects ?? {}
  const paragraphs: Paragraph[] = []
  let i = 0
  for (const el of api.body?.content ?? []) {
    if (!el.paragraph) continue // skip tables / sectionBreaks we don't model
    paragraphs.push(mapParagraph(`p${i++}`, el, el.paragraph, inlineObjects))
  }
  if (paragraphs.length === 0) {
    paragraphs.push({ id: 'p0', kind: 'normal', runs: [{ text: '', fontSize: DEFAULT_FONT }] })
  }
  return rebuildOffsets({
    id: docId,
    title: api.title ?? 'Untitled',
    defaultFontSize: DEFAULT_FONT,
    linesPerPage: 46,
    paragraphs,
  })
}

function mapParagraph(
  id: string,
  el: ApiStructural,
  para: ApiParagraph,
  inlineObjects: Record<string, ApiInlineObject>,
): Paragraph {
  const elements = para.elements ?? []
  const named = para.paragraphStyle?.namedStyleType ?? ''
  const kind: Paragraph['kind'] = elements.some((e) => e.pageBreak)
    ? 'pageBreak'
    : para.bullet
      ? 'bullet'
      : named.startsWith('HEADING') || named === 'TITLE'
        ? 'heading'
        : 'normal'

  const runs: TextRun[] = elements
    .map((e) => {
      if (e.textRun) return mapRun(e)
      if (e.inlineObjectElement) return mapImageRun(e, inlineObjects)
      return null
    })
    .filter((r): r is TextRun => r !== null)
  if (runs.length === 0) {
    // Empty / break-only paragraphs still need a run so the analyzer + offsets work.
    runs.push({ text: '', fontSize: DEFAULT_FONT, docStart: el.startIndex })
  }
  return { id, kind, runs, docStart: el.startIndex, docEnd: el.endIndex }
}

function mapRun(e: ApiElement): TextRun {
  const ts = e.textRun!.textStyle ?? {}
  const raw = e.textRun!.content ?? ''
  // Docs carries the paragraph's newline on its final run; our flat model adds it back via
  // rebuildOffsets, so strip it here to keep offsets aligned.
  const text = raw.endsWith('\n') ? raw.slice(0, -1) : raw
  return {
    text,
    bold: ts.bold || undefined,
    italic: ts.italic || undefined,
    underline: ts.underline || undefined,
    highlightColor: rgbToHex(ts.backgroundColor?.color?.rgbColor),
    fontSize: ts.fontSize?.magnitude ?? DEFAULT_FONT,
    docStart: e.startIndex,
  }
}

// Converts a Dimension to points regardless of the unit Docs reports it in (it's
// normally PT already, but guard against EMU just in case: 1pt = 12700 EMU).
function toPt(d?: ApiDimension): number | undefined {
  if (d?.magnitude == null) return undefined
  return d.unit === 'EMU' ? d.magnitude / 12700 : d.magnitude
}

function mapImageRun(e: ApiElement, inlineObjects: Record<string, ApiInlineObject>): TextRun {
  const objectId = e.inlineObjectElement!.inlineObjectId
  const size = inlineObjects[objectId]?.inlineObjectProperties?.embeddedObject?.size
  return {
    text: '',
    fontSize: DEFAULT_FONT,
    docStart: e.startIndex,
    imageObjectId: objectId,
    imageWidthPt: toPt(size?.width),
    imageHeightPt: toPt(size?.height),
  }
}

function rgbToHex(rgb?: ApiRgb): string | null {
  if (!rgb) return null
  const c = (v?: number) =>
    Math.round((v ?? 0) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${c(rgb.red)}${c(rgb.green)}${c(rgb.blue)}`
}
