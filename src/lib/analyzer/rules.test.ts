import { describe, it, expect } from 'vitest'
import { analyzeDoc, totalImpact } from './rules'
import { SAMPLE_DOC, rebuildOffsets, type DocModel } from '../docModel'
import { MockDocsBackend } from '../docBackend'
import { condenseLocally, looksVerbose } from './condense'

const flags = analyzeDoc(SAMPLE_DOC)
const typesIn = (t: string) => flags.filter((f) => f.type === t)

describe('analyzeDoc on the sample doc', () => {
  it('detects each of the seven waste categories', () => {
    for (const t of [
      'highlight',
      'fontSize',
      'doubleSpacing',
      'pageBreak',
      'bulletSprawl',
      'verbose',
      'largeImage',
    ]) {
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

describe('bulletSprawl detection', () => {
  const bulletDoc = (texts: string[]): DocModel =>
    rebuildOffsets({
      id: 'd',
      title: 't',
      defaultFontSize: 11,
      linesPerPage: 46,
      paragraphs: texts.map((text, i) => ({
        id: `b${i}`,
        kind: 'bullet' as const,
        runs: [{ text, fontSize: 11 }],
      })),
    })

  it('flags short-sentence bullets, not just one- or two-word ones', () => {
    // The reported bug: full short sentences average >4 words and were missed.
    const doc = bulletDoc([
      'Remote work is here to stay.',
      'Supply chains remain fragile.',
      'Inflation persists globally.',
      'Renewable energy is expanding.',
      'Cybersecurity threats are escalating.',
      'Consumer spending is volatile.',
    ])
    expect(analyzeDoc(doc).filter((f) => f.type === 'bulletSprawl').length).toBe(1)
  })

  it('leaves genuinely long, paragraph-like bullets alone', () => {
    const long =
      'This bullet runs on for an entire line and well beyond, the kind of paragraph a table would only turn into one unwieldy cell.'
    expect(analyzeDoc(bulletDoc(Array(6).fill(long)))).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ type: 'bulletSprawl' })]),
    )
  })

  it('detects a list whose bullets are spaced out with blank lines', () => {
    // The reported bug: a wasteful doc puts a blank paragraph between every bullet, which
    // used to break the consecutive-run scan so the list never reached the 5-item threshold.
    const items = [
      'Remote work is here to stay.',
      'Supply chains remain fragile.',
      'Inflation persists globally.',
      'Renewable energy is expanding.',
      'Cybersecurity threats are escalating.',
    ]
    const spaced: DocModel = rebuildOffsets({
      id: 'd',
      title: 't',
      defaultFontSize: 11,
      linesPerPage: 46,
      paragraphs: items.flatMap((text, i) => [
        { id: `b${i}`, kind: 'bullet' as const, runs: [{ text, fontSize: 11 }] },
        { id: `gap${i}`, kind: 'normal' as const, runs: [{ text: '', fontSize: 11 }] },
      ]),
    })
    const f = analyzeDoc(spaced).find((x) => x.type === 'bulletSprawl')
    expect(f).toBeDefined()
    // Converting it should remove the bullets and the blank spacers between them (the run
    // ends on the last bullet, so only the trailing blank after the list survives).
    return new MockDocsBackend().apply(spaced, f!.action).then((next) => {
      expect(next.paragraphs.filter((p) => p.kind === 'bullet')).toHaveLength(0)
      const blanks = next.paragraphs.filter((p) => p.runs.every((r) => r.text.trim() === ''))
      expect(blanks.length).toBeLessThanOrEqual(1)
      expect(next.paragraphs.length).toBeLessThan(spaced.paragraphs.length)
    })
  })

  it('detects manually-typed glyph bullets, stripping the glyph from cells', () => {
    const glyph: DocModel = rebuildOffsets({
      id: 'd',
      title: 't',
      defaultFontSize: 11,
      linesPerPage: 46,
      // Read path marks these 'bullet'; here we mimic that so the rule is exercised directly.
      paragraphs: ['Alpha team', 'Beta team', 'Gamma team', 'Delta team', 'Omega team'].map(
        (t, i) => ({ id: `g${i}`, kind: 'bullet' as const, runs: [{ text: `• ${t}`, fontSize: 11 }] }),
      ),
    })
    const f = analyzeDoc(glyph).find((x) => x.type === 'bulletSprawl')
    expect(f).toBeDefined()
    expect(f!.action.kind === 'bulletsToTable' && f!.action.rows).toContain('Alpha team')
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

  it('collapses a bullet sprawl into a compact grid with fewer paragraphs', async () => {
    const f = typesIn('bulletSprawl')[0]
    const beforeBullets = SAMPLE_DOC.paragraphs.filter((p) => p.kind === 'bullet').length
    const next = await new MockDocsBackend().apply(SAMPLE_DOC, f.action)
    const afterBullets = next.paragraphs.filter((p) => p.kind === 'bullet').length
    expect(afterBullets).toBe(0)
    // The grid uses strictly fewer rows than there were bullets.
    const gridRows = next.paragraphs.filter((p) => p.runs.some((r) => r.text.includes('•')))
    expect(gridRows.length).toBeLessThan(beforeBullets)
    expect(gridRows.length).toBeGreaterThan(0)
  })
})

describe('wideMargins detection', () => {
  const marginDoc = (pt: number): DocModel =>
    rebuildOffsets({
      id: 'd',
      title: 't',
      defaultFontSize: 11,
      linesPerPage: 46,
      pageWidthPt: 612,
      pageHeightPt: 792,
      margins: { topPt: pt, bottomPt: pt, leftPt: pt, rightPt: pt },
      paragraphs: [{ id: 'a', kind: 'normal', runs: [{ text: 'Body text here.', fontSize: 11 }] }],
    })

  // Build a doc with independent per-side margins (PT) on a Letter page.
  const sidesDoc = (s: { topPt: number; bottomPt: number; leftPt: number; rightPt: number }): DocModel =>
    rebuildOffsets({
      id: 'd',
      title: 't',
      defaultFontSize: 11,
      linesPerPage: 46,
      pageWidthPt: 612,
      pageHeightPt: 792,
      margins: s,
      paragraphs: [{ id: 'a', kind: 'normal', runs: [{ text: 'Body text here.', fontSize: 11 }] }],
    })

  it('resets oversized margins to 1in and saves paper', () => {
    // 2in all round: right marker = (612-144)/72 = 6.5in, outside the keep zone → all reset.
    const f = analyzeDoc(marginDoc(144)).find((x) => x.type === 'wideMargins')
    expect(f).toBeDefined()
    const a = f!.action
    expect(a.kind === 'setMargins' && [a.topPt, a.bottomPt, a.leftPt, a.rightPt]).toEqual([72, 72, 72, 72])
    expect(f!.impact.paper).toBeGreaterThan(0)
  })

  it('does not touch margins at or below default (no paper to save)', () => {
    expect(analyzeDoc(marginDoc(72)).some((x) => x.type === 'wideMargins')).toBe(false)
    expect(analyzeDoc(marginDoc(36)).some((x) => x.type === 'wideMargins')).toBe(false)
  })

  it('resets only the oversized sides, preserving tight left/right (screenshot case)', () => {
    // left/right 0.75in (54pt): left marker 54/72-0.75 = 0.0in, right marker 8.5-0.75-0.75 =
    // 7.0in — both in the keep zones (and ≤1in anyway). top/bottom 2in → reset.
    const f = analyzeDoc(
      sidesDoc({ topPt: 144, bottomPt: 144, leftPt: 54, rightPt: 54 }),
    ).find((x) => x.type === 'wideMargins')
    expect(f).toBeDefined()
    const a = f!.action
    expect(a.kind === 'setMargins' && [a.topPt, a.bottomPt, a.leftPt, a.rightPt]).toEqual([
      72, 72, 54, 54,
    ])
  })

  it('leaves a uniformly tight (0.75in) doc alone', () => {
    expect(analyzeDoc(marginDoc(54)).some((x) => x.type === 'wideMargins')).toBe(false)
  })

  it('does not flag a doc with no margin info', () => {
    const doc = marginDoc(144)
    delete doc.margins
    expect(analyzeDoc(doc).some((x) => x.type === 'wideMargins')).toBe(false)
  })

  it('does not spell out the target margin values on the card', () => {
    const f = analyzeDoc(marginDoc(144)).find((x) => x.type === 'wideMargins')!
    const shown = `${f.title} ${f.before} ${f.after} ${f.explanation}`
    expect(shown).not.toMatch(/0\.75|54|\b72\b|0\.0|7\.0/)
  })

  it('shrinks the oversized margins and clears the flag on apply', async () => {
    const doc = marginDoc(144)
    const f = analyzeDoc(doc).find((x) => x.type === 'wideMargins')!
    const next = await new MockDocsBackend().apply(doc, f.action)
    expect(next.margins).toEqual({ topPt: 72, bottomPt: 72, leftPt: 72, rightPt: 72 })
    expect(analyzeDoc(next).some((x) => x.type === 'wideMargins')).toBe(false)
  })
})

describe('blank-run detection vs. images', () => {
  const para = (over: Partial<DocModel['paragraphs'][number]>): DocModel['paragraphs'][number] => ({
    id: Math.random().toString(36).slice(2),
    kind: 'normal',
    runs: [{ text: '', fontSize: 11 }],
    ...over,
  })
  const doc = (paras: DocModel['paragraphs']): DocModel =>
    rebuildOffsets({ id: 'd', title: 't', defaultFontSize: 11, linesPerPage: 46, paragraphs: paras })

  it('does not treat an image-bearing paragraph as a blank line', () => {
    // blank, image, blank — the image breaks the run, so there is no 2-in-a-row blank pair.
    const d = doc([
      para({ runs: [{ text: '', fontSize: 11 }] }),
      para({ images: [{ objectId: 'img', widthPt: 100, heightPt: 80 }] }),
      para({ runs: [{ text: '', fontSize: 11 }] }),
    ])
    expect(analyzeDoc(d).some((f) => f.type === 'doubleSpacing')).toBe(false)
  })

  it('collapses real blank runs without deleting a nearby image', async () => {
    const d = doc([
      para({ runs: [{ text: 'Intro', fontSize: 11 }] }),
      para({ runs: [{ text: '', fontSize: 11 }] }),
      para({ runs: [{ text: '', fontSize: 11 }] }),
      para({ images: [{ objectId: 'img', widthPt: 100, heightPt: 80 }] }),
      para({ runs: [{ text: 'Body', fontSize: 11 }] }),
    ])
    const f = analyzeDoc(d).find((x) => x.type === 'doubleSpacing')
    expect(f).toBeDefined() // the two real blanks are still flagged
    const next = await new MockDocsBackend().apply(d, f!.action)
    // The image survives the collapse.
    expect(next.paragraphs.some((p) => p.images?.some((i) => i.objectId === 'img'))).toBe(true)
  })

  it('does not treat a table as a blank line, even between blanks', () => {
    // blank, table, blank — the table breaks the run, so there is no 2-in-a-row blank pair.
    const d = doc([
      para({ runs: [{ text: '', fontSize: 11 }] }),
      para({ kind: 'table' }),
      para({ runs: [{ text: '', fontSize: 11 }] }),
    ])
    expect(analyzeDoc(d).some((x) => x.type === 'doubleSpacing')).toBe(false)
  })

  it('collapses blanks on each side of a table without deleting the table', async () => {
    const d = doc([
      para({ runs: [{ text: 'A', fontSize: 11 }] }),
      para({ runs: [{ text: '', fontSize: 11 }] }),
      para({ runs: [{ text: '', fontSize: 11 }] }),
      para({ kind: 'table' }),
      para({ runs: [{ text: '', fontSize: 11 }] }),
      para({ runs: [{ text: '', fontSize: 11 }] }),
      para({ runs: [{ text: 'B', fontSize: 11 }] }),
    ])
    // Two separate runs (before and after the table), neither spanning it.
    const flags = analyzeDoc(d).filter((x) => x.type === 'doubleSpacing')
    expect(flags.length).toBe(2)
    // Applying either collapse must leave the table intact (apply each to the original doc).
    for (const f of flags) {
      const next = await new MockDocsBackend().apply(d, f.action)
      expect(next.paragraphs.some((p) => p.kind === 'table')).toBe(true)
    }
  })
})

describe('blankPage detection (trailing blanks spilling to an empty page)', () => {
  const trailingDoc = (content: number, blanks: number, linesPerPage: number): DocModel =>
    rebuildOffsets({
      id: 'd',
      title: 't',
      defaultFontSize: 11,
      linesPerPage,
      paragraphs: [
        ...Array.from({ length: content }, (_, i) => ({
          id: `c${i}`,
          kind: 'normal' as const,
          runs: [{ text: 'Line', fontSize: 11 }],
        })),
        ...Array.from({ length: blanks }, (_, i) => ({
          id: `b${i}`,
          kind: 'normal' as const,
          runs: [{ text: '', fontSize: 11 }],
        })),
      ],
    })

  it('flags trailing blanks that push content onto a new page (high severity)', () => {
    // 5 content lines fill page 1 (lpp 5); the 2 trailing blanks spill onto a blank page 2.
    const f = analyzeDoc(trailingDoc(5, 2, 5)).find((x) => x.type === 'blankPage')
    expect(f).toBeDefined()
    expect(f!.severity).toBe('high')
    expect(f!.action.kind).toBe('removeBlankLines')
    expect(f!.impact.paper).toBeGreaterThanOrEqual(1)
  })

  it('hands trailing runs to blankPage, not doubleSpacing (no duplicate flag)', () => {
    const flags = analyzeDoc(trailingDoc(5, 3, 5))
    expect(flags.some((x) => x.type === 'doubleSpacing')).toBe(false)
    expect(flags.some((x) => x.type === 'blankPage')).toBe(true)
  })

  it('does not flag a single trailing blank on a one-page document', () => {
    // 6 lines, 46 per page → 1 page; a lone final blank here is the doc's natural last line.
    expect(analyzeDoc(trailingDoc(5, 1, 46)).some((x) => x.type === 'blankPage')).toBe(false)
  })

  it('flags a single trailing blank on a multi-page document (the reported case)', () => {
    // 5 content lines fill page 1 (lpp 5); the lone trailing blank spills onto a blank page 2.
    const f = analyzeDoc(trailingDoc(5, 1, 5)).find((x) => x.type === 'blankPage')
    expect(f).toBeDefined()
    expect(f!.severity).toBe('high')
    expect(f!.action.kind).toBe('removeBlankLines')
  })

  it('does not flag a lone trailing blank that sits right after a table', () => {
    const d = rebuildOffsets({
      id: 'd',
      title: 't',
      defaultFontSize: 11,
      linesPerPage: 1, // force multi-page
      paragraphs: [
        { id: 'tb', kind: 'table', runs: [{ text: '', fontSize: 11 }] },
        { id: 'b', kind: 'normal', runs: [{ text: '', fontSize: 11 }] }, // required post-table blank
      ],
    })
    expect(analyzeDoc(d).some((x) => x.type === 'blankPage')).toBe(false)
  })

  it('still flags mid-document blank runs as doubleSpacing', () => {
    const d = rebuildOffsets({
      id: 'd',
      title: 't',
      defaultFontSize: 11,
      linesPerPage: 46,
      paragraphs: [
        { id: 'a', kind: 'normal', runs: [{ text: 'A', fontSize: 11 }] },
        { id: 'b1', kind: 'normal', runs: [{ text: '', fontSize: 11 }] },
        { id: 'b2', kind: 'normal', runs: [{ text: '', fontSize: 11 }] },
        { id: 'c', kind: 'normal', runs: [{ text: 'B', fontSize: 11 }] },
      ],
    })
    expect(analyzeDoc(d).some((x) => x.type === 'doubleSpacing')).toBe(true)
  })

  it('collapses the trailing run on apply', async () => {
    const d = trailingDoc(5, 3, 5)
    const f = analyzeDoc(d).find((x) => x.type === 'blankPage')!
    const next = await new MockDocsBackend().apply(d, f.action)
    expect(analyzeDoc(next).some((x) => x.type === 'blankPage')).toBe(false)
  })
})

describe('wideIndents detection', () => {
  const indentDoc = (
    paras: { text: string; kind?: 'normal' | 'bullet' | 'heading'; indentStartPt?: number; indentEndPt?: number }[],
  ): DocModel =>
    rebuildOffsets({
      id: 'd',
      title: 't',
      defaultFontSize: 11,
      linesPerPage: 46,
      pageWidthPt: 612,
      pageHeightPt: 792,
      margins: { topPt: 72, bottomPt: 72, leftPt: 72, rightPt: 72 },
      paragraphs: paras.map((p, i) => ({
        id: `p${i}`,
        kind: p.kind ?? 'normal',
        runs: [{ text: p.text, fontSize: 11 }],
        ...(p.indentStartPt ? { indentStartPt: p.indentStartPt } : {}),
        ...(p.indentEndPt ? { indentEndPt: p.indentEndPt } : {}),
      })),
    })

  it('flags paragraphs whose indents exceed 0.5in', () => {
    const f = analyzeDoc(
      indentDoc([
        { text: 'A paragraph pulled well in from both sides.', indentStartPt: 144, indentEndPt: 144 },
        { text: 'Another deeply indented paragraph here.', indentStartPt: 144 },
      ]),
    ).find((x) => x.type === 'wideIndents')
    expect(f).toBeDefined()
    expect(f!.action.kind).toBe('reduceIndents')
    expect(f!.impact.paper).toBeGreaterThan(0)
  })

  it('leaves small/normal indents (≤0.5in) alone', () => {
    expect(
      analyzeDoc(indentDoc([{ text: 'Slightly indented quote.', indentStartPt: 36 }])).some(
        (x) => x.type === 'wideIndents',
      ),
    ).toBe(false)
  })

  it('ignores indents on list items and headings (structural, not wasted)', () => {
    expect(
      analyzeDoc(
        indentDoc([
          { text: 'Nested bullet', kind: 'bullet', indentStartPt: 144 },
          { text: 'Indented heading', kind: 'heading', indentStartPt: 144 },
        ]),
      ).some((x) => x.type === 'wideIndents'),
    ).toBe(false)
  })

  it('removes only the wide side and clears the flag on apply', async () => {
    const doc = indentDoc([
      { text: 'Wide on the left only, normal on the right.', indentStartPt: 144, indentEndPt: 18 },
    ])
    const f = analyzeDoc(doc).find((x) => x.type === 'wideIndents')!
    const next = await new MockDocsBackend().apply(doc, f.action)
    expect(next.paragraphs[0].indentStartPt).toBe(0) // wide side removed
    expect(next.paragraphs[0].indentEndPt).toBe(18) // narrow side preserved
    expect(analyzeDoc(next).some((x) => x.type === 'wideIndents')).toBe(false)
  })
})

describe('largeImage detection', () => {
  const imageDoc = (widthPt: number, heightPt: number): DocModel =>
    rebuildOffsets({
      id: 'd',
      title: 't',
      defaultFontSize: 11,
      linesPerPage: 46,
      paragraphs: [
        { id: 'i0', kind: 'normal', runs: [{ text: '', fontSize: 11 }], images: [{ objectId: 'x', widthPt, heightPt }] },
      ],
    })

  it('flags an image covering more than a quarter of the page', () => {
    const f = analyzeDoc(imageDoc(468, 360)).find((x) => x.type === 'largeImage')
    expect(f).toBeDefined()
    expect(f!.action.kind).toBe('resizeImage')
  })

  it('leaves a reasonably sized image alone', () => {
    expect(analyzeDoc(imageDoc(200, 150))).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ type: 'largeImage' })]),
    )
  })

  it('shrinks an oversized image toward the page-area limit', async () => {
    const doc = imageDoc(468, 360)
    const f = analyzeDoc(doc).find((x) => x.type === 'largeImage')!
    const next = await new MockDocsBackend().apply(doc, f.action)
    const img = next.paragraphs[0].images![0]
    expect(img.widthPt).toBeLessThan(468)
    expect(img.heightPt).toBeLessThan(360)
    // No longer large enough to re-flag.
    expect(analyzeDoc(next).some((x) => x.type === 'largeImage')).toBe(false)
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
