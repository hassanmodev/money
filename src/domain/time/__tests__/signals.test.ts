import { describe, expect, it } from 'vitest'
import { allSignals, hogSignals, neglectSignals, qualityWarnings } from '../signals'
import { simulate } from '../simulation'
import { mkBlock, mkFragment, mkProject, mkQuality, mkState, WEEK } from './fixtures'

describe('hogSignals', () => {
  it('flags consistent actual-vs-plan overshoot', () => {
    const work = mkProject({ id: 'work' })
    const state = mkState({
      projects: [work],
      blocks: [
        mkBlock({ id: 'p1', projectId: 'work', layer: 'plan', durationMin: 120 }),
        mkBlock({ id: 'a1', projectId: 'work', layer: 'actual', durationMin: 240 }),
      ],
    })
    const signals = hogSignals(state, WEEK)
    expect(signals).toHaveLength(1)
    expect(signals[0].message).toMatch(/work is running 2\.0× its plan/)
    expect(signals[0].severity).toBe('warn')
  })

  it('flags overflow into time planned for others', () => {
    const work = mkProject({ id: 'work' })
    const evening = mkProject({ id: 'evening' })
    const state = mkState({
      projects: [work, evening],
      blocks: [
        mkBlock({ id: 'p1', projectId: 'work', layer: 'plan', startMin: 540, durationMin: 60 }),
        mkBlock({ id: 'p2', projectId: 'evening', layer: 'plan', startMin: 1140, durationMin: 60 }),
        mkBlock({ id: 'a1', projectId: 'work', layer: 'actual', startMin: 1080, durationMin: 120 }),
      ],
    })
    const signals = hogSignals(state, WEEK)
    const hog = signals.find((s) => s.projectId === 'work')!
    expect(hog.message).toMatch(/spilled into 1 block planned for others/)
  })

  it('stays quiet when actuals track the plan', () => {
    const work = mkProject({ id: 'work' })
    const state = mkState({
      projects: [work],
      blocks: [
        mkBlock({ id: 'p1', projectId: 'work', layer: 'plan', durationMin: 120 }),
        mkBlock({ id: 'a1', projectId: 'work', layer: 'actual', durationMin: 120 }),
      ],
    })
    expect(hogSignals(state, WEEK)).toHaveLength(0)
  })
})

describe('neglectSignals', () => {
  const budget = { min: 60, max: 60, intent: 'target' as const, period: { kind: 'week' as const }, spread: 'any' as const }

  it('surfaces projects never touched since creation', () => {
    const chores = mkProject({ id: 'chores', budget, createdAt: '2025-12-20T09:00:00.000Z' })
    const signals = neglectSignals(mkState({ projects: [chores] }), '2026-01-05')
    expect(signals).toHaveLength(1)
    expect(signals[0].message).toBe('chores: never touched since you added it')
  })

  it('counts days since the last actual', () => {
    const run = mkProject({ id: 'run', budget })
    const state = mkState({
      projects: [run],
      blocks: [mkBlock({ id: 'a1', projectId: 'run', layer: 'actual', date: '2025-12-26' })],
    })
    const signals = neglectSignals(state, '2026-01-05')
    expect(signals[0].message).toBe('run: untouched for 10 days')
  })

  it('ignores projects with recent actuals, budgets, or fragments', () => {
    const run = mkProject({ id: 'run', budget })
    const state = mkState({
      projects: [run],
      fragments: [mkFragment({ id: 'f1', projectId: 'run', at: '2026-01-04T10:00:00' })],
    })
    expect(neglectSignals(state, '2026-01-05')).toHaveLength(0)
  })
})

describe('qualityWarnings', () => {
  it('warns when a projected quality crashes mid-week', () => {
    const mental = mkQuality({ id: 'mental', baseline: [{ minute: 0, value: 0 }], drift: 1 })
    const sim = simulate({ qualities: [mental], blocks: [], weekStart: WEEK })
    const warnings = qualityWarnings(sim, [mental])
    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toMatch(/^mental hits \d+ by Monday$/)
    expect(warnings[0].severity).toBe('warn')
  })

  it('stays quiet when qualities hold', () => {
    const mental = mkQuality({ id: 'mental' }) // flat 100
    const sim = simulate({ qualities: [mental], blocks: [], weekStart: WEEK })
    expect(qualityWarnings(sim, [mental])).toHaveLength(0)
  })
})

describe('allSignals', () => {
  it('orders warnings before info', () => {
    const mental = mkQuality({ id: 'mental', baseline: [{ minute: 0, value: 0 }], drift: 1 })
    const chores = mkProject({
      id: 'chores',
      budget: { min: 60, max: 60, intent: 'target', period: { kind: 'week' }, spread: 'any' },
      createdAt: '2025-12-20T09:00:00.000Z',
    })
    const state = mkState({ qualities: [mental], projects: [chores] })
    const sim = simulate({ qualities: [mental], blocks: [], weekStart: WEEK })
    const signals = allSignals(state, WEEK, sim, '2026-01-05')
    expect(signals.length).toBeGreaterThanOrEqual(2)
    expect(signals[0].severity).toBe('warn')
  })
})
