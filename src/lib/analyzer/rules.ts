// The deterministic, offline eco-rules engine. Each detector scans the DocModel and
// emits Flags with a serializable EditAction. This runs in the side panel today; the
// optional Gemini backend (server/api/analyze.ts) returns the same Flag shape so the UI
// is identical whether analysis is local or AI-assisted.

import type { DocModel, Paragraph } from '../docModel.js'
import { paragraphText, stripBulletGlyph, hasWideIndent, wideIndentSides, INDENT_KEEP_PT } from '../docModel.js'
import type { EcoImpact, Flag, Range } from './types.js'
import { condenseLocally, looksVerbose } from './condense.js'
import { tableLayout } from '../tableLayout.js'
import { estimatePages } from '../pageEstimate.js'

/** ~characters that fit on one printed line / page for impact math. */
const CHARS_PER_LINE = 90

/** Printable content area of a US-Letter page in points (8.5×11in minus 1in margins). */
const CONTENT_WIDTH_PT = 468
const CONTENT_HEIGHT_PT = 648
const PAGE_AREA_PT = CONTENT_WIDTH_PT * CONTENT_HEIGHT_PT
/** Flag images that cover more than this fraction of the page, and shrink toward it. */
const IMAGE_AREA_LIMIT = 0.25

let _fid = 0
const fid = (t: string) => `flag-${t}-${_fid++}`

export function charsToPaper(chars: number, doc: DocModel): number {
  const charsPerPage = CHARS_PER_LINE * doc.linesPerPage
  return Math.max(0, chars / charsPerPage)
}

