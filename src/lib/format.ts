/** Small presentational formatters (money lives in domain/money). */

export const fmtPercent = (fraction: number, digits = 1): string =>
  `${(fraction * 100).toFixed(digits)}%`

export const fmtSignedPercent = (fraction: number, digits = 1): string =>
  `${fraction >= 0 ? '+' : '−'}${(Math.abs(fraction) * 100).toFixed(digits)}%`

/** A compact count like 1.2k / 3.4M, for axis labels and chips. */
export const fmtCompact = (n: number): string =>
  new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n)

export const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n))

/** Linear map of v from [a0,a1] onto [b0,b1]. */
export const mapRange = (
  v: number,
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): number => (a1 === a0 ? b0 : b0 + ((v - a0) * (b1 - b0)) / (a1 - a0))
