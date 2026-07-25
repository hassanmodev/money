/**
 * The simulation — a small pure engine that walks the week in 10-minute steps
 * applying passive drift + block effects with clamps and dependency rules,
 * producing a projected quality timeline. Everything advisory in the app
 * reads from this one pass.
 *
 * The actual curve replays the exact same math over *actual* blocks and
 * fragments, so it diverges from the projected curve exactly where the week
 * diverged — for free.
 *
 * Concurrency honesty: a fragment inside another project's block drains its
 * own qualities *and* degrades the host block's positive gives while it runs
 * (phone during work: phone pays mental, and the work hour counts for less).
 */
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { applyDependencies, baselineAt, topoOrder } from './qualities'
import {
  DAY_MIN,
  SLOTS_PER_DAY,
  SLOTS_PER_WEEK,
  STEP_MIN,
  type ISODate,
  type Quality,
  type QualityEffect,
  type QualityId,
} from './types'

/** While a fragment runs inside a host block, the host's positive gives are scaled by this. */
export const HOST_GIVE_DEGRADE = 0.5

/** Default per-quality relaxation speed toward the baseline (fraction per hour). */
export const DEFAULT_DRIFT = 0.5

export interface SimBlock {
  date: ISODate
  startMin: number
  durationMin: number
  effects: QualityEffect[]
}

export interface SimFragment {
  /** ISO timestamp — the fragment's rough position in time */
  at: string
  minutes: number
  effects: QualityEffect[]
}

export interface SimInput {
  qualities: Quality[]
  blocks: SimBlock[]
  fragments?: SimFragment[]
  weekStart: ISODate
}

export interface SimStep {
  /** effective (post-dependency) values at this slot */
  values: Record<QualityId, number>
}

export interface SimResult {
  weekStart: ISODate
  /** one step per 10-minute slot of the week, 0..1007 */
  steps: SimStep[]
}

const toISO = (d: Date): ISODate => format(d, 'yyyy-MM-dd')

/** Slot index of a date + minute-of-day within the week, or -1 when outside. */
export function slotIndexFor(weekStart: ISODate, date: ISODate, minute: number): number {
  const day = differenceInCalendarDays(parseISO(date), parseISO(weekStart))
  if (day < 0 || day > 6) return -1
  const slot = Math.floor(minute / STEP_MIN)
  if (slot < 0 || slot >= SLOTS_PER_DAY) return -1
  return day * SLOTS_PER_DAY + slot
}

/** The date + minute-of-day a slot points at. */
export function slotToDateMinute(
  weekStart: ISODate,
  slot: number,
): { date: ISODate; minute: number } {
  const day = Math.floor(slot / SLOTS_PER_DAY)
  return { date: toISO(addDays(parseISO(weekStart), day)), minute: (slot % SLOTS_PER_DAY) * STEP_MIN }
}

interface SlotEntry {
  effects: QualityEffect[]
  /** scale applied to positive rates (concurrent-fragment degradation) */
  giveScale: number
  /** true on the slot where the block opens (opening cost lands here) */
  opens: boolean
  isFragment: boolean
}

/** Effective value of a quality at a slot. Out-of-range slots clamp to the edges. */
export function valueAt(sim: SimResult, quality: QualityId, slot: number): number {
  const s = Math.max(0, Math.min(sim.steps.length - 1, Math.round(slot)))
  return sim.steps[s]?.values[quality] ?? 0
}

/** Average effective value over [startSlot, endSlot). */
export function avgBetween(
  sim: SimResult,
  quality: QualityId,
  startSlot: number,
  endSlot: number,
): number {
  let sum = 0
  let n = 0
  for (let s = Math.max(0, startSlot); s < Math.min(sim.steps.length, endSlot); s++) {
    sum += sim.steps[s].values[quality] ?? 0
    n++
  }
  return n ? sum / n : 0
}

