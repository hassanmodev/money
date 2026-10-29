import { describe, expect, it } from 'vitest'
import { collapsedBoxCount } from './collapseBoxes'

describe('collapsed box cutoff', () => {
  it('keeps two rows when there is no pronounced drop', () => {
    expect(collapsedBoxCount([100, 90, 80, 70, 60, 50, 40, 30], 3)).toBe(6)
  })
  it('stops at an elbow between one and two rows', () => {
    expect(collapsedBoxCount([1000, 950, 900, 850, 20, 18, 16, 14], 3)).toBe(4)
  })
  it('allows one extra item to keep a value cluster together', () => {
    expect(collapsedBoxCount([100, 99, 98, 97, 96, 2, 1], 2)).toBe(5)
  })
  it('adapts to a single column and keeps short collections intact', () => {
    expect(collapsedBoxCount([100, 90, 80, 70], 1)).toBe(2)
    expect(collapsedBoxCount([100, 90], 3)).toBe(2)
    expect(collapsedBoxCount([], 2)).toBe(0)
  })
  it('collapses zero balances without dividing by zero', () => {
    expect(collapsedBoxCount([0, 0, 0, 0, 0, 0], 2)).toBe(4)
    expect(collapsedBoxCount([100, 90, 80, 0, 0, 0], 2)).toBe(3)
  })
})
