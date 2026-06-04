import { useState } from 'react'
import { motion } from 'framer-motion'
import { Cloud, ExternalLink, ShieldCheck, ArrowRight, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '@/api'

export default function SetupPage() {
  const navigate = useNavigate()
  const [apiId, setApiId] = useState('')
  const [apiHash, setApiHash] = useState('')
  const [appName, setAppName] = useState('Telegram Drive Web')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!apiId || !apiHash) return setError('API ID dan API Hash wajib diisi.')
    if (isNaN(Number(apiId)) || Number(apiId) <= 0) return setError('API ID harus berupa angka positif.')
    if (apiHash.length < 10) return setError('API Hash tidak valid (terlalu pendek).')

    setLoading(true)
    try {
      await api.post('/setup/telegram-config', {
        api_id: Number(apiId),
        api_hash: apiHash.trim(),
        app_name: appName.trim() || 'Telegram Drive Web',
      })
      navigate('/login')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string }
      setError(err.response?.data?.detail || err.message || 'Gagal menyimpan konfigurasi.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = `w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white
    placeholder:text-white/30 focus:outline-none focus:border-blue-500 focus:ring-1
    focus:ring-blue-500/30 transition-all text-sm`

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'radial-gradient(ellipse at top, #0d1b3e 0%, #0d1117 60%)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl
            bg-gradient-to-br from-blue-600 to-blue-400 shadow-2xl shadow-blue-500/30 mb-4">
            <Cloud className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Selamat Datang!</h1>
          <p className="text-white/50 mt-2">Pertama kali? Hubungkan akun Telegram Anda dahulu.</p>
        </div>

        {/* Steps info */}
        <div className="flex gap-2 mb-6">
          {['Konfigurasi API', 'Login Telegram', 'Mulai Pakai'].map((label, i) => (
            <div key={i} className="flex-1 flex items-center gap-2">
              <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold flex-shrink-0 ${
                i === 0 ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/30'
              }`}>
                {i + 1}
              </div>
              <span className={`text-xs font-medium ${i === 0 ? 'text-white/80' : 'text-white/30'}`}>
                {label}
              </span>
              {i < 2 && <div className="flex-1 h-px bg-white/10" />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8 shadow-2xl"
          style={{ background: '#161b22', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Guide link */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <ShieldCheck className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-white/80 font-medium">Cara mendapatkan API credentials:</p>
                <p className="text-white/50 mt-1">
                  Buka{' '}
                  <a
                    href="https://my.telegram.org/apps"
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 underline underline-offset-2"
                  >
                    my.telegram.org/apps
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {' '}→ Login → "Create Application" → salin API ID dan API Hash.
                </p>
              </div>
            </div>

            {/* API ID */}
            <div>
              <label className="block text-xs text-white/50 font-medium mb-1.5">
                API ID <span className="text-red-400">*</span>
              </label>
              <input
                className={inputClass}
                placeholder="Contoh: 12345678"
                value={apiId}
                onChange={(e) => setApiId(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                autoFocus
              />
            </div>

            {/* API Hash */}
            <div>
              <label className="block text-xs text-white/50 font-medium mb-1.5">
                API Hash <span className="text-red-400">*</span>
              </label>
              <input
                className={`${inputClass} font-mono tracking-wider`}
                placeholder="Contoh: a1b2c3d4e5f6..."
                value={apiHash}
                onChange={(e) => setApiHash(e.target.value)}
              />
            </div>

            {/* App Name */}
            <div>
              <label className="block text-xs text-white/50 font-medium mb-1.5">
                Nama Aplikasi (opsional)
              </label>
              <input
                className={inputClass}
                placeholder="Telegram Drive Web"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
              />
              <p className="text-xs text-white/25 mt-1.5">
                Nama ini akan muncul di daftar sesi aktif Telegram Anda.
              </p>
            </div>

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
              >
                {error}
              </motion.div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-semibold text-white flex items-center
                justify-center gap-2 transition-all shadow-lg shadow-blue-500/20
                bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  Simpan & Lanjutkan
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Privacy note */}
        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-white/20">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>API credentials hanya tersimpan secara lokal di server Anda. Tidak dikirim ke mana pun.</span>
        </div>
      </motion.div>
    </div>
  )
}
