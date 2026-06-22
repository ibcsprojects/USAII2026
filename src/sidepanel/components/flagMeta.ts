import type { FlagType, Severity } from '../../lib/analyzer/types'

export const FLAG_META: Record<FlagType, { label: string; accent: string }> = {
  highlight: { label: 'Ink — highlight', accent: 'bg-amber-100 text-amber-800' },
  fontSize: { label: 'Paper — font size', accent: 'bg-sky-100 text-sky-800' },
  doubleSpacing: { label: 'Paper — spacing', accent: 'bg-violet-100 text-violet-800' },
  blankPage: { label: 'Paper — blank page', accent: 'bg-rose-100 text-rose-800' },
  pageBreak: { label: 'Paper — page break', accent: 'bg-rose-100 text-rose-800' },
  bulletSprawl: { label: 'Paper — layout', accent: 'bg-teal-100 text-teal-800' },
  verbose: { label: 'Paper — wordiness', accent: 'bg-leaf-100 text-leaf-800' },
  largeImage: { label: 'Paper — image', accent: 'bg-indigo-100 text-indigo-800' },
  wideMargins: { label: 'Paper — margins', accent: 'bg-orange-100 text-orange-800' },
  wideIndents: { label: 'Paper — indents', accent: 'bg-lime-100 text-lime-800' },
}

export const SEVERITY_DOT: Record<Severity, string> = {
  low: 'bg-leaf-400',
  medium: 'bg-amber-400',
  high: 'bg-rose-500',
}
