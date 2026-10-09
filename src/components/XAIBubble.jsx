import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

export default function XAIBubble({ title, children }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* The tiny bubble trigger */}
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 hover:bg-indigo-200 hover:scale-110 active:scale-95 transition-all duration-200 cursor-pointer border border-indigo-200/50 shadow-sm flex-shrink-0"
        title="How is this calculated?"
      >
        <span className="text-xs font-black leading-none select-none">?</span>
      </button>

      {/* Portal-rendered glassmorphic modal — escapes all parent overflow/stacking */}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 flex items-center justify-center p-4"
              style={{ zIndex: 9999 }}
              onClick={() => setOpen(false)}
            >
              {/* Backdrop */}
              <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />

              {/* Modal */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                onClick={(e) => e.stopPropagation()}
                className="relative z-10 w-full max-w-md bg-white/80 backdrop-blur-2xl rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.15)] border border-white/50 overflow-hidden"
              >
                {/* Top accent bar */}
                <div className="h-1 bg-gradient-to-r from-indigo-500 via-indigo-400 to-purple-500" />

                {/* Header */}
                <div className="px-6 pt-5 pb-3 flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600 mb-1 block">Explainability</span>
                    <h3 className="text-lg font-headline font-bold text-slate-900">{title}</h3>
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>

                {/* Content */}
                <div className="px-6 pb-6 text-sm text-slate-600 leading-relaxed space-y-3">
                  {children}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
