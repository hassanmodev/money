import { describe, expect, it } from 'vitest'
import { resolveFrShares, suggestWeek } from '../suggest'
import { mkProject, mkQuality, mkState, NOW_BEFORE, WEEK } from './fixtures'

const flatQualities = [mkQuality({ id: 'mental' })]

const budgeted = (
  id: string,
  budget: Partial<NonNullable<ReturnType<typeof mkProject>>['budget']> = {},
) =>
  mkProject({
    id,
    budget: {
      min: 120,
      max: 120,
      intent: 'target',
      period: { kind: 'week' },
      spread: 'any',
      ...budget,
    },
  })

const sum = (list: { projectId: string; durationMin: number }[], id: string) =>
  list.filter((s) => s.projectId === id).reduce((n, s) => n + s.durationMin, 0)

describe('suggestWeek — budget claims', () => {
  it('proposes sessions that cover the budget', () => {
    const gym = budgeted('gym', { sessionMax: 60 })
    const { suggestions, unfit } = suggestWeek(
      mkState({ qualities: flatQualities, projects: [gym] }),
      WEEK,
      NOW_BEFORE,
    )
    expect(sum(suggestions, 'gym')).toBe(120)
    expect(suggestions.filter((s) => s.projectId === 'gym')).toHaveLength(2)
    expect(unfit).toHaveLength(0)
  })

  it('honours session shaping — a budget spreads instead of cramming', () => {
    const gym = budgeted('gym', { sessionMin: 30, sessionMax: 30 })
    const { suggestions } = suggestWeek(
      mkState({ qualities: flatQualities, projects: [gym] }),
      WEEK,
      NOW_BEFORE,
    )
    const list = suggestions.filter((s) => s.projectId === 'gym')
    expect(list).toHaveLength(4)
    expect(list.every((s) => s.durationMin === 30)).toBe(true)
  })

  it('says so when it doesn’t fit — never silently crams', () => {
    const hog = budgeted('hog', { min: 200 * 60, max: 200 * 60, sessionMax: 480 })
    const { unfit } = suggestWeek(
      mkState({ qualities: flatQualities, projects: [hog] }),
      WEEK,
      NOW_BEFORE,
    )
    expect(unfit).toHaveLength(1)
    expect(unfit[0].missingMin).toBeGreaterThan(1000)
    expect(unfit[0].reasons.join(' ')).toMatch(/no open slots/)
  })

  it('never proposes placements for minimize projects — over the cap is tracked, not planned', () => {
    const doomscroll = budgeted('doomscroll', { min: 120, max: 480, intent: 'minimize' })
    const { suggestions } = suggestWeek(
      mkState({ qualities: flatQualities, projects: [doomscroll] }),
      WEEK,
      NOW_BEFORE,
    )
    expect(suggestions.filter((s) => s.projectId === 'doomscroll')).toHaveLength(0)
  })

  it('proposes nothing for a week that is entirely past', () => {
    const gym = budgeted('gym')
    const { suggestions, unfit } = suggestWeek(
      mkState({ qualities: flatQualities, projects: [gym] }),
      WEEK,
      { date: '2026-01-13', minute: 0 },
    )
    expect(suggestions).toHaveLength(0)
    expect(unfit).toHaveLength(0)
  })
})

describe('suggestWeek — elastic maximize', () => {
  it('starts at the low end and proposes growth toward the cap', () => {
    const grow = budgeted('grow', { min: 120, max: 360, intent: 'maximize', sessionMax: 60 })
    const { suggestions } = suggestWeek(
      mkState({ qualities: flatQualities, projects: [grow] }),
      WEEK,
      NOW_BEFORE,
    )
    const list = suggestions.filter((s) => s.projectId === 'grow')
    expect(list.filter((s) => !s.elastic)).toHaveLength(2) // the committed 2h
    expect(list.filter((s) => s.elastic)).toHaveLength(4) // growth proposals to the 6h cap
    expect(sum(suggestions, 'grow')).toBe(360)
  })
})

describe('resolveFrShares', () => {
  it('distributes CSS-style by share weight', () => {
    const a = mkProject({ id: 'a', fr: { share: 1, scope: 'global' } })
    const b = mkProject({ id: 'b', fr: { share: 3, scope: 'global' } })
    const allocs = resolveFrShares([a, b], 1000)
    expect(allocs.get('a')).toBeCloseTo(250, 5)
    expect(allocs.get('b')).toBeCloseTo(750, 5)
  })

  it('siblings split the direct parent’s share', () => {
    const ent = mkProject({ id: 'ent', code: 'ent', fr: { share: 2, scope: 'global' } })
    const tv = mkProject({ id: 'tv', code: 'ent-tv', fr: { share: 1, scope: 'parent' } })
    const phone = mkProject({ id: 'phone', code: 'ent-phone', fr: { share: 3, scope: 'parent' } })
    const other = mkProject({ id: 'other', fr: { share: 2, scope: 'global' } })
    const allocs = resolveFrShares([ent, tv, phone, other], 1000)
    // ent takes 500 of the pool, and its children split that pie 1:3
    expect(allocs.get('ent')).toBeUndefined()
    expect(allocs.get('tv')).toBeCloseTo(125, 5)
    expect(allocs.get('phone')).toBeCloseTo(375, 5)
    expect(allocs.get('other')).toBeCloseTo(500, 5)
  })

  it('family scope splits the top-level family’s share', () => {
    const ent = mkProject({ id: 'ent', code: 'ent', fr: { share: 1, scope: 'global' } })
    const screen = mkProject({ id: 'screen', code: 'ent-screen' })
    const phone = mkProject({ id: 'phone', code: 'ent-screen-phone', fr: { share: 1, scope: 'family' } })
    const read = mkProject({ id: 'read', code: 'ent-read', fr: { share: 3, scope: 'family' } })
    const allocs = resolveFrShares([ent, screen, phone, read], 800)
    expect(allocs.get('phone')).toBeCloseTo(200, 5)
    expect(allocs.get('read')).toBeCloseTo(600, 5)
  })
})

describe('suggestWeek — fr placement', () => {
  it('places fr allocations after budgeted claims resolve', () => {
    const a = mkProject({ id: 'a', fr: { share: 1, scope: 'global' } })
    const b = mkProject({ id: 'b', fr: { share: 3, scope: 'global' } })
    const { suggestions } = suggestWeek(
      mkState({ qualities: flatQualities, projects: [a, b] }),
      WEEK,
      NOW_BEFORE,
    )
    const aMin = sum(suggestions, 'a')
    const bMin = sum(suggestions, 'b')
    expect(aMin).toBeGreaterThan(2000)
    expect(bMin / aMin).toBeCloseTo(3, 1)
  })
})
