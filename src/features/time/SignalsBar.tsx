/**
 * The weekly summary — quality warnings, hog and neglect signals, and unfit
 * budgets, in one quiet strip. The app surfaces; the user judges. Nothing
 * here is an alarm; "may fail" is expected output, not an error state.
 */
import { CloudDrizzle, Flame, MoonStar } from 'lucide-react'
import type { Project, Signal, UnfitReport } from '@/domain/time'
import { Tooltip } from '@/ui'
import { fmtHours } from './format'

const SIGNAL_ICON = {
  quality: CloudDrizzle,
  hog: Flame,
  neglect: MoonStar,
} as const

export function SignalsBar({
  signals,
  unfit,
  projects,
}: {
  signals: Signal[]
  unfit: UnfitReport[]
  projects: Project[]
}) {
  if (signals.length === 0 && unfit.length === 0) return null
  const nameOf = (id: string) => projects.find((p) => p.id === id)?.name ?? id

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      {signals.map((s, i) => {
        const Icon = SIGNAL_ICON[s.kind]
        return (
          <span
            key={`${s.kind}-${i}`}
            className={
              s.severity === 'warn'
                ? 'inline-flex items-center gap-1.5 rounded-full border border-honey/30 bg-honey/10 px-2.5 py-1 text-xs text-honey'
                : 'inline-flex items-center gap-1.5 rounded-full border border-line bg-raised/60 px-2.5 py-1 text-xs text-muted'
            }
          >
            <Icon className="size-3.5" />
            {s.message}
          </span>
        )
      })}
      {unfit.map((u) => (
        <Tooltip key={u.projectId} content={u.reasons.join(' · ') || 'no slots left'}>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rust/30 bg-rust/10 px-2.5 py-1 text-xs text-rust">
            {nameOf(u.projectId)}: {fmtHours(u.missingMin)} doesn't fit
          </span>
        </Tooltip>
      ))}
    </div>
  )
}
