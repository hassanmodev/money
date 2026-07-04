import { Archive, CircleDashed, Sparkles, type LucideIcon } from 'lucide-react'
import type { GoalStatus } from '@/domain'

/** The most a goal can be rated — the top of every happiness slider. */
export const MAX_RATING = 100

export const STATUS_META: Record<GoalStatus, { label: string; icon: LucideIcon; tone: string }> = {
  open: { label: 'Open', icon: CircleDashed, tone: 'text-clay' },
  done: { label: 'Achieved', icon: Sparkles, tone: 'text-sage' },
  dismissed: { label: 'Shelved', icon: Archive, tone: 'text-faint' },
}

export const STATUS_ORDER: GoalStatus[] = ['open', 'done', 'dismissed']
