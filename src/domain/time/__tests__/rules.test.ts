import { describe, expect, it } from 'vitest'
import { describeRule, expandRule, expandRules, parseRule } from '../rules'
import { mkProject, mkRule, WEEK } from './fixtures'

describe('parseRule', () => {
  it('parses weekday ranges with 24h times', () => {
    const r = parseRule('mon-fri 9-17')
    expect(r.ok && r.rule).toMatchObject({
      days: { kind: 'weekly', days: [0, 1, 2, 3, 4] },
      startMin: 540,
      durationMin: 480,
      crossesMidnight: false,
    })
  })

  it('reads "9–5" as 9:00–17:00, rolling the end forward', () => {
    const r = parseRule('mon–fri 9–5') // en-dashes
    expect(r.ok && r.rule.startMin).toBe(540)
    expect(r.ok && r.rule.durationMin).toBe(480)
  })

  it('reads "23–7" as an overnight block', () => {
    const r = parseRule('daily 23-7')
    expect(r.ok && r.rule).toMatchObject({ startMin: 1380, durationMin: 480, crossesMidnight: true })
  })

  it('parses ordinal monthly rules with explicit durations', () => {
    const r = parseRule('first sat 14:00 for 2h')
    expect(r.ok && r.rule).toMatchObject({
      days: { kind: 'ordinal', nth: 1, weekday: 5 },
      startMin: 840,
      durationMin: 120,
    })
  })

  it('parses last-weekday ordinals', () => {
    const r = parseRule('last fri 18:00')
    expect(r.ok && r.rule.days).toEqual({ kind: 'ordinal', nth: 5, weekday: 4 })
  })

  it('defaults a point in time to one hour', () => {
    const r = parseRule('tue 14:30')
    expect(r.ok && r.rule.durationMin).toBe(60)
  })

  it('understands am/pm, weekend, and weekday shorthands', () => {
    expect(parseRule('weekend 10am-12pm')).toMatchObject({
      ok: true,
      rule: { days: { kind: 'weekly', days: [5, 6] }, startMin: 600, durationMin: 120 },
    })
    expect(parseRule('weekdays 7-8')).toMatchObject({
      ok: true,
      rule: { days: { kind: 'weekly', days: [0, 1, 2, 3, 4] } },
    })
  })

  it('rejects gibberish with a helpful error', () => {
    expect(parseRule('blargh').ok).toBe(false)
    expect(parseRule('mon').ok).toBe(false)
    expect(parseRule('mon 25-26').ok).toBe(false)
    expect(parseRule('').ok).toBe(false)
  })
})

describe('expandRule', () => {
  it('expands weekly rules across a window', () => {
    const r = parseRule('mon-fri 9-17')
    const occ = expandRule(r.ok ? r.rule : (null as never), WEEK, '2026-01-11')
    expect(occ.map((o) => o.date)).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
    ])
    expect(occ[0].key).toBe('2026-01-05@540')
  })

  it('expands ordinal rules to the right calendar day', () => {
    const r = parseRule('first sat 14:00 for 2h')
    const occ = expandRule(r.ok ? r.rule : (null as never), '2026-01-01', '2026-02-28')
    expect(occ.map((o) => o.date)).toEqual(['2026-01-03', '2026-02-07'])
  })

  it('expands last-weekday ordinals', () => {
    const r = parseRule('last fri 18:00')
    const occ = expandRule(r.ok ? r.rule : (null as never), '2026-01-01', '2026-01-31')
    expect(occ.map((o) => o.date)).toEqual(['2026-01-30'])
  })
})

describe('expandRules', () => {
  const gym = mkProject({ id: 'gym' })

  it('stamps plan blocks carrying rule identity', () => {
    const blocks = expandRules([mkRule({ id: 'r1', projectId: 'gym', text: 'mon,wed 18-19' })], [gym], WEEK, '2026-01-11')
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({
      projectId: 'gym',
      layer: 'plan',
      origin: 'rule',
      ruleId: 'r1',
      ruleKey: '2026-01-05@1080',
      date: '2026-01-05',
      startMin: 1080,
      durationMin: 60,
    })
  })

  it('honours skipped occurrences', () => {
    const rule = mkRule({ id: 'r1', projectId: 'gym', text: 'mon,wed 18-19', skipped: ['2026-01-05@1080'] })
    const blocks = expandRules([rule], [gym], WEEK, '2026-01-11')
    expect(blocks.map((b) => b.date)).toEqual(['2026-01-07'])
  })

  it('applies overrides — the generated block stays draggable', () => {
    const rule = mkRule({
      id: 'r1',
      projectId: 'gym',
      text: 'mon,wed 18-19',
      overrides: { '2026-01-05@1080': { startMin: 1200, durationMin: 90, date: '2026-01-06' } },
    })
    const blocks = expandRules([rule], [gym], WEEK, '2026-01-11')
    const moved = blocks.find((b) => b.ruleKey === '2026-01-05@1080')!
    expect(moved).toMatchObject({ date: '2026-01-06', startMin: 1200, durationMin: 90 })
  })

  it('drops occurrences of archived projects and unparseable rules', () => {
    const archived = mkProject({ id: 'old', archived: true })
    const blocks = expandRules(
      [mkRule({ id: 'r1', projectId: 'old', text: 'mon 9-10' }), mkRule({ id: 'r2', projectId: 'gym', text: 'junk' })],
      [archived, gym],
      WEEK,
      '2026-01-11',
    )
    expect(blocks).toHaveLength(0)
  })

  it('drops rules whose project no longer exists — orphan stamps must not claim slots', () => {
    // leftover demo rule (tue,thu 20-22) after the TV project was removed
    const blocks = expandRules(
      [mkRule({ id: 'r-tv', projectId: 'p-ent-screen-tv', text: 'tue,thu 20-22' })],
      [gym],
      WEEK,
      '2026-01-11',
    )
    expect(blocks).toHaveLength(0)
  })
})

describe('describeRule', () => {
  it('renders a compact human reading', () => {
    const r = parseRule('mon-fri 9-17')
    expect(r.ok && describeRule(r.rule)).toBe('Mon–Fri · 9:00–17:00')
    const o = parseRule('first sat 14:00 for 2h')
    expect(o.ok && describeRule(o.rule)).toBe('First Sat · 14:00–16:00')
  })
})