/** Minimum effective value over [startSlot, endSlot). */
export function minBetween(
  sim: SimResult,
  quality: QualityId,
  startSlot: number,
  endSlot: number,
): number {
  let min = Infinity
  for (let s = Math.max(0, startSlot); s < Math.min(sim.steps.length, endSlot); s++) {
    min = Math.min(min, sim.steps[s].values[quality] ?? Infinity)
  }
  return min === Infinity ? 0 : min
}

/**
 * Walk the week. Qualities start full; each step relaxes toward the baseline,
 * applies the effects of whatever blocks/fragments occupy the slot, clamps to
 * [0, max], then resolves dependency rules in topological order.
 */
export function simulate(input: SimInput): SimResult {
  const { qualities, weekStart } = input
  const order = topoOrder(qualities)
  const byId = new Map(qualities.map((q) => [q.id, q]))

  // ── rasterize events into per-slot effect lists ──
  const slots: SlotEntry[][] = Array.from({ length: SLOTS_PER_WEEK }, () => [])

  const rasterize = (
    startSlot: number,
    endSlot: number,
    effects: QualityEffect[],
    isFragment: boolean,
    opens: boolean,
  ): void => {
    const a = Math.max(0, startSlot)
    const b = Math.min(SLOTS_PER_WEEK, endSlot)
    for (let s = a; s < b; s++) {
      slots[s].push({ effects, giveScale: 1, opens: opens && s === a, isFragment })
    }
  }

  for (const b of input.blocks) {
    if (b.effects.length === 0) continue
    const start = slotIndexFor(weekStart, b.date, b.startMin)
    if (start < 0) continue
    rasterize(start, start + Math.round(b.durationMin / STEP_MIN), b.effects, false, true)
  }

  // fragments rasterize after blocks so concurrent degradation can find hosts
  for (const f of input.fragments ?? []) {
    if (f.effects.length === 0) continue
    const at = parseISO(f.at)
    const start = slotIndexFor(weekStart, toISO(at), at.getHours() * 60 + at.getMinutes())
    if (start < 0) continue
    rasterize(start, start + Math.round(f.minutes / STEP_MIN), f.effects, true, true)
  }

  // concurrent degradation: host block gives count for less while a fragment runs inside
  for (let s = 0; s < SLOTS_PER_WEEK; s++) {
    const list = slots[s]
    if (list.length < 2 || !list.some((e) => e.isFragment)) continue
    for (const entry of list) {
      if (!entry.isFragment) entry.giveScale = Math.min(entry.giveScale, HOST_GIVE_DEGRADE)
    }
  }

  // ── walk ──
  const raw: Record<QualityId, number> = {}
  for (const q of qualities) raw[q.id] = q.max // every quality starts the week at full

  const steps: SimStep[] = []
  const hoursPerStep = STEP_MIN / 60

  for (let s = 0; s < SLOTS_PER_WEEK; s++) {
    const minute = (s * STEP_MIN) % DAY_MIN

    // passive drift toward the time-of-day baseline
    for (const q of qualities) {
      const k = (q.drift ?? DEFAULT_DRIFT) * hoursPerStep
      raw[q.id] += (baselineAt(q, minute) - raw[q.id]) * k
    }

    // block & fragment effects
    for (const entry of slots[s]) {
      for (const eff of entry.effects) {
        const q = byId.get(eff.quality)
        if (!q) continue
        let delta = eff.rate * hoursPerStep
        if (delta > 0) delta *= entry.giveScale
        if (entry.opens) delta += eff.open
        raw[eff.quality] = Math.max(0, Math.min(q.max, raw[eff.quality] + delta))
      }
    }

    // clamp everything (drift can overshoot when baseline sits outside [0, max])
    for (const q of qualities) raw[q.id] = Math.max(0, Math.min(q.max, raw[q.id]))

    steps.push({ values: applyDependencies(qualities, order, raw) })
  }

  return { weekStart, steps }
}
