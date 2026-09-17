import { useMemo } from 'react'
import { currencyMeta, formatMoney } from '@/domain'
import { useFinanceState, usePlannedBuys } from '@/store/selectors'
import { useViewDate } from '@/store/time'
import { Card, Money } from '@/ui'
import { DistributionChart } from '@/ui/charts/DistributionChart'
import { buildBoxCharts } from './buildBoxCharts'

export function BoxCharts() {
  const state = useFinanceState()
  const planned = usePlannedBuys()
  const date = useViewDate()
  const groups = useMemo(() => buildBoxCharts(state, date, planned), [state, date, planned])
  const base = state.settings.baseCurrency
  if (!groups.length) return null

  return (
    <section className="mt-8" aria-labelledby="box-charts-heading">
      <div className="mb-4">
        <h2 id="box-charts-heading" className="font-serif text-2xl text-ink">By currency</h2>
        <p className="mt-1 text-sm text-muted">Your accounts, grouped by the currency they hold.</p>
      </div>
      <Card className="mb-4 p-5">
        <h3 className="text-lg text-ink">Currency mix</h3>
        <p className="mb-4 mt-1 text-xs text-muted">Positive balances in {base}, using your saved exchange rates.</p>
        <DistributionChart
          label="Currency mix"
          points={groups.map((group) => group.point)}
          formatValue={(value) => formatMoney(value, base)}
        />
        {groups.some((group) => group.point.value === null) && (
          <p className="mt-3 text-xs text-muted">Some currencies need an exchange rate in Settings to appear in this pie. Their accounts are listed below.</p>
        )}
      </Card>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {groups.map((group) => (
          <Card key={group.currency} className="min-w-0 p-5">
            <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg text-ink">{group.currency}</h3>
                <p className="text-xs text-muted">{currencyMeta(group.currency).name}</p>
              </div>
              <div className="min-w-0 text-right">
                <div className="text-[11px] text-faint">Net balance</div>
                <Money amount={group.total} currency={group.currency} className="break-words text-sm text-ink" />
              </div>
            </header>
            <DistributionChart
              label={`${group.currency} accounts`}
              points={group.accounts}
              formatValue={(value) => formatMoney(value, group.currency)}
              emptyMessage="No positive account balances yet"
            />
          </Card>
        ))}
      </div>
    </section>
  )
}
