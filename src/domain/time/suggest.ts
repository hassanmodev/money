/**
 * The suggestion pass — computes proposals; nothing is ever moved or locked
 * automatically. Placed and rule-generated claims resolve first, then
 * budgeted projects claim their hours, then `fr` shares split what's left
 * CSS-style. What doesn't fit is reported, never silently crammed.
 */
import { budgetRoomMin, periodWindow, planUsageMinutes } from './budgets'
import { childrenOf, descendantsOf, parentOf } from './codes'
import { buildScoreContext, scorePlacement, type ScoreContext } from './scorer'
import { simulate, slotToDateMinute } from './simulation'
import {
  SLOTS_PER_WEEK,
  STEP_MIN,
  type Block,
  type ISODate,
  type Project,
  type ProjectId,
  type TimeState,
} from './types'

/** A suggestion scores at least this before it's worth proposing. */
export const ACCEPT_THRESHOLD = 45
/** Elastic growth needs a clearly good slot — the user is asked to confirm. */
export const GROWTH_THRESHOLD = 60
/** Crumbs below this aren't reported as unfit — the badge would be noise. */
export const UNFIT_MIN = 30

const MAX_SESSIONS_PER_PROJECT = 30

export interface Suggestion {
  projectId: ProjectId
  date: ISODate
  startMin: number
  durationMin: number
  score: number
  reasons: string[]
  /** growth proposal for a maximize project — starts at the low end, user confirms the stretch */
  elastic?: boolean
}

export interface UnfitReport {
  projectId: ProjectId
  missingMin: number
  reasons: string[]
}

export interface SuggestResult {
  suggestions: Suggestion[]
  unfit: UnfitReport[]
}

const hours = (min: number) => Math.round(min / 6) / 10

/**
 * Resolve `fr` shares over a free pool, CSS-style. Scope picks the pie:
 * - `global`: the week pool itself.
 * - `family`: the top-level family's allocation (root must have `fr`).
 * - `parent`: the direct parent's allocation — siblings split it.
 * A project whose container has no `fr` share to split falls back to the
 * global pool, so shares never vanish silently.
 */
export function resolveFrShares(projects: Project[], poolMin: number): Map<ProjectId, number> {
  const out = new Map<ProjectId, number>()
  const withFr = projects.filter((p) => p.fr && !p.archived && p.fr.share > 0)
  if (poolMin <= 0 || withFr.length === 0) return out

  const allocate = (pool: number, claimants: Project[]) => {
    const total = claimants.reduce((s, p) => s + (p.fr?.share ?? 0), 0)
    if (total <= 0 || pool <= 0) return
    for (const c of claimants) {
      const share = (pool * (c.fr?.share ?? 0)) / total
      // children claiming the direct parent's share split it instead
      const parentKids = childrenOf(projects, c).filter(
        (k) => k.fr?.scope === 'parent' && !k.archived && k.fr.share > 0,
      )
      // a family root's share feeds descendants claiming the family pie
      const familyMembers = parentOf(projects, c)
        ? []
        : descendantsOf(projects, c).filter(
            (d) => d.fr?.scope === 'family' && !d.archived && d.fr.share > 0,
          )
      if (parentKids.length > 0) {
        allocate(share, parentKids)
      } else if (familyMembers.length > 0) {
        allocate(share, familyMembers)
      } else {
        out.set(c.id, (out.get(c.id) ?? 0) + share)
      }
    }
  }

  const globalClaimants = withFr.filter((p) => {
    const parent = parentOf(projects, p)
    if (p.fr!.scope === 'global') return true
    if (!parent) return true // roots always claim from the global pool
    if (p.fr!.scope === 'parent') return !parent.fr // no parent pie → global fallback
    // family scope: claims from the root's share when the root has one
    let root: Project | undefined = parent
    let cur: Project | undefined = parent
    while (cur) {
      root = cur
      cur = parentOf(projects, cur)
    }
    return !root?.fr
  })

  allocate(poolMin, globalClaimants)
  return out
}

