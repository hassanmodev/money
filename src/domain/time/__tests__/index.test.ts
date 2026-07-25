import { describe, expect, it } from 'vitest'
import { computeWeek } from '../index'
import { mkBlock, mkFragment, mkProject, mkQuality, mkRule, mkState, NOW_BEFORE, WEEK } from './fixtures'

describe('computeWeek', () => {
  it('assembles everything the tab renders for a week', () => {
    const sleep = mkProject({ id: 'sleep', dim: true })
    const work = mkProject({
      id: 'work',
      budget: { min: 600, max: 600, intent: 'target', period: { kind: 'week' }, spread: 'any' },
      effects: [{ quality: 'mental', open: -2, rate: -4 }],
      requires: [{ quality: 'mental', min: 40 }],
    })
    const state = mkState({
      qualities: [mkQuality({ id: 'mental' })],
      projects: [sleep, work],
      rules: [mkRule({ id: 'r1', projectId: 'sleep', text: 'daily 23-7' })],
      blocks: [
        mkBlock({ id: 'p1', projectId: 'work', startMin: 540, durationMin: 240 }),
        mkBlock({ id: 'a1', projectId: 'work', layer: 'actual', startMin: 540, durationMin: 200 }),
      ],
      fragments: [mkFragment({ id: 'f1', projectId: 'work', at: '2026-01-06T12:00:00' })],
    })

    const data = computeWeek(state, WEEK, NOW_BEFORE)

    expect(data.days).toHaveLength(7)
    expect(data.days[0]).toBe(WEEK)
    // 7 rule-stamped sleep blocks + the one manual work block
    expect(data.planBlocks.filter((b) => b.origin === 'rule')).toHaveLength(7)
    expect(data.planBlocks.filter((b) => b.origin === 'manual')).toHaveLength(1)
    expect(data.actualBlocks).toHaveLength(1)
    expect(data.fragments).toHaveLength(1)
    expect(data.simPlan.steps).toHaveLength(1008)
    expect(data.simActual.steps).toHaveLength(1008)
    expect(data.progress.get('work')?.targetMin).toBe(600)
    // the work budget gets suggestions on top of what is already placed
    expect(data.suggestions.length).toBeGreaterThan(0)
    expect(data.scoreCtx.firstOpenSlot).toBe(0)
  })
})
