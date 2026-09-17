import { boxValueAt, type FinanceState, type PlannedBuy } from '@/domain'
import { ChartDataset, type ChartPoint } from '@/lib/charts/ChartDataset'
import { SWATCHES } from '@/lib/palette'

/** The finance-specific adapter; charts receive ordinary numeric points. */
export function buildBoxCharts(state: FinanceState, date: string, planned: PlannedBuy[] = []) {
  const balances = new ChartDataset(state.boxes.filter((box) => !box.archived))
    .map((box) => ({ box, value: boxValueAt(state, box.id, date, planned) }))

  return balances.groupBy(({ box }) => box.currency)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ key: currency, data }) => {
      const rate = currency === state.settings.baseCurrency ? 1 : state.settings.rates[currency]
      const positiveTotal = data.sum(({ value }) => Math.max(0, value))
      // Stable currency color even when accounts are reordered or removed.
      const hash = [...currency].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0)
      const color = SWATCHES[hash % SWATCHES.length].hex
      const accounts = data.map<ChartPoint>(({ box, value }) => ({
        id: box.id, label: box.name, value, color: box.color,
      })).rows
      const converted = positiveTotal * rate
      return {
        currency,
        total: data.sum(({ value }) => value),
        accounts,
        point: {
          id: currency,
          label: currency,
          value: Number.isFinite(rate) && rate > 0 && Number.isFinite(converted) ? converted : null,
          color,
          detail: `${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}`,
        } satisfies ChartPoint,
      }
    })
}
