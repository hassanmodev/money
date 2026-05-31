import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { useIsMobile } from '@/lib/hooks'
import { Button } from './Button'

export interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

/** A side sheet on desktop, a bottom sheet on mobile. The primary editing surface. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: SheetProps) {
  const mobile = useIsMobile()

  const panelMotion = mobile
    ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }
    : { initial: { x: '101%' }, animate: { x: 0 }, exit: { x: '101%' } }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[3px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              aria-describedby={undefined}
              className="z-50"
            >
              <motion.div
                {...panelMotion}
                transition={{ type: 'spring', stiffness: 340, damping: 36 }}
                className={cn(
                  'fixed z-50 flex flex-col border-line bg-surface shadow-lift',
                  mobile
                    ? 'inset-x-0 bottom-0 max-h-[90vh] rounded-t-3xl border-t pb-[env(safe-area-inset-bottom)]'
                    : 'right-0 top-0 h-full w-full max-w-md border-l',
                  className,
                )}
              >
                {mobile && (
                  <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-line-2" />
                )}
                <header className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
                  <div className="min-w-0">
                    {title && (
                      <Dialog.Title className="font-serif text-2xl text-ink">
                        {title}
                      </Dialog.Title>
                    )}
                    {description && (
                      <Dialog.Description className="mt-1 text-sm text-muted">
                        {description}
                      </Dialog.Description>
                    )}
                  </div>
                  <Dialog.Close asChild>
                    <Button size="icon" variant="ghost" aria-label="Close">
                      <X className="size-5" />
                    </Button>
                  </Dialog.Close>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>

                {footer && (
                  <footer className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
                    {footer}
                  </footer>
                )}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
