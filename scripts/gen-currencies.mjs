/**
 * Generates src/domain/currencies.json — the default currency catalogue.
 *
 * Names + minor-unit decimals come from the platform's Intl data; symbols come
 * from Intl too, with a curated override map for the ones whose glyphs read
 * better than the bare ISO code. Order is "most popular + EGP first", then the
 * rest alphabetically. Re-run after changing rates_usd.json or the lists below.
 *
 *   node scripts/gen-currencies.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const rates = JSON.parse(readFileSync(resolve(root, 'src/domain/rates_usd.json'), 'utf8'))

// Curated, in display order. EGP rides up front right behind the global majors.
const POPULAR = [
  'USD', 'EUR', 'EGP', 'GBP', 'JPY', 'CNY', 'CHF', 'CAD', 'AUD',
  'AED', 'SAR', 'INR', 'TRY', 'RUB', 'BRL', 'ZAR', 'SEK', 'NOK',
]

// Symbols that read better than the ISO code Intl falls back to.
const SYMBOL = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', CHF: 'Fr', CAD: 'C$',
  AUD: 'A$', NZD: 'NZ$', HKD: 'HK$', SGD: 'S$', INR: '₹', RUB: '₽',
  BRL: 'R$', ZAR: 'R', SEK: 'kr', NOK: 'kr', DKK: 'kr', ISK: 'kr',
  KRW: '₩', TRY: '₺', PLN: 'zł', THB: '฿', PHP: '₱', VND: '₫', UAH: '₴',
  ILS: '₪', NGN: '₦', GHS: '₵', KZT: '₸', PKR: '₨', LKR: '₨', NPR: '₨',
  IDR: 'Rp', MYR: 'RM', TWD: 'NT$', MXN: '$', ARS: '$', CLP: '$', COP: '$',
  EGP: 'E£', AED: 'د.إ', SAR: '﷼', QAR: '﷼', KWD: 'د.ك', BHD: 'ب.د',
  IRR: '﷼', IQD: 'ع.د', JOD: 'د.ا', LBP: 'ل.ل', MAD: 'د.م.', DZD: 'د.ج',
  TND: 'د.ت', LYD: 'ل.د',
}

// Precious metals carried in the FX table as XAU/XAG/XPT/XPD (priced per troy oz).
const METALS = {
  XAU: { name: 'Gold (troy oz)', symbol: 'oz', decimals: 3 },
  XAG: { name: 'Silver (troy oz)', symbol: 'oz', decimals: 2 },
  XPT: { name: 'Platinum (troy oz)', symbol: 'oz', decimals: 3 },
  XPD: { name: 'Palladium (troy oz)', symbol: 'oz', decimals: 3 },
}

// Crypto isn't in the fiat FX feed; seed the common two so they exist by default.
const CRYPTO = [
  { code: 'BTC', name: 'Bitcoin', symbol: '₿', decimals: 6, kind: 'crypto' },
  { code: 'ETH', name: 'Ethereum', symbol: 'Ξ', decimals: 4, kind: 'crypto' },
]

const names = new Intl.DisplayNames(['en'], { type: 'currency' })

function meta(code) {
  if (METALS[code]) return { code, ...METALS[code], kind: 'metal' }

  let name = code
  try {
    name = names.of(code) ?? code
  } catch {
    /* not a recognised ISO code — keep the code as the name */
  }

  let decimals = 2
  let symbol = code
  try {
    const fmt = new Intl.NumberFormat('en', { style: 'currency', currency: code })
    decimals = fmt.resolvedOptions().maximumFractionDigits
    const part = fmt.formatToParts(1).find((p) => p.type === 'currency')
    if (part && part.value !== code) symbol = part.value
  } catch {
    /* unknown to Intl — generic 2-decimal fiat */
  }

  return { code, name, symbol: SYMBOL[code] ?? symbol, decimals, kind: 'fiat' }
}

// USD is the FX base, so it never appears as a quote — add it explicitly.
const codes = [...new Set(['USD', ...rates.map((r) => r.quote)])]
const rest = codes.filter((c) => !POPULAR.includes(c)).sort()
const ordered = [...POPULAR.filter((c) => codes.includes(c)), ...rest]

const catalogue = [
  ...CRYPTO.map((c) => ({ ...c, popular: false })),
  ...ordered.map((code) => {
    const m = meta(code)
    return { ...m, popular: POPULAR.includes(code) }
  }),
]

// Pull the popular block (incl. EGP) to the very front, preserving POPULAR order.
catalogue.sort((a, b) => {
  const ia = POPULAR.indexOf(a.code)
  const ib = POPULAR.indexOf(b.code)
  if (ia !== -1 || ib !== -1) {
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  }
  return 0
})

writeFileSync(
  resolve(root, 'src/domain/currencies.json'),
  JSON.stringify(catalogue, null, 2) + '\n',
)

console.log(`Wrote ${catalogue.length} currencies (${POPULAR.length} popular).`)
