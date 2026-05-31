import { formatMoney, type CurrencyCode, type FormatOptions } from '@/domain'
import { cn } from '@/lib/cn'
import { useStore } from '@/store/store'
import { AnimatedNumber } from './AnimatedNumber'

export const useBaseCurrency = (): CurrencyCode =>
  useStore((s) => s.settings.baseCurrency)

/** A formatter bound to the user's base currency. */
export function useMoneyFmt() {
  const base = useBaseCurrency()
  return (amount: number, opts: FormatOptions & { currency?: CurrencyCode } = {}) =>
    formatMoney(amount, opts.currency ?? base, opts)
}

export interface MoneyProps extends FormatOptions {
  amount: number
  currency?: CurrencyCode
  animate?: boolean
  className?: string
}

/** Render an amount in a currency (base by default), optionally spring-animated. */
export function Money({ amount, currency, animate, className, ...opts }: MoneyProps) {
  const base = useBaseCurrency()
  const code = currency ?? base
  if (animate) {
    return (
      <AnimatedNumber
        value={amount}
        format={(n) => formatMoney(n, code, opts)}
        className={className}
      />
    )
  }
  return <span className={cn('tabular', className)}>{formatMoney(amount, code, opts)}</span>
}
