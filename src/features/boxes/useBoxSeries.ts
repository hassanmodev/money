import { useMemo } from 'react'
import { boxValueAt, type Box } from '@/domain'
import { toISO } from '@/lib/date'
import { useFinanceState } from '@/store/selectors'

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000

/** A box's projected value (own currency) sampled from today into the future. */
export function useBoxSeries(box: Box, { points = 24, years = 3 } = {}): number[] {
  const state = useFinanceState()
  return useMemo(() => {
    const fromT = Date.now()
    const toT = fromT + years * MS_PER_YEAR
    return Array.from({ length: points }, (_, i) =>
      boxValueAt(state, box.id, toISO(new Date(fromT + ((toT - fromT) * i) / (points - 1)))),
    )
  }, [state, box.id, points, years])
}
