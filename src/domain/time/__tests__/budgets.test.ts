import { describe, expect, it } from 'vitest'
import {
  actualUsageMinutes,
  blockMinutesInWindow,
  budgetProgress,
  budgetRoomMin,
  familyUsageOf,
  periodWindow,
  weekStartFor,
} from '../budgets'
import { mkBlock, mkFragment, mkProject, mkState, WEEK } from './fixtures'

describe('weekStartFor', () => {
  it('finds the Monday of a week by default', () => {
    expect(weekStartFor('2026-01-07', 0)).toBe(WEEK) // Wednesday
    expect(weekStartFor('2026-01-05', 0)).toBe(WEEK) // Monday itself
    expect(weekStartFor('2026-01-11', 0)).toBe(WEEK) // Sunday
  })

  it('honours a different week start', () => {
    expect(weekStartFor('2026-01-11', 6)).toBe('2026-01-11') // Sunday start
    expect(weekStartFor('2026-01-10', 6)).toBe('2026-01-04')
  })
})

describe('periodWindow', () => {
  const ref = '2026-01-07' // Wednesday

  it('covers day / week / month / custom', () => {
    expect(periodWindow({ kind: 'day' }, ref, 0)).toEqual({ from: ref, to: ref })
    expect(periodWindow({ kind: 'week' }, ref, 0)).toEqual({ from: WEEK, to: '2026-01-11' })
    expect(periodWindow({ kind: 'month' }, ref, 0)).toEqual({ from: '2026-01-01', to: '2026-01-31' })
    expect(periodWindow({ kind: 'custom', days: 3 }, ref, 0)).toEqual({
      from: '2026-01-05',
      to: ref,
    })
  })
})

describe('blockMinutesInWindow', () => {
  it('counts only the part inside the window', () => {
    const b = { date: '2026-01-06', startMin: 22 * 60, durationMin: 4 * 60 } // Tue 22:00 → Wed 02:00
    expect(blockMinutesInWindow(b, { from: WEEK, to: '2026-01-11' })).toBe(240)
    expect(blockMinutesInWindow(b, { from: '2026-01-07', to: '2026-01-07' })).toBe(120)
    expect(blockMinutesInWindow(b, { from: '2026-01-08', to: '2026-01-08' })).toBe(0)
  })
})

describe('actualUsageMinutes', () => {
  it('carves concurrent fragments out of the host — no double-counted hours', () => {
    const blocks = [
      mkBlock({ id: 'b1', projectId: 'work', layer: 'actual', startMin: 540, durationMin: 120 }),
    ]
    const fragments = [
      mkFragment({ id: 'f1', projectId: 'phone', minutes: 30, at: '2026-01-05T09:30:00' }),
    ]
    const week = { from: WEEK, to: '2026-01-11' }
    expect(actualUsageMinutes('work', blocks, fragments, week)).toBe(90)
    expect(actualUsageMinutes('phone', blocks, fragments, week)).toBe(30)
  })

  it('does not carve a fragment from its own project', () => {
    const blocks = [
      mkBlock({ id: 'b1', projectId: 'work', layer: 'actual', startMin: 540, durationMin: 60 }),
    ]
    const fragments = [
      mkFragment({ id: 'f1', projectId: 'work', minutes: 15, at: '2026-01-05T09:10:00' }),
    ]
    expect(actualUsageMinutes('work', blocks, fragments, { from: WEEK, to: '2026-01-11' })).toBe(75)
  })
})

describe('familyUsageOf + budgetRoomMin', () => {
  const ent = mkProject({
    id: 'ent',
    code: 'ent',
    budget: { min: 600, max: 600, intent: 'target', period: { kind: 'week' }, spread: 'any' },
  })
  const tv = mkProject({ id: 'tv', code: 'ent-tv' })
  const phone = mkProject({ id: 'phone', code: 'ent-phone' })

  it('a parent’s budget caps its children’s total — the family pie', () => {
    const blocks = [
      mkBlock({ id: 'b1', projectId: 'tv', durationMin: 360 }),
      mkBlock({ id: 'b2', projectId: 'phone', startMin: 700, durationMin: 120 }),
    ]
    const state = mkState({ projects: [ent, tv, phone], blocks })
    const family = familyUsageOf(state.projects, ent, blocks, [], { from: WEEK, to: '2026-01-11' })
    expect(family.planMin).toBe(480)
    // 10h family budget, 8h planned → 2h of room, whoever asks
    expect(budgetRoomMin(state, tv, '2026-01-07')).toBe(120)
    expect(budgetRoomMin(state, phone, '2026-01-07')).toBe(120)
  })

  it('a child’s own budget can tighten the room further', () => {
    const tvCapped = mkProject({
      id: 'tv',
      code: 'ent-tv',
      budget: { min: 60, max: 60, intent: 'target', period: { kind: 'week' }, spread: 'any' },
    })
    const blocks = [mkBlock({ id: 'b1', projectId: 'tv', durationMin: 360 })]
    const state = mkState({ projects: [ent, tvCapped, phone], blocks })
    // own 1h budget is fully planned; parent still has room — own wins
    expect(budgetRoomMin(state, tvCapped, '2026-01-07')).toBe(0)
  })

  it('maximize projects may grow toward their cap', () => {
    const grow = mkProject({
      id: 'grow',
      budget: { min: 120, max: 480, intent: 'maximize', period: { kind: 'week' }, spread: 'any' },
    })
    const blocks = [mkBlock({ id: 'b1', projectId: 'grow', durationMin: 120 })]
    const state = mkState({ projects: [grow], blocks })
    expect(budgetRoomMin(state, grow, '2026-01-07')).toBe(360)
  })
})

describe('budgetProgress', () => {
  it('aggregates the family for parents', () => {
    const ent = mkProject({
      id: 'ent',
      code: 'ent',
      budget: { min: 600, max: 600, intent: 'target', period: { kind: 'week' }, spread: 'any' },
    })
    const tv = mkProject({ id: 'tv', code: 'ent-tv' })
    const state = mkState({
      projects: [ent, tv],
      blocks: [mkBlock({ id: 'b1', projectId: 'tv', durationMin: 300 })],
    })
    const p = budgetProgress(state, ent, '2026-01-07')!
    expect(p.family).toBe(true)
    expect(p.planMin).toBe(300)
    expect(p.targetMin).toBe(600)
  })
})
