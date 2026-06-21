// The deterministic, offline eco-rules engine. Each detector scans the DocModel and
// emits Flags with a serializable EditAction. This runs in the side panel today; the
// optional Gemini backend (server/api/analyze.ts) returns the same Flag shape so the UI
// is identical whether analysis is local or AI-assisted.

import type { DocModel, Paragraph } from '../docModel.js'
import { paragraphText } from '../docModel.js'
import type { EcoImpact, Flag, Range } from './types.js'
import { condenseLocally, looksVerbose } from './condense.js'

/** ~characters that fit on one printed line / page for impact math. */
const CHARS_PER_LINE = 90

let _fid = 0
const fid = (t: string) => `flag-${t}-${_fid++}`

function charsToPaper(chars: number, doc: DocModel): number {
  const charsPerPage = CHARS_PER_LINE * doc.linesPerPage
  return Math.max(0, chars / charsPerPage)
}

function isBlank(p: Paragraph): boolean {
  const hasImage = p.runs.some((r) => r.imageObjectId)
  return paragraphText(p).trim().length === 0 && p.kind !== 'pageBreak' && !hasImage
}

// ---------------------------------------------------------------------------
// 1. Highlighted text → de-highlight (switch to underline). Highlight fills are
//    among the most ink-hungry things you can print.
// ---------------------------------------------------------------------------
function detectHighlights(doc: DocModel): Flag[] {
  const flags: Flag[] = []
  for (const p of doc.paragraphs) {
    for (const r of p.runs) {
      if (r.highlightColor && r.text.trim()) {
        const range: Range = { start: r.start!, end: r.end! }
        flags.push({
          id: fid('highlight'),
          type: 'highlight',
          severity: 'high',
          range,
          title: 'Highlighted text wastes ink',
          explanation:
            'Background highlights flood the page with ink when printed. Underline conveys the same emphasis using a fraction of the ink.',
          before: `🖍️ "${truncate(r.text)}"`,
          after: `U̲n̲d̲e̲r̲l̲i̲n̲e̲ "${truncate(r.text)}"`,
          impact: { paper: 0, ink: 0.9 * (r.text.length / 200) },
          action: { kind: 'removeHighlight', range, alt: 'underline' },
        })
      }
    }
  }
  return flags
}

// ---------------------------------------------------------------------------
// 2. Oversized body font → shrink to default. Large fonts spill onto extra sheets.
// ---------------------------------------------------------------------------
function detectFontSize(doc: DocModel): Flag[] {
  const flags: Flag[] = []
  const threshold = doc.defaultFontSize + 1
  for (const p of doc.paragraphs) {
    if (p.kind === 'heading') continue // headings are allowed to be large
    for (const r of p.runs) {
      if (r.fontSize > threshold && r.text.trim()) {
        const range: Range = { start: r.start!, end: r.end! }
        const to = doc.defaultFontSize
        const linesSaved =
          (r.text.length / CHARS_PER_LINE) * (1 - to / r.fontSize)
        const impact: EcoImpact = { paper: linesSaved / doc.linesPerPage, ink: 0 }
        flags.push({
          id: fid('fontSize'),
          type: 'fontSize',
          severity: r.fontSize >= 16 ? 'high' : 'medium',
          range,
          title: `Body text is ${r.fontSize}pt`,
          explanation: `This paragraph is set at ${r.fontSize}pt. Dropping body text to ${to}pt keeps it readable while fitting more on each page.`,
          before: `${r.fontSize}pt — "${truncate(r.text)}"`,
          after: `${to}pt — "${truncate(r.text)}"`,
          impact,
          action: { kind: 'setFontSize', range, from: r.fontSize, to },
        })
      }
    }
  }
  return flags
}

