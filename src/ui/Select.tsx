import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface SelectOption {
  value: string
  label: ReactNode
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  'aria-label': ariaLabel,
}: {
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  'aria-label'?: string
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          'flex h-11 items-center justify-between gap-2 rounded-xl border border-line bg-sunken/40 px-3.5',
          'text-sm text-ink outline-none transition-all duration-200',
          'hover:border-line-2 focus:border-clay/50 focus:ring-4 focus:ring-clay/10 data-[placeholder]:text-ghost',
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-faint" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-[60] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-line bg-raised shadow-lift"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className={cn(
                  'relative flex cursor-pointer select-none items-center justify-between gap-3 rounded-lg px-3 py-2',
                  'text-sm text-muted outline-none transition-colors',
                  'data-[highlighted]:bg-clay/15 data-[highlighted]:text-ink data-[state=checked]:text-ink',
                )}
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check className="size-4 text-clay" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
