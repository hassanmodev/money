/**
 * Quality curves and dependency rules.
 *
 * The baseline is the passive-drift attractor: a piecewise-linear curve over
 * the day that wraps at midnight. Dependencies ("when physical < 30, mental
 * −40%") form a DAG — cycles are rejected at edit time, and the simulation
 * walks it in topological order.
 */
import { DAY_MIN, type Quality, type QualityDependency, type QualityId } from './types'

/** The baseline value at a minute of day, interpolating and wrapping at midnight. */
export function baselineAt(q: Quality, minute: number): number {
  const pts = [...q.baseline].sort((a, b) => a.minute - b.minute)
  if (pts.length === 0) return q.max
  if (pts.length === 1) return pts[0].value

  const m = ((minute % DAY_MIN) + DAY_MIN) % DAY_MIN
  // find the segment [a, b] containing m, wrapping across midnight
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const span = (b.minute - a.minute + DAY_MIN) % DAY_MIN || DAY_MIN
    const off = (m - a.minute + DAY_MIN) % DAY_MIN
    if (off <= span) {
      const t = span === 0 ? 0 : off / span
      return a.value + (b.value - a.value) * Math.min(1, t)
    }
  }
  return pts[0].value
}

/** Edge direction: quality → the qualities it depends on. */
const depEdges = (qualities: Quality[]): Map<QualityId, QualityId[]> => {
  const m = new Map<QualityId, QualityId[]>()
  for (const q of qualities) m.set(q.id, (q.dependsOn ?? []).map((d) => d.on))
  return m
}

/**
 * Would adding `dep` to quality `id` create a cycle? True when the watched
 * quality can already reach `id` through existing dependency chains.
 */
export function wouldCreateCycle(
  qualities: Quality[],
  id: QualityId,
  dep: QualityDependency,
): boolean {
  if (dep.on === id) return true
  const edges = depEdges(qualities)
  const seen = new Set<QualityId>()
  const stack = [dep.on]
  while (stack.length) {
    const cur = stack.pop()!
    if (cur === id) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const next of edges.get(cur) ?? []) stack.push(next)
  }
  return false
}

/** All dependency errors in a quality set (unknown references and cycles). */
export function validateDependencies(qualities: Quality[]): string[] {
  const errors: string[] = []
  const ids = new Set(qualities.map((q) => q.id))
  for (const q of qualities) {
    for (const dep of q.dependsOn ?? []) {
      if (!ids.has(dep.on)) errors.push(`${q.name}: unknown quality "${dep.on}"`)
    }
  }
  const nameOf = (id: QualityId) => qualities.find((q) => q.id === id)?.name ?? id
  const edges = depEdges(qualities)
  const state = new Map<QualityId, 0 | 1 | 2>() // 0 unvisited 1 in-stack 2 done
  const visit = (id: QualityId, path: string[]): void => {
    if (state.get(id) === 2) return
    if (state.get(id) === 1) {
      errors.push(`dependency cycle: ${[...path, id].map(nameOf).join(' → ')}`)
      return
    }
    state.set(id, 1)
    for (const next of edges.get(id) ?? []) visit(next, [...path, id])
    state.set(id, 2)
  }
  for (const q of qualities) visit(q.id, [])
  return errors
}

/**
 * Quality ids ordered so every watched quality comes before its dependents —
 * the order the simulation applies dependencies in. Cyclic stragglers
 * (rejected at edit time, so only reachable via hand-edited data) keep their
 * input order at the end.
 */
export function topoOrder(qualities: Quality[]): QualityId[] {
  const edges = depEdges(qualities)
  const out: QualityId[] = []
  const state = new Map<QualityId, 1 | 2>()
  const visit = (id: QualityId) => {
    if (state.has(id)) return
    state.set(id, 1)
    for (const next of edges.get(id) ?? []) visit(next)
    state.set(id, 2)
    out.push(id)
  }
  for (const q of qualities) visit(q.id)
  return out
}

/** Effective values after dependency rules, given raw simulated state. */
export function applyDependencies(
  qualities: Quality[],
  order: QualityId[],
  raw: Record<QualityId, number>,
): Record<QualityId, number> {
  const byId = new Map(qualities.map((q) => [q.id, q]))
  const effective: Record<QualityId, number> = {}
  for (const id of order) {
    const q = byId.get(id)
    if (!q) continue
    let v = raw[id] ?? 0
    for (const dep of q.dependsOn ?? []) {
      if ((effective[dep.on] ?? raw[dep.on] ?? 0) < dep.below) v *= dep.scale
    }
    effective[id] = Math.max(0, Math.min(q.max, v))
  }
  return effective
}