// ---------------------------------------------------------------------------
// 3. Runs of blank paragraphs / double spacing → collapse.
// ---------------------------------------------------------------------------
function detectBlankRuns(doc: DocModel): Flag[] {
  const flags: Flag[] = []
  let i = 0
  while (i < doc.paragraphs.length) {
    if (isBlank(doc.paragraphs[i])) {
      let j = i
      while (j < doc.paragraphs.length && isBlank(doc.paragraphs[j])) j++
      const count = j - i
      if (count >= 2) {
        const range: Range = {
          start: doc.paragraphs[i].start!,
          end: doc.paragraphs[j - 1].end!,
        }
        flags.push({
          id: fid('blank'),
          type: 'doubleSpacing',
          severity: count >= 3 ? 'medium' : 'low',
          range,
          title: `${count} blank lines in a row`,
          explanation:
            'Stacks of empty lines pad the document and push content onto extra pages. One blank line is enough to separate sections.',
          before: `${count} empty lines`,
          after: '1 empty line',
          impact: { paper: charsToPaper((count - 1) * CHARS_PER_LINE, doc), ink: 0 },
          action: { kind: 'removeBlankLines', range },
        })
      }
      i = j
    } else {
      i++
    }
  }
  return flags
}

// ---------------------------------------------------------------------------
// 4. Hard page breaks → a slim dashed rule (ChatGPT/Claude style separator).
// ---------------------------------------------------------------------------
function detectPageBreaks(doc: DocModel): Flag[] {
  const flags: Flag[] = []
  for (const p of doc.paragraphs) {
    if (p.kind === 'pageBreak') {
      const range: Range = { start: p.start!, end: p.end! }
      flags.push({
        id: fid('pageBreak'),
        type: 'pageBreak',
        severity: 'medium',
        range,
        title: 'Hard page break',
        explanation:
          'A forced page break can leave most of a sheet blank. A thin divider line separates sections without burning a whole page.',
        before: '⤓ Page break (rest of sheet blank)',
        after: '— — — — — divider line — — — — —',
        impact: { paper: 0.4, ink: 0 },
        action: { kind: 'pageBreakToRule', range },
      })
    }
  }
  return flags
}

// ---------------------------------------------------------------------------
// 5. Many short bullets → a compact table.
// ---------------------------------------------------------------------------
function detectBulletSprawl(doc: DocModel): Flag[] {
  const flags: Flag[] = []
  let i = 0
  while (i < doc.paragraphs.length) {
    if (doc.paragraphs[i].kind === 'bullet') {
      let j = i
      while (j < doc.paragraphs.length && doc.paragraphs[j].kind === 'bullet') j++
      const bullets = doc.paragraphs.slice(i, j)
      const rows = bullets.map(paragraphText)
      const avgWords =
        rows.reduce((s, t) => s + t.trim().split(/\s+/).length, 0) / rows.length
      // 5+/<=4 words was tuned to the contrived sample doc ("Sales: high") and almost
      // never matched real bullet lists, which usually run longer per item.
      if (bullets.length >= 4 && avgWords <= 8) {
        const range: Range = { start: bullets[0].start!, end: bullets[j - 1 - i].end! }
        flags.push({
          id: fid('bullets'),
          type: 'bulletSprawl',
          severity: 'low',
          range,
          title: `${bullets.length} short bullets`,
          explanation:
            'A long column of tiny bullets uses one line each. A compact table (or multi-column list) fits the same items in far less vertical space.',
          before: `${bullets.length} bullets, 1 line each`,
          after: `Table — ~${Math.ceil(bullets.length / 2)} rows`,
          impact: {
            paper: charsToPaper(Math.floor(bullets.length / 2) * CHARS_PER_LINE, doc),
            ink: 0,
          },
          action: { kind: 'bulletsToTable', range, rows },
        })
      }
      i = j
    } else {
      i++
    }
  }
  return flags
}

