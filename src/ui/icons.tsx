import {
  Banknote,
  Bitcoin,
  Boxes,
  Coins,
  Gem,
  Landmark,
  LineChart,
  PiggyBank,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { Box, BoxKind } from '@/domain'

export const KIND_ICON: Record<BoxKind, LucideIcon> = {
  cash: Banknote,
  checking: Wallet,
  savings: PiggyBank,
  investment: LineChart,
  asset: Gem,
  crypto: Bitcoin,
  custom: Boxes,
}

const NAMED: Record<string, LucideIcon> = {
  Wallet,
  Banknote,
  PiggyBank,
  Landmark,
  LineChart,
  ChartLine: LineChart,
  Bitcoin,
  Gem,
  Coins,
  Boxes,
}

/** Resolve a box's icon: explicit override → kind default → generic. */
export function boxIcon(box: Pick<Box, 'icon' | 'kind'>): LucideIcon {
  return (box.icon && NAMED[box.icon]) || KIND_ICON[box.kind] || Coins
}

export const KIND_LABEL: Record<BoxKind, string> = {
  cash: 'Cash',
  checking: 'Checking',
  savings: 'Savings',
  investment: 'Investment',
  asset: 'Asset',
  crypto: 'Crypto',
  custom: 'Custom',
}
