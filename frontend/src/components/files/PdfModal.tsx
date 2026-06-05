import { useEffect, useState } from 'react'
import { X, Download, Loader2 } from 'lucide-react'
import { type FileItem } from '@/stores'
import { filesApi } from '@/api'

interface PdfModalProps {
  file: FileItem | null
  currentFolderId: number | null
  onClose: () => void
}

export default function PdfModal({ file, currentFolderId, onClose }: PdfModalProps) {
  const [loading, setLoading] = useState(true)

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!file) return null

  const pdfUrl = filesApi.streamUrl(file.message_id, currentFolderId)
  const downloadUrl = filesApi.downloadUrl(file.message_id, currentFolderId)

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900"
      onClick={onClose}
    >
      <div 
        className="w-full h-full flex flex-col relative"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 shrink-0 px-4 flex items-center justify-between border-b border-white/10 bg-zinc-950">
          <span className="text-white font-medium text-sm truncate max-w-xs md:max-w-lg">
            {file.file_name}
          </span>
          <div className="flex items-center gap-2">
            <a
              href={downloadUrl}
              download={file.file_name}
              className="p-2 text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-all"
            >
              <Download className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-2 text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 relative bg-white">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-10">
              <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
            </div>
          )}
          <iframe
            src={pdfUrl}
            className="w-full h-full border-none"
            onLoad={() => setLoading(false)}
            title={file.file_name}
          />
        </div>
      </div>
    </div>
  )
}
