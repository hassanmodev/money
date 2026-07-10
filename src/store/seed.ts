/** Pleasant demo data so the app feels alive on first run. */
import type { FinanceState, Goal } from '@/domain'

const CREATED = '2025-09-01T10:00:00.000Z'

/** Blank slate — no boxes, transactions, or goals; default settings only. */
export function createEmpty(): FinanceState {
  return {
    settings: {
      baseCurrency: 'EUR',
      rates: { EUR: 1 },
      inflation: 0,
      goalAutoApply: true,
    },
    boxes: [],
    transactions: [],
    goals: [],
    goalGroups: [],
  }
}

/** A fresh copy of the starter world (never share references with the store). */
export function createSeed(): FinanceState {
  return {
    settings: {
      baseCurrency: 'EUR',
      // value of 1 unit in EUR
      rates: { EUR: 1, USD: 0.92, GBP: 1.17, CHF: 1.04, BTC: 92000, XAU: 2400 },
      inflation: 0.025,
      happinessHalfLifeMonths: 24,
      goalAutoApply: true,
    },
    boxes: [
      {
        id: 'box-cash',
        name: 'Cash at home',
        kind: 'cash',
        currency: 'EUR',
        openingBalance: 760,
        openingDate: '2024-01-01',
        color: '#e0aa66',
        icon: 'Banknote',
        note: 'The jar on the shelf.',
        effects: [
          { id: 'fx-cash-inf', kind: 'inflation', annualRate: 0.032, compounding: 'annually' },
        ],
        createdAt: CREATED,
      },
      {
        id: 'box-checking',
        name: 'Everyday',
        kind: 'checking',
        currency: 'EUR',
        openingBalance: 3400,
        openingDate: '2025-09-01',
        color: '#d4845c',
        icon: 'Wallet',
        effects: [],
        // Keep a €5k float; sweep anything above it into the rainy-day fund,
        // where it actually earns interest.
        acceptance: [{ level: 5000, rate: 0 }],
        forwards: [{ id: 'fwd-checking-savings', toBoxId: 'box-savings', share: 1 }],
        createdAt: CREATED,
      },
      {
        id: 'box-savings',
        name: 'Rainy day',
        kind: 'savings',
        currency: 'EUR',
        openingBalance: 9000,
        openingDate: '2024-01-01',
        color: '#9eb87f',
        icon: 'PiggyBank',
        // The rainy-day fund doubles as the pool the goal planner spends from.
        fundsGoals: true,
        effects: [
          { id: 'fx-sav-int', kind: 'interest', annualRate: 0.036, compounding: 'monthly' },
        ],
        createdAt: CREATED,
      },
      {
        id: 'box-brokerage',
        name: 'Brokerage',
        kind: 'investment',
        currency: 'USD',
        openingBalance: 16000,
        openingDate: '2023-06-01',
        color: '#8aa0c8',
        icon: 'ChartLine',
        note: 'Index funds, mostly.',
        effects: [
          { id: 'fx-brk-app', kind: 'appreciation', annualRate: 0.07, compounding: 'annually' },
        ],
        createdAt: CREATED,
      },
      {
        id: 'box-btc',
        name: 'Bitcoin',
        kind: 'crypto',
        currency: 'BTC',
        openingBalance: 0.12,
        openingDate: '2022-03-01',
        color: '#cba24f',
        icon: 'Bitcoin',
        effects: [
          { id: 'fx-btc-app', kind: 'appreciation', annualRate: 0.18, compounding: 'annually' },
        ],
        createdAt: CREATED,
      },
      {
        id: 'box-gold',
        name: 'Gold',
        kind: 'asset',
        currency: 'XAU',
        openingBalance: 3,
        openingDate: '2023-01-01',
        color: '#b88cc0',
        icon: 'Gem',
        effects: [
          { id: 'fx-gold-app', kind: 'appreciation', annualRate: 0.04, compounding: 'annually' },
        ],
        createdAt: CREATED,
      },
    ],
    transactions: [
      // ── recurring rhythm of the month ──
      r('tx-salary', 'income', 'box-checking', 3600, 'salary', '2025-09-25', { every: 1, unit: 'month' }, 'Monthly pay'),
      r('tx-rent', 'expense', 'box-checking', 1250, 'rent', '2025-09-01', { every: 1, unit: 'month' }),
      r('tx-groceries', 'expense', 'box-checking', 85, 'groceries', '2025-09-05', { every: 1, unit: 'week' }),
      r('tx-subs', 'expense', 'box-checking', 15.99, 'subscriptions', '2025-09-12', { every: 1, unit: 'month' }, 'Streaming'),
      r('tx-gym', 'expense', 'box-checking', 39, 'fitness', '2025-09-03', { every: 1, unit: 'month' }),
      r('tx-phone', 'expense', 'box-checking', 25, 'utilities', '2025-09-18', { every: 1, unit: 'month' }, 'Phone'),
      t('tx-autosave', 'transfer', 'box-checking', 700, 'savings', '2025-09-26', 'box-savings', { every: 1, unit: 'month' }, 'Auto-save'),
      t('tx-dca', 'transfer', 'box-checking', 300, 'investing', '2025-09-27', 'box-brokerage', { every: 1, unit: 'month' }, 'Dollar-cost average'),

      // ── recent one-offs for the activity feed ──
      o('tx-r1', 'expense', 'box-checking', 48.5, 'dining', '2026-05-29', 'Trattoria with friends'),
      o('tx-r2', 'expense', 'box-cash', 4.8, 'coffee', '2026-05-30'),
      o('tx-r3', 'expense', 'box-checking', 32, 'shopping', '2026-05-27', 'Bookshop'),
      o('tx-r4', 'expense', 'box-checking', 64.3, 'groceries', '2026-05-24'),
      o('tx-r5', 'expense', 'box-checking', 18.2, 'health', '2026-05-22', 'Pharmacy'),
      o('tx-r6', 'income', 'box-checking', 450, 'salary', '2026-05-20', 'Side gig'),
      o('tx-r7', 'expense', 'box-checking', 120, 'fun', '2026-05-16', 'Live show'),
    ],
    goals: [
      g('goal-japan', 'Two weeks in Japan', 4800, 90, '#db8a82', 'The big one.'),
      g('goal-laptop', 'New laptop', 1900, 60, '#8aa0c8'),
      {
        // An umbrella: cheap, highly rated, and it lifts every other goal by
        // up to 15% once it lands.
        ...g('goal-calm', 'A calmer routine', 1200, 80, '#b58ad0', 'Lifts everything else a little.'),
        umbrella: { boost: 0.15 },
      },
      {
        id: 'goal-bike',
        name: 'Road bike',
        cost: 1300,
        // Worth a lot through the summer, much less once the rain sets in.
        value: {
          type: 'periods',
          points: [
            { from: '2026-06-01', rating: 70 },
            { from: '2026-10-01', rating: 30 },
            { from: '2027-05-01', rating: 70 },
          ],
        },
        status: 'open',
        color: '#9eb87f',
        createdAt: CREATED,
      },
      {
        ...g('goal-desk', 'Standing desk', 520, 50, '#74b1a3'),
        status: 'done',
        doneDate: '2026-04-15',
      },
      { ...g('goal-watch', 'Vintage watch', 3200, 40, '#cba24f', 'Maybe one day.'), status: 'dismissed' },

      // ── an alternative-set: three phones, one slot. The planner picks the
      // best — or, since the group allows it, buys cheap now and upgrades later.
      { ...g('goal-phone-budget', 'Budget phone', 320, 50, '#7fb0c4'), groupId: 'grp-phone' },
      { ...g('goal-phone-mid', 'Mid-range phone', 620, 70, '#7fb0c4'), groupId: 'grp-phone' },
      { ...g('goal-phone-pro', 'Flagship phone', 1150, 90, '#7fb0c4', 'The one you really want.'), groupId: 'grp-phone' },
    ],
    goalGroups: [
      {
        id: 'grp-phone',
        name: 'New phone',
        upgradable: true,
        upgradeLoss: 0.15,
        color: '#7fb0c4',
        createdAt: CREATED,
      },
    ],
  }
}

