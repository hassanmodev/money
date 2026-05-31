import { growthFactor, type Effect, type EffectKind } from '@/domain'

interface EffectMeta {
  label: string
  dir: 'up' | 'down'
  /** tailwind text color token */
  tone: 'sage' | 'rust'
  blurb: string
}

export const EFFECT_META: Record<EffectKind, EffectMeta> = {
  interest: { label: 'interest', dir: 'up', tone: 'sage', blurb: 'Earns a steady return.' },
  appreciation: { label: 'appreciation', dir: 'up', tone: 'sage', blurb: 'Grows in value over time.' },
  inflation: { label: 'inflation', dir: 'down', tone: 'rust', blurb: 'Quietly erodes purchasing power.' },
  depreciation: { label: 'depreciation', dir: 'down', tone: 'rust', blurb: 'Loses value over time.' },
  fee: { label: 'fee', dir: 'down', tone: 'rust', blurb: 'A recurring drag on the balance.' },
}

export const toneClass = (tone: 'sage' | 'rust') =>
  tone === 'sage' ? 'text-sage' : 'text-rust'

/** What 1 unit becomes after `years` under a single effect (signed). */
export function effectFactor(effect: Effect, years: number): number {
  const signed = EFFECT_META[effect.kind].dir === 'up' ? effect.annualRate : -effect.annualRate
  return growthFactor(signed, effect.compounding, years)
}
