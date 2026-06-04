import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Unlock, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '@/stores'

export default function PinLock() {
  const { isLocked, pin, unlock, logout } = useAuthStore()
  const [inputPin, setInputPin] = useState('')
  const [error, setError] = useState(false)

  // Block scrolling when locked
  useEffect(() => {
    if (isLocked) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
      setInputPin('')
      setError(false)
    }
  }, [isLocked])

  const handleInput = (val: string) => {
    if (inputPin.length >= 6) return
    const nextPin = inputPin + val
    setInputPin(nextPin)
    setError(false)

    if (nextPin.length === 6) {
      if (nextPin === pin) {
        unlock()
      } else {
        setError(true)
        setTimeout(() => setInputPin(''), 500) // reset
      }
    }
  }

  const handleDelete = () => {
    setInputPin(prev => prev.slice(0, -1))
    setError(false)
  }

  if (!isLocked) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
        animate={{ opacity: 1, backdropFilter: 'blur(24px)' }}
        exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
        className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          className="bg-[#1c1c1c] rounded-3xl p-8 max-w-sm w-full border border-white/10 shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-blue-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Layar Terkunci</h2>
            <p className="text-white/60 text-center text-sm">
              Sesi Anda telah terkunci karena tidak ada aktivitas. Masukkan PIN untuk melanjutkan.
            </p>
          </div>

          {/* PIN Dots */}
          <div className={`flex justify-center gap-4 mb-8 ${error ? 'animate-shake' : ''}`}>
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full transition-colors ${
                  i < inputPin.length
                    ? error ? 'bg-red-500' : 'bg-blue-500'
                    : 'bg-white/10'
                }`}
              />
            ))}
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button
                key={num}
                onClick={() => handleInput(num.toString())}
                className="h-14 rounded-2xl bg-white/5 hover:bg-white/10 text-white text-xl font-medium transition-colors"
              >
                {num}
              </button>
            ))}
            <div />
            <button
              onClick={() => handleInput('0')}
              className="h-14 rounded-2xl bg-white/5 hover:bg-white/10 text-white text-xl font-medium transition-colors"
            >
              0
            </button>
            <button
              onClick={handleDelete}
              className="h-14 rounded-2xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors"
            >
              ⌫
            </button>
          </div>

          <button
            onClick={logout}
            className="w-full py-3 text-red-400 hover:text-red-300 text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Unlock className="w-4 h-4" />
            Logout (Hapus Sesi)
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
