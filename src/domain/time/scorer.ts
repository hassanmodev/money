/**
 * The scorer — one pure function `(project, slot, sim state) → score +
 * reasons`. The heart of the engine: every hint in the app (slot-fit glows,
 * the ranked options list, drag whispers, the suggestion pass) is a view over
 * this single pass.
 *
 * Fit means "requirement satisfied with least waste": the least-demanding
 * project should take the lowest-quality acceptable slot, saving peak hours
 * for peak-needy projects — so surplus quality *costs* a little.
 */
import { addDays, format, parseISO } from 'date-fns'
import { budgetRoomMin } from './budgets'
import { parentOf } from './codes'
import { expandRules } from './rules'
import { avgBetween, minBetween, simulate, slotToDateMinute, type SimResult } from './simulation'
import {
  SLOTS_PER_DAY,
  SLOTS_PER_WEEK,
  STEP_MIN,
  type Block,
  type Fragment,
  type ISODate,
  type Project,
  type Quality,
  type TimeSettings,
  type TimeState,
} from './types'

export interface ScoreContext {
  qualities: Quality[]
  /** the projected (plan-layer) timeline to judge candidate slots against */
  sim: SimResult
  /** which slots are already claimed on the plan layer */
  occupancy: boolean[]
  /** prime-hours weights, 24 entries 0..1 */
  primeHours: number[]
  /** slots before this index are in the past and can't take new placements */
  firstOpenSlot: number
  projects: Project[]
  /** every block claiming time on the plan layer (manual + rule expansions + suggestions so far) */
  planBlocks: Block[]
  fragments: Fragment[]
  settings: TimeSettings
  /** start slots of a project's placed sessions this week (for spread scoring) */
  sessionSlots: (projectId: string) => number[]
}

export interface Score {
  value: number // 0..100
  reasons: string[]
}

