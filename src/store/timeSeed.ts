/**
 * Starter world for the time side — a believable week so the tab feels alive
 * on first run. Dates are relative to today so the grid always shows a week
 * in motion: rule-stamped sleep, a freelance gig, an entertainment family
 * fighting over one budget, and a couple of actuals already diverging.
 */
import {
  autoColor,
  DEFAULT_PRIME_HOURS,
  type Block,
  type Fragment,
  type Project,
  type Quality,
  type TimeRule,
  type TimeState,
} from '@/domain/time'
import type { ISODate } from '@/domain'
import { addDaysISO } from '@/lib/date'

const CREATED = '2026-06-22T09:00:00.000Z'

/** Blank slate — default settings only. */
export function createTimeEmpty(): TimeState {
  return {
    projects: [],
    qualities: [],
    blocks: [],
    rules: [],
    fragments: [],
    settings: { weekStart: 0, primeHours: [...DEFAULT_PRIME_HOURS] },
  }
}

/** A fresh copy of the starter world, dated around `today` (never share references). */
export function createTimeSeed(today: ISODate): TimeState {
  const yesterday = addDaysISO(today, -1)
  const dayBefore = addDaysISO(today, -2)

  const qualities: Quality[] = [
    {
      id: 'q-mental',
      name: 'Mental',
      max: 100,
      color: '#8aa0c8',
      // peaks late morning, wears down across the day, recovers overnight
      baseline: [
        { minute: 0, value: 70 },
        { minute: 420, value: 95 },
        { minute: 600, value: 100 },
        { minute: 1020, value: 65 },
        { minute: 1320, value: 35 },
        { minute: 1410, value: 45 },
      ],
      drift: 0.6,
      // when physical < 30, mental −40%
      dependsOn: [{ on: 'q-physical', below: 30, scale: 0.6 }],
    },
    {
      id: 'q-physical',
      name: 'Physical',
      max: 100,
      color: '#9eb87f',
      // rebuilt by sleep, spent by effort
      baseline: [
        { minute: 0, value: 55 },
        { minute: 360, value: 85 },
        { minute: 720, value: 90 },
        { minute: 1080, value: 70 },
        { minute: 1380, value: 50 },
      ],
      drift: 0.5,
    },
    {
      id: 'q-focus',
      name: 'Focus',
      max: 100,
      color: '#e0aa66',
      // the end of the chain: physical → mental → focus
      baseline: [
        { minute: 0, value: 50 },
        { minute: 540, value: 90 },
        { minute: 780, value: 85 },
        { minute: 1140, value: 45 },
        { minute: 1380, value: 30 },
      ],
      drift: 0.7,
      dependsOn: [{ on: 'q-mental', below: 40, scale: 0.5 }],
    },
  ]

  const projects: Project[] = [
    {
      id: 'p-sleep',
      name: 'Sleep',
      code: 'sleep',
      dim: true,
      effects: [
        { quality: 'q-physical', open: 0, rate: 9 },
        { quality: 'q-mental', open: 0, rate: 6 },
      ],
      requires: [],
      note: 'An ordinary project — rule-placed, single-session, strong give.',
      createdAt: CREATED,
    },
    {
      id: 'p-wrk',
      name: 'Work',
      code: 'wrk',
      // the family pie: children fight over 25h
      budget: { min: 25 * 60, max: 25 * 60, intent: 'target', period: { kind: 'week' }, spread: 'any' },
      effects: [],
      requires: [],
      createdAt: CREATED,
    },
    {
      id: 'p-wrk-acme',
      name: 'Acme gig',
      code: 'wrk-acme',
      budget: {
        min: 20 * 60,
        max: 20 * 60,
        intent: 'target',
        period: { kind: 'week' },
        spread: 'cluster',
        sessionMin: 120,
        sessionMax: 240,
      },
      effects: [
        { quality: 'q-mental', open: -3, rate: -5 },
        { quality: 'q-focus', open: -2, rate: -3 },
      ],
      requires: [{ quality: 'q-mental', min: 60 }],
      note: 'Deep work wants the morning.',
      createdAt: CREATED,
    },
    {
      id: 'p-ent',
      name: 'Entertainment',
      code: 'ent',
      budget: { min: 10 * 60, max: 10 * 60, intent: 'target', period: { kind: 'week' }, spread: 'any' },
      effects: [],
      requires: [],
      createdAt: CREATED,
    },
    {
      id: 'p-ent-screen',
      name: 'Screen',
      code: 'ent-screen',
      effects: [],
      requires: [],
      createdAt: CREATED,
    },
    {
      id: 'p-ent-screen-phone',
      name: 'Phone',
      code: 'ent-screen-phone',
      // a habit being fought: under the cap is the goal; over it is tracked
      budget: { min: 0, max: 4 * 60, intent: 'minimize', period: { kind: 'week' }, spread: 'any' },
      effects: [{ quality: 'q-mental', open: 0, rate: -3 }],
      requires: [],
      createdAt: CREATED,
    },
    {
      id: 'p-ent-screen-tv',
      name: 'TV',
      code: 'ent-screen-tv',
      effects: [{ quality: 'q-mental', open: 0, rate: 1 }],
      requires: [],
      createdAt: CREATED,
    },
    {
      id: 'p-ent-read',
      name: 'Reading',
      code: 'ent-read',
      // self-improve: starts at 3h, the sim proposes growth toward 5h
      budget: { min: 3 * 60, max: 5 * 60, intent: 'maximize', period: { kind: 'week' }, spread: 'scatter', sessionMin: 30, sessionMax: 90 },
      effects: [{ quality: 'q-mental', open: 0, rate: 2 }],
      requires: [{ quality: 'q-mental', min: 30 }],
      createdAt: CREATED,
    },
    {
      id: 'p-hlth-run',
      name: 'Running',
      code: 'hlth-run',
      budget: { min: 3 * 60, max: 3 * 60, intent: 'target', period: { kind: 'week' }, spread: 'scatter', sessionMin: 30, sessionMax: 90 },
      effects: [
        { quality: 'q-physical', open: -5, rate: -8 },
        { quality: 'q-mental', open: 0, rate: 3 },
      ],
      requires: [{ quality: 'q-physical', min: 50 }],
      createdAt: CREATED,
    },
    {
      id: 'p-home-chores',
      name: 'Chores',
      code: 'home-chores',
      budget: { min: 2 * 60, max: 2 * 60, intent: 'target', period: { kind: 'week' }, spread: 'any', sessionMax: 90 },
      effects: [{ quality: 'q-physical', open: 0, rate: -2 }],
      requires: [],
      createdAt: CREATED,
    },
    {
      id: 'p-fun',
      name: 'Fun',
      code: 'fun',
      // fr: after everything else claims its hours, fun takes a share of what's left
      fr: { share: 2, scope: 'global' },
      effects: [
        { quality: 'q-mental', open: 0, rate: 4 },
        { quality: 'q-physical', open: 0, rate: 1 },
      ],
      requires: [],
      createdAt: CREATED,
    },
  ]

  // stamp auto colors once so families stay stable as projects are added
  const colored: Project[] = []
  for (const p of projects) colored.push({ ...p, color: autoColor(colored, p) })

  const rules: TimeRule[] = [
    { id: 'r-sleep', projectId: 'p-sleep', text: 'daily 23-7', skipped: [], overrides: {}, createdAt: CREATED },
    { id: 'r-acme', projectId: 'p-wrk-acme', text: 'mon-fri 9-13', note: 'Deep work block', skipped: [], overrides: {}, createdAt: CREATED },
    { id: 'r-tv', projectId: 'p-ent-screen-tv', text: 'tue,thu 20-22', skipped: [], overrides: {}, createdAt: CREATED },
    { id: 'r-run', projectId: 'p-hlth-run', text: 'mon,wed,sat 7-8', skipped: [], overrides: {}, createdAt: CREATED },
  ]

  const blocks: Block[] = [
    // a couple of one-off plans for this week
    { id: 'b-read', projectId: 'p-ent-read', layer: 'plan', date: today, startMin: 21 * 60, durationMin: 60, note: 'Finish the novel', origin: 'manual', createdAt: CREATED },
    { id: 'b-chores', projectId: 'p-home-chores', layer: 'plan', date: addDaysISO(today, 2), startMin: 10 * 60, durationMin: 90, origin: 'manual', createdAt: CREATED },
    // actuals already diverging from the plan
    { id: 'a-acme-1', projectId: 'p-wrk-acme', layer: 'actual', date: yesterday, startMin: 9 * 60, durationMin: 210, note: 'Invoice feature', origin: 'manual', createdAt: CREATED },
    { id: 'a-tv-1', projectId: 'p-ent-screen-tv', layer: 'actual', date: dayBefore, startMin: 20 * 60, durationMin: 150, origin: 'manual', createdAt: CREATED },
  ]

  const fragments: Fragment[] = [
    // phone during work — the honest-concurrency demo
    { id: 'f-phone-1', projectId: 'p-ent-screen-phone', minutes: 25, at: `${yesterday}T10:30:00`, createdAt: CREATED },
    { id: 'f-phone-2', projectId: 'p-ent-screen-phone', minutes: 15, at: `${dayBefore}T21:10:00`, createdAt: CREATED },
  ]

  return {
    projects: colored,
    qualities,
    blocks,
    rules,
    fragments,
    settings: { weekStart: 0, primeHours: [...DEFAULT_PRIME_HOURS] },
  }
}
