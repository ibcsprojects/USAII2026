// Shared layout math for the "many short bullets → compact table" fix. The analyzer (to
// label and size the flag) and both edit backends (to build the actual table) must agree
// on the grid, so the column choice lives here in one place.

/**
 * Choose a column count that packs short bullets tightly without breaking long words. We
 * pick the *largest* count (most compact) in [2..MAX_COLS] whose resulting cell is still
 * wide enough to hold the longest word — that's what avoids the "Cybersecur / ity" splits
 * a naive fixed 5-column table produces.
 */
export function tableColumns(items: string[]): number {
  const n = items.length
  if (n <= 1) return Math.max(1, n)
  if (n <= 3) return 2
  const longestWord = Math.max(
    1,
    ...items.flatMap((r) => r.trim().split(/\s+/).map((w) => w.length)),
  )
  // A full text line is ~90 chars at 11pt; table cells lose a bit to padding on each side,
  // so budget ~80 usable chars across the row when deciding how narrow a column can get.
  const USABLE_CHARS = 80
  const MAX_COLS = 4
  let cols = Math.min(MAX_COLS, n)
  while (cols > 2 && Math.floor(USABLE_CHARS / cols) < longestWord) cols--
  return cols
}

export interface TableLayout {
  columns: number
  /** Number of grid rows the items fill. */
  rows: number
  /** Cell text in row-major order, padded with '' so the final row is complete. */
  cells: string[]
}

/** Arrange bullet texts into a compact row-major grid. */
export function tableLayout(items: string[]): TableLayout {
  const trimmed = items.map((s) => s.trim())
  const columns = tableColumns(trimmed)
  const rows = Math.max(1, Math.ceil(trimmed.length / columns))
  const cells = trimmed.slice()
  while (cells.length < rows * columns) cells.push('')
  return { columns, rows, cells }
}
