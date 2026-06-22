import { useStore } from '../state/store'
import { EcoScore } from './EcoScore'
import { SortMenu } from './SortMenu'
import logoUrl from '../../assets/logo.png'

export function Header() {
  const reanalyze = useStore((s) => s.reanalyze)
  const loading = useStore((s) => s.loading)
  const doc = useStore((s) => s.doc)

  // Only reveal the eco score once a scan has actually completed for a doc —
  // otherwise it flashes a misleading "perfect" score before scanning.
  const showScore = !loading && !!doc

  return (
    <header className="sticky top-0 z-10 border-b border-leaf-100 bg-leaf-50/95 px-3 pb-2 pt-3 backdrop-blur">
      <div className="mb-2 flex items-center gap-2">
        <img src={logoUrl} alt="GreenPages" className="h-7 w-7" />
        <div className="leading-tight">
          <div className="text-sm font-bold text-leaf-800">GreenPages</div>
          <div className="text-[11px] text-bark-700/60">Print less. Save more.</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <SortMenu />
          <button
            onClick={reanalyze}
            disabled={loading}
            className="rounded-lg border border-leaf-200 bg-white px-2.5 py-1 text-xs font-medium text-leaf-700 transition hover:bg-leaf-100 disabled:opacity-50"
          >
            {loading ? 'Scanning…' : '↻ Re-scan'}
          </button>
        </div>
      </div>
      {showScore && <EcoScore />}
    </header>
  )
}
