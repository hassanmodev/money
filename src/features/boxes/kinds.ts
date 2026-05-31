import type { BoxKind, EffectKind } from '@/domain'

export const BOX_KINDS: BoxKind[] = [
  'cash',
  'checking',
  'savings',
  'investment',
  'asset',
  'crypto',
  'custom',
]

/** A sensible default effect to seed when someone adds one to a box. */
export const DEFAULT_EFFECT_RATE: Record<EffectKind, number> = {
  interest: 0.035,
  appreciation: 0.07,
  inflation: 0.03,
  depreciation: 0.1,
  fee: 0.01,
}

export const EFFECT_KINDS: EffectKind[] = [
  'interest',
  'appreciation',
  'inflation',
  'depreciation',
  'fee',
]
