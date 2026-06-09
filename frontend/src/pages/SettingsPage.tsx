import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, sharingApi, setupApi } from '@/api'
import { ArrowLeft, Shield, Wifi, Key, Link, Trash2, Eye, EyeOff, Copy, Check, Cpu, RotateCcw, Lock } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuthStore } from '@/stores'
import ConfirmDialog from '@/components/ConfirmDialog'

type Tab = 'telegram' | 'proxy' | 'network' | 'apikey' | 'shares' | 'security'

export default function SettingsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('telegram')
  const [copied, setCopied] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const { pin, setPin, lock } = useAuthStore()
  const [pinInput, setPinInput] = useState('')
  const [confirmState, setConfirmState] = useState<{ type: 'reset_api' | 'delete_pin' } | null>(null)

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get })
  const { data: apiKeyData } = useQuery({ queryKey: ['api-key'], queryFn: settingsApi.getApiKey })
  const { data: sharesData } = useQuery({ queryKey: ['shares'], queryFn: sharingApi.list })
  const { data: configData } = useQuery({ queryKey: ['setup-config'], queryFn: setupApi.getConfig })

  const saveProxyMut = useMutation({
    mutationFn: (data: object) => settingsApi.saveProxy(data),
    onSuccess: () => alert('Pengaturan proxy disimpan!'),
  })

  const deleteConfigMut = useMutation({
    mutationFn: setupApi.deleteConfig,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['setup-config'] })
      navigate('/setup')
    },
  })

  const regenKeyMut = useMutation({
    mutationFn: settingsApi.regenerateApiKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-key'] }),
  })

  const deleteShareMut = useMutation({
    mutationFn: (token: string) => sharingApi.delete(token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shares'] }),
  })

  const copyKey = () => {
    navigator.clipboard.writeText(apiKeyData?.data?.api_key || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'telegram', label: 'Telegram API', icon: <Cpu className="w-4 h-4" /> },
    { id: 'proxy', label: 'Proxy', icon: <Shield className="w-4 h-4" /> },
    { id: 'network', label: 'Jaringan', icon: <Wifi className="w-4 h-4" /> },
    { id: 'apikey', label: 'API Key', icon: <Key className="w-4 h-4" /> },
    { id: 'shares', label: 'Share Links', icon: <Link className="w-4 h-4" /> },
    { id: 'security', label: 'Keamanan', icon: <Lock className="w-4 h-4" /> },
  ]

  const inputClass = `w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white
    placeholder:text-white/20 focus:outline-none focus:border-blue-500 transition-all text-sm`

  return (
    <div className="min-h-screen" style={{ background: '#0d1117' }}>
      <div className="max-w-3xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate('/')}
            className="p-2 rounded-xl hover:bg-white/5 text-white/40 hover:text-white transition-all">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">Pengaturan</h1>
            <p className="text-sm text-white/40">Konfigurasi proxy, jaringan, dan API</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-white/5 pb-4">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all
                ${tab === t.id ? 'bg-blue-600/20 text-blue-400' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {/* ── Telegram API Config ── */}
          {tab === 'telegram' && (
            <div className="space-y-4 rounded-2xl p-6" style={{ background: '#161b22', border: '1px solid rgba(255,255,255,0.05)' }}>
              <h2 className="text-base font-semibold text-white">Konfigurasi Telegram API</h2>
              <p className="text-sm text-white/40">Kredensial yang digunakan untuk terhubung ke Telegram.</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 rounded-xl bg-white/3 border border-white/5">
                  <div>
                    <p className="text-xs text-white/40 mb-1">API ID</p>
                    <p className="text-sm font-mono text-white font-medium">
                      {configData?.data?.api_id ?? '—'}
                    </p>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl bg-white/3 border border-white/5">
                  <div>
                    <p className="text-xs text-white/40 mb-1">API Hash</p>
                    <p className="text-sm font-mono text-white/50">{'•'.repeat(32)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 rounded-xl bg-white/3 border border-white/5">
                  <div>
                    <p className="text-xs text-white/40 mb-1">Nama Aplikasi</p>
                    <p className="text-sm text-white">{configData?.data?.app_name ?? 'Telegram Drive Web'}</p>
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-white/5">
                <p className="text-xs text-white/30 mb-3">
                  Untuk mengubah API credentials, Anda perlu reset konfigurasi. Ini akan menghapus sesi login aktif.
                </p>
                <button
                  onClick={() => setConfirmState({ type: 'reset_api' })}
                  disabled={deleteConfigMut.isPending}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                    text-red-400 border border-red-500/20 hover:bg-red-500/10
                    disabled:opacity-50 transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                  {deleteConfigMut.isPending ? 'Mereset...' : 'Reset Konfigurasi & Logout'}
                </button>
              </div>
            </div>
          )}

          {/* ── Proxy Settings ── */}
          {tab === 'proxy' && (
            <div className="space-y-4 rounded-2xl p-6" style={{ background: '#161b22', border: '1px solid rgba(255,255,255,0.05)' }}>
              <h2 className="text-base font-semibold text-white">Konfigurasi Proxy</h2>
              <p className="text-sm text-white/40">Gunakan SOCKS5 proxy untuk melewati pembatasan regional.</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs text-white/40 mb-1.5 block">Tipe Proxy</label>
                  <select className={`${inputClass} cursor-pointer`} defaultValue={settings?.data?.proxy?.proxy_type || 'socks5'}>
                    <option value="socks5">SOCKS5</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Host</label>
                  <input className={inputClass} placeholder="127.0.0.1"
                    defaultValue={settings?.data?.proxy?.host} />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Port</label>
                  <input className={inputClass} type="number" placeholder="1080"
                    defaultValue={settings?.data?.proxy?.port} />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Username (Opsional)</label>
                  <input className={inputClass} placeholder="username"
                    defaultValue={settings?.data?.proxy?.username} />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Password (Opsional)</label>
                  <input className={inputClass} type="password" placeholder="••••••••" />
                </div>
              </div>
              <button onClick={() => saveProxyMut.mutate({ enabled: true, proxy_type: 'socks5' })}
                disabled={saveProxyMut.isPending}
                className="px-6 py-2.5 rounded-xl text-sm font-medium text-white
                  bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400
                  disabled:opacity-50 transition-all">
                Simpan Proxy
              </button>
            </div>
          )}

          {/* ── Network Settings ── */}
          {tab === 'network' && (
            <div className="space-y-4 rounded-2xl p-6" style={{ background: '#161b22', border: '1px solid rgba(255,255,255,0.05)' }}>
              <h2 className="text-base font-semibold text-white">Konfigurasi Jaringan</h2>
              <p className="text-sm text-white/40">Atur batas bandwidth dan pengaturan koneksi.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Batas Download (KB/s, 0 = Tanpa Batas)</label>
                  <input className={inputClass} type="number" placeholder="0"
                    defaultValue={settings?.data?.network?.download_limit_kbps || 0} />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Batas Upload (KB/s, 0 = Tanpa Batas)</label>
                  <input className={inputClass} type="number" placeholder="0"
                    defaultValue={settings?.data?.network?.upload_limit_kbps || 0} />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Percobaan Ulang Saat Gagal</label>
                  <input className={inputClass} type="number" placeholder="3"
                    defaultValue={settings?.data?.network?.retry_attempts || 3} />
                </div>
              </div>
              <button className="px-6 py-2.5 rounded-xl text-sm font-medium text-white
                bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 transition-all">
                Simpan Pengaturan
              </button>
            </div>
          )}

          {/* ── API Key ── */}
          {tab === 'apikey' && (
            <div className="space-y-4 rounded-2xl p-6" style={{ background: '#161b22', border: '1px solid rgba(255,255,255,0.05)' }}>
              <h2 className="text-base font-semibold text-white">REST API Key</h2>
              <p className="text-sm text-white/40">API Key untuk mengakses API ini dari aplikasi lain (misal: n8n, Make, dll).</p>
              {apiKeyData?.data?.has_key ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10">
                    <span className="flex-1 font-mono text-sm text-white/70">
                      {showKey ? apiKeyData.data.api_key : '••••••••••••••••••••••••••••••••'}
                    </span>
                    <button onClick={() => setShowKey(!showKey)}
                      className="text-white/30 hover:text-white transition-colors">
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button onClick={copyKey} className="text-white/30 hover:text-white transition-colors">
                      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-white/30 italic">Belum ada API key. Buat yang baru di bawah.</p>
              )}
              <button onClick={() => regenKeyMut.mutate(undefined)} disabled={regenKeyMut.isPending}
                className="px-6 py-2.5 rounded-xl text-sm font-medium text-white border border-white/10
                  hover:border-blue-500/50 hover:text-blue-400 transition-all disabled:opacity-50">
                {regenKeyMut.isPending ? 'Membuat...' : apiKeyData?.data?.has_key ? 'Buat Ulang API Key' : 'Buat API Key Baru'}
              </button>
            </div>
          )}

          {/* ── Share Links ── */}
          {tab === 'shares' && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-white mb-4">Link Berbagi Aktif</h2>
              {(sharesData?.data || []).length === 0 ? (
                <div className="text-center py-12 text-white/20">
                  <Link className="w-12 h-12 mx-auto mb-3" />
                  <p>Belum ada link berbagi.</p>
                </div>
              ) : (
                (sharesData?.data || []).map((share: any) => (
                  <div key={share.token}
                    className="flex items-center gap-4 px-4 py-3 rounded-xl"
                    style={{ background: '#161b22', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 font-medium truncate">{share.file_name}</p>
                      <p className="text-xs text-white/30 mt-0.5">
                        Diunduh {share.download_count}x
                        {share.has_password && ' · 🔒 Berpassword'}
                        {share.expires_at && ` · Kadaluwarsa ${new Date(share.expires_at).toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => navigator.clipboard.writeText(share.share_url)}
                        className="p-2 rounded-lg hover:bg-white/5 text-white/30 hover:text-white transition-all">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteShareMut.mutate(share.token)}
                        className="p-2 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {/* ── Security ── */}
          {tab === 'security' && (
            <div className="space-y-4 rounded-2xl p-6" style={{ background: '#161b22', border: '1px solid rgba(255,255,255,0.05)' }}>
              <h2 className="text-base font-semibold text-white">Keamanan Aplikasi</h2>
              <p className="text-sm text-white/40">Kunci layar web secara otomatis jika tidak ada aktivitas selama 15 menit.</p>
              
              <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-white">Layar Kunci PIN</h3>
                    <p className="text-xs text-white/40">Status: {pin ? <span className="text-green-400">Aktif</span> : 'Nonaktif'}</p>
                  </div>
                </div>

                {!pin ? (
                  <div className="flex gap-2">
                    <input 
                      type="password" 
                      maxLength={6}
                      placeholder="Masukkan 6 Digit PIN" 
                      className={inputClass}
                      value={pinInput}
                      onChange={e => setPinInput(e.target.value)}
                    />
                    <button 
                      onClick={() => {
                        if (pinInput.length === 6) {
                          setPin(pinInput)
                          setPinInput('')
                          alert('PIN berhasil disimpan!')
                        } else {
                          alert('PIN harus 6 digit!')
                        }
                      }}
                      className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 whitespace-nowrap"
                    >
                      Simpan PIN
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button 
                      onClick={lock}
                      className="px-4 py-2 rounded-xl border border-white/10 text-white text-sm font-medium hover:bg-white/5"
                    >
                      Kunci Sekarang
                    </button>
                    <button 
                      onClick={() => setConfirmState({ type: 'delete_pin' })}
                      className="px-4 py-2 rounded-xl bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20"
                    >
                      Hapus PIN
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>
      <ConfirmDialog
        open={confirmState !== null}
        onClose={() => setConfirmState(null)}
        title={confirmState?.type === 'reset_api' ? 'Reset Konfigurasi API' : 'Hapus PIN'}
        message={confirmState?.type === 'reset_api' 
          ? 'Apakah Anda yakin ingin mereset konfigurasi Telegram API? Anda akan log out dan harus mengatur ulang konfigurasi.' 
          : 'Apakah Anda yakin ingin menghapus PIN perlindungan?'}
        onConfirm={() => {
          if (confirmState?.type === 'reset_api') {
            deleteConfigMut.mutate(undefined)
          } else if (confirmState?.type === 'delete_pin') {
            setPin(null)
          }
        }}
      />
    </div>
  )
}
