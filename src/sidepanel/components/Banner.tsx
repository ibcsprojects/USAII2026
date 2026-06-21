import { useStore } from '../state/store'

// Surfaces what used to fail silently: a hard error from the last action (red), or a
// heads-up that we're on the bundled sample because the live doc couldn't be opened
// (amber). Without these, an OAuth/Docs failure looked like "the feature does nothing".
export function Banner() {
  const error = useStore((s) => s.error)
  const notice = useStore((s) => s.notice)
  const pagesNotice = useStore((s) => s.pagesNotice)
  const docSource = useStore((s) => s.docSource)

  if (error) {
    return (
      <div className="border-b border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-relaxed text-rose-700">
        <span className="font-semibold">Something went wrong. </span>
        {error}
      </div>
    )
  }

  // Only warn about the sample when we actually wanted the live doc and missed it.
  if (notice && docSource === 'sample') {
    return (
      <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
        {notice}
      </div>
    )
  }

  // On a live doc, warn when the page count fell back to the rough estimate.
  if (pagesNotice) {
    return (
      <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
        {pagesNotice}
      </div>
    )
  }

  return null
}
