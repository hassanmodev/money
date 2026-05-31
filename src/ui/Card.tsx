import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'card-surface',
        interactive &&
          'cursor-pointer transition-all duration-300 ease-[var(--ease-cozy)] hover:-translate-y-0.5 hover:border-line-2 hover:shadow-lift',
        className,
      )}
      {...props}
    />
  ),
)
Card.displayName = 'Card'
