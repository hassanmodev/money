/**
 * Time travel — the app's movable notion of "now".
 *
 * Every derived/viewed number in the app (net worth, box values, projections,
 * the goal plan) is computed *as of a date*, defaulting to today. This tiny,
 * deliberately un-persisted store lets the user slide that date forward or back
 * so the whole interface reframes itself to a future (or past) "today".
 *
 * It is view state, not data: it never touches the persisted world, resets to
 * the real today on reload, and mutations (adding entries, achieving goals) stay
 * anchored to the real calendar. Time travel changes what you *see*, never what
 * you *save*.
 */
import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import type { ISODate } from '@/domain'
import { todayISO } from '@/lib/date'

interface TimeTravelState {
  /** The date the whole app treats as "today". Defaults to the real today. */
  viewDate: ISODate
  /** Keep following the calendar until the user deliberately time-travels. */
  followingToday: boolean
  setViewDate: (iso: ISODate) => void
  /** Return the cursor to the real today. */
  reset: () => void
}

export const useTimeTravel = create<TimeTravelState>((set) => ({
  viewDate: todayISO(),
  followingToday: true,
  setViewDate: (viewDate) => set({ viewDate, followingToday: viewDate === todayISO() }),
  reset: () => set({ viewDate: todayISO(), followingToday: true }),
}))

/**
 * Subscribe to the local calendar day. The timeout handles an open tab crossing
 * midnight; focus/visibility handle a suspended laptop or backgrounded tab.
 */
const subscribeToToday = (onDayChange: () => void) => {
  if (typeof window === 'undefined') return () => undefined

  let timer = 0
  const scheduleMidnight = () => {
    window.clearTimeout(timer)
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    timer = window.setTimeout(() => {
      onDayChange()
      scheduleMidnight()
    }, Math.max(1, next.getTime() - now.getTime() + 50))
  }
  const checkDay = () => onDayChange()

  scheduleMidnight()
  window.addEventListener('focus', checkDay)
  document.addEventListener('visibilitychange', checkDay)
  return () => {
    window.clearTimeout(timer)
    window.removeEventListener('focus', checkDay)
    document.removeEventListener('visibilitychange', checkDay)
  }
}

/** The real local calendar day, reactive across midnight and tab wake-up. */
export const useToday = (): ISODate =>
  useSyncExternalStore(subscribeToToday, todayISO, todayISO)

/** Subscribe to the app's notion of "now" (the time-travel cursor). */
export const useViewDate = (): ISODate => {
  const today = useToday()
  const viewDate = useTimeTravel((s) => s.viewDate)
  const followingToday = useTimeTravel((s) => s.followingToday)
  return followingToday ? today : viewDate
}

/** True when the cursor has moved off the real today. */
export const useIsTimeTraveling = (): boolean => useTimeTravel((s) => !s.followingToday)

/** Read the current view date outside React (e.g. one-off calculations). */
export const viewDate = (): ISODate => {
  const state = useTimeTravel.getState()
  return state.followingToday ? todayISO() : state.viewDate
}
