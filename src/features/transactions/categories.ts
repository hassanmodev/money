import {
  Banknote,
  Bus,
  Coffee,
  Coins,
  Dumbbell,
  HeartPulse,
  Home,
  LineChart,
  PartyPopper,
  PiggyBank,
  Plug,
  Repeat,
  Scale,
  ShoppingBag,
  ShoppingCart,
  Utensils,
  type LucideIcon,
} from 'lucide-react'

export interface Category {
  key: string
  label: string
  icon: LucideIcon
  color: string
}

export const CATEGORIES: Category[] = [
  { key: 'groceries', label: 'Groceries', icon: ShoppingCart, color: '#9eb87f' },
  { key: 'dining', label: 'Dining', icon: Utensils, color: '#d4845c' },
  { key: 'coffee', label: 'Coffee', icon: Coffee, color: '#cba24f' },
  { key: 'rent', label: 'Rent', icon: Home, color: '#8aa0c8' },
  { key: 'utilities', label: 'Utilities', icon: Plug, color: '#74b1a3' },
  { key: 'transport', label: 'Transport', icon: Bus, color: '#b88cc0' },
  { key: 'shopping', label: 'Shopping', icon: ShoppingBag, color: '#db8a82' },
  { key: 'health', label: 'Health', icon: HeartPulse, color: '#d98a7e' },
  { key: 'fun', label: 'Fun', icon: PartyPopper, color: '#e0aa66' },
  { key: 'fitness', label: 'Fitness', icon: Dumbbell, color: '#9eb87f' },
  { key: 'subscriptions', label: 'Subscriptions', icon: Repeat, color: '#8aa0c8' },
  { key: 'salary', label: 'Income', icon: Banknote, color: '#9eb87f' },
  { key: 'savings', label: 'Savings', icon: PiggyBank, color: '#74b1a3' },
  { key: 'investing', label: 'Investing', icon: LineChart, color: '#8aa0c8' },
  { key: 'adjustment', label: 'Adjustment', icon: Scale, color: '#a89ec2' },
  { key: 'other', label: 'Other', icon: Coins, color: '#b4a695' },
]

const FALLBACK: Category = { key: 'other', label: 'Other', icon: Coins, color: '#b4a695' }

export const normalizeCategory = (value: string) => value.trim().toLowerCase()
  .split('.').map((part) => part.trim().replace(/\s*:\s*/g, ':')).join('.')

export const validCategory = (value: string) => {
  const path = normalizeCategory(value)
  return Boolean(path) && path.split('.').every((part) => /^[^.:\s]+(?: [^.:\s]+)*(?::[^.:\s]+(?: [^.:\s]+)*)?$/.test(part))
}

export const categoryOf = (key?: string): Category => {
  const path = normalizeCategory(key || 'other')
  const root = CATEGORIES.find((c) => c.key === path.split('.')[0]) ?? FALLBACK
  return { ...root, key: path, label: CATEGORIES.find((c) => c.key === path)?.label ?? path }
}

/** Match whole segments or contiguous paths, including property names and values. */
export function matchesCategory(category: string | undefined, query: string) {
  const search = normalizeCategory(query)
  if (!search) return true
  const parts = normalizeCategory(category || 'other').split('.')
  const wanted = search.split('.')
  return parts.some((_, start) => wanted.every((part, offset) => {
    const segment = parts[start + offset]
    return segment === part || Boolean(segment?.includes(':') && segment.split(':').includes(part))
  }))
}

export function categorySuggestions(value: string, categories: string[]) {
  const query = normalizeCategory(value)
  const split = query.lastIndexOf('.')
  const parent = split < 0 ? '' : query.slice(0, split + 1)
  const fragment = query.slice(split + 1)
  const paths = new Set<string>()
  for (const category of categories) {
    const parts = normalizeCategory(category).split('.')
    for (let i = 1; i <= parts.length; i++) paths.add(parts.slice(0, i).join('.'))
  }
  const score = (path: string) => {
    const tail = parent ? path.slice(parent.length) : path
    if (tail === fragment) return 0
    if (tail.startsWith(fragment)) return 1
    if (tail.includes(fragment)) return 2
    let position = 0
    for (const char of tail) if (char === fragment[position]) position++
    return position === fragment.length ? 3 : 4
  }
  return [...paths].filter((path) => (!parent || path.startsWith(parent)) && path !== parent && score(path) < 4)
    .sort((a, b) => score(a) - score(b) || a.split('.').length - b.split('.').length || a.localeCompare(b)).slice(0, 8)
}
