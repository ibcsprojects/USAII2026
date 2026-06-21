import type { Flag } from '../../lib/analyzer/types'

/**
 * Cluster flags that point at the same snippet so the UI can show them under one card.
 * Two flags belong together when their character ranges overlap — e.g. an oversized-font
 * run that is also highlighted, or a wordy paragraph whose text is also too large.
 *
 * Flags arrive sorted by `range.start` (see analyzeDoc), so a single sweep that tracks the
 * running cluster end is enough to find connected (transitively overlapping) groups.
 */
export function groupFlags(flags: Flag[]): Flag[][] {
  const groups: Flag[][] = []
  let current: Flag[] = []
  let clusterEnd = -Infinity

  for (const flag of flags) {
    if (current.length > 0 && flag.range.start < clusterEnd) {
      current.push(flag)
      clusterEnd = Math.max(clusterEnd, flag.range.end)
    } else {
      current = [flag]
      groups.push(current)
      clusterEnd = flag.range.end
    }
  }

  return groups
}
