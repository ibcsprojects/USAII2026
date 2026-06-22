import logoUrl from '../../assets/logo.png'

export function EmptyState() {
  return (
    <div className="grid place-items-center px-6 py-16 text-center">
      <img src={logoUrl} alt="" className="mb-3 h-12 w-12 opacity-90" />
      <h2 className="text-sm font-semibold text-leaf-800">No waste detected</h2>
      <p className="mt-1 max-w-[15rem] text-xs text-bark-700/70">
        Every flag is resolved. This document is ready to print with a clear
        conscience.
      </p>
    </div>
  )
}
