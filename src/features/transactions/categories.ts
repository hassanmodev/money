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

export const categoryOf = (key?: string): Category =>
  CATEGORIES.find((c) => c.key === key) ?? FALLBACK
