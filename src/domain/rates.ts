/**
 * Reference exchange rates from `rates_usd.json` (units of each currency per
 * 1 USD). Used to seed and refresh `settings.rates`, which the app stores as
 * "value of 1 unit expressed in the base currency".
 */
import type { CurrencyCode } from './types'
import table from './rates_usd.json'

/** Units of `code` per 1 USD (USD itself is 1). */
const USD_PER: Record<string, number> = { USD: 1 }
for (const { quote, rate } of table as { quote: string; rate: number }[]) {
  USD_PER[quote] = rate
}

/** Whether we have a market USD rate on file for `code`. */
export const hasMarketRate = (code: CurrencyCode): boolean => code in USD_PER

/**
 * Market value of 1 unit of `code` expressed in `base` — i.e. base units per
 * 1 code. Returns `undefined` when either side is missing from the table.
 */
export function marketRateInBase(
  code: CurrencyCode,
  base: CurrencyCode,
): number | undefined {
  const perCode = USD_PER[code]
  const perBase = USD_PER[base]
  if (!perCode || !perBase) return undefined
  // 1 USD = perCode `code` = perBase `base`  ⇒  1 code = perBase / perCode base
  return perBase / perCode
}

/**
 * Build a full `rates` map (value of 1 unit in `base`) for the given codes
 * using market data, falling back to any rates already set. Base is pinned to 1.
 */
export function marketRates(
  base: CurrencyCode,
  codes: Iterable<CurrencyCode>,
  prev: Record<CurrencyCode, number> = {},
): Record<CurrencyCode, number> {
  const out: Record<CurrencyCode, number> = { [base]: 1 }
  for (const code of codes) {
    if (code === base) continue
    out[code] = marketRateInBase(code, base) ?? prev[code] ?? 1
  }
  return out
}
