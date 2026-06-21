import { describe, it, expect } from 'vitest'
import { tableColumns, tableLayout } from './tableLayout'

describe('tableColumns', () => {
  it('packs many short items into a multi-column grid', () => {
    const items = Array.from({ length: 12 }, (_, i) => `Item ${i}`)
    expect(tableColumns(items)).toBeGreaterThanOrEqual(3)
  })

  it('drops columns so long words are not split across cell lines', () => {
    // The screenshot bug: long words ("Cybersecurity", "transformation") forced into
    // narrow 5-column cells. Adaptive layout must keep cells wide enough for them.
    const items = [
      'Remote work is here to stay',
      'Supply chains remain fragile',
      'Inflation persists globally',
      'Renewable energy is expanding',
      'Cybersecurity threats are escalating',
      'Digital transformation accelerates',
      'Data privacy regulations tighten',
    ]
    const cols = tableColumns(items)
    const longestWord = Math.max(...items.flatMap((r) => r.split(/\s+/).map((w) => w.length)))
    expect(Math.floor(80 / cols)).toBeGreaterThanOrEqual(longestWord)
    expect(cols).toBeLessThanOrEqual(4)
  })

  it('never uses more columns than items', () => {
    expect(tableColumns(['a', 'b'])).toBeLessThanOrEqual(2)
  })
})

describe('tableLayout', () => {
  it('fills the final row so the grid is rectangular', () => {
    const layout = tableLayout(['a', 'b', 'c', 'd', 'e'])
    expect(layout.cells.length).toBe(layout.rows * layout.columns)
  })

  it('lays cells out row-major and trims them', () => {
    const layout = tableLayout(['  one  ', 'two', 'three', 'four'])
    expect(layout.cells[0]).toBe('one')
    expect(layout.cells.slice(0, layout.columns)).toEqual(
      ['one', 'two', 'three', 'four'].slice(0, layout.columns),
    )
  })
})