function isBlank(p: Paragraph): boolean {
  // Images and tables sit in paragraphs with no text — they are NOT blank lines, and must
  // never be swept into a blank-run collapse (that would delete the image/table).
  if (p.images && p.images.length > 0) return false
  if (p.kind === 'table' || p.isRule) return false
  return paragraphText(p).trim().length === 0 && p.kind !== 'pageBreak'
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
          before: `"${truncate(r.text)}"`,
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
      // A run that reaches the end of the document is handled by detectBlankPage (it may be
      // spilling onto a wasted blank page), so don't also flag it here as plain spacing.
      if (count >= 2 && j < doc.paragraphs.length) {
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
// 3b. Trailing blank lines that spill onto a near-empty extra page. A few empty lines at the
//     end can push the document onto a whole new sheet that's otherwise blank — very wasteful.
// ---------------------------------------------------------------------------
function detectBlankPage(doc: DocModel): Flag[] {
  const paras = doc.paragraphs
  if (paras.length === 0) return []
  // The run of blank paragraphs at the very end of the document.
  let start = paras.length
  for (let k = paras.length - 1; k >= 0; k--) {
    if (isBlank(paras[k])) start = k
    else break
  }
  const trailing = paras.slice(start)
  if (trailing.length === 0) return []

  // Page math (heuristic): do the trailing blanks fall on their own page?
  const lpp = doc.linesPerPage
  const totalLines = estimatePages(doc).lines
  const contentLines = Math.max(0, totalLines - trailing.length)
  const totalPages = Math.max(1, Math.ceil(totalLines / lpp))
  const contentPages = Math.max(1, Math.ceil(contentLines / lpp))
  const createsExtraPage = totalPages > contentPages

  // A single trailing blank is the document's natural last paragraph on most docs, so only
  // flag it on a multi-page document and when it can actually be removed (the paragraph
  // before it isn't a table — that lone blank is the required separator after a table).
  const before = paras[start - 1]
  if (trailing.length < 2) {
    if (totalPages < 2 || !before || before.kind === 'table') return []
  }

  const single = trailing.length === 1
  const range: Range = { start: trailing[0].start!, end: trailing[trailing.length - 1].end! }
  return [
    {
      id: fid('blankPage'),
      type: 'blankPage',
      severity: createsExtraPage ? 'high' : 'low',
      range,
      title: createsExtraPage
        ? single
          ? 'A blank line adds an empty page'
          : 'Blank lines add an empty page'
        : `${trailing.length} trailing blank line${single ? '' : 's'}`,
      explanation: createsExtraPage
        ? 'Empty line(s) at the end of the document run onto a new, almost-blank page — a whole wasted sheet. Removing them pulls everything back onto the previous page.'
        : 'Empty lines at the end of the document only pad it out and can spill onto an extra page.',
      before: `${trailing.length} blank line${single ? '' : 's'} at the end`,
      after: createsExtraPage ? 'Empty page removed' : single ? 'Removed' : '1 blank line',
      impact: {
        paper: createsExtraPage
          ? totalPages - contentPages
          : charsToPaper(Math.max(1, trailing.length - 1) * CHARS_PER_LINE, doc),
        ink: 0,
      },
      action: { kind: 'removeBlankLines', range },
    },
  ]
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
          'A forced page break can leave most of a sheet blank. A horizontal line separates sections without burning a whole page.',
        before: '⤓ Page break (rest of sheet blank)',
        after: '──────  horizontal line  ──────',
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
  const paras = doc.paragraphs
  let i = 0
  while (i < paras.length) {
    if (paras[i].kind !== 'bullet') {
      i++
      continue
    }
    // Walk one list. Wasteful docs often put a blank line between every bullet, which must
    // not hide the list — so we extend the run across blanks, but it still has to start and
    // end on a real bullet. (`lastBullet` is the last non-blank item in the run.)
    let j = i
    let lastBullet = i
    while (j < paras.length && (paras[j].kind === 'bullet' || isBlank(paras[j]))) {
      if (paras[j].kind === 'bullet') lastBullet = j
      j++
    }
    const span = paras.slice(i, lastBullet + 1)
    const bullets = span.filter((p) => p.kind === 'bullet')
    // Manual "• "/"- " bullets carry the glyph in their text; strip it for the cells.
    const rows = bullets.map((p) => stripBulletGlyph(paragraphText(p)).trim())
    // "Short enough to tabulate" is about how much of a line each bullet uses, not its word
    // count: "Remote work is here to stay." is 6 words but barely a third of a line. Gate on
    // characters so short-sentence bullets qualify, while genuinely long (paragraph-like)
    // bullets — where a table would just make one giant cell — are left alone.
    const lengths = rows.map((t) => t.length)
    const avgChars = lengths.reduce((s, n) => s + n, 0) / lengths.length
    const maxChars = Math.max(...lengths, 0)
    if (bullets.length >= 5 && avgChars <= 50 && maxChars <= 90) {
      // Range spans the whole list (blanks included) so converting also removes that spacing.
      const range: Range = { start: span[0].start!, end: span[span.length - 1].end! }
      const layout = tableLayout(rows)
      flags.push({
        id: fid('bullets'),
        type: 'bulletSprawl',
        severity: 'low',
        range,
        title: `${bullets.length} short bullets`,
        explanation:
          'A long column of tiny bullets uses one line each. A compact table fits the same items in far less vertical space.',
        before: `${bullets.length} bullets, 1 line each`,
        after: `Table — ${layout.rows} rows × ${layout.columns} cols`,
        impact: {
          // One line per bullet today vs. roughly one line per grid row in the table.
          paper: charsToPaper(Math.max(0, bullets.length - layout.rows) * CHARS_PER_LINE, doc),
          ink: 0,
        },
        action: { kind: 'bulletsToTable', range, rows },
      })
    }
    i = lastBullet + 1
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
      after: localHelps ? truncate(suggestion, 90) : 'AI will rewrite this to be shorter',
      impact: { paper: charsToPaper(text.length - suggestion.length, doc), ink: 0 },
      action: { kind: 'replaceText', range, text: suggestion },
      editableSuggestion: suggestion,
    })
  }
  return flags
}

