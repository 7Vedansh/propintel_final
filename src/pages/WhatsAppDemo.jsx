import { useState, useEffect, useRef } from 'react'
import { whatsappMessages } from '../data/mockData'
import Navbar from '../components/Layout/Navbar'
import { MapPin, Camera, CheckCheck, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function WhatsAppDemo() {
  const [visibleMessages, setVisibleMessages] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const chatEndRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (currentIndex < whatsappMessages.length) {
      const timer = setTimeout(() => {
        setVisibleMessages(prev => [...prev, whatsappMessages[currentIndex]])
        setCurrentIndex(prev => prev + 1)
      }, currentIndex === 0 ? 500 : 1000 + Math.random() * 800)
      return () => clearTimeout(timer)
    }
  }, [currentIndex])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visibleMessages])

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <Navbar />

      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-12 p-6">
        {/* Phone frame */}
        <div className="w-full max-w-[380px] flex-shrink-0 bg-black rounded-[3rem] p-3 shadow-2xl">
          {/* Screen */}
          <div className="bg-white rounded-[2.2rem] overflow-hidden flex flex-col" style={{ height: 'min(680px, 75vh)' }}>
            {/* Status bar */}
            <div className="bg-slate-900 px-6 py-2 flex items-center justify-between">
              <span className="text-white text-xs font-medium">9:41</span>
              <div className="w-20 h-5 bg-slate-800 rounded-full" /> {/* Notch */}
              <div className="flex items-center gap-1">
                <div className="flex gap-0.5">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="w-0.5 bg-white rounded-full" style={{ height: `${8 + i * 2}px` }} />
                  ))}
                </div>
                <div className="w-5 h-2.5 border border-white rounded-sm ml-1">
                  <div className="w-3/4 h-full bg-white rounded-sm" />
                </div>
              </div>
            </div>

            {/* WhatsApp header */}
            <div className="bg-emerald-700 px-4 py-3 flex items-center gap-3">
              <button
                onClick={() => navigate('/')}
                aria-label="Back to dashboard"
                className="text-white transition-colors duration-150 hover:text-emerald-100"
              >
                <ArrowLeft aria-hidden="true" size={20} />
              </button>
              <div className="w-9 h-9 bg-emerald-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-sm">PS</span>
              </div>
              <div className="flex-1">
                <p className="text-white text-sm font-semibold">PropIntel Bot</p>
                <p className="text-emerald-200 text-xs">
                  {currentIndex < whatsappMessages.length ? 'typing...' : 'online'}
                </p>
              </div>
              <div className="flex gap-4 text-emerald-200">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94M23 21v-2a4 4 0 0 0-3-3.87M12 3a4 4 0 0 1 0 8M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                </svg>
              </div>
            </div>

            {/* Chat area */}
            <div className="flex-1 whatsapp-bg p-3 overflow-y-auto space-y-2">
              {/* Date divider */}
              <div className="flex justify-center mb-2">
                <span className="bg-white/80 text-slate-500 text-xs px-3 py-1 rounded-full shadow-sm">
                  TODAY
                </span>
              </div>

              {visibleMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
                  <div className={msg.type === 'user' ? 'chat-bubble-user' : 'chat-bubble-bot'}>
                    {msg.isLocation && (
                      <div className="mb-2 bg-emerald-50 rounded-lg p-2.5 border border-emerald-100">
                        <div className="flex items-center gap-1.5 mb-1">
                          <MapPin size={13} className="text-emerald-600" />
                          <span className="text-xs font-semibold text-emerald-700">Live Location</span>
                        </div>
                        <p className="text-xs text-emerald-600">{msg.locationText}</p>
                      </div>
                    )}

                    {msg.isImage && (
                      <div className="mb-2 grid grid-cols-3 gap-1 rounded-lg overflow-hidden">
                        {['from-blue-200 to-blue-300', 'from-amber-200 to-amber-300', 'from-emerald-200 to-emerald-300'].map((gradient, i) => (
                          <div key={i} className={`h-16 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                            <Camera size={14} className="text-white/60" />
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed">{msg.text}</p>
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-xs text-slate-400">{msg.time}</span>
                      {msg.type === 'user' && (
                        <CheckCheck size={13} className="text-blue-500" />
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {currentIndex < whatsappMessages.length && (
                <div className="flex justify-start">
                  <div className="chat-bubble-bot py-3 px-4">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input bar */}
            <div className="bg-white border-t border-slate-100 px-3 py-2 flex items-center gap-2">
              <div className="flex-1 bg-slate-100 rounded-full px-4 py-2.5 flex items-center">
                <span className="text-sm text-slate-400">Type a message...</span>
              </div>
              <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
                </svg>
              </div>
            </div>

            {/* Home indicator */}
            <div className="flex justify-center py-2 bg-white">
              <div className="w-28 h-1 bg-slate-200 rounded-full" />
            </div>
          </div>
        </div>

        {/* Side description */}
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold text-slate-800 mb-3">WhatsApp Integration</h2>
          <p className="text-sm text-slate-500 leading-relaxed mb-6">
            Field agents and applicants can submit property data directly through WhatsApp.
            The PropIntel bot guides them through location sharing, property details, and photo uploads.
          </p>
          <div className="space-y-3">
            {[
              { step: '1', text: 'Share property location via GPS pin' },
              { step: '2', text: 'Provide basic property details' },
              { step: '3', text: 'Upload 3-5 property photos' },
              { step: '4', text: 'Receive instant PropIntel analysis' },
            ].map((item) => (
              <div key={item.step} className="flex items-center gap-3">
                <div className="w-7 h-7 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-emerald-700">{item.step}</span>
                </div>
                <span className="text-sm text-slate-600">{item.text}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => navigate('/')}
            className="mt-8 px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
          >
            Back to Dashboard →
          </button>
        </div>
      </div>
    </div>
  )
}