interface Working {
  ctx: ScoreContext
  occupancy: boolean[]
  planBlocks: Block[]
  sessionStarts: Map<ProjectId, number[]>
  state: TimeState
  weekStart: ISODate
  byId: Map<ProjectId, Project>
}

/** Re-run the projected timeline with the suggestions placed so far. */
const resimulate = (w: Working) => {
  w.ctx = {
    ...w.ctx,
    sim: simulate({
      qualities: w.state.qualities,
      weekStart: w.weekStart,
      blocks: w.planBlocks
        .map((b) => {
          const p = w.byId.get(b.projectId)
          return p && p.effects.length
            ? { date: b.date, startMin: b.startMin, durationMin: b.durationMin, effects: p.effects }
            : null
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    }),
  }
}

/**
 * Greedily place `minutes` for a project at its best-scoring open slots.
 * Returns what wouldn't fit and why. Every placed session becomes part of the
 * landscape for the next one (occupancy, budget room, spread, quality drift).
 *
 * Prefers large chunks (up to `sessionCap` / `sessionMax`), but when a size
 * won't fit it halves and retries — otherwise fr leftovers die as "unfit"
 * while smaller open runs still exist.
 */
function placeSessions(
  w: Working,
  project: Project,
  minutes: number,
  opts: { elastic?: boolean; threshold: number; sessionCap?: number },
): { placed: Suggestion[]; missingMin: number; reasons: string[] } {
  const placed: Suggestion[] = []
  let remaining = minutes
  let reasons: string[] = []
  const { sessionMin, sessionMax } = project.budget ?? {}
  const preferred = sessionMax ?? opts.sessionCap
  const floor = sessionMin ?? STEP_MIN
  let maxChunk = preferred ?? minutes
  let sessions = 0

  while (sessions < MAX_SESSIONS_PER_PROJECT && remaining >= STEP_MIN) {
    if (sessionMin && remaining < sessionMin) {
      reasons = [`needs at least ${hours(sessionMin)}h per sitting`]
      break
    }
    const len = Math.max(floor, Math.min(maxChunk, remaining))
    const span = Math.max(1, Math.round(len / STEP_MIN))

    let bestSlot = -1
    let bestScore = -1
    let bestReasons: string[] = []
    for (let s = w.ctx.firstOpenSlot; s + span <= SLOTS_PER_WEEK; s++) {
      const score = scorePlacement(project, s, len, w.ctx)
      if (score.value > bestScore) {
        bestScore = score.value
        bestSlot = s
        bestReasons = score.reasons
      }
    }
    if (bestSlot < 0 || bestScore < opts.threshold) {
      // shrink and retry — don't burn a session slot on a size that won't fit
      const smaller = Math.floor(len / 2 / STEP_MIN) * STEP_MIN
      if (smaller >= floor && smaller < len) {
        maxChunk = smaller
        continue
      }
      reasons =
        bestScore <= 0
          ? ['no open slots left']
          : [`best open slot scores ${bestScore}`, ...bestReasons.slice(0, 2)]
      break
    }

    // commit the session
    const { date, minute } = slotToDateMinute(w.weekStart, bestSlot)
    placed.push({
      projectId: project.id,
      date,
      startMin: minute,
      durationMin: len,
      score: Math.round(bestScore),
      reasons: bestReasons,
      elastic: opts.elastic || undefined,
    })
    const synthetic: Block = {
      id: `sug:${project.id}:${bestSlot}`,
      projectId: project.id,
      layer: 'plan',
      date,
      startMin: minute,
      durationMin: len,
      origin: 'suggested',
      createdAt: '',
    }
    w.planBlocks.push(synthetic)
    for (let s = bestSlot; s < Math.min(SLOTS_PER_WEEK, bestSlot + span); s++) w.occupancy[s] = true
    const starts = w.sessionStarts.get(project.id) ?? []
    starts.push(bestSlot)
    w.sessionStarts.set(project.id, starts)
    w.ctx = {
      ...w.ctx,
      planBlocks: w.planBlocks,
      sessionSlots: (id) => w.sessionStarts.get(id) ?? [],
    }
    if (project.effects.length) resimulate(w)
    remaining -= len
    sessions++
    // prefer large chunks again whenever a longer open run appears
    maxChunk = preferred ?? remaining
  }

  return { placed, missingMin: Math.max(0, remaining), reasons }
}

/**
 * Compute this week's proposals: budgeted projects claim their hours at their
 * best slots, maximize projects get elastic growth proposals on top, and `fr`
 * shares split the remaining free pool. Past weeks propose nothing.
 */
export function suggestWeek(
  state: TimeState,
  weekStart: ISODate,
  now: { date: ISODate; minute: number },
): SuggestResult {
  const ctx = buildScoreContext(state, weekStart, now)
  const empty: SuggestResult = { suggestions: [], unfit: [] }
  if (ctx.firstOpenSlot >= SLOTS_PER_WEEK) return empty

  const byId = new Map(state.projects.map((p) => [p.id, p]))
  const sessionStarts = new Map<ProjectId, number[]>()
  for (const p of state.projects) sessionStarts.set(p.id, [...ctx.sessionSlots(p.id)])

  const w: Working = {
    ctx,
    occupancy: [...ctx.occupancy],
    planBlocks: [...ctx.planBlocks],
    sessionStarts,
    state,
    weekStart,
    byId,
  }
  w.ctx = { ...ctx, occupancy: w.occupancy, planBlocks: w.planBlocks }

  const suggestions: Suggestion[] = []
  const unfit: UnfitReport[] = []

  // ── budgeted claims: requirements-heavy first, then biggest remaining ──
  // Budget windows are judged inside the viewed week — when planning ahead,
  // "now" sits outside it and would point at the wrong period.
  const weekRef = now.date >= weekStart ? now.date : weekStart
  const roomOf = (p: Project) =>
    budgetRoomMin({ projects: state.projects, blocks: w.planBlocks, fragments: state.fragments, settings: state.settings }, p, weekRef)
  const claimants = state.projects
    .filter((p) => !p.archived && p.budget && p.budget.intent !== 'minimize')
    .map((p) => ({ p, room: roomOf(p) }))
    .filter((c) => c.room >= STEP_MIN)
    .sort(
      (a, b) =>
        b.p.requires.length - a.p.requires.length || b.room - a.room || a.p.name.localeCompare(b.p.name),
    )

  for (const { p, room } of claimants) {
    const target = Math.min(room, p.budget!.min)
    const r = placeSessions(w, p, target, { threshold: ACCEPT_THRESHOLD })
    suggestions.push(...r.placed)

    // elastic maximize: propose growth toward the cap while slots still look productive
    const missing = r.missingMin
    if (p.budget!.intent === 'maximize' && missing < target) {
      const window = periodWindow(p.budget!.period, weekRef, state.settings.weekStart)
      const plannedNow = planUsageMinutes(p.id, w.planBlocks, window)
      const growthRoom = Math.max(0, p.budget!.max - plannedNow)
      if (growthRoom >= STEP_MIN) {
        const g = placeSessions(w, p, growthRoom, { elastic: true, threshold: GROWTH_THRESHOLD })
        suggestions.push(...g.placed)
      }
    }

    if (missing >= UNFIT_MIN) {
      unfit.push({ projectId: p.id, missingMin: missing, reasons: r.reasons })
    }
  }

  // ── fr shares split the remaining free pool ──
  const freeSlots = w.occupancy.reduce((n, taken, i) => n + (taken || i < w.ctx.firstOpenSlot ? 0 : 1), 0)
  const pool = freeSlots * STEP_MIN
  const frAllocs = resolveFrShares(state.projects, pool)
  for (const [projectId, minutes] of frAllocs) {
    const p = byId.get(projectId)
    if (!p || minutes < STEP_MIN) continue
    const r = placeSessions(w, p, Math.floor(minutes / STEP_MIN) * STEP_MIN, {
      threshold: ACCEPT_THRESHOLD,
      // fr filler without its own session shape spreads in day-sized chunks
      sessionCap: 480,
    })
    suggestions.push(...r.placed)
    if (r.missingMin >= UNFIT_MIN) {
      unfit.push({ projectId, missingMin: r.missingMin, reasons: r.reasons })
    }
  }

  return { suggestions, unfit }
}