const fmtSlot = (sim: SimResult, slot: number): string => {
  const { minute } = slotToDateMinute(sim.weekStart, slot)
  const h = Math.floor(minute / 60)
  return `${h}${minute % 60 ? `:${String(minute % 60).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`
}

/** Component weights, summing to 100. */
const W = { require: 35, budget: 20, spread: 15, session: 10, prime: 10, runway: 10 } as const

const inWeek = (weekStart: ISODate, date: ISODate): boolean => {
  const ws = parseISO(weekStart)
  const d = parseISO(date)
  return d >= ws && d <= addDays(ws, 6)
}

/**
 * Assemble everything the scorer needs for a viewed week: plan claims
 * (manual blocks + rule expansions), the projected timeline, occupancy, and
 * the "no placements in the past" boundary.
 */
export function buildScoreContext(
  state: TimeState,
  weekStart: ISODate,
  now: { date: ISODate; minute: number },
): ScoreContext {
  const weekEnd = format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd')
  const ruleBlocks = expandRules(state.rules, state.projects, weekStart, weekEnd)
  const manual = state.blocks.filter((b) => b.layer === 'plan' && inWeek(weekStart, b.date))
  const planBlocks = [...manual, ...ruleBlocks]

  const byId = new Map(state.projects.map((p) => [p.id, p]))
  const sim = simulate({
    qualities: state.qualities,
    weekStart,
    blocks: planBlocks
      .map((b) => {
        const p = byId.get(b.projectId)
        return p && p.effects.length
          ? { date: b.date, startMin: b.startMin, durationMin: b.durationMin, effects: p.effects }
          : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  })

  const occupancy = new Array(SLOTS_PER_WEEK).fill(false)
  for (const b of planBlocks) {
    const day = Math.round((parseISO(b.date).getTime() - parseISO(weekStart).getTime()) / 86_400_000)
    if (day < 0 || day > 6) continue
    const a = day * SLOTS_PER_DAY + Math.floor(b.startMin / STEP_MIN)
    const span = Math.max(1, Math.round(b.durationMin / STEP_MIN))
    for (let s = Math.max(0, a); s < Math.min(SLOTS_PER_WEEK, a + span); s++) occupancy[s] = true
  }

  let firstOpenSlot = 0
  if (inWeek(weekStart, now.date)) {
    const day = Math.round((parseISO(now.date).getTime() - parseISO(weekStart).getTime()) / 86_400_000)
    firstOpenSlot = day * SLOTS_PER_DAY + Math.ceil(now.minute / STEP_MIN)
  } else if (parseISO(now.date) > addDays(parseISO(weekStart), 6)) {
    firstOpenSlot = SLOTS_PER_WEEK // the whole week is past
  }

  const startsByProject = new Map<string, number[]>()
  for (const b of planBlocks) {
    const day = Math.round((parseISO(b.date).getTime() - parseISO(weekStart).getTime()) / 86_400_000)
    if (day < 0 || day > 6) continue
    const list = startsByProject.get(b.projectId) ?? []
    list.push(day * SLOTS_PER_DAY + Math.floor(b.startMin / STEP_MIN))
    startsByProject.set(b.projectId, list)
  }

  return {
    qualities: state.qualities,
    sim,
    occupancy,
    primeHours: state.settings.primeHours,
    firstOpenSlot,
    projects: state.projects,
    planBlocks,
    fragments: state.fragments,
    settings: state.settings,
    sessionSlots: (id) => startsByProject.get(id) ?? [],
  }
}

/**
 * Score placing `project` at [startSlot, startSlot + durationMin).
 * Advisory only — a low score never blocks anything, it just informs.
 */
export function scorePlacement(
  project: Project,
  startSlot: number,
  durationMin: number,
  ctx: ScoreContext,
): Score {
  const reasons: string[] = []
  const span = Math.max(1, Math.round(durationMin / STEP_MIN))
  const endSlot = Math.min(SLOTS_PER_WEEK, startSlot + span)
  const { sim, qualities } = ctx
  const qById = new Map(qualities.map((q) => [q.id, q]))

  // hard constraints first — occupancy and the past cap the score at 0
  if (startSlot < ctx.firstOpenSlot) {
    return { value: 0, reasons: ['in the past'] }
  }
  for (let s = startSlot; s < endSlot; s++) {
    if (ctx.occupancy[s]) return { value: 0, reasons: ['slot already taken'] }
  }

  // ── quality requirements (35): met with least waste scores best ──
  let reqScore: number
  if (project.requires.length === 0) {
    reqScore = 20 // no demands — a filler project, by definition fits anywhere
  } else {
    reqScore = W.require
    for (const req of project.requires) {
      const q = qById.get(req.quality)
      if (!q) continue
      const avg = avgBetween(sim, req.quality, startSlot, endSlot)
      if (avg < req.min) {
        const deficit = (req.min - avg) / q.max
        reqScore -= W.require * Math.min(1, deficit * 3)
        reasons.push(`${q.name} ≈${Math.round(avg)} here, wants ≥${req.min}`)
      } else {
        // surplus quality is wasted on an undemanding slot (smallest-fitting)
        const surplus = (avg - req.min) / q.max
        reqScore -= Math.min(8, surplus * 12)
      }
    }
    reqScore = Math.max(0, reqScore)
  }

  // ── budget room (20): nothing left to claim is a hard no (daily budgets
  // especially — one filled day must not keep absorbing the week's claim)
  let budgetScore = 10
  if (project.budget) {
    const b = project.budget
    if (b.intent === 'minimize') {
      budgetScore = 12 // never placed by suggestion, but logging is allowed
    } else {
      // budget room is judged against the period covering the candidate slot,
      // so monthly/custom/daily windows stay correct at their boundaries
      const room = budgetRoomMin(
        { projects: ctx.projects, blocks: ctx.planBlocks, fragments: ctx.fragments, settings: ctx.settings },
        project,
        slotToDateMinute(sim.weekStart, startSlot).date,
      )
      if (room < durationMin) {
        const parent = parentOf(ctx.projects, project)
        return {
          value: 0,
          reasons: [
            room <= 0
              ? parent?.budget
                ? `the ${parent.name} budget is spent`
                : 'budget already used up'
              : `only ${Math.round(room / 6) / 10}h left in the budget`,
          ],
        }
      }
      budgetScore = 20
    }
  } else if (project.fr) {
    budgetScore = 16 // fr projects draw from the free pool
  }

  // ── distribution preference (15) ──
  let spreadScore = W.spread / 2
  const spread = project.budget?.spread ?? 'any'
  const sessions = ctx.sessionSlots(project.id)
  if (spread !== 'any' && sessions.length > 0) {
    const nearest = Math.min(...sessions.map((s) => Math.abs(s - startSlot)))
    const hoursAway = (nearest * STEP_MIN) / 60
    if (spread === 'cluster') {
      spreadScore = W.spread * Math.max(0.1, Math.exp(-hoursAway / 6))
      if (hoursAway > 12) reasons.push('its sessions want to cluster together')
    } else {
      spreadScore = W.spread * Math.min(1, hoursAway / 20 + 0.1)
      if (hoursAway < 4) reasons.push('its sessions want to spread out')
    }
  }

  // ── session shape (10) ──
  let sessionScore: number = W.session
  const { sessionMin, sessionMax } = project.budget ?? {}
  if (sessionMin && durationMin < sessionMin) {
    sessionScore = (W.session * durationMin) / sessionMin
    reasons.push(`shorter than its ${Math.round(sessionMin / 6) / 10}h session minimum`)
  }
  if (sessionMax && durationMin > sessionMax) {
    sessionScore = (W.session * sessionMax) / durationMin
    reasons.push(`longer than its ${Math.round(sessionMax / 6) / 10}h session maximum`)
  }

  // ── prime-hours cost (10): filler avoids eating living hours ──
  let primeSum = 0
  for (let s = startSlot; s < endSlot; s++) {
    primeSum += ctx.primeHours[Math.floor(((s % SLOTS_PER_DAY) * STEP_MIN) / 60)] ?? 0
  }
  const primeAvg = primeSum / Math.max(1, endSlot - startSlot)
  const primeScore = W.prime * (1 - primeAvg)
  if (primeAvg > 0.6) reasons.push(`eats prime hours (${fmtSlot(sim, startSlot)})`)

  // ── runway (10): would this drain a quality to the floor here? ──
  let runwayScore: number = W.runway
  const hours = durationMin / 60
  for (const eff of project.effects) {
    if (eff.rate >= 0 && eff.open >= 0) continue
    const q = qById.get(eff.quality)
    if (!q) continue
    const projected = minBetween(sim, eff.quality, startSlot, endSlot)
    const after = projected + Math.min(0, eff.open) + Math.min(0, eff.rate) * hours
    if (after < q.max * 0.15) {
      runwayScore = Math.min(runwayScore, 2)
      reasons.push(`${q.name} would bottom out here`)
      break
    }
  }

  const value = Math.round(
    Math.max(0, Math.min(100, reqScore + budgetScore + spreadScore + sessionScore + primeScore + runwayScore)),
  )
  return { value, reasons: reasons.slice(0, 4) }
}

/** Rank every candidate start slot for a project — the data behind slot-fit glows. */
export function rankSlots(
  project: Project,
  durationMin: number,
  ctx: ScoreContext,
): { slot: number; score: Score }[] {
  const out: { slot: number; score: Score }[] = []
  const span = Math.max(1, Math.round(durationMin / STEP_MIN))
  for (let s = ctx.firstOpenSlot; s + span <= SLOTS_PER_WEEK; s++) {
    out.push({ slot: s, score: scorePlacement(project, s, durationMin, ctx) })
  }
  return out.sort((a, b) => b.score.value - a.score.value)
}

/** Rank every project for one slot — the ranked options list. */
export function rankProjects(
  projects: Project[],
  slot: number,
  durationMin: number,
  ctx: ScoreContext,
): { project: Project; score: Score }[] {
  return projects
    .filter((p) => !p.archived)
    .map((project) => ({ project, score: scorePlacement(project, slot, durationMin, ctx) }))
    .sort((a, b) => b.score.value - a.score.value)
}
