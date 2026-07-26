/**
 * Bulk-create parsing — the compact "create many subs under a parent" format.
 * Pure and import-style: parse text → a plan of projects to create, skips,
 * and per-line errors. Nothing here touches the store.
 *
 * ```
 * # comments start with #, blank lines ignored
 * fun-phone Phone: soc Social "x,fb", chess, vid Video "youtube,tiktok"
 * fun-watch Watch: mov, ser
 * ent: 1h, phone-yt, phone-tik 2h    # line default 1h/day; phone-tik overrides
 * ```
 *
 * An item is `[code] [Name words…] [amount] ["note"]`:
 * - the first word is always the code path (dashes nest deeper); any
 *   remaining words are its display name — case never changes this
 * - a `"quoted"` string is the note — commas inside are safe
 * - a quoted string *alone* is a spaced name with no explicit code:
 *   `"video games"` → code `video-games`
 * - an amount (`1h`, `30m`, `2h/w`, `2fr`) anywhere in the item is its claim;
 *   leading bare amounts set the line default; bare items get `1fr`
 *
 * The line header takes the same `[code] [Name] ["note"]` shape. Every full
 * code keeps the selected parent's code as prefix. Missing intermediate codes
 * are planned as plain groups before their children. Existing codes are
 * skipped, never updated.
 */
import type { Budget, BudgetPeriod, FrShare, Project } from './types'

export interface BulkCreate {
  code: string
  name: string
  note?: string
  budget?: Budget
  fr?: FrShare
  /** auto-created as a missing intermediate — a plain group, no claim */
  group?: boolean
}

export interface BulkSkip {
  code: string
  line: number
  reason: string
}

export interface BulkError {
  line: number
  message: string
}

export interface BulkPlan {
  /** in dependency order — intermediates before their children */
  creates: BulkCreate[]
  skips: BulkSkip[]
  errors: BulkError[]
}

interface Claim {
  budget?: Budget
  fr?: FrShare
}

const DEFAULT_CLAIM: Claim = { fr: { share: 1, scope: 'parent' } }

const PERIODS: Record<string, BudgetPeriod> = {
  d: { kind: 'day' },
  w: { kind: 'week' },
  mo: { kind: 'month' },
}

const CODE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** 10-minute snap, same resolution as everything else. */
const snap = (min: number) => Math.round(min / 10) * 10

/** '2h' · '30m' · '1.5h/w' · 'fr' · '2fr' → a claim, or null when it isn't one. */
const parseClaim = (tok: string): Claim | null => {
  const fr = tok.match(/^(\d+(?:\.\d+)?)?fr$/)
  if (fr) return { fr: { share: fr[1] ? Number(fr[1]) : 1, scope: 'parent' } }
  const amt = tok.match(/^(\d+(?:\.\d+)?)(m|h)(?:\/(d|w|mo))?$/)
  if (amt) {
    const minutes = snap(Number(amt[1]) * (amt[2] === 'h' ? 60 : 1))
    if (minutes <= 0) return null
    return {
      budget: {
        min: minutes,
        max: minutes,
        intent: 'target',
        period: PERIODS[amt[3] ?? 'd'],
        spread: 'any',
      },
    }
  }
  return null
}

const leafOf = (code: string) => code.slice(code.lastIndexOf('-') + 1)

/** 'Social Media!' → 'social-media' */
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** A `#` comment ends the line, unless it's inside a quoted note. */
const stripComment = (s: string): string => {
  let quoted = false
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') quoted = !quoted
    else if (s[i] === '#' && !quoted) return s.slice(0, i)
  }
  return s
}

/** Split header from items at the first colon outside quotes. */
const splitHeader = (s: string): [string, string] | null => {
  let quoted = false
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') quoted = !quoted
    else if (s[i] === ':' && !quoted) return [s.slice(0, i), s.slice(i + 1)]
  }
  return null
}

