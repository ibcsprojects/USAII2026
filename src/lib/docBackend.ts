// The edit seam. The side panel never touches a DocModel directly — it asks an
// EditBackend to apply an EditAction. Today that's MockDocsBackend (mutates the bundled
// sample doc, fully working offline). When OAuth + the Docs API are configured, swap in
// GoogleDocsBackend (below) with no UI changes: it maps each EditAction to a Google Docs
// `batchUpdate` request.

import type { DocModel, Paragraph, TextRun } from './docModel'
import { cloneDoc, rebuildOffsets } from './docModel'
import type { EditAction, Range } from './analyzer/types'
import { fetchGoogleDoc, pushBatchUpdate } from './googleDocs'

export interface EditBackend {
  /** Apply one accepted fix, returning the new document state. */
  apply(doc: DocModel, action: EditAction): Promise<DocModel>
}

// Run-level overlap (runs always have non-zero length).
const overlaps = (a: Range, b: { start?: number; end?: number }) =>
  b.start! < a.end && b.end! > a.start

// Paragraph-level containment. Robust for zero-length (empty) paragraphs such as blank
// lines and page breaks, which sit exactly on a range boundary and fail strict overlap.
const within = (a: Range, b: { start?: number; end?: number }) =>
  b.start! >= a.start && b.end! <= a.end

// ---------------------------------------------------------------------------
// MockDocsBackend — pure, in-memory, works with zero credentials.
// ---------------------------------------------------------------------------
export class MockDocsBackend implements EditBackend {
  async apply(doc: DocModel, action: EditAction): Promise<DocModel> {
    const next = cloneDoc(doc)
    switch (action.kind) {
      case 'removeHighlight':
        forRuns(next, action.range, (r) => {
          r.highlightColor = null
          if (action.alt === 'underline') r.underline = true
          else r.italic = true
        })
        break

      case 'setFontSize':
        forRuns(next, action.range, (r) => {
          r.fontSize = action.to
        })
        break

      case 'removeBlankLines': {
        const blanks = next.paragraphs.filter(
          (p) => within(action.range, p) && p.kind !== 'pageBreak',
        )
        // keep the first blank, drop the rest
        const drop = new Set(blanks.slice(1).map((p) => p.id))
        next.paragraphs = next.paragraphs.filter((p) => !drop.has(p.id))
        break
      }

      case 'pageBreakToRule': {
        const p = next.paragraphs.find((x) => within(action.range, x))
        if (p) {
          p.kind = 'normal'
          p.runs = [
            { text: '— — — — — — — — — — — — — — — — —', fontSize: doc.defaultFontSize },
          ]
        }
        break
      }

      case 'bulletsToTable': {
        const idx = next.paragraphs.findIndex((p) => overlaps(action.range, p))
        const bullets = next.paragraphs.filter(
          (p) => overlaps(action.range, p) && p.kind === 'bullet',
        )
        const ids = new Set(bullets.map((p) => p.id))
        // Mock representation: a compact two-column text block standing in for a table.
        // GoogleDocsBackend would emit an insertTable request instead.
        const table = toTwoColumnText(action.rows)
        const replacement: Paragraph = {
          id: bullets[0]?.id ?? `tbl-${idx}`,
          kind: 'normal',
          runs: [{ text: table, fontSize: doc.defaultFontSize }],
        }
        let inserted = false
        next.paragraphs = next.paragraphs.flatMap((p) => {
          if (!ids.has(p.id)) return [p]
          if (!inserted) {
            inserted = true
            return [replacement]
          }
          return []
        })
        break
      }

      case 'replaceText': {
        const p = next.paragraphs.find((x) => overlaps(action.range, x))
        if (p) {
          const first = p.runs[0] ?? { text: '', fontSize: doc.defaultFontSize }
          p.runs = [{ ...first, text: action.text }]
        }
        break
      }
    }
    return rebuildOffsets(next)
  }
}

function forRuns(doc: DocModel, range: Range, fn: (r: TextRun) => void) {
  for (const p of doc.paragraphs) {
    if (!overlaps(range, p)) continue
    for (const r of p.runs) if (overlaps(range, r)) fn(r)
  }
}

