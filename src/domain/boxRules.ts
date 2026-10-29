import type { Box, Effect } from './types'

/** Physical assets change value through appreciation or depreciation. */
export function boxEffects(kind: Box['kind'], effects: Effect[]): Effect[] {
  return kind === 'asset'
    ? effects.filter((effect) => effect.kind === 'appreciation' || effect.kind === 'depreciation')
    : effects
}
