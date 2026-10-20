/**
 * Toasts, with an optional Undo that stays for 10 seconds (spec 8.2).
 * One toast at a time: a new one replaces the old.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import { useT } from '../i18n'

export const UNDO_MS = 10_000
const PLAIN_MS = 4_000

export interface ToastInput {
  message: string
  /** Shows an Undo button; the toast then stays for 10 s. */
  onUndo?: () => void
}

interface ToastState extends ToastInput {
  id: number
}

const Context = createContext<(toast: ToastInput) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const seq = useRef(0)

  const show = useCallback((input: ToastInput) => {
    seq.current += 1
    setToast({ ...input, id: seq.current })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), toast.onUndo ? UNDO_MS : PLAIN_MS)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <Context.Provider value={show}>
      {children}
      <ToastView toast={toast} onClose={() => setToast(null)} />
    </Context.Provider>
  )
}

export function useToast(): (toast: ToastInput) => void {
  return useContext(Context)
}

function ToastView({ toast, onClose }: { toast: ToastState | null; onClose: () => void }) {
  const t = useT()
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-nav-offset z-50 flex justify-center px-4 pb-3 lg:bottom-6"
    >
      {toast ? (
        <div
          key={toast.id}
          className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-card bg-ink px-4 py-3 text-base text-white"
        >
          <span className="min-w-0 flex-1 break-words">{toast.message}</span>
          {toast.onUndo ? (
            <button
              type="button"
              onClick={() => {
                toast.onUndo?.()
                onClose()
              }}
              className="min-h-tap shrink-0 rounded-lg px-3 font-semibold text-orange underline-offset-2 hover:underline"
            >
              {t('common.undo')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
