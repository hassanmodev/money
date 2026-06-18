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
import { create } from 'zustand'
import type { ISODate } from '@/domain'
import { todayISO } from '@/lib/date'

interface TimeTravelState {
  /** The date the whole app treats as "today". Defaults to the real today. */
  viewDate: ISODate
  setViewDate: (iso: ISODate) => void
  /** Return the cursor to the real today. */
  reset: () => void
}

export const useTimeTravel = create<TimeTravelState>((set) => ({
  viewDate: todayISO(),
  setViewDate: (viewDate) => set({ viewDate }),
  reset: () => set({ viewDate: todayISO() }),
}))

/** Subscribe to the app's notion of "now" (the time-travel cursor). */
export const useViewDate = (): ISODate => useTimeTravel((s) => s.viewDate)

/** True when the cursor has moved off the real today. */
export const useIsTimeTraveling = (): boolean =>
  useTimeTravel((s) => s.viewDate !== todayISO())

/** Read the current view date outside React (e.g. one-off calculations). */
export const viewDate = (): ISODate => useTimeTravel.getState().viewDate
