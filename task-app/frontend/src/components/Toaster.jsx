import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const remove = useCallback((id) => {
    setToasts((ts) => ts.filter((t) => t.id !== id))
  }, [])

  const notify = useCallback((message, type = 'info', opts = {}) => {
    const id = ++idRef.current
    const toast = { id, message, type }
    setToasts((ts) => [...ts, toast])
    const duration = opts.duration ?? (type === 'error' ? 5000 : 3000)
    window.setTimeout(() => remove(id), duration)
  }, [remove])

  const value = useMemo(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              'shadow-lg rounded-md px-4 py-3 text-sm text-white',
              t.type === 'error' && 'bg-rose-600',
              t.type === 'success' && 'bg-emerald-600',
              t.type === 'info' && 'bg-slate-800',
            ].filter(Boolean).join(' ')}
            role="status"
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}


