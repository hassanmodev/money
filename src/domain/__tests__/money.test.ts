import { describe, expect, it } from 'vitest'
import { convert, formatMoney, fromBase, roundMoney, toBase } from '../money'
import type { Settings } from '../types'

const settings: Settings = {
  baseCurrency: 'EUR',
  rates: { USD: 0.9, BTC: 50000 },
}

describe('conversion', () => {
  it('converts to and from the base currency', () => {
    expect(toBase(100, 'USD', settings)).toBeCloseTo(90, 10)
    expect(fromBase(90, 'USD', settings)).toBeCloseTo(100, 10)
    expect(toBase(50, 'EUR', settings)).toBe(50) // base passes through
  })

  it('round-trips between two currencies', () => {
    expect(convert(100, 'USD', 'EUR', settings)).toBeCloseTo(90, 10)
    expect(convert(convert(100, 'USD', 'EUR', settings), 'EUR', 'USD', settings)).toBeCloseTo(
      100,
      10,
    )
  })

  it('is the identity for same-currency conversion', () => {
    expect(convert(123.45, 'BTC', 'BTC', settings)).toBe(123.45)
  })
})

describe('roundMoney', () => {
  it('rounds to the currency precision', () => {
    expect(roundMoney(1.234, 'EUR')).toBe(1.23)
    expect(roundMoney(1234.6, 'JPY')).toBe(1235) // 0 decimals
    expect(roundMoney(0.1234567, 'BTC')).toBe(0.123457) // 6 decimals
  })
})

describe('formatMoney', () => {
  it('uses currency symbols', () => {
    expect(formatMoney(1000, 'BTC')).toContain('₿')
    expect(formatMoney(12.5, 'XAU')).toContain('oz')
    expect(formatMoney(0, 'USD')).toContain('$')
  })

  it('can show an explicit sign and compact notation', () => {
    expect(formatMoney(1200, 'USD', { sign: true })).toMatch(/^\+/)
    expect(formatMoney(-50, 'USD', { sign: true })).toMatch(/^[-−]/)
  })
})
