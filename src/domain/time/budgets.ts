/**
 * Budgets & usage accounting.
 *
 * A budget is an amount over a period; a parent's budget caps its children's
 * total — the family fights over a fixed pie. Actual usage counts wall time
 * honestly: a fragment inside another project's block is tracked against the
 * fragment's project, carved out of the host so no hour is double-counted.
 */
import { addDays, format, parseISO } from 'date-fns'
import { descendantsOf, parentOf } from './codes'
import {
  DAY_MIN,
  type Block,
  type Budget,
  type BudgetPeriod,
  type Fragment,
  type ISODate,
  type Project,
  type ProjectId,
  type TimeState,
} from './types'

const toISO = (d: Date): ISODate => format(d, 'yyyy-MM-dd')

export interface PeriodWindow {
  from: ISODate // inclusive
  to: ISODate // inclusive
}

/** First day of the week containing `date`, honouring the week-start setting (0 = Monday). */
export function weekStartFor(date: ISODate, weekStartDay: number): ISODate {
  const d = parseISO(date)
  const dow = (d.getDay() + 6) % 7 // Mon=0 .. Sun=6
  const delta = (((dow - weekStartDay) % 7) + 7) % 7
  return toISO(addDays(d, -delta))
}

/** The window a budget period covers around a reference date. */
export function periodWindow(
  period: BudgetPeriod,
  ref: ISODate,
  weekStartDay: number,
): PeriodWindow {
  const d = parseISO(ref)
  switch (period.kind) {
    case 'day':
      return { from: ref, to: ref }
    case 'week': {
      const from = weekStartFor(ref, weekStartDay)
      return { from, to: toISO(addDays(parseISO(from), 6)) }
    }
    case 'month': {
      const from = toISO(new Date(d.getFullYear(), d.getMonth(), 1))
      return { from, to: toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)) }
    }
    case 'custom': {
      const days = Math.max(1, period.days ?? 7)
      return { from: toISO(addDays(d, -(days - 1))), to: ref }
    }
  }
}

/** How many minutes of a block fall inside the window. Blocks may cross midnight. */
export function blockMinutesInWindow(
  b: Pick<Block, 'date' | 'startMin' | 'durationMin'>,
  window: PeriodWindow,
): number {
  const start = parseISO(b.date).getTime() + b.startMin * 60_000
  const end = start + b.durationMin * 60_000
  const wStart = parseISO(window.from).getTime()
  const wEnd = parseISO(window.to).getTime() + DAY_MIN * 60_000
  return Math.max(0, Math.min(end, wEnd) - Math.max(start, wStart)) / 60_000
}

/** Minutes of a fragment that fall inside the window. */
export function fragmentMinutesInWindow(f: Fragment, window: PeriodWindow): number {
  const at = parseISO(f.at)
  const start = at.getTime()
  const end = start + f.minutes * 60_000
  const wStart = parseISO(window.from).getTime()
  const wEnd = parseISO(window.to).getTime() + DAY_MIN * 60_000
  return Math.max(0, Math.min(end, wEnd) - Math.max(start, wStart)) / 60_000
}

/** Overlap in minutes between a fragment and a block. */
function overlapMin(
  f: Fragment,
  b: Pick<Block, 'date' | 'startMin' | 'durationMin'>,
): number {
  const bStart = parseISO(b.date).getTime() + b.startMin * 60_000
  const fStart = parseISO(f.at).getTime()
  return Math.max(
    0,
    Math.min(bStart + b.durationMin * 60_000, fStart + f.minutes * 60_000) -
      Math.max(bStart, fStart),
  ) / 60_000
}

/** Planned minutes for a project inside the window (plan-layer blocks). */
export function planUsageMinutes(
  projectId: ProjectId,
  blocks: Block[],
  window: PeriodWindow,
): number {
  let sum = 0
  for (const b of blocks) {
    if (b.projectId !== projectId || b.layer !== 'plan') continue
    sum += blockMinutesInWindow(b, window)
  }
  return sum
}