/** Split on commas that aren't inside quotes; quote chars stay in the tokens. */
const splitItems = (s: string): string[] => {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (const ch of s) {
    if (ch === '"') quoted = !quoted
    if (ch === ',' && !quoted) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

/** Pull the first `"quoted"` string out — it becomes the note, or the name when nothing else is left. */
const extractQuote = (s: string): { rest: string; quoted?: string; err?: string } => {
  const m = s.match(/"([^"]*)"/)
  if (!m) return s.includes('"') ? { rest: s, err: 'unterminated quote' } : { rest: s }
  const rest = `${s.slice(0, m.index)} ${s.slice(m.index! + m[0].length)}`.trim()
  if (rest.includes('"')) return { rest, err: 'unexpected quote' }
  return { rest, quoted: m[1].trim() || undefined }
}

/**
 * Words → a target. The first word is always the code path — case never
 * changes that; any remaining words are the display name. No explicit name →
 * the caller falls back to the code's leaf.
 */
const parseTarget = (words: string[]): { segs: string; name?: string } | null => {
  if (words.length === 0) return null
  const [first, ...rest] = words
  const segs = first.toLowerCase()
  if (!CODE_RE.test(segs)) return null
  return rest.length > 0 ? { segs, name: rest.join(' ') } : { segs }
}

/**
 * Parse the bulk format into a creation plan. `parent` supplies the code
 * prefix (null = top level); `existing` is the current project list, used to
 * skip codes that are already taken.
 */
export function parseBulkCreate(
  text: string,
  parent: Project | null,
  existing: Project[],
): BulkPlan {
  const taken = new Set(existing.map((p) => p.code).filter(Boolean))
  const planned = new Map<string, BulkCreate>()
  const skips: BulkSkip[] = []
  const errors: BulkError[] = []
  const prefixSegs = parent?.code ? parent.code.split('-').length : 0

  /** Plan missing intermediate codes of `full` (below the parent) as groups. */
  const ensureGroups = (full: string) => {
    const segs = full.split('-')
    for (let i = Math.max(1, prefixSegs + 1); i < segs.length; i++) {
      const c = segs.slice(0, i).join('-')
      if (!taken.has(c) && !planned.has(c)) {
        planned.set(c, { code: c, name: segs[i - 1], group: true })
      }
    }
  }

  const applyLeaf = (
    full: string,
    claim: Claim,
    line: number,
    meta?: { name?: string; note?: string },
  ) => {
    if (taken.has(full)) {
      skips.push({ code: full, line, reason: 'already exists' })
      return
    }
    ensureGroups(full)
    const prev = planned.get(full)
    if (prev) {
      // a group planned earlier as an intermediate can still gain a claim/name
      if (prev.group) {
        Object.assign(prev, claim, { group: undefined })
        if (meta?.name) prev.name = meta.name
        if (meta?.note) prev.note = meta.note
      } else {
        skips.push({ code: full, line, reason: 'duplicate' })
      }
      return
    }
    planned.set(full, { code: full, name: meta?.name ?? leafOf(full), note: meta?.note, ...claim })
  }

  text.split('\n').forEach((raw, idx) => {
    const line = idx + 1
    const body = stripComment(raw).trim()
    if (!body) return
    const split = splitHeader(body)
    if (!split) {
      errors.push({ line, message: 'expected `code: items`' })
      return
    }
    const head = extractQuote(split[0].trim())
    if (head.err) {
      errors.push({ line, message: head.err })
      return
    }
    const hWords = head.rest.split(/\s+/).filter(Boolean)
    // `"Fun Stuff":` — a quoted header is a spaced name with a derived code
    const hQuotedName = hWords.length === 0 ? head.quoted : undefined
    const hNote = hWords.length === 0 ? undefined : head.quoted
    const hTarget =
      hQuotedName != null
        ? { segs: slugify(hQuotedName), name: hQuotedName }
        : parseTarget(hWords)
    if (!hTarget || !CODE_RE.test(hTarget.segs)) {
      errors.push({ line, message: `bad code in '${split[0].trim()}' — letters, digits, dashes` })
      return
    }
    const fullLine = parent?.code ? `${parent.code}-${hTarget.segs}` : hTarget.segs

    const tokens = splitItems(split[1])
      .map((t) => t.trim())
      .filter(Boolean)
    if (tokens.length === 0) {
      errors.push({ line, message: 'no items' })
      return
    }

    // leading bare claims set the line default
    let lineClaim: Claim | null = null
    let first = 0
    while (first < tokens.length) {
      const c = parseClaim(tokens[first].toLowerCase())
      if (!c) break
      lineClaim = c
      first++
    }
    const items = tokens.slice(first)

    if (items.length === 0) {
      // a claim-only line applies to the line's own code: `ent: 1h`
      applyLeaf(fullLine, lineClaim ?? DEFAULT_CLAIM, line, { name: hTarget.name, note: hNote })
      return
    }

    for (const item of items) {
      const ex = extractQuote(item)
      if (ex.err) {
        errors.push({ line, message: ex.err })
        continue
      }
      let claim = lineClaim
      const words: string[] = []
      for (const w of ex.rest.split(/\s+/).filter(Boolean)) {
        const c = parseClaim(w.toLowerCase())
        if (c) claim = c
        else words.push(w)
      }
      if (words.length === 0) {
        // `"video games"` alone — a spaced name with a derived code
        const segs = ex.quoted ? slugify(ex.quoted) : ''
        if (!segs) {
          errors.push({ line, message: ex.quoted ? `can't parse '${item}'` : 'amount without a project' })
          continue
        }
        applyLeaf(`${fullLine}-${segs}`, claim ?? DEFAULT_CLAIM, line, { name: ex.quoted })
        continue
      }
      const t = parseTarget(words)
      if (!t) {
        errors.push({ line, message: `bad code '${words[0]}' — letters, digits, dashes` })
        continue
      }
      applyLeaf(`${fullLine}-${t.segs}`, claim ?? DEFAULT_CLAIM, line, {
        name: t.name,
        note: ex.quoted,
      })
    }

    // a header name/note lands on the line's own project when it's a planned group
    if (hTarget.name || hNote) {
      const g = planned.get(fullLine)
      if (g?.group) {
        if (hTarget.name) g.name = hTarget.name
        if (hNote) g.note = hNote
      }
    }
  })

  return { creates: [...planned.values()], skips, errors }
}
