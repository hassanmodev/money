/**
 * The week's data, memoized. `computeWeek` is the single engine pass behind
 * everything the tab renders — it costs a few milliseconds, so it re-runs
 * only when the underlying slices, the viewed week, or the minute hand move.
 */
import { format } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import { computeWeek, type ISODate, type WeekData } from '@/domain/time'
import { useTimeStore } from '@/store/timeProjects'

export interface Now {
  date: ISODate
  minute: number
}

const readNow = (): Now => {
  const d = new Date()
  return { date: format(d, 'yyyy-MM-dd'), minute: d.getHours() * 60 + d.getMinutes() }
}

/** The current minute, ticking forward so "now" and the past boundary stay honest. */
export function useNow(tickMs = 45_000): Now {
  const [now, setNow] = useState(readNow)
  useEffect(() => {
    const t = setInterval(() => setNow(readNow()), tickMs)
    return () => clearInterval(t)
  }, [tickMs])
  return now
}

export function useWeekData(weekStart: ISODate): { data: WeekData; now: Now } {
  const projects = useTimeStore((s) => s.projects)
  const qualities = useTimeStore((s) => s.qualities)
  const blocks = useTimeStore((s) => s.blocks)
  const rules = useTimeStore((s) => s.rules)
  const fragments = useTimeStore((s) => s.fragments)
  const settings = useTimeStore((s) => s.settings)
  const now = useNow()

  const data = useMemo(
    () => computeWeek({ projects, qualities, blocks, rules, fragments, settings }, weekStart, now),
    [projects, qualities, blocks, rules, fragments, settings, weekStart, now],
  )
  return { data, now }
}
