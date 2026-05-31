import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-7 flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="font-serif text-3xl text-ink md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-prose text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
