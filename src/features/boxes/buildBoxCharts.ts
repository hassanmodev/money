import { boxValueAt, type FinanceState, type PlannedBuy } from '@/domain'
import { ChartDataset, type ChartPoint } from '@/lib/charts/ChartDataset'
import { SWATCHES } from '@/lib/palette'

/** The finance-specific adapter; charts receive ordinary numeric points. */
export function buildBoxCharts(state: FinanceState, date: string, planned: PlannedBuy[] = []) {
  const balances = new ChartDataset(state.boxes.filter((box) => !box.archived))
    .map((box) => ({ box, value: boxValueAt(state, box.id, date, planned) }))

  const regular = new ChartDataset(balances.rows.filter(({ box }) => box.kind !== 'asset'))
  const groups = regular.groupBy(({ box }) => box.currency)
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
        label: currency,
        isAssets: false,
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

  const assets = balances.rows.filter(({ box }) => box.kind === 'asset')
  if (!assets.length) return groups

  const currency = state.settings.baseCurrency
  const accounts: ChartPoint[] = assets.map(({ box, value }) => {
    const rate = box.currency === currency ? 1 : state.settings.rates[box.currency]
    const converted = value * rate
    return {
      id: box.id,
      label: box.name,
      value: Number.isFinite(rate) && rate > 0 && Number.isFinite(converted) ? converted : null,
      color: box.color,
      detail: box.currency,
    }
  })
  const hasMissingRate = accounts.some((point) => point.value === null)
  const total = accounts.reduce((sum, point) => sum + (point.value ?? 0), 0)
  const positiveTotal = accounts.reduce((sum, point) => sum + Math.max(0, point.value ?? 0), 0)
  return [...groups, {
    currency,
    label: 'Assets',
    isAssets: true,
    total: hasMissingRate ? null : total,
    accounts,
    point: {
      id: 'assets',
      label: 'Assets',
      value: hasMissingRate ? null : positiveTotal,
      color: '#b88cc0',
      detail: `${assets.length} ${assets.length === 1 ? 'asset' : 'assets'}`,
    } satisfies ChartPoint,
  }]
}
