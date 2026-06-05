import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Cloud, QrCode, Phone, Settings } from 'lucide-react'
import { authApi } from '@/api'
import { useAuthStore } from '@/stores'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'

// Step: 'phone' langsung (API credentials sudah disimpan di setup)
type Step = 'phone' | 'otp' | 'password' | 'qr'

export default function AuthPage() {
  const navigate = useNavigate()
  const { setUser } = useAuthStore()

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [qrUrl, setQrUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleError = (e: unknown) => {
    const msg = (e as { response?: { data?: { detail?: string } }, message?: string })
    setError(msg?.response?.data?.detail || msg?.message || 'Terjadi kesalahan.')
  }

  async function onSendCode() {
    if (!phone) return setError('Nomor telepon wajib diisi.')
    setLoading(true); setError('')
    try {
      // api_id & api_hash otomatis dibaca dari config storage di backend
      await authApi.sendCode(phone, 0, '')
      setStep('otp')
    } catch (e) { handleError(e) }
    finally { setLoading(false) }
  }

  async function onSignIn() {
    setLoading(true); setError('')
    try {
      const res = await authApi.signIn(code)
      if (res.data.next_step === 'dashboard') {
        const me = await authApi.getMe()
        setUser(me.data)
        navigate('/')
      } else if (res.data.next_step === 'password') {
        setStep('password')
      }
    } catch (e) { handleError(e) }
    finally { setLoading(false) }
  }

  async function onCheckPassword() {
    setLoading(true); setError('')
    try {
      const res = await authApi.checkPassword(password)
      if (res.data.success) {
        const me = await authApi.getMe()
        setUser(me.data)
        navigate('/')
      }
    } catch (e) { handleError(e) }
    finally { setLoading(false) }
  }

  // Polling QR status using standard React effect
  useEffect(() => {
    if (step === 'qr') {
      const poll = setInterval(async () => {
        try {
          const r = await authApi.pollQr()
          if (r.data.success) {
            clearInterval(poll)
            const me = await authApi.getMe()
            setUser(me.data)
            navigate('/')
          }
        } catch {
          // ignore error, keep polling
        }
      }, 1000)

      // Auto-regenerate QR Code every 25 seconds
      const refresh = setInterval(async () => {
        try {
          const res = await authApi.getQrToken(0, '')
          setQrUrl(res.data.url)
        } catch {
          // ignore error
        }
      }, 25000)

      return () => {
        clearInterval(poll)
        clearInterval(refresh)
      }
    }
  }, [step, navigate, setUser])

  async function onStartQR() {
    setLoading(true); setError('')

    try {
      const res = await authApi.getQrToken(0, '')
      setQrUrl(res.data.url)
      setStep('qr')
      // Interval is now handled by the useEffect above automatically!
    } catch (e) { handleError(e) }
    finally { setLoading(false) }
  }

  const inputClass = `w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white
    placeholder:text-white/30 focus:outline-none focus:border-blue-500 focus:ring-1
    focus:ring-blue-500/30 transition-all`

  const btnClass = `w-full py-3.5 rounded-xl font-semibold text-white transition-all
    bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400
    disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20
    flex items-center justify-center gap-2`

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'radial-gradient(ellipse at top, #0d1b3e 0%, #0d1117 60%)' }}>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl
            bg-gradient-to-br from-blue-600 to-blue-400 shadow-xl shadow-blue-500/30 mb-4">
            <Cloud className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Telegram Drive</h1>
          <p className="text-white/50 mt-1">Masuk dengan akun Telegram Anda</p>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-8 shadow-2xl">
          <AnimatePresence mode="wait">

            {/* Step 1: Phone */}
            {step === 'phone' && (
              <motion.div key="phone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">Login ke Telegram</h2>
                  <p className="text-sm text-white/50 mt-1">Masukkan nomor telepon dengan kode negara</p>
                </div>
                <input className={inputClass} placeholder="+62 812 3456 7890" type="tel"
                  value={phone} onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onSendCode()} autoFocus />
                <button className={btnClass} onClick={onSendCode} disabled={loading}>
                  {loading
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Mengirim...</>
                    : <><Phone className="w-4 h-4" /> Kirim Kode OTP</>
                  }
                </button>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10" />
                  </div>
                  <div className="relative flex justify-center text-xs text-white/30">
                    <span className="px-3 bg-transparent">atau</span>
                  </div>
                </div>

                <button onClick={onStartQR} disabled={loading}
                  className="w-full py-3 rounded-xl font-medium text-white/70 border border-white/10
                    hover:border-blue-500/50 hover:text-white transition-all flex items-center justify-center gap-2">
                  <QrCode className="w-4 h-4" />
                  Login via QR Code
                </button>
              </motion.div>
            )}

            {/* Step 2: OTP */}
            {step === 'otp' && (
              <motion.div key="otp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">Kode Verifikasi</h2>
                  <p className="text-sm text-white/50 mt-1">Kode dikirim ke <span className="text-white font-medium">{phone}</span></p>
                </div>
                <input className={`${inputClass} text-center text-2xl tracking-[0.5em] font-mono`}
                  placeholder="•••••" maxLength={6} value={code} autoFocus
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && onSignIn()} />
                <button className={btnClass} onClick={onSignIn} disabled={loading}>
                  {loading
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Memverifikasi...</>
                    : 'Masuk'
                  }
                </button>
                <button onClick={() => { setStep('phone'); setCode('') }}
                  className="w-full text-center text-sm text-white/40 hover:text-white/70 transition-colors">
                  ← Ubah nomor telepon
                </button>
              </motion.div>
            )}

            {/* Step 3: 2FA Password */}
            {step === 'password' && (
              <motion.div key="pw" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">Verifikasi Dua Langkah</h2>
                  <p className="text-sm text-white/50 mt-1">Akun ini mengaktifkan password 2FA.</p>
                </div>
                <input className={inputClass} type="password" placeholder="Masukkan password 2FA"
                  value={password} onChange={(e) => setPassword(e.target.value)} autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && onCheckPassword()} />
                <button className={btnClass} onClick={onCheckPassword} disabled={loading}>
                  {loading
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Memverifikasi...</>
                    : 'Konfirmasi'
                  }
                </button>
              </motion.div>
            )}

            {/* Step 4: QR Code */}
            {step === 'qr' && (
              <motion.div key="qr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="space-y-4 text-center">
                <div>
                  <h2 className="text-xl font-semibold text-white">Scan QR Code</h2>
                  <p className="text-sm text-white/50 mt-1">
                    Buka Telegram di ponsel Anda → Settings → Devices → Link Desktop Device
                  </p>
                </div>
                {qrUrl && (
                  <div className="flex justify-center">
                    <div className="bg-white p-4 rounded-2xl inline-block shadow-xl">
                      <QRCodeSVG value={qrUrl} size={256} level="L" includeMargin={false} />
                    </div>
                  </div>
                )}
                <p className="text-xs text-white/30 animate-pulse">Menunggu scan...</p>
                <button onClick={() => setStep('phone')}
                  className="text-sm text-white/40 hover:text-white/70 transition-colors">
                  ← Kembali ke login nomor
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                {error}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer links */}
        <div className="flex items-center justify-center gap-4 mt-5">
          <button onClick={() => navigate('/setup')}
            className="flex items-center gap-1.5 text-xs text-white/20 hover:text-white/50 transition-colors">
            <Settings className="w-3 h-3" />
            Ubah API Config
          </button>
          <span className="text-white/10">·</span>
          <p className="text-xs text-white/20">Data tersimpan lokal, tidak ke pihak ketiga.</p>
        </div>
      </motion.div>
    </div>
  )
}
