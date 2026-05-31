import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  /** a leading color dot */
  dot?: string
  children: ReactNode
}

export function Chip({ className, dot, children, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-line bg-raised/60',
        'px-2.5 py-1 text-xs font-medium text-muted',
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: dot }}
        />
      )}
      {children}
    </span>
  )
}
