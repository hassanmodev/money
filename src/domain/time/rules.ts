/**
 * Typed rules — recurring patterns as small text, not dragged blocks.
 * `mon–fri 9–17` · `first sat 14:00 for 2h` · `daily 23–7`.
 *
 * A rule expands to ordinary blocks for any requested week. Generated blocks
 * stay individually deletable (`skipped`) and draggable (`overrides`) — the
 * rule is just the fast way to stamp repetition.
 */
import { addDays, format, parseISO } from 'date-fns'
import { DAY_MIN, STEP_MIN, type Block, type ISODate, type Project, type TimeRule } from './types'

export type RuleDays =
  /** weekly cadence on weekdays 0=Mon..6=Sun */
  | { kind: 'weekly'; days: number[] }
  /** monthly: the nth (1..4) or last (5) weekday of the month */
  | { kind: 'ordinal'; nth: number; weekday: number }

export interface ParsedRule {
  days: RuleDays
  /** minutes from midnight, multiple of STEP_MIN */
  startMin: number
  durationMin: number
  /** the block runs past midnight into the next day */
  crossesMidnight: boolean
}

export type ParseResult = { ok: true; rule: ParsedRule } | { ok: false; error: string }

const DAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

const ORDINALS: Record<string, number> = {
  first: 1,
  '1st': 1,
  second: 2,
  '2nd': 2,
  third: 3,
  '3rd': 3,
  fourth: 4,
  '4th': 4,
  fifth: 5,
  '5th': 5,
  last: 5,
}

const snap = (min: number): number => Math.max(STEP_MIN, Math.round(min / STEP_MIN) * STEP_MIN)

const dayIndex = (token: string): number =>
  DAY_NAMES.findIndex((d) => token.startsWith(d))

/** e.g. "mon-fri" | "mon,wed" | "daily" | "weekend" | "first sat" */
function parseDays(spec: string): RuleDays | undefined {
  const s = spec.trim().toLowerCase()
  if (!s) return undefined
  if (s === 'daily' || s === 'everyday' || s === 'every day') {
    return { kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6] }
  }
  if (s === 'weekday' || s === 'weekdays') return { kind: 'weekly', days: [0, 1, 2, 3, 4] }
  if (s === 'weekend' || s === 'weekends') return { kind: 'weekly', days: [5, 6] }

  const words = s.split(/[\s,]+/).filter(Boolean)
  if (words.length === 2 && ORDINALS[words[0]] !== undefined) {
    const wd = dayIndex(words[1])
    if (wd >= 0) return { kind: 'ordinal', nth: ORDINALS[words[0]], weekday: wd }
    return undefined
  }

  const days = new Set<number>()
  for (const w of words) {
    const range = w.split('-')
    if (range.length === 2) {
      const a = dayIndex(range[0])
      const b = dayIndex(range[1])
      if (a < 0 || b < 0) return undefined
      for (let i = a; i !== (b + 1) % 7; i = (i + 1) % 7) days.add(i)
    } else {
      const d = dayIndex(w)
      if (d < 0) return undefined
      days.add(d)
    }
  }
  return days.size ? { kind: 'weekly', days: [...days].sort((a, b) => a - b) } : undefined
}

/** "9" · "9:30" · "5pm" → minutes from midnight (24h unless am/pm says otherwise) */
function parseTime(token: string): number | undefined {
  const m = /^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?$/.exec(token.trim())
  if (!m) return undefined
  let h = Number(m[1])
  const min = Number(m[2] ?? 0)
  const ap = m[3]
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  if (h > 23) return undefined
  return h * 60 + min
}

/** "for 2h" · "for 90m" · "for 1.5 hours" → minutes */
function parseDuration(spec: string): number | undefined {
  const m = /^for\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minutes)$/.exec(spec.trim())
  if (!m) return undefined
  const n = Number(m[1])
  return /^h/.test(m[2]) ? n * 60 : n
}

/**
 * Parse a typed rule. Grammar: `<days> <time[-time]> [for <duration>]`.
 * A range whose end is not after its start rolls forward in 12h steps —
 * that's how `9–5` means 9:00–17:00 and `23–7` means 23:00–07:00.
 */
export function parseRule(text: string): ParseResult {
  const normalized = text.toLowerCase().replace(/[–—‑]/g, '-').replace(/\s+/g, ' ').trim()
  if (!normalized) return { ok: false, error: 'empty rule' }

  // split off an optional trailing "for …"
  let body = normalized
  let duration: number | undefined
  const forIdx = body.search(/\bfor\b/)
  if (forIdx >= 0) {
    duration = parseDuration(body.slice(forIdx))
    if (duration === undefined) return { ok: false, error: 'bad duration — try "for 2h" or "for 90m"' }
    body = body.slice(0, forIdx).trim()
  }

  // the time spec starts at the first word containing a digit
  const words = body.split(' ')
  const tIdx = words.findIndex((w) => /\d/.test(w))
  if (tIdx < 0) return { ok: false, error: 'no time — add something like "9-17" or "14:00 for 2h"' }
  const daysSpec = words.slice(0, tIdx).join(' ')
  const timeSpec = words.slice(tIdx).join(' ')

  const days = parseDays(daysSpec)
  if (!days) return { ok: false, error: `bad days "${daysSpec}" — try "mon-fri", "weekend", "first sat"` }

  const range = timeSpec.split('-').map((w) => w.trim())
  if (range.length > 2) return { ok: false, error: 'bad time range' }
  const start = parseTime(range[0])
  if (start === undefined) return { ok: false, error: `bad time "${range[0]}"` }

  let durationMin: number
  if (range.length === 2) {
    const end = parseTime(range[1])
    if (end === undefined) return { ok: false, error: `bad time "${range[1]}"` }
    let e = end
    while (e <= start && e < start + DAY_MIN) e += 12 * 60
    durationMin = e - start
  } else {
    durationMin = duration ?? 60
  }
  if (duration !== undefined && range.length === 2 && duration !== durationMin) {
    return { ok: false, error: 'give either an end time or "for …", not both' }
  }

  const startMin = snap(start) % DAY_MIN
  const durMin = snap(durationMin)
  return {
    ok: true,
    rule: { days, startMin, durationMin: durMin, crossesMidnight: startMin + durMin > DAY_MIN },
  }
}

