import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export default function Modal({ children, onClose, title, maxWidth = 'max-w-3xl' }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (typeof onClose !== 'function') return undefined
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return undefined
    const previousFocus = typeof document !== 'undefined' ? document.activeElement : null
    const focusTarget = node.querySelector('[data-autofocus]') || node
    focusTarget.focus({ preventScroll: true })
    return () => {
      if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [])

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        ref={containerRef}
        className={`modal-content ${maxWidth} w-full mx-4`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        tabIndex={-1}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <h3 id="modal-title" className="text-lg font-semibold text-slate-800">{title}</h3>
            <button
              onClick={onClose}
              type="button"
              aria-label="Close dialog"
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors duration-150"
            >
              <X aria-hidden="true" size={18} strokeWidth={1.5} className="text-slate-500" />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