// ---------------------------------------------------------------------------
// 7. Oversized images → scale down. A picture filling most of the page pushes text
//    onto extra sheets and floods that sheet with ink when printed.
// ---------------------------------------------------------------------------
function detectLargeImages(doc: DocModel): Flag[] {
  const flags: Flag[] = []
  for (const p of doc.paragraphs) {
    for (const img of p.images ?? []) {
      const ratio = (img.widthPt * img.heightPt) / PAGE_AREA_PT
      if (ratio <= IMAGE_AREA_LIMIT) continue
      // Scale both dimensions by √(target/ratio) so the area lands near the limit.
      const scale = Math.sqrt(IMAGE_AREA_LIMIT / ratio)
      const newW = Math.round(img.widthPt * scale)
      const newH = Math.round(img.heightPt * scale)
      const pct = Math.round(ratio * 100)
      const range: Range = { start: p.start!, end: p.end! }
      flags.push({
        id: fid('image'),
        type: 'largeImage',
        severity: ratio > 0.5 ? 'high' : 'medium',
        range,
        title: `Image fills ${pct}% of the page`,
        explanation:
          'A large image dominates the page, pushing text onto extra sheets and soaking the paper in ink when printed. Scaling it down keeps it clear while freeing space.',
        before: `${Math.round(img.widthPt)}×${Math.round(img.heightPt)}pt — ${pct}% of page`,
        after: `${newW}×${newH}pt — ~${Math.round(IMAGE_AREA_LIMIT * 100)}% of page`,
        impact: {
          // Vertical space reclaimed on the page, plus a rough ink saving from less fill.
          paper: Math.max(0, (img.heightPt - newH) / CONTENT_HEIGHT_PT),
          ink: 0.5 * Math.max(0, ratio - IMAGE_AREA_LIMIT),
        },
        action: { kind: 'resizeImage', range, objectId: img.objectId, scale },
      })
    }
  }
  return flags
}

// ---------------------------------------------------------------------------
// 8. Margins larger than the 1in default → reset just those (only when it saves paper).
//    Two sides honour a "keep as-is" ruler zone so a deliberately tight layout is left be.
//    Surfaced first in the panel (see FlagList) so it's the top recommendation.
// ---------------------------------------------------------------------------
/** US-Letter fallback and the Google Docs default margin, in points (72pt = 1 inch). */
const LETTER_W_PT = 612
const LETTER_H_PT = 792
const DEFAULT_MARGIN_PT = 72 // 1in on every side — the Google Docs default
const PT_PER_IN = 72

function detectWideMargins(doc: DocModel): Flag[] {
  const m = doc.margins
  if (!m) return []
  const pageW = doc.pageWidthPt ?? LETTER_W_PT
  const pageH = doc.pageHeightPt ?? LETTER_H_PT

  // The Google Docs ruler runs -0.75in (left page edge) … 7.75in (right page edge), so
  // ruler 0 sits 0.75in in from the left edge. A left margin of M inches puts the left
  // marker at M − 0.75; a right margin of M puts the right marker at (pageWidth − M) − 0.75.
  // The user keeps a side as-is when its marker is in a preferred zone.
  const RULER_OFFSET_IN = 0.75
  const leftMarkerIn = m.leftPt / PT_PER_IN - RULER_OFFSET_IN
  const rightMarkerIn = pageW / PT_PER_IN - m.rightPt / PT_PER_IN - RULER_OFFSET_IN
  const keepLeft = leftMarkerIn >= -0.75 && leftMarkerIn <= 0.0
  const keepRight = rightMarkerIn >= 7.0 && rightMarkerIn <= 7.75

  // Reset a side to default only if that shrinks it (current > 1in → saves paper) and it
  // isn't in a keep zone. Top/bottom have no keep zone.
  const reduced = (cur: number, keep: boolean) =>
    !keep && cur > DEFAULT_MARGIN_PT ? DEFAULT_MARGIN_PT : cur
  const next = {
    topPt: reduced(m.topPt, false),
    bottomPt: reduced(m.bottomPt, false),
    leftPt: reduced(m.leftPt, keepLeft),
    rightPt: reduced(m.rightPt, keepRight),
  }

  // Nothing worth flagging unless at least one side actually shrinks.
  const shrank =
    next.topPt < m.topPt ||
    next.bottomPt < m.bottomPt ||
    next.leftPt < m.leftPt ||
    next.rightPt < m.rightPt
  if (!shrank) return []

  const area = (mr: typeof next) =>
    Math.max(1, (pageW - mr.leftPt - mr.rightPt) * (pageH - mr.topPt - mr.bottomPt))
  const fractionSaved = Math.max(0, 1 - area(m) / area(next))
  const basePages = estimatePages(doc).pages

  const range: Range = { start: 0, end: 0 } // document-level fix; anchor at the top
  return [
    {
      id: fid('margins'),
      type: 'wideMargins',
      severity: 'medium',
      range,
      // Deliberately generic — the card doesn't spell out the target margin values.
      title: 'Wide margins',
      explanation:
        'Some page margins are larger than the default, shrinking the printable area and pushing text onto extra pages. Resetting just those reclaims space without touching your tighter margins.',
      before: 'Oversized margins',
      after: 'Default margins where it saves paper',
      impact: { paper: fractionSaved * basePages, ink: 0 },
      action: { kind: 'setMargins', range, ...next },
    },
  ]
}

