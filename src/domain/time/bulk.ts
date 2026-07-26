/**
 * Bulk-create parsing — the compact "create many subs under a parent" format.
 * Pure and import-style: parse text → a plan of projects to create, skips,
 * and per-line errors. Nothing here touches the store.
 *
 * ```
 * # comments start with #, blank lines ignored
 * ent: fr                            # line default: bare items get fr
 * ent: 1h, phone-yt, phone-tik 2h    # line default 1h/day; phone-tik overrides
 * ent: phone-yt, phone-series-thriller  # no amount → each gets fr
 * ent-phone: yt, series              # items land under ent-phone
 * ```
 *
 * Every full code keeps the selected parent's code as prefix. Missing
 * intermediate codes are planned as plain groups before their children.
 * Existing codes are skipped, never updated.
 */
import type { Budget, BudgetPeriod, FrShare, Project } from './types'

export interface BulkCreate {
  code: string
  name: string
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

  const applyLeaf = (full: string, claim: Claim, line: number) => {
    if (taken.has(full)) {
      skips.push({ code: full, line, reason: 'already exists' })
      return
    }
    ensureGroups(full)
    const prev = planned.get(full)
    if (prev) {
      // a group planned earlier as an intermediate can still gain a claim
      if (prev.group) Object.assign(prev, claim, { group: undefined })
      else skips.push({ code: full, line, reason: 'duplicate' })
      return
    }
    planned.set(full, { code: full, name: leafOf(full), ...claim })
  }

  text.split('\n').forEach((raw, idx) => {
    const line = idx + 1
    const body = raw.split('#')[0].trim()
    if (!body) return
    const ci = body.indexOf(':')
    if (ci < 0) {
      errors.push({ line, message: 'expected `code: items`' })
      return
    }
    const code = body.slice(0, ci).trim().toLowerCase()
    const rest = body.slice(ci + 1).trim()
    if (!CODE_RE.test(code)) {
      errors.push({ line, message: `bad code '${code}' — lowercase letters, digits, dashes` })
      return
    }
    const tokens = rest
      .split(',')
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
    const fullLine = parent?.code ? `${parent.code}-${code}` : code

    if (items.length === 0) {
      // a claim-only line applies to the line's own code: `ent: 1h`
      applyLeaf(fullLine, lineClaim ?? DEFAULT_CLAIM, line)
      return
    }

    for (const item of items) {
      const words = item.split(/\s+/)
      const segs = words[0].toLowerCase()
      let claim = lineClaim
      if (words.length > 1) {
        const c = words.length === 2 ? parseClaim(words[1].toLowerCase()) : null
        if (!c) {
          errors.push({ line, message: `can't parse '${item}'` })
          continue
        }
        claim = c
      }
      if (!CODE_RE.test(segs)) {
        errors.push({ line, message: `bad code '${segs}' — lowercase letters, digits, dashes` })
        continue
      }
      applyLeaf(`${fullLine}-${segs}`, claim ?? DEFAULT_CLAIM, line)
    }
  })

  return { creates: [...planned.values()], skips, errors }
}
