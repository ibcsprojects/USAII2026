import { describe, it, expect } from 'vitest'
import { analyzeDoc, totalImpact } from './rules'
import { SAMPLE_DOC, rebuildOffsets, type DocModel } from '../docModel'
import { MockDocsBackend } from '../docBackend'
import { condenseLocally, looksVerbose } from './condense'

const flags = analyzeDoc(SAMPLE_DOC)
const typesIn = (t: string) => flags.filter((f) => f.type === t)

describe('analyzeDoc on the sample doc', () => {
  it('detects each of the six waste categories', () => {
    for (const t of ['highlight', 'fontSize', 'doubleSpacing', 'pageBreak', 'bulletSprawl', 'verbose']) {
      expect(typesIn(t).length, `expected at least one ${t} flag`).toBeGreaterThan(0)
    }
  })

  it('returns flags ordered by document position', () => {
    const starts = flags.map((f) => f.range.start)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
  })

  it('reports a positive total paper saving', () => {
    expect(totalImpact(flags).paper).toBeGreaterThan(0)
  })

  it('does not flag headings for large font size', () => {
    // The 20pt title is a heading and must not be flagged.
    const fontFlags = typesIn('fontSize')
    expect(fontFlags.every((f) => f.before.includes('18pt'))).toBe(true)
  })
})

describe('MockDocsBackend.apply', () => {
  it('removes a highlight and adds an underline', async () => {
    const f = typesIn('highlight')[0]
    const next = await new MockDocsBackend().apply(SAMPLE_DOC, f.action)
    const stillHighlighted = next.paragraphs.some((p) =>
      p.runs.some((r) => r.highlightColor),
    )
    expect(stillHighlighted).toBe(false)
    const hasUnderline = next.paragraphs.some((p) => p.runs.some((r) => r.underline))
    expect(hasUnderline).toBe(true)
  })

  it('shrinks an oversized font', async () => {
    const f = typesIn('fontSize')[0]
    const next = await new MockDocsBackend().apply(SAMPLE_DOC, f.action)
    const has18 = next.paragraphs.some((p) => p.runs.some((r) => r.fontSize === 18))
    expect(has18).toBe(false)
  })

  it('collapses blank-line runs to a single blank', async () => {
    const f = typesIn('doubleSpacing')[0]
    const before = SAMPLE_DOC.paragraphs.length
    const next = await new MockDocsBackend().apply(SAMPLE_DOC, f.action)
    expect(next.paragraphs.length).toBeLessThan(before)
  })

  it('converts a page break to a divider paragraph', async () => {
    const f = typesIn('pageBreak')[0]
    const next = await new MockDocsBackend().apply(SAMPLE_DOC, f.action)
    expect(next.paragraphs.some((p) => p.kind === 'pageBreak')).toBe(false)
  })

  it('applies an edited verbose suggestion when overridden', async () => {
    const f = typesIn('verbose')[0]
    const custom = 'Print less.'
    const action = { ...f.action, text: custom } as typeof f.action
    const next = await new MockDocsBackend().apply(SAMPLE_DOC, action)
    expect(next.paragraphs.some((p) => p.runs.some((r) => r.text === custom))).toBe(true)
  })

  it('keeps offsets consistent after an edit', async () => {
    const f = typesIn('fontSize')[0]
    const next = await new MockDocsBackend().apply(SAMPLE_DOC, f.action)
    const last = next.paragraphs[next.paragraphs.length - 1]
    expect(last.end).toBeGreaterThan(last.start!)
  })
})

describe('condenseLocally', () => {
  it('shortens padded phrases', () => {
    const out = condenseLocally('Due to the fact that it rained, we stayed home.')
    expect(out.toLowerCase()).toContain('because')
    expect(out.length).toBeLessThan('Due to the fact that it rained, we stayed home.'.length)
  })

  it('flags only genuinely verbose text', () => {
    expect(looksVerbose('Short and tidy.')).toBe(false)
  })
})

describe('rebuildOffsets', () => {
  it('produces monotonic non-overlapping run offsets', () => {
    const doc: DocModel = rebuildOffsets(JSON.parse(JSON.stringify(SAMPLE_DOC)))
    let prevEnd = -1
    for (const p of doc.paragraphs) {
      expect(p.start!).toBeGreaterThanOrEqual(prevEnd === -1 ? 0 : prevEnd)
      prevEnd = p.end!
    }
  })
})