/**
 * Actual minutes for a project: its actual blocks plus its fragments, minus
 * the time its blocks host *other* projects' fragments — concurrent time is
 * tracked against the fragment's project, never double-counted.
 */
export function actualUsageMinutes(
  projectId: ProjectId,
  blocks: Block[],
  fragments: Fragment[],
  window: PeriodWindow,
): number {
  let sum = 0
  for (const b of blocks) {
    if (b.projectId !== projectId || b.layer !== 'actual') continue
    sum += blockMinutesInWindow(b, window)
    for (const f of fragments) {
      if (f.projectId === projectId) continue
      sum -= overlapMin(f, b)
    }
  }
  for (const f of fragments) {
    if (f.projectId !== projectId) continue
    sum += fragmentMinutesInWindow(f, window)
  }
  return Math.max(0, sum)
}

export interface Usage {
  planMin: number
  actualMin: number
}

/** Usage of a single project inside the window. */
export function usageOf(
  projectId: ProjectId,
  blocks: Block[],
  fragments: Fragment[],
  window: PeriodWindow,
): Usage {
  return {
    planMin: planUsageMinutes(projectId, blocks, window),
    actualMin: actualUsageMinutes(projectId, blocks, fragments, window),
  }
}

/** Usage rolled up over a project and all its descendants — the family pie. */
export function familyUsageOf(
  projects: Project[],
  project: Project,
  blocks: Block[],
  fragments: Fragment[],
  window: PeriodWindow,
): Usage {
  const ids = [project.id, ...descendantsOf(projects, project).map((p) => p.id)]
  const out: Usage = { planMin: 0, actualMin: 0 }
  for (const id of ids) {
    const u = usageOf(id, blocks, fragments, window)
    out.planMin += u.planMin
    out.actualMin += u.actualMin
  }
  return out
}

export interface BudgetProgress {
  window: PeriodWindow
  intent: Budget['intent']
  /** the committed amount (low end) */
  targetMin: number
  /** the cap (high end; === targetMin for plain targets) */
  capMin: number
  planMin: number
  actualMin: number
  /** rolled up over descendants when this project is a parent */
  family: boolean
}

/**
 * Progress for a project's budget as of `ref`. A parent's budget aggregates
 * its whole family — the cap limits the children's combined total.
 */
export function budgetProgress(
  state: Pick<TimeState, 'projects' | 'blocks' | 'fragments' | 'settings'>,
  project: Project,
  ref: ISODate,
): BudgetProgress | undefined {
  const budget = project.budget
  if (!budget) return undefined
  const window = periodWindow(budget.period, ref, state.settings.weekStart)
  const hasKids = descendantsOf(state.projects, project).length > 0
  const usage = hasKids
    ? familyUsageOf(state.projects, project, state.blocks, state.fragments, window)
    : usageOf(project.id, state.blocks, state.fragments, window)
  return {
    window,
    intent: budget.intent,
    targetMin: budget.min,
    capMin: budget.max,
    planMin: usage.planMin,
    actualMin: usage.actualMin,
    family: hasKids,
  }
}

/**
 * The budget room left for a project to claim, honouring the family pie: the
 * smaller of its own remaining budget and any budgeted ancestor's remaining.
 */
export function budgetRoomMin(
  state: Pick<TimeState, 'projects' | 'blocks' | 'fragments' | 'settings'>,
  project: Project,
  ref: ISODate,
): number {
  let room = Infinity
  let cur: Project | undefined = project
  const guard = new Set<string>()
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id)
    if (cur.budget && cur.budget.intent !== 'minimize') {
      // maximize projects may grow toward their cap; targets stop at the low end
      const cap = cur.budget.intent === 'maximize' ? cur.budget.max : cur.budget.min
      const p = budgetProgress(state, cur, ref)!
      room = Math.min(room, Math.max(0, cap - p.planMin))
    }
    cur = parentOf(state.projects, cur)
  }
  return room
}
