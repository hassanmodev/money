import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTimeTravel, viewDate } from '../time'

describe('time travel calendar following', () => {
  afterEach(() => {
    vi.useRealTimers()
    useTimeTravel.getState().reset()
  })

  it('moves with the real day until the user deliberately time-travels', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 11, 12))
    useTimeTravel.getState().reset()

    expect(viewDate()).toBe('2026-07-11')

    vi.setSystemTime(new Date(2026, 6, 12, 12))
    expect(viewDate()).toBe('2026-07-12')

    useTimeTravel.getState().setViewDate('2027-01-01')
    vi.setSystemTime(new Date(2026, 6, 13, 12))
    expect(viewDate()).toBe('2027-01-01')
  })
})