function toTwoColumnText(rows: string[]): string {
  const lines: string[] = []
  for (let i = 0; i < rows.length; i += 2) {
    const left = (rows[i] ?? '').padEnd(22)
    const right = rows[i + 1] ?? ''
    lines.push(`${left}${right}`.trimEnd())
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// GoogleDocsBackend — the live path. Each EditAction becomes one or more Docs API
// `batchUpdate` requests, addressed by real document indices (translated from our
// flat-text offsets via the anchors captured at read time). After every edit we
// re-read the document so our model and the Docs indices stay perfectly in sync for
// the next edit, sidestepping any index-shift bookkeeping.
// ---------------------------------------------------------------------------
export class GoogleDocsBackend implements EditBackend {
  constructor(private documentId: string) {}

  async apply(doc: DocModel, action: EditAction): Promise<DocModel> {
    await pushBatchUpdate(this.documentId, buildRequests(doc, action))
    return fetchGoogleDoc(this.documentId)
  }
}

// --- flat-offset → Docs index translation ---------------------------------
// Within a single run, characters map 1:1 to Docs indices, so a flat offset is
// run.docStart + (offset - run.start). Paragraph-level edits use the paragraph's
// stored [docStart, docEnd) which includes the trailing newline.
function toDocIndex(doc: DocModel, offset: number): number {
  for (const p of doc.paragraphs) {
    for (const r of p.runs) {
      if (r.docStart == null || r.start == null || r.end == null) continue
      if (offset >= r.start && offset <= r.end) return r.docStart + (offset - r.start)
    }
  }
  // Fallback to just past the last anchored run (e.g. trailing-edge offsets).
  const runs = doc.paragraphs.flatMap((p) => p.runs).filter((r) => r.docStart != null)
  const last = runs[runs.length - 1]
  return last ? last.docStart! + ((last.end ?? 0) - (last.start ?? 0)) : 1
}

const docRange = (doc: DocModel, r: Range) => ({
  startIndex: toDocIndex(doc, r.start),
  endIndex: toDocIndex(doc, r.end),
})

/** Map an EditAction to Google Docs API `batchUpdate` requests using real doc indices. */
export function buildRequests(doc: DocModel, action: EditAction): unknown[] {
  switch (action.kind) {
    case 'removeHighlight':
      return [
        {
          updateTextStyle: {
            range: docRange(doc, action.range),
            textStyle: {
              backgroundColor: {}, // clear highlight
              underline: action.alt === 'underline',
              italic: action.alt === 'italic',
            },
            fields: 'backgroundColor,underline,italic',
          },
        },
      ]

    case 'setFontSize':
      return [
        {
          updateTextStyle: {
            range: docRange(doc, action.range),
            textStyle: { fontSize: { magnitude: action.to, unit: 'PT' } },
            fields: 'fontSize',
          },
        },
      ]

    case 'replaceText': {
      const r = docRange(doc, action.range)
      const reqs: unknown[] = []
      if (r.endIndex > r.startIndex) reqs.push({ deleteContentRange: { range: r } })
      // Requests apply sequentially: after the delete, startIndex is the insert point.
      reqs.push({ insertText: { location: { index: r.startIndex }, text: action.text } })
      return reqs
    }

    case 'removeBlankLines': {
      // Keep the first blank line, delete the structural extent of the rest (text + newline).
      const blanks = doc.paragraphs.filter(
        (p) => within(action.range, p) && p.kind !== 'pageBreak' && p.docStart != null,
      )
      const drop = blanks.slice(1)
      if (drop.length === 0) return []
      const startIndex = drop[0].docStart!
      const endIndex = drop[drop.length - 1].docEnd!
      return endIndex > startIndex
        ? [{ deleteContentRange: { range: { startIndex, endIndex } } }]
        : []
    }

    case 'pageBreakToRule': {
      // Delete the page-break content (keeping the paragraph's newline) and drop in a rule.
      const p = doc.paragraphs.find(
        (x) => within(action.range, x) && x.docStart != null && x.docEnd != null,
      )
      if (!p) return []
      const startIndex = p.docStart!
      const endIndex = p.docEnd! - 1 // preserve the trailing newline
      const reqs: unknown[] = []
      if (endIndex > startIndex) reqs.push({ deleteContentRange: { range: { startIndex, endIndex } } })
      reqs.push({
        insertText: { location: { index: startIndex }, text: RULE_TEXT },
      })
      return reqs
    }

    case 'bulletsToTable': {
      // Collapse the bullet list into a compact two-column text block (matching the mock).
      // A real insertTable is possible but needs follow-up requests to populate each cell
      // at computed indices — see docs/SETUP.md for that upgrade path.
      const bullets = doc.paragraphs.filter(
        (p) => overlaps(action.range, p) && p.kind === 'bullet' && p.docStart != null,
      )
      if (bullets.length === 0) return []
      const startIndex = bullets[0].docStart!
      const endIndex = bullets[bullets.length - 1].docEnd! - 1 // keep the final newline
      if (endIndex <= startIndex) return []
      const range = { startIndex, endIndex }
      return [
        { deleteParagraphBullets: { range } }, // strip the list formatting
        { deleteContentRange: { range } },
        { insertText: { location: { index: startIndex }, text: toTwoColumnText(action.rows) } },
      ]
    }
  }
}

const RULE_TEXT = '— — — — — — — — — — — — — — — — —'
