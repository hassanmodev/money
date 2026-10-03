import { formatMoney, reportingAmounts, type CurrencyCode, type FormatOptions } from '@/domain'
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
  /** Lead with base currency, then the original and extra reporting currencies. */
  report?: boolean
  reportInline?: boolean
  className?: string
}

/** Render an amount in a currency (base by default), optionally spring-animated. */
export function Money({ amount, currency, animate, report, reportInline, className, ...opts }: MoneyProps) {
  const settings = useStore((s) => s.settings)
  const base = settings.baseCurrency
  const code = currency ?? base
  if (report) {
    const baseAmount = code === base
      ? amount
      : reportingAmounts(amount, code, settings).find((value) => value.currency === base)?.amount
    return (
      <span className={cn('min-w-0 max-w-full align-baseline', reportInline ? 'inline-flex flex-wrap items-baseline gap-x-2 gap-y-1' : 'inline-block')}>
        {baseAmount == null
          ? <span className="text-sm text-muted">{base} · rate needed</span>
          : <Money amount={baseAmount} currency={base} animate={animate} className={className} {...opts} />}
        <MoneyEquivalents amount={amount} currency={code} baseFirst reportInline={reportInline} {...opts} />
      </span>
    )
  }
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

/** Secondary figures always name their currency, even when symbols overlap. */
export function MoneyEquivalents({ amount, currency, className, reportInline, baseFirst = false, ...opts }: Omit<MoneyProps, 'animate' | 'report'> & { baseFirst?: boolean }) {
  const settings = useStore((s) => s.settings)
  const source = currency ?? settings.baseCurrency
  const original = baseFirst && source !== settings.baseCurrency
  const values = reportingAmounts(amount, source, settings)
    .filter((value) => !baseFirst || value.currency !== settings.baseCurrency)
  if (!original && !values.length) return null
  return (
    <span className={cn('font-sans text-xs font-normal leading-relaxed text-muted tabular', reportInline ? 'inline-flex flex-wrap items-baseline gap-x-2 gap-y-1' : 'mt-1 block', className)}>
      {original && (
        <span className={reportInline ? 'whitespace-nowrap' : 'block'} title="Original amount in its native currency">
          {formatMoney(amount, source, { compact: opts.compact, sign: opts.sign })} · {source}
        </span>
      )}
      {values.map((value) => (
        <span key={value.currency} className={reportInline ? 'whitespace-nowrap' : 'block'} title="Equivalent at your saved exchange rates">
          {value.amount === null
            ? `${value.currency} · rate needed`
            : `≈ ${formatMoney(value.amount, value.currency, { compact: opts.compact, sign: opts.sign })} · ${value.currency}`}
        </span>
      ))}
    </span>
  )
}
