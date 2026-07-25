/** Small formatting helpers for the time tab. */

/** 150 → "2h30" · 45 → "45m" · 120 → "2h" */
export const fmtDur = (min: number): string => {
  const m = Math.round(min)
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest}m`
  return rest === 0 ? `${h}h` : `${h}h${String(rest).padStart(2, '0')}`
}

/** 600 → "10:00" (24h, the grid's own clock) */
export const fmtTime = (minute: number): string => {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

/** 150 → "2.5h" — compact hours for badges */
export const fmtHours = (min: number): string => `${Math.round(min / 6) / 10}h`
