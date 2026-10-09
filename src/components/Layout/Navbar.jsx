import { Bell, Settings, MessageSquare, Download } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'

export default function Navbar({ onGenerateReport }) {
  const navigate = useNavigate()
  const location = useLocation()
  const isWhatsApp = location.pathname === '/whatsapp'

  return (
    <nav className="h-14 bg-white/80 backdrop-blur-xl border-b border-zinc-200/80 px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Left: Logo */}
      <button
        type="button"
        onClick={() => navigate('/')}
        aria-label="Go to PropIntel home"
        className="flex items-center gap-3 rounded-lg transition-colors duration-150 hover:opacity-90"
      >
        <div aria-hidden="true" className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-sm">
          <span className="text-white font-bold text-sm tracking-tight">P</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-semibold text-zinc-900 tracking-tight">PropIntel</span>
          <span className="text-xs font-medium text-zinc-400 tracking-widest uppercase">Intelligence</span>
        </div>
      </button>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => navigate(isWhatsApp ? '/' : '/whatsapp')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 rounded-lg transition-all"
        >
          <MessageSquare size={15} strokeWidth={1.5} />
          WhatsApp
        </button>

        <button
          onClick={onGenerateReport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 rounded-lg transition-all"
        >
          <Download size={15} strokeWidth={1.5} />
          Report
        </button>

        <div className="w-px h-5 bg-zinc-200 mx-1.5" />

        <button
          type="button"
          aria-label="Notifications"
          className="p-2 hover:bg-zinc-50 rounded-lg transition-colors duration-150"
        >
          <Bell aria-hidden="true" size={16} strokeWidth={1.5} className="text-zinc-400" />
        </button>

        <button
          type="button"
          aria-label="Settings"
          className="p-2 hover:bg-zinc-50 rounded-lg transition-colors duration-150"
        >
          <Settings aria-hidden="true" size={16} strokeWidth={1.5} className="text-zinc-400" />
        </button>

        <button
          type="button"
          aria-label="User profile"
          className="w-8 h-8 bg-gradient-to-br from-zinc-700 to-zinc-900 rounded-full flex items-center justify-center ml-1.5 transition-all duration-150 hover:ring-2 hover:ring-zinc-200"
        >
          <span aria-hidden="true" className="text-white text-xs font-semibold">CO</span>
        </button>
      </div>
    </nav>
  )
}
