import { describe, expect, it } from 'vitest'
import { plannedBuysFromPlan } from '../selectors'
import type { Goal, ScheduledPlan } from '@/domain'

const goal = (id: string): Goal => ({
  id,
  name: id,
  cost: 100,
  value: { type: 'flat', rating: 50 },
  status: 'open',
  color: '#9eb87f',
  createdAt: '2026-01-01T00:00:00Z',
})

const plan = (dates: Record<string, string>): ScheduledPlan => ({
  scheduled: Object.entries(dates).map(([id, achieveDate]) => ({
    goal: goal(id),
    cost: id === 'upgrade' ? 45 : 100,
    achieveDate,
    happiness: 1,
    density: 1,
  })),
  dropped: [],
  happiness: 0,
  spend: 0,
})

describe('plannedBuysFromPlan', () => {
  it('includes buys scheduled for today as well as future buys', () => {
    const buys = plannedBuysFromPlan(
      plan({
        past: '2025-12-01',
        today: '2026-01-01',
        future: '2026-02-01',
        upgrade: '2026-03-01',
      }),
      '2026-01-01',
    )

    expect(buys.map((b) => `${b.id}@${b.date}`)).toEqual([
      'today@2026-01-01',
      'future@2026-02-01',
      'upgrade@2026-03-01',
    ])
    expect(buys.find((b) => b.id === 'upgrade')?.cost).toBe(45)
  })
})