// ---------------------------------------------------------------------------
// 9. Wide paragraph indents (the ruler's blue markers) → pull them back. Big left/right
//    indents narrow each line, so text runs onto extra pages. Same idea as wide margins,
//    but per-paragraph: only the indents the user can see waste space here.
// ---------------------------------------------------------------------------
function detectWideIndents(doc: DocModel): Flag[] {
  const wide = doc.paragraphs.filter(hasWideIndent)
  if (wide.length === 0) return []

  // Reclaimable horizontal space lives inside the text column (page minus page margins).
  const pageW = doc.pageWidthPt ?? LETTER_W_PT
  const sideMargins = doc.margins ? doc.margins.leftPt + doc.margins.rightPt : 2 * DEFAULT_MARGIN_PT
  const contentW = Math.max(1, pageW - sideMargins)

  // Estimate lines saved: each wide paragraph's lines shrink in proportion to the indent
  // removed relative to the column width.
  let linesSaved = 0
  for (const p of wide) {
    const s = wideIndentSides(p)
    const removed = (s.left ? (p.indentStartPt ?? 0) : 0) + (s.right ? (p.indentEndPt ?? 0) : 0)
    const lines = Math.max(1, Math.ceil(paragraphText(p).length / CHARS_PER_LINE))
    linesSaved += lines * (removed / contentW)
  }

  const range: Range = { start: wide[0].start!, end: wide[wide.length - 1].end! }
  return [
    {
      id: fid('indents'),
      type: 'wideIndents',
      severity: 'low',
      range,
      title: `${wide.length} indented paragraph${wide.length === 1 ? '' : 's'}`,
      explanation:
        'Wide left/right indents narrow each line, pushing text onto extra pages. Pulling these paragraphs back to the margin fits more on every line. Small indents are left alone.',
      before: `${wide.length} paragraph${wide.length === 1 ? '' : 's'} indented past ${+(INDENT_KEEP_PT / 72).toFixed(2)}in`,
      after: 'Indents removed (text back to the margin)',
      impact: { paper: Math.max(0, linesSaved / doc.linesPerPage), ink: 0 },
      action: { kind: 'reduceIndents', range },
    },
  ]
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
    ...detectBlankPage(doc),
    ...detectPageBreaks(doc),
    ...detectBulletSprawl(doc),
    ...detectVerbose(doc, opts.aiRewrite ?? false),
    ...detectLargeImages(doc),
    ...detectWideMargins(doc),
    ...detectWideIndents(doc),
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
