/** Find a pronounced value drop around the first two rows, or keep two rows. */
export function collapsedBoxCount(values: number[], columns: number): number {
  const row = Math.max(1, Math.floor(columns))
  const fallback = Math.min(values.length, row * 2)
  let cutoff = fallback
  let largestDrop = 0.6
  for (let i = row; i <= Math.min(values.length - 1, row * 2 + 1); i++) {
    const before = values[i - 1]
    const after = values[i]
    if (before <= 0) continue
    const drop = 1 - after / before
    // On ties, prefer the boundary closest to two rows.
    if (drop > largestDrop || (drop === largestDrop && Math.abs(i - row * 2) < Math.abs(cutoff - row * 2))) {
      largestDrop = drop
      cutoff = i
    }
  }
  return cutoff
}
