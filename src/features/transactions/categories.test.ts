import { describe, expect, it } from 'vitest'
import { categoryOf, categorySuggestions, matchesCategory, normalizeCategory, validCategory } from './categories'
import { spendingTree } from './categoryTree'
import { ActivityStatsModel } from './ActivityStatsModel'
import type { FinanceState } from '@/domain/types'

describe('category paths', () => {
  it('normalizes paths and rejects unfinished or ambiguous segments', () => {
    expect(normalizeCategory(' Shopping . place: Online . Laptop ')).toBe('shopping.place:online.laptop')
    for (const value of ['food.burger', 'shopping.place:online.electronics.laptop', 'home office.supplies']) expect(validCategory(value)).toBe(true)
    for (const value of ['', '.food', 'food.', 'food..burger', 'food.place:', 'food.:online', 'a:b:c']) expect(validCategory(value)).toBe(false)
    expect(categoryOf('food.burger').label).toBe('food.burger')
    expect(categoryOf('shopping.online').color).toBe(categoryOf('shopping').color)
  })

  it('matches roots, contiguous paths, leaves, and properties at segment boundaries', () => {
    const path = 'shopping.place:online.electronics.laptop'
    for (const query of ['shopping', 'shopping.place:online', 'electronics.laptop', 'laptop', 'place:online', 'online', 'place']) expect(matchesCategory(path, query)).toBe(true)
    for (const query of ['shop', 'lap', 'shopping.laptop', 'place:offline']) expect(matchesCategory(path, query)).toBe(false)
    expect(matchesCategory('groceries.online.milk', 'groceries.online')).toBe(true)
    expect(matchesCategory(undefined, 'other')).toBe(true)
  })

  it('suggests reusable prefixes and fuzzy next levels without crossing parents', () => {
    const paths = ['shopping.place:online.electronics.laptop', 'food.burger', 'groceries.online.milk']
    expect(categorySuggestions('shopping.', paths)).toEqual(expect.arrayContaining(['shopping.place:online', paths[0]]))
    expect(categorySuggestions('shopping.pl:on', paths)[0]).toBe('shopping.place:online')
    expect(categorySuggestions('lptp', paths)).toContain(paths[0])
    expect(categorySuggestions('shopping.', paths)).not.toContain('food.burger')
  })

  it('rolls up converted recurring spending once, preserving direct parent entries and exclusions', () => {
    const state: FinanceState = {
      boxes: [], goals: [], goalGroups: [], settings: { baseCurrency: 'EUR', rates: { USD: 0.5 } },
      transactions: [
        { id: 'parent', kind: 'expense', boxId: '', amount: 20, currency: 'EUR', category: 'shopping', date: '2026-01-01', createdAt: '' },
        { id: 'child', kind: 'expense', boxId: '', amount: 10, currency: 'USD', category: 'shopping.place:online.laptop', date: '2026-01-01', createdAt: '', recurrence: { every: 1, unit: 'day', anchor: '2026-01-01', end: { type: 'after', count: 2 } } },
        { id: 'income', kind: 'income', boxId: '', amount: 50, currency: 'EUR', category: 'shopping', date: '2026-01-01', createdAt: '' },
      ],
    }
    const stats = new ActivityStatsModel(state, '2026-01-01', '2026-01-02')
    const tree = spendingTree(stats.entries)
    expect(tree).toHaveLength(1)
    expect(tree[0].amount).toBe(stats.adjustedSpending)
    expect(tree[0].amount).toBe(30)
    expect(tree[0].count).toBe(3)
    expect(tree[0].entries).toHaveLength(1)
    expect(tree[0].children[0].children[0].amount).toBe(10)
    expect(spendingTree(stats.entries, 'place:online')[0].amount).toBe(10)
    stats.entries.find((entry) => entry.id === 'tx:parent')!.excluded = true
    expect(spendingTree(stats.entries)[0].amount).toBe(10)
  })
})
