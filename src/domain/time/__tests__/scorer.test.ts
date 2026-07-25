import { describe, expect, it } from 'vitest'
import { buildScoreContext, rankProjects, scorePlacement } from '../scorer'
import { mkBlock, mkProject, mkQuality, mkSettings, mkState, NOW_BEFORE, WEEK } from './fixtures'

const MONDAY_8AM = { date: '2026-01-05', minute: 480 }
const mentalDeclining = mkQuality({
  id: 'mental',
  drift: 2,
  baseline: [
    { minute: 0, value: 100 },
    { minute: 600, value: 100 },
    { minute: 1320, value: 20 },
  ],
})

describe('scorePlacement — hard constraints', () => {
  const state = mkState({ qualities: [mkQuality({ id: 'mental' })] })
  const ctx = buildScoreContext(state, WEEK, MONDAY_8AM)

  it('scores the past as zero', () => {
    const s = scorePlacement(mkProject({ id: 'x' }), 0, 60, ctx)
    expect(s.value).toBe(0)
    expect(s.reasons).toContain('in the past')
  })

  it('scores occupied slots as zero', () => {
    const busy = mkState({
      qualities: [mkQuality({ id: 'mental' })],
      projects: [mkProject({ id: 'a' })],
      blocks: [mkBlock({ id: 'b1', projectId: 'a', startMin: 600, durationMin: 60 })],
    })
    const busyCtx = buildScoreContext(busy, WEEK, MONDAY_8AM)
    const s = scorePlacement(mkProject({ id: 'x' }), 60, 60, busyCtx)
    expect(s.value).toBe(0)
    expect(s.reasons).toContain('slot already taken')
  })

  it('scores an open future slot above zero', () => {
    const s = scorePlacement(mkProject({ id: 'x' }), 60, 60, ctx)
    expect(s.value).toBeGreaterThan(0)
  })
})

describe('scorePlacement — quality requirements', () => {
  const state = mkState({ qualities: [mentalDeclining] })
  const ctx = buildScoreContext(state, WEEK, NOW_BEFORE)
  const deepWork = mkProject({ id: 'deep', requires: [{ quality: 'mental', min: 60 }] })

  it('prefers slots where requirements are met', () => {
    const morning = scorePlacement(deepWork, 60, 60, ctx) // Mon 10:00
    const evening = scorePlacement(deepWork, 120, 60, ctx) // Mon 20:00
    expect(morning.value).toBeGreaterThan(evening.value)
    expect(evening.reasons.join(' ')).toMatch(/mental/)
  })

  it('rewards least waste — the least-demanding project takes the lowest acceptable slot', () => {
    const undemanding = mkProject({ id: 'easy', requires: [{ quality: 'mental', min: 20 }] })
    const needy = mkProject({ id: 'needy', requires: [{ quality: 'mental', min: 90 }] })
    const ranked = rankProjects([undemanding, needy], 54, 60, ctx) // Mon 9:00, quality ≈ full
    expect(ranked[0].project.id).toBe('needy')
  })
})

describe('scorePlacement — prime hours', () => {
  it('charges filler projects for eating living hours', () => {
    const primeHours = new Array(24).fill(0)
    primeHours[19] = 1 // 7pm is prime personal time
    const state = mkState({
      qualities: [mkQuality({ id: 'mental' })],
      settings: mkSettings({ primeHours }),
    })
    const ctx = buildScoreContext(state, WEEK, NOW_BEFORE)
    const filler = mkProject({ id: 'filler' })
    const midday = scorePlacement(filler, 60, 60, ctx) // 10:00
    const prime = scorePlacement(filler, 114, 60, ctx) // 19:00
    expect(midday.value).toBeGreaterThan(prime.value)
    expect(prime.reasons.join(' ')).toMatch(/prime/)
  })
})

describe('scorePlacement — budgets', () => {
  it('reports when the budget is used up', () => {
    const p = mkProject({
      id: 'gym',
      budget: { min: 60, max: 60, intent: 'target', period: { kind: 'week' }, spread: 'any' },
    })
    const state = mkState({
      qualities: [mkQuality({ id: 'mental' })],
      projects: [p],
      blocks: [mkBlock({ id: 'b1', projectId: 'gym', startMin: 600, durationMin: 60 })],
    })
    const ctx = buildScoreContext(state, WEEK, NOW_BEFORE)
    const s = scorePlacement(p, 70, 60, ctx)
    expect(s.reasons.join(' ')).toMatch(/used up/)
  })
})

describe('scorePlacement — session shape', () => {
  it('penalizes sessions that break the shaping', () => {
    const p = mkProject({
      id: 'run',
      budget: { min: 180, max: 180, intent: 'target', period: { kind: 'week' }, spread: 'any', sessionMin: 60 },
    })
    const state = mkState({ qualities: [mkQuality({ id: 'mental' })], projects: [p] })
    const ctx = buildScoreContext(state, WEEK, NOW_BEFORE)
    const s = scorePlacement(p, 60, 20, ctx)
    expect(s.reasons.join(' ')).toMatch(/session minimum/)
  })
})
