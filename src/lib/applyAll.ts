// The "Apply all changes" engine. Pulled out of the service worker so it's unit-testable.
//
// It applies fixes one at a time, re-analyzing after each so every edit runs against a
// fresh, consistent document (the live backend re-reads the doc on each apply). Two things
// make it robust where the old inline loop wasn't:
//   • It tracks already-attempted flags by a stable (type, range) signature — NOT by flag
//     id, which the analyzer regenerates every run, and NOT via the shared `dismissed` set,
//     which would hide flags until a manual re-scan (the "needs several apply-alls" bug).
//   • It never assumes one apply removes exactly one flag. Some fixes legitimately surface a
//     new flag (e.g. a page break becomes an empty line next to existing blanks); the loop
//     keeps going until every outstanding flag has been attempted once.

import type { DocModel } from './docModel'
import type { EditAction, Flag } from './analyzer/types'

/** Stable identity for a flag across re-analyses (ids are regenerated each run). */
const signature = (f: Flag) => `${f.type}:${f.range.start}:${f.range.end}`

export interface ApplyAllResult {
  doc: DocModel
  flags: Flag[]
  /** How many fixes were actually applied (for logging/telemetry). */
  applied: number
}

export async function applyAllFixes(
  doc: DocModel,
  analyze: (d: DocModel) => Flag[] | Promise<Flag[]>,
  apply: (d: DocModel, action: EditAction) => DocModel | Promise<DocModel>,
  maxSteps = 500,
): Promise<ApplyAllResult> {
  const tried = new Set<string>()
  let flags = await analyze(doc)
  let applied = 0
  let steps = 0

  while (steps++ < maxSteps) {
    // Next flag we haven't attempted yet this run. A fix that resolves its flag drops it
    // from the list; a no-op fix leaves it, but it's now marked tried so we move past it.
    const flag = flags.find((f) => !tried.has(signature(f)))
    if (!flag) break
    tried.add(signature(flag))
    try {
      doc = await apply(doc, flag.action)
      applied++
    } catch {
      // A fix that throws (e.g. an image with no usable URL) is left in place and skipped;
      // marking it tried above keeps the loop from getting stuck on it.
    }
    flags = await analyze(doc)
  }

  return { doc, flags, applied }
}
