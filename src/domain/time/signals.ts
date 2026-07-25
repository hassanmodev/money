/**
 * Signals — the app surfaces, the user judges. Everything here is a derived
 * heuristic with tunable thresholds; nothing is ever enforced.
 */
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { actualUsageMinutes, planUsageMinutes, type PeriodWindow } from './budgets'
import { expandRules } from './rules'
import { slotToDateMinute, type SimResult } from './simulation'
import {
  STEP_MIN,
  type Block,
  type ISODate,
  type ProjectId,
  type Quality,
  type QualityId,
  type TimeState,
} from './types'

export const SIGNAL_TUNING = {
  /** actual must exceed plan by this factor (and a minimum volume) to read as a hog */
  hogRatio: 1.25,
  hogMinActualMin: 120,
  /** an actual block overlapping someone else's plan by at least this counts as a spill */
  hogOverflowMin: 30,
  /** a budgeted project with no actuals for this many days gets surfaced */
  neglectDays: 7,
  /** projected quality below this fraction of max, sustained, triggers a warning */
  qualityFloor: 0.15,
  qualitySustainMin: 60,
} as const

export type SignalKind = 'hog' | 'neglect' | 'quality'

export interface Signal {
  kind: SignalKind
  message: string
  projectId?: ProjectId
  quality?: QualityId
  severity: 'info' | 'warn'
}

const weekWindow = (weekStart: ISODate): PeriodWindow => ({
  from: weekStart,
  to: format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd'),
})

const overlapMin = (
  a: Pick<Block, 'date' | 'startMin' | 'durationMin'>,
  b: Pick<Block, 'date' | 'startMin' | 'durationMin'>,
): number => {
  const aStart = parseISO(a.date).getTime() + a.startMin * 60_000
  const bStart = parseISO(b.date).getTime() + b.startMin * 60_000
  return (
    Math.max(
      0,
      Math.min(aStart + a.durationMin * 60_000, bStart + b.durationMin * 60_000) -
        Math.max(aStart, bStart),
    ) / 60_000
  )
}

/**
 * Resource hog detection: consistent actual-vs-plan overshoot, or repeated
 * overflow into time planned for other projects.
 */
export function hogSignals(state: TimeState, weekStart: ISODate): Signal[] {
  const window = weekWindow(weekStart)
  const known = new Set(state.projects.map((p) => p.id))
  const ruleBlocks = expandRules(state.rules, state.projects, window.from, window.to)
  const planBlocks = [
    ...state.blocks.filter((b) => b.layer === 'plan' && known.has(b.projectId)),
    ...ruleBlocks,
  ]
  const actualBlocks = state.blocks.filter((b) => b.layer === 'actual' && known.has(b.projectId))

  const out: Signal[] = []
  for (const p of state.projects) {
    if (p.archived || p.dim) continue
    const planMin = planUsageMinutes(p.id, planBlocks, window)
    const actualMin = actualUsageMinutes(p.id, actualBlocks, state.fragments, window)
    const reasons: string[] = []

    if (
      actualMin >= SIGNAL_TUNING.hogMinActualMin &&
      planMin > 0 &&
      actualMin > planMin * SIGNAL_TUNING.hogRatio
    ) {
      reasons.push(`running ${(actualMin / planMin).toFixed(1)}× its plan`)
    }

    let spills = 0
    for (const a of actualBlocks) {
      if (a.projectId !== p.id) continue
      for (const b of planBlocks) {
        if (b.projectId === p.id) continue
        if (overlapMin(a, b) >= SIGNAL_TUNING.hogOverflowMin) {
          spills++
          break
        }
      }
    }
    if (spills > 0) reasons.push(`spilled into ${spills} block${spills > 1 ? 's' : ''} planned for others`)

    if (reasons.length) {
      out.push({
        kind: 'hog',
        projectId: p.id,
        message: `${p.name} is ${reasons.join(' and ')}`,
        severity: 'warn',
      })
    }
  }
  // unplanned hogs: heavy actuals with zero plan still deserve a whisper
  for (const p of state.projects) {
    if (p.archived || p.dim) continue
    const planMin = planUsageMinutes(p.id, planBlocks, window)
    if (planMin > 0) continue
    const actualMin = actualUsageMinutes(p.id, actualBlocks, state.fragments, window)
    if (actualMin >= SIGNAL_TUNING.hogMinActualMin * 2) {
      out.push({
        kind: 'hog',
        projectId: p.id,
        message: `${p.name} logged ${Math.round(actualMin / 6) / 10}h with nothing planned`,
        severity: 'info',
      })
    }
  }
  return out
}

/**
 * Neglect: a project with intent (budget or fr share) but no actuals for too
 * long gets gently surfaced — "untouched for 9 days". The anti-starvation
 * seed, as a reminder only.
 */
export function neglectSignals(state: TimeState, today: ISODate): Signal[] {
  const out: Signal[] = []
  const t = parseISO(today)
  for (const p of state.projects) {
    if (p.archived || p.dim) continue
    if (!p.budget && !p.fr) continue

    let last: ISODate | undefined
    for (const b of state.blocks) {
      if (b.projectId !== p.id || b.layer !== 'actual') continue
      if (!last || b.date > last) last = b.date
    }
    for (const f of state.fragments) {
      if (f.projectId !== p.id) continue
      const d = format(parseISO(f.at), 'yyyy-MM-dd')
      if (!last || d > last) last = d
    }

    const created = format(parseISO(p.createdAt), 'yyyy-MM-dd')
    const since = last ?? created
    const days = differenceInCalendarDays(t, parseISO(since))
    if (days >= SIGNAL_TUNING.neglectDays) {
      out.push({
        kind: 'neglect',
        projectId: p.id,
        message: last
          ? `${p.name}: untouched for ${days} days`
          : `${p.name}: never touched since you added it`,
        severity: 'info',
      })
    }
  }
  return out
}

/**
 * Quality warnings from the simulation: a projected quality crashing
 * mid-week — "mental hits 12 by Thursday". Derived, never enforced.
 */
export function qualityWarnings(
  sim: SimResult,
  qualities: Quality[],
  floor: number = SIGNAL_TUNING.qualityFloor,
): Signal[] {
  const out: Signal[] = []
  const sustain = Math.max(1, Math.round(SIGNAL_TUNING.qualitySustainMin / STEP_MIN))
  for (const q of qualities) {
    const threshold = q.max * floor
    let run = 0
    for (let s = 0; s < sim.steps.length; s++) {
      const v = sim.steps[s].values[q.id] ?? q.max
      run = v < threshold ? run + 1 : 0
      if (run === sustain) {
        const firstLow = s - sustain + 1
        const { date } = slotToDateMinute(sim.weekStart, firstLow)
        const day = format(parseISO(date), 'EEEE')
        const low = Math.round(
          Math.min(...sim.steps.slice(firstLow, firstLow + sustain).map((x) => x.values[q.id] ?? q.max)),
        )
        out.push({
          kind: 'quality',
          quality: q.id,
          message: `${q.name} hits ${low} by ${day}`,
          severity: 'warn',
        })
        break
      }
    }
  }
  return out
}

/** All signals for a week, severity-first. */
export function allSignals(
  state: TimeState,
  weekStart: ISODate,
  sim: SimResult,
  today: ISODate,
): Signal[] {
  const all = [
    ...qualityWarnings(sim, state.qualities, state.settings.warnBelow ?? SIGNAL_TUNING.qualityFloor),
    ...hogSignals(state, weekStart),
    ...neglectSignals(state, today),
  ]
  return all.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warn' ? -1 : 1))
}
