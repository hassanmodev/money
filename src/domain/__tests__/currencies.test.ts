import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CURRENCIES,
  currencyMeta,
  isDefaultCurrency,
  mergeCurrencies,
  searchCurrencies,
  setCustomCurrencies,
} from '../currencies'
import type { CurrencyMeta } from '../types'

describe('default catalogue', () => {
  it('includes EGP among the popular block, near the front', () => {
    const codes = DEFAULT_CURRENCIES.map((c) => c.code)
    expect(codes).toContain('EGP')
    const egp = DEFAULT_CURRENCIES.find((c) => c.code === 'EGP')!
    expect(egp.popular).toBe(true)
    expect(codes.indexOf('EGP')).toBeLessThan(5)
  })

  it('leads with the global majors', () => {
    expect(DEFAULT_CURRENCIES[0].code).toBe('USD')
    expect(DEFAULT_CURRENCIES.slice(0, 3).map((c) => c.code)).toEqual(['USD', 'EUR', 'EGP'])
  })
})

describe('searchCurrencies', () => {
  it('returns everything in order for an empty query', () => {
    expect(searchCurrencies('').map((c) => c.code)).toEqual(
      DEFAULT_CURRENCIES.map((c) => c.code),
    )
  })

  it('matches by code exactly first', () => {
    expect(searchCurrencies('egp')[0].code).toBe('EGP')
  })

  it('matches by name substring', () => {
    const codes = searchCurrencies('pound').map((c) => c.code)
    expect(codes).toContain('EGP')
    expect(codes).toContain('GBP')
  })

  it('matches a fuzzy subsequence', () => {
    expect(searchCurrencies('jpy').map((c) => c.code)).toContain('JPY')
    // subsequence of "Egyptian Pound"
    expect(searchCurrencies('egyp').map((c) => c.code)).toContain('EGP')
  })

  it('returns nothing for gibberish', () => {
    expect(searchCurrencies('zzzqqq')).toHaveLength(0)
  })
})

describe('mergeCurrencies + overrides', () => {
  const dogecoin: CurrencyMeta = { code: 'DOGE', name: 'Dogecoin', symbol: 'Ð', decimals: 2, kind: 'crypto' }
  const egpOverride: CurrencyMeta = { code: 'EGP', name: 'Pound (EG)', symbol: 'LE', decimals: 0, kind: 'fiat' }

  it('appends brand-new currencies and overrides built-ins in place', () => {
    const merged = mergeCurrencies([dogecoin, egpOverride])
    expect(merged.find((c) => c.code === 'DOGE')).toEqual(dogecoin)
    const egp = merged.find((c) => c.code === 'EGP')!
    expect(egp.symbol).toBe('LE')
    expect(egp.decimals).toBe(0)
    // overrides keep their position; new ones go to the end
    expect(merged[merged.length - 1].code).toBe('DOGE')
    expect(merged).toHaveLength(DEFAULT_CURRENCIES.length + 1)
  })

  it('isDefaultCurrency distinguishes built-ins from customs', () => {
    expect(isDefaultCurrency('USD')).toBe(true)
    expect(isDefaultCurrency('DOGE')).toBe(false)
  })

  it('setCustomCurrencies makes currencyMeta reflect edits, and reverts cleanly', () => {
    setCustomCurrencies([dogecoin, egpOverride])
    expect(currencyMeta('DOGE').name).toBe('Dogecoin')
    expect(currencyMeta('EGP').symbol).toBe('LE')

    setCustomCurrencies([])
    expect(currencyMeta('EGP').symbol).toBe('E£') // back to the default
    expect(currencyMeta('DOGE').code).toBe('DOGE') // unknown → generic fallback
    expect(currencyMeta('DOGE').symbol).toBe('DOGE')
  })
})
