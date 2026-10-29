import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Menu({
  trigger,
  children,
  align = 'end',
}: {
  trigger: ReactNode
  children: ReactNode
  align?: 'start' | 'center' | 'end'
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          // Portal clicks still bubble through the React tree to the owning card.
          onClick={(event) => event.stopPropagation()}
          className="z-[60] min-w-44 rounded-xl border border-line bg-raised p-1 shadow-lift"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function MenuItem({
  onSelect,
  icon: Icon,
  danger,
  children,
}: {
  onSelect?: () => void
  icon?: ComponentType<{ className?: string }>
  danger?: boolean
  children: ReactNode
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors',
        danger
          ? 'text-rust data-[highlighted]:bg-rust/15'
          : 'text-muted data-[highlighted]:bg-clay/15 data-[highlighted]:text-ink',
      )}
    >
      {Icon && <Icon className="size-4" />}
      {children}
    </DropdownMenu.Item>
  )
}
