import { describe, expect, it } from 'vitest'
import { autoColor, hexToHsl, TIME_SWATCHES } from '../colors'
import { mkProject } from './fixtures'

describe('autoColor', () => {
  it('is stable for the same input', () => {
    expect(autoColor([], { name: 'Gym' })).toBe(autoColor([], { name: 'Gym' }))
  })

  it('assigns palette colors to codeless projects', () => {
    expect(TIME_SWATCHES).toContain(autoColor([], { name: 'Gym' }))
  })

  it('shades sub-projects off the parent hue, distinguishably', () => {
    const ent = mkProject({ id: 'ent', code: 'ent', color: '#8aa0c8' })
    const kids = [
      mkProject({ id: 'a', code: 'ent-screen-phone' }),
      mkProject({ id: 'b', code: 'ent-screen-tv' }),
    ]
    const a = autoColor([ent, ...kids], kids[0])
    const b = autoColor([ent, ...kids], kids[1])
    expect(a).not.toBe(b)
    // same family hue as the parent
    expect(Math.abs(hexToHsl(a).h - hexToHsl('#8aa0c8').h)).toBeLessThan(3)
  })
})
