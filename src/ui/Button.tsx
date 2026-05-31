import { Slot } from '@radix-ui/react-slot'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-clay text-canvas hover:bg-honey shadow-soft hover:shadow-glow',
  secondary:
    'bg-raised text-ink hover:bg-line border border-line',
  ghost: 'text-muted hover:text-ink hover:bg-raised/70',
  outline: 'border border-line text-ink hover:border-line-2 hover:bg-raised/50',
  danger: 'bg-rust/15 text-rust hover:bg-rust/25',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-2xl',
  icon: 'h-10 w-10 rounded-xl',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(
          'inline-flex select-none items-center justify-center font-medium',
          'transition-all duration-200 ease-[var(--ease-cozy)] active:scale-[0.97]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay/40',
          'disabled:pointer-events-none disabled:opacity-40',
          VARIANTS[variant],
          SIZES[size],
          className,
        )}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'
