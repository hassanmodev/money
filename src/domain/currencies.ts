/**
 * The currency catalogue: built-in defaults + the user's custom/overridden
 * entries, plus lookup and fuzzy search. Pure data and pure functions — the
 * store keeps the live overrides in sync via `setCustomCurrencies`.
 */
import type { CurrencyCode, CurrencyMeta } from './types'
import catalogue from './currencies.json'

/** The shipped catalogue, ordered "most popular + EGP first". */
export const DEFAULT_CURRENCIES: CurrencyMeta[] = catalogue as CurrencyMeta[]

const DEFAULT_BY_CODE = new Map(DEFAULT_CURRENCIES.map((c) => [c.code, c]))

/** True if `code` ships in the catalogue (vs. a user-created currency). */
export const isDefaultCurrency = (code: CurrencyCode): boolean =>
  DEFAULT_BY_CODE.has(code)

const GENERIC: CurrencyMeta = {
  code: '?',
  symbol: '¤',
  name: 'Unit',
  decimals: 2,
  kind: 'custom',
}

/**
 * Live, ordered catalogue. Starts as the defaults; `setCustomCurrencies`
 * folds the user's overrides and additions back in. Kept as a module
 * singleton so the pure `currencyMeta`/`formatMoney` path needs no context.
 */
let registry: CurrencyMeta[] = [...DEFAULT_CURRENCIES]
let byCode = new Map(registry.map((c) => [c.code, c]))

/**
 * Merge the user's custom currencies over the defaults. Overrides (same `code`
 * as a default) replace in place; genuinely new currencies are appended after
 * the defaults. Pure — used by both the live registry and reactive UI.
 */
export function mergeCurrencies(custom: CurrencyMeta[] = []): CurrencyMeta[] {
  const overrides = new Map(custom.map((c) => [c.code, c]))
  const merged = DEFAULT_CURRENCIES.map((c) => overrides.get(c.code) ?? c)
  for (const c of custom) {
    if (!DEFAULT_BY_CODE.has(c.code)) merged.push(c)
  }
  return merged
}

/** Rebuild the live registry from the user's custom currencies. */
export function setCustomCurrencies(custom: CurrencyMeta[] = []): void {
  registry = mergeCurrencies(custom)
  byCode = new Map(registry.map((c) => [c.code, c]))
}

/** Every currency in the live catalogue, in display order. */
export const allCurrencies = (): CurrencyMeta[] => registry

/** Look up a currency's metadata, falling back to a generic unit. */
export function currencyMeta(code: CurrencyCode): CurrencyMeta {
  return byCode.get(code) ?? { ...GENERIC, code, symbol: code }
}

/** Back-compat: the live catalogue keyed by code. */
export const CURRENCIES: Record<string, CurrencyMeta> = new Proxy(
  {},
  {
    get: (_t, key: string) => byCode.get(key),
    has: (_t, key: string) => byCode.has(key),
    ownKeys: () => registry.map((c) => c.code),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  },
) as Record<string, CurrencyMeta>

// ── fuzzy search ───────────────────────────────────────────────────────────

/** Subsequence match: do `query`'s chars appear in order within `text`? */
function subsequence(query: string, text: string): boolean {
  let i = 0
  for (let j = 0; j < text.length && i < query.length; j++) {
    if (text[j] === query[i]) i++
  }
  return i === query.length
}

/** Higher is better; -1 means no match. */
function score(query: string, c: CurrencyMeta): number {
  const code = c.code.toLowerCase()
  const name = c.name.toLowerCase()
  // A small nudge so the global majors float above obscure same-tier matches
  // (e.g. "pound" → GBP/EGP ahead of SYP) without crossing match tiers.
  const pop = c.popular ? 40 : 0
  if (code === query) return 1000
  if (code.startsWith(query)) return 900 - code.length + pop
  if (name.startsWith(query)) return 700 - name.length + pop
  if (name.includes(query)) return 500 - name.indexOf(query) + pop
  if (subsequence(query, code)) return 300 + pop
  if (subsequence(query, name)) return 200 + pop
  return -1
}

/**
 * Fuzzy-search the catalogue. Empty query returns everything in catalogue
 * order (popular + EGP first); otherwise results are ranked, popular currencies
 * breaking ties.
 */
export function searchCurrencies(
  query: string,
  list: CurrencyMeta[] = registry,
): CurrencyMeta[] {
  const q = query.trim().toLowerCase()
  if (!q) return list

  return list
    .map((c, i) => ({ c, i, s: score(q, c) }))
    .filter((r) => r.s >= 0)
    .sort((a, b) => b.s - a.s || Number(!!b.c.popular) - Number(!!a.c.popular) || a.i - b.i)
    .map((r) => r.c)
}
