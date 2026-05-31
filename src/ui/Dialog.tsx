import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

export interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: ReactNode
  description?: ReactNode
  children?: ReactNode
  className?: string
}

/** A small centered modal — used for confirmations and focused choices. */
export function Modal({ open, onOpenChange, title, description, children, className }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-[3px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Dialog.Content
                  asChild
                  onClick={(e) => e.stopPropagation()}
                  aria-describedby={undefined}
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97, y: 6 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    className={cn(
                      'card-surface w-full max-w-sm p-6 shadow-lift',
                      className,
                    )}
                  >
                    {title && (
                      <Dialog.Title className="font-serif text-xl text-ink">{title}</Dialog.Title>
                    )}
                    {description && (
                      <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted">
                        {description}
                      </Dialog.Description>
                    )}
                    {children}
                  </motion.div>
                </Dialog.Content>
              </motion.div>
            </Dialog.Overlay>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  onConfirm,
  danger,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  onConfirm: () => void
  danger?: boolean
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          onClick={() => {
            onConfirm()
            onOpenChange(false)
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