export interface RuleOccurrence {
  date: ISODate
  startMin: number
  durationMin: number
  /** stable identity of the generated instance: 'YYYY-MM-DD@startMin' */
  key: string
}

export const occurrenceKey = (date: ISODate, startMin: number): string => `${date}@${startMin}`

/** The nth (1..4) or last (5) weekday of a month. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date | null {
  const jsDay = (weekday + 1) % 7 // Date.getDay: 0=Sun
  if (nth === 5) {
    for (let d = new Date(year, month + 1, 0); ; d = addDays(d, -1)) {
      if (d.getDay() === jsDay) return d
    }
  }
  let found: Date | null = null
  for (let d = new Date(year, month, 1), n = 0; d.getMonth() === month; d = addDays(d, 1)) {
    if (d.getDay() === jsDay && ++n === nth) {
      found = d
      break
    }
  }
  return found
}

const toISO = (d: Date): ISODate => format(d, 'yyyy-MM-dd')

/** All occurrences of a parsed rule inside [from, to] inclusive. */
export function expandRule(rule: ParsedRule, from: ISODate, to: ISODate): RuleOccurrence[] {
  const out: RuleOccurrence[] = []
  const fromD = parseISO(from)
  const toD = parseISO(to)

  if (rule.days.kind === 'weekly') {
    const set = new Set(rule.days.days)
    for (let d = fromD; d <= toD; d = addDays(d, 1)) {
      const weekday = (d.getDay() + 6) % 7 // Mon=0
      if (set.has(weekday)) {
        const date = toISO(d)
        out.push({ date, startMin: rule.startMin, durationMin: rule.durationMin, key: occurrenceKey(date, rule.startMin) })
      }
    }
    return out
  }

  const { nth, weekday } = rule.days
  for (let y = fromD.getFullYear(), m = fromD.getMonth(); ; ) {
    const hit = nthWeekdayOfMonth(y, m, weekday, nth)
    if (hit && hit >= fromD && hit <= toD) {
      const date = toISO(hit)
      out.push({ date, startMin: rule.startMin, durationMin: rule.durationMin, key: occurrenceKey(date, rule.startMin) })
    }
    if (y > toD.getFullYear() || (y === toD.getFullYear() && m >= toD.getMonth())) break
    if (++m === 12) {
      m = 0
      y++
    }
  }
  return out
}

/**
 * Expand stored rules into plan blocks for a window, honouring per-occurrence
 * skips and overrides. Occurrences of archived projects are dropped.
 */
export function expandRules(
  rules: TimeRule[],
  projects: Project[],
  from: ISODate,
  to: ISODate,
): Block[] {
  const archived = new Map(projects.map((p) => [p.id, !!p.archived]))
  const out: Block[] = []
  for (const rule of rules) {
    if (archived.get(rule.projectId)) continue
    const parsed = parseRule(rule.text)
    if (!parsed.ok) continue
    for (const occ of expandRule(parsed.rule, from, to)) {
      if (rule.skipped.includes(occ.key)) continue
      const o = rule.overrides[occ.key]
      out.push({
        id: `rule:${rule.id}:${occ.key}`,
        projectId: rule.projectId,
        layer: 'plan',
        date: o?.date ?? occ.date,
        startMin: o?.startMin ?? occ.startMin,
        durationMin: o?.durationMin ?? occ.durationMin,
        note: o?.note ?? rule.note,
        origin: 'rule',
        ruleId: rule.id,
        ruleKey: occ.key,
        createdAt: rule.createdAt,
      })
    }
  }
  return out
}

/** A human reading of a parsed rule — "Mon–Fri · 9:00–17:00" · "First Sat · 14:00–16:00". */
export function describeRule(rule: ParsedRule): string {
  const dayName = (d: number) => DAY_NAMES[d][0].toUpperCase() + DAY_NAMES[d].slice(1)
  const daysLabel =
    rule.days.kind === 'weekly'
      ? describeDaySet(rule.days.days, dayName)
      : `${['', 'First', 'Second', 'Third', 'Fourth', 'Last'][rule.days.nth]} ${dayName(rule.days.weekday)}`
  const fmt = (min: number) => {
    const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
  }
  const end = rule.startMin + rule.durationMin
  return `${daysLabel} · ${fmt(rule.startMin)}–${fmt(end)}${rule.crossesMidnight ? ' (+1d)' : ''}`
}

function describeDaySet(days: number[], dayName: (d: number) => string): string {
  if (days.length === 7) return 'Daily'
  const contiguous = days.every((d, i) => i === 0 || d === days[i - 1] + 1)
  if (contiguous && days.length > 1) return `${dayName(days[0])}–${dayName(days[days.length - 1])}`
  return days.map(dayName).join(', ')
}
