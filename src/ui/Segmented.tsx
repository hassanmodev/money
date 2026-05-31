import { motion } from 'motion/react'
import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
}

/** A segmented control with a spring-animated highlight that slides between options. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T
  onChange: (value: T) => void
  options: SegmentOption<T>[]
  className?: string
  size?: 'sm' | 'md'
}) {
  const layoutId = useId()
  return (
    <div
      className={cn(
        'relative inline-flex rounded-xl border border-line bg-sunken/40 p-1',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'relative z-10 rounded-lg font-medium transition-colors duration-200',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
              active ? 'text-ink' : 'text-faint hover:text-muted',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 -z-10 rounded-lg border border-line-2 bg-raised shadow-soft"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
