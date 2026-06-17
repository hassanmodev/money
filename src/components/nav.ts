import { Boxes, LayoutGrid, LineChart, Receipt, Settings, Target, type LucideIcon } from 'lucide-react'

export interface NavItemDef {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export const NAV: NavItemDef[] = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/boxes', label: 'Boxes', icon: Boxes },
  { to: '/planning', label: 'Planning', icon: LineChart },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/activity', label: 'Activity', icon: Receipt },
  { to: '/settings', label: 'Settings', icon: Settings },
]
