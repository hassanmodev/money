/** Currency metadata, formatting, and conversion. Pure functions only. */
import type { CurrencyCode, Settings } from './types'

export interface CurrencyMeta {
  code: string
  symbol: string
  name: string
  decimals: number
  kind: 'fiat' | 'crypto' | 'metal' | 'custom'
}

export const CURRENCIES: Record<string, CurrencyMeta> = {
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2, kind: 'fiat' },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2, kind: 'fiat' },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2, kind: 'fiat' },
  CHF: { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc', decimals: 2, kind: 'fiat' },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0, kind: 'fiat' },
  CAD: { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', decimals: 2, kind: 'fiat' },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2, kind: 'fiat' },
  SEK: { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', decimals: 2, kind: 'fiat' },
  BTC: { code: 'BTC', symbol: '₿', name: 'Bitcoin', decimals: 6, kind: 'crypto' },
  ETH: { code: 'ETH', symbol: 'Ξ', name: 'Ethereum', decimals: 4, kind: 'crypto' },
  XAU: { code: 'XAU', symbol: 'oz', name: 'Gold (troy oz)', decimals: 3, kind: 'metal' },
  XAG: { code: 'XAG', symbol: 'oz', name: 'Silver (troy oz)', decimals: 2, kind: 'metal' },
}

const GENERIC: CurrencyMeta = {
  code: '?',
  symbol: '¤',
  name: 'Unit',
  decimals: 2,
  kind: 'custom',
}

export function currencyMeta(code: CurrencyCode): CurrencyMeta {
  return CURRENCIES[code] ?? { ...GENERIC, code, symbol: code }
}

export interface FormatOptions {
  /** drop fraction digits and use compact notation (1.2k, 3.4M) */
  compact?: boolean
  /** always show a +/- sign */
  sign?: boolean
  /** override fraction digits */
  decimals?: number
}

/** Format an amount in a currency, fiat via Intl, crypto/metal with symbols. */
export function formatMoney(
  amount: number,
  code: CurrencyCode,
  opts: FormatOptions = {},
): string {
  const meta = currencyMeta(code)
  const { compact = false, sign = false } = opts
  // Crypto & metals hold value in small units (0.24 BTC, 3 oz) — never round
  // those to whole numbers just because the display is compact.
  const isSmallUnit = meta.kind === 'crypto' || meta.kind === 'metal'
  const decimals = opts.decimals ?? (compact && !isSmallUnit ? 0 : meta.decimals)

  if (meta.kind === 'fiat') {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: code,
        notation: compact ? 'compact' : 'standard',
        minimumFractionDigits: compact ? 0 : decimals,
        maximumFractionDigits: decimals,
        signDisplay: sign ? 'exceptZero' : 'auto',
      }).format(amount)
    } catch {
      // unknown ISO code — fall through to manual formatting
    }
  }

  const num = new Intl.NumberFormat(undefined, {
    notation: compact ? 'compact' : 'standard',
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
    signDisplay: sign ? 'exceptZero' : 'auto',
  }).format(amount)

  // metals read naturally as a suffix ("12.5 oz"); everything else prefixes.
  return meta.kind === 'metal' ? `${num} ${meta.symbol}` : `${meta.symbol}${num}`
}

/** Round to a currency's natural precision (or given decimals). */
export function roundMoney(amount: number, code: CurrencyCode): number {
  const d = currencyMeta(code).decimals
  const f = 10 ** d
  return Math.round(amount * f) / f
}

const rateOf = (code: CurrencyCode, s: Settings): number =>
  code === s.baseCurrency ? 1 : (s.rates[code] ?? 1)

/** Convert an amount into the base currency. */
export function toBase(amount: number, code: CurrencyCode, s: Settings): number {
  return amount * rateOf(code, s)
}

/** Convert an amount from the base currency into `code`. */
export function fromBase(amount: number, code: CurrencyCode, s: Settings): number {
  return amount / rateOf(code, s)
}

/** Convert between any two currencies via the base. */
export function convert(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  s: Settings,
): number {
  if (from === to) return amount
  return fromBase(toBase(amount, from, s), to, s)
}