// ---------------------------------------------------------------------------
// 6. Verbose paragraphs → condensed text (offline; Gemini upgrades the suggestion).
// ---------------------------------------------------------------------------
function detectVerbose(doc: DocModel, aiRewrite: boolean): Flag[] {
  const flags: Flag[] = []
  for (const p of doc.paragraphs) {
    if (p.kind !== 'normal') continue
    const text = paragraphText(p)
    if (!looksVerbose(text)) continue
    const suggestion = condenseLocally(text)
    const localHelps = suggestion.length < text.length
    // Offline we can only show a useful card when the local shortener actually trims
    // something. With AI on, keep the flag even if the local pass is a no-op — the
    // backend rewrites it with Gemini and fills in a shorter suggestion.
    if (!localHelps && !aiRewrite) continue
    const range: Range = { start: p.start!, end: p.end! }
    flags.push({
      id: fid('verbose'),
      type: 'verbose',
      severity: 'medium',
      range,
      title: 'Wordy paragraph',
      explanation:
        'This paragraph is long and padded. Tightening it removes lines without losing meaning — and you can edit the suggestion before applying.',
      before: truncate(text, 90),
      after: localHelps ? truncate(suggestion, 90) : '✨ AI will rewrite this to be shorter',
      impact: { paper: charsToPaper(text.length - suggestion.length, doc), ink: 0 },
      action: { kind: 'replaceText', range, text: suggestion },
      editableSuggestion: suggestion,
    })
  }
  return flags
}

// ---------------------------------------------------------------------------
// 7. Inline images wider than the text column → shrink them. Docs API supports
//    resizing embedded images directly (updateInlineObjectProperties), so unlike the
//    original brief's assumption this is genuinely auto-fixable, not suggestion-only.
// ---------------------------------------------------------------------------
const MAX_IMAGE_WIDTH_PT = 400 // ~ a standard body text column width

function detectOversizedImages(doc: DocModel): Flag[] {
  const flags: Flag[] = []
  for (const p of doc.paragraphs) {
    for (const r of p.runs) {
      if (!r.imageObjectId || !r.imageWidthPt || r.imageWidthPt <= MAX_IMAGE_WIDTH_PT) continue
      const range: Range = { start: r.start!, end: r.end! }
      const scale = MAX_IMAGE_WIDTH_PT / r.imageWidthPt
      const heightPt = r.imageHeightPt ? Math.round(r.imageHeightPt * scale) : undefined
      flags.push({
        id: fid('image'),
        type: 'imageResize',
        severity: 'low',
        range,
        title: `Image is ${Math.round(r.imageWidthPt)}pt wide`,
        explanation:
          'This image is wider than a standard text column. Shrinking it keeps it legible while using less ink and page space.',
        before: `${Math.round(r.imageWidthPt)}pt wide`,
        after: `${MAX_IMAGE_WIDTH_PT}pt wide`,
        impact: { paper: 0.05, ink: 0.3 },
        action: { kind: 'resizeImage', range, objectId: r.imageObjectId, widthPt: MAX_IMAGE_WIDTH_PT, heightPt },
      })
    }
  }
  return flags
}

function truncate(s: string, n = 60): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

export interface AnalyzeDocOptions {
  /** When true, also flag long paragraphs the offline shortener can't trim, so the
   *  backend can rewrite them with Gemini. Set by the AI-backed endpoint. */
  aiRewrite?: boolean
}

/** Run every detector and return flags ordered by document position. */
export function analyzeDoc(doc: DocModel, opts: AnalyzeDocOptions = {}): Flag[] {
  _fid = 0
  const flags = [
    ...detectHighlights(doc),
    ...detectFontSize(doc),
    ...detectBlankRuns(doc),
    ...detectPageBreaks(doc),
    ...detectBulletSprawl(doc),
    ...detectVerbose(doc, opts.aiRewrite ?? false),
    ...detectOversizedImages(doc),
  ]
  return flags.sort((a, b) => a.range.start - b.range.start)
}

/** Total estimated saving across a set of flags. */
export function totalImpact(flags: Flag[]): EcoImpact {
  return flags.reduce<EcoImpact>(
    (acc, f) => ({ paper: acc.paper + f.impact.paper, ink: acc.ink + f.impact.ink }),
    { paper: 0, ink: 0 },
  )
}
