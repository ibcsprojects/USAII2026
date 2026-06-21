import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rebuildOffsets, type DocModel } from './docModel'

// Capture the batchUpdate the live backend emits for an image resize, without hitting
// the network. The Docs API has no in-place resize, so the backend must delete the image
// element and re-insert it at the new size.
const pushed: unknown[][] = []

vi.mock('./googleDocs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./googleDocs')>()
  return {
    ...actual,
    pushBatchUpdate: vi.fn(async (_id: string, requests: unknown[]) => {
      pushed.push(requests)
    }),
    fetchGoogleDoc: vi.fn(async (): Promise<DocModel> => ({
      id: 'd',
      title: 't',
      defaultFontSize: 11,
      linesPerPage: 46,
      paragraphs: [],
    })),
  }
})

import { GoogleDocsBackend } from './docBackend'

const docWithImage = (img: {
  objectId?: string
  widthPt: number
  heightPt: number
  docStart?: number
  uri?: string
}): DocModel =>
  rebuildOffsets({
    id: 'd',
    title: 't',
    defaultFontSize: 11,
    linesPerPage: 46,
    paragraphs: [
      { id: 'h', kind: 'normal', runs: [{ text: 'Chart', fontSize: 11 }] },
      { id: 'i', kind: 'normal', runs: [{ text: '', fontSize: 11 }], images: [img] },
    ],
  })

describe('GoogleDocsBackend.applyResizeImage (live path)', () => {
  beforeEach(() => (pushed.length = 0))

  it('deletes the image element and re-inserts it at the scaled size', async () => {
    const doc = docWithImage({
      objectId: 'kix.abc',
      widthPt: 468,
      heightPt: 360,
      docStart: 42,
      uri: 'https://example.com/chart.png',
    })

    await new GoogleDocsBackend('d').apply(doc, {
      kind: 'resizeImage',
      range: { start: 0, end: 0 },
      objectId: 'kix.abc',
      scale: 0.5,
    })

    expect(pushed).toHaveLength(1)
    const [del, ins] = pushed[0] as any[]
    expect(del).toEqual({ deleteContentRange: { range: { startIndex: 42, endIndex: 43 } } })
    expect(ins.insertInlineImage.uri).toBe('https://example.com/chart.png')
    expect(ins.insertInlineImage.location).toEqual({ index: 42 })
    // 468×360 scaled by 0.5 → 234×180, and the insert must land before the delete shifts it.
    expect(ins.insertInlineImage.objectSize).toEqual({
      width: { magnitude: 234, unit: 'PT' },
      height: { magnitude: 180, unit: 'PT' },
    })
  })

  it('errors clearly when the image has no usable source URL', async () => {
    const doc = docWithImage({ objectId: 'kix.nouri', widthPt: 468, heightPt: 360, docStart: 42 })
    await expect(
      new GoogleDocsBackend('d').apply(doc, {
        kind: 'resizeImage',
        range: { start: 0, end: 0 },
        objectId: 'kix.nouri',
        scale: 0.5,
      }),
    ).rejects.toThrow(/no shareable source URL/i)
    expect(pushed).toHaveLength(0)
  })

  it('errors when the image is no longer in the document', async () => {
    const doc = docWithImage({
      objectId: 'kix.abc',
      widthPt: 468,
      heightPt: 360,
      docStart: 42,
      uri: 'https://example.com/chart.png',
    })
    await expect(
      new GoogleDocsBackend('d').apply(doc, {
        kind: 'resizeImage',
        range: { start: 0, end: 0 },
        objectId: 'kix.GONE',
        scale: 0.5,
      }),
    ).rejects.toThrow(/locate that image/i)
  })
})