/** A flat-rated goal — the common case. */
function g(
  id: string,
  name: string,
  cost: number,
  rating: number,
  color: string,
  note?: string,
): Goal {
  return {
    id,
    name,
    cost,
    value: { type: 'flat', rating },
    status: 'open',
    color,
    note,
    createdAt: CREATED,
  }
}

// ── tiny builders to keep the seed readable ──
type Cad = { every: number; unit: 'day' | 'week' | 'month' | 'year' }

function r(
  id: string,
  kind: 'income' | 'expense',
  boxId: string,
  amount: number,
  category: string,
  anchor: string,
  cad: Cad,
  note?: string,
) {
  return {
    id,
    kind,
    boxId,
    amount,
    currency: 'EUR',
    category,
    note,
    date: anchor,
    recurrence: { ...cad, anchor, end: { type: 'never' as const } },
    createdAt: CREATED,
  }
}

function t(
  id: string,
  kind: 'transfer',
  boxId: string,
  amount: number,
  category: string,
  anchor: string,
  toBoxId: string,
  cad: Cad,
  note?: string,
) {
  return {
    id,
    kind,
    boxId,
    toBoxId,
    amount,
    currency: 'EUR',
    category,
    note,
    date: anchor,
    recurrence: { ...cad, anchor, end: { type: 'never' as const } },
    createdAt: CREATED,
  }
}

function o(
  id: string,
  kind: 'income' | 'expense',
  boxId: string,
  amount: number,
  category: string,
  date: string,
  note?: string,
) {
  return { id, kind, boxId, amount, currency: 'EUR', category, note, date, createdAt: CREATED }
}
