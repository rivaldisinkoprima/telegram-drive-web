import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Link as LinkIcon, Copy, Check } from 'lucide-react'
import { sharingApi } from '@/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { FileItem } from '@/stores'

interface Props {
  file: FileItem | null
  open: boolean
  onClose: () => void
  currentFolderId: number | null
}

export default function ShareDialog({ file, open, onClose, currentFolderId }: Props) {
  const qc = useQueryClient()
  const [password, setPassword] = useState('')
  const [expires, setExpires] = useState<number | ''>('')
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const createMut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected')
      const res = await sharingApi.create({
        message_id: file.message_id,
        folder_id: currentFolderId,
        password: password || undefined,
        expires_in_hours: expires ? Number(expires) : undefined,
      })
      return res.data
    },
    onSuccess: (data) => {
      setShareUrl(data.share_url)
      qc.invalidateQueries({ queryKey: ['shares'] })
    },
  })

  const copyUrl = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClose = () => {
    setPassword('')
    setExpires('')
    setShareUrl('')
    createMut.reset()
    onClose()
  }

  if (!open || !file) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
          style={{ background: '#161b22' }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <LinkIcon className="w-5 h-5 text-blue-400" />
              Bagikan File
            </h2>
            <button onClick={handleClose} className="p-2 -mr-2 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6">
            <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/5">
              <p className="text-sm font-medium text-white truncate" title={file.file_name}>{file.file_name}</p>
              <p className="text-xs text-white/40 mt-1">Buat link publik agar orang lain bisa mengunduh file ini tanpa aplikasi Telegram.</p>
            </div>

            {shareUrl ? (
              <div className="space-y-4">
                <p className="text-sm text-green-400 font-medium">Link berhasil dibuat!</p>
                <div className="flex items-center gap-2">
                  <input readOnly value={shareUrl}
                    className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" />
                  <button onClick={copyUrl}
                    className="p-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all flex items-center gap-2">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <button onClick={handleClose}
                  className="w-full py-3 rounded-xl font-medium text-white border border-white/10 hover:bg-white/5 transition-all mt-4">
                  Selesai
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-white/40 mb-1.5 block">Kata Sandi (Opsional)</label>
                  <input
                    type="password"
                    placeholder="Masukkan password untuk proteksi..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500 transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-white/40 mb-1.5 block">Kedaluwarsa dalam (Jam) (Opsional)</label>
                  <input
                    type="number"
                    placeholder="Contoh: 24"
                    value={expires}
                    onChange={(e) => setExpires(e.target.value === '' ? '' : Number(e.target.value))}
                    min="1"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500 transition-all text-sm"
                  />
                  <p className="text-xs text-white/30 mt-2">Kosongkan jika ingin link berlaku selamanya.</p>
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <button onClick={handleClose}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-all">
                    Batal
                  </button>
                  <button
                    onClick={() => createMut.mutate()}
                    disabled={createMut.isPending}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-all flex items-center gap-2">
                    {createMut.isPending ? 'Membuat...' : 'Buat Link'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
