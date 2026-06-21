import { useStore } from '../state/store'
import { EcoScore } from './EcoScore'

export function Header() {
  const reanalyze = useStore((s) => s.reanalyze)
  const loading = useStore((s) => s.loading)

  return (
    <header className="sticky top-0 z-10 border-b border-leaf-100 bg-leaf-50/95 px-3 pb-2 pt-3 backdrop-blur">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-leaf-600 text-sm">🌿</span>
        <div className="leading-tight">
          <div className="text-sm font-bold text-leaf-800">GreenPages</div>
          <div className="text-[11px] text-bark-700/60">Print less. Save more.</div>
        </div>
        <button
          onClick={reanalyze}
          disabled={loading}
          className="ml-auto rounded-lg border border-leaf-200 bg-white px-2.5 py-1 text-xs font-medium text-leaf-700 transition hover:bg-leaf-100 disabled:opacity-50"
        >
          {loading ? 'Scanning…' : '↻ Re-scan'}
        </button>
      </div>
      <EcoScore />
    </header>
  )
}
