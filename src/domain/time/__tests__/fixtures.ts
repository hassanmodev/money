/** Shared builders for time-domain tests. All dates sit in the week of Mon 2026-01-05. */
import type {
  Block,
  Fragment,
  Project,
  Quality,
  TimeRule,
  TimeSettings,
  TimeState,
} from '../types'

/** Monday of the test week. */
export const WEEK = '2026-01-05' // Mon Jan 5 – Sun Jan 11, 2026
/** A "now" before the week starts, so the whole week is open for placement. */
export const NOW_BEFORE = { date: '2026-01-04', minute: 12 * 60 }

export const mkQuality = (partial: Partial<Quality> & { id: string }): Quality => ({
  name: partial.id,
  max: 100,
  baseline: [{ minute: 0, value: 100 }],
  ...partial,
})

export const mkProject = (partial: Partial<Project> & { id: string }): Project => ({
  name: partial.id,
  effects: [],
  requires: [],
  createdAt: '2025-12-20T09:00:00.000Z',
  ...partial,
})

export const mkBlock = (
  partial: Partial<Block> & { id: string; projectId: string },
): Block => ({
  layer: 'plan',
  date: WEEK,
  startMin: 600,
  durationMin: 60,
  origin: 'manual',
  createdAt: '2025-12-20T09:00:00.000Z',
  ...partial,
})

export const mkRule = (partial: Partial<TimeRule> & { id: string; projectId: string }): TimeRule => ({
  text: 'mon 9-10',
  skipped: [],
  overrides: {},
  createdAt: '2025-12-20T09:00:00.000Z',
  ...partial,
})

export const mkFragment = (
  partial: Partial<Fragment> & { id: string; projectId: string },
): Fragment => ({
  minutes: 20,
  at: `${WEEK}T10:00:00`,
  createdAt: '2025-12-20T09:00:00.000Z',
  ...partial,
})

export const mkSettings = (patch?: Partial<TimeSettings>): TimeSettings => ({
  weekStart: 0,
  primeHours: new Array(24).fill(0),
  ...patch,
})

export const mkState = (patch?: Partial<TimeState>): TimeState => ({
  projects: [],
  qualities: [],
  blocks: [],
  rules: [],
  fragments: [],
  settings: mkSettings(),
  ...patch,
})
