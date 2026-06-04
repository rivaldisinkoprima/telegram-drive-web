import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { foldersApi } from '@/api'
import { X, FolderPlus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  open: boolean
  onClose: () => void
}

export default function CreateFolderDialog({ open, onClose }: Props) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const createMut = useMutation({
    mutationFn: () => foldersApi.create(name.trim()),
    onSuccess: (res) => {
      qc.setQueryData(['folders'], (old: any) => {
        if (!old || !old.data) return { data: [res.data] }
        // Cek jika sudah ada untuk menghindari duplikat
        const exists = old.data.find((f: any) => f.id === res.data.id)
        if (exists) return old
        return { ...old, data: [...old.data, res.data] }
      })
      setName('')
      setError('')
      onClose()
      
      // Invalidate query in the background to ensure consistency
      setTimeout(() => qc.invalidateQueries({ queryKey: ['folders'] }), 2000)
    },
    onError: (e: any) => setError(e.response?.data?.detail || 'Gagal membuat folder.'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Nama folder tidak boleh kosong.')
    createMut.mutate()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: '#161b22', border: '1px solid rgba(255,255,255,0.08)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-blue-400" />
                <span className="font-semibold text-white">Buat Folder Baru</span>
              </div>
              <button onClick={onClose}
                className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-white/40 mb-1.5">Nama Folder</label>
                <input
                  autoFocus
                  className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white
                    placeholder:text-white/20 focus:outline-none focus:border-blue-500 transition-all"
                  placeholder="contoh: Dokumen Penting"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl text-sm text-white/60 border border-white/10
                    hover:border-white/20 hover:text-white transition-all">
                  Batal
                </button>
                <button type="submit" disabled={createMut.isPending}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white
                    bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400
                    disabled:opacity-50 transition-all">
                  {createMut.isPending ? 'Membuat...' : 'Buat Folder'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
