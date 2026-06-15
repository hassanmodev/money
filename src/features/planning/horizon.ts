/** Pure helpers for the month-granular planning horizon. */

// Evenly-spaced *visually*, but denser in months up close where decisions live.
export const HORIZON_STOPS = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 18, 21, 24, 30, 36, 48, 60, 84, 120, 180, 240, 360,
]

export const HORIZON_PRESETS: { label: string; months: number }[] = [
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: '2Y', months: 24 },
  { label: '5Y', months: 60 },
  { label: '10Y', months: 120 },
  { label: '30Y', months: 360 },
]

/** Index of the stop nearest a given month count. */
export const nearestStop = (months: number): number => {
  let best = 0
  let bestD = Infinity
  HORIZON_STOPS.forEach((m, i) => {
    const d = Math.abs(m - months)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/** "8 months" · "1 yr 6 mo" · "3 years" — the horizon in plain words. */
export function horizonLabel(months: number): string {
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`
  const y = Math.floor(months / 12)
  const m = months % 12
  if (m === 0) return `${y} year${y === 1 ? '' : 's'}`
  return `${y} yr ${m} mo`
}
