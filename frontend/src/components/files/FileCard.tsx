import { type FileItem, useDriveStore } from '@/stores'
import { filesApi } from '@/api'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Download, Trash2, Film, Music, Image as ImageIcon, FileText, Archive, File, Link as LinkIcon, Loader2, Edit, MoreVertical } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import ShareDialog from './ShareDialog'
import toast from 'react-hot-toast'
import { useDownload } from '@/hooks/useDownload'

interface Props { file: FileItem; onPreview?: () => void; onPreviewPdf?: () => void }

function getIcon(mime: string) {
  if (mime.startsWith('video/')) return <Film className="w-8 h-8 text-purple-400" />
  if (mime.startsWith('audio/')) return <Music className="w-8 h-8 text-pink-400" />
  if (mime.startsWith('image/')) return <ImageIcon className="w-8 h-8 text-green-400" />
  if (mime === 'application/pdf') return <FileText className="w-8 h-8 text-red-400" />
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar')) return <Archive className="w-8 h-8 text-yellow-400" />
  return <File className="w-8 h-8 text-blue-400" />
}

function formatSize(bytes: number) {
  if (bytes === 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export default function FileCard({ file, onPreview, onPreviewPdf }: Props) {
  const { currentFolderId } = useDriveStore()
  const qc = useQueryClient()
  const [shareOpen, setShareOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ x: number, y: number } | null>(null)
  const { downloadEncryptedFile, isDownloading } = useDownload()

  useEffect(() => {
    const closeMenu = () => setMenuPos(null)
    if (menuPos) {
      window.addEventListener('click', closeMenu)
      window.addEventListener('contextmenu', closeMenu)
      return () => {
        window.removeEventListener('click', closeMenu)
        window.removeEventListener('contextmenu', closeMenu)
      }
    }
  }, [menuPos])

  const isImage = file.mime_type.startsWith('image/')
  const isVideo = file.mime_type.startsWith('video/')
  const isAudio = file.mime_type.startsWith('audio/')
  const isPdf = file.mime_type === 'application/pdf'
  const isMedia = isImage || isVideo || isAudio

  const deleteMut = useMutation({
    mutationFn: () => filesApi.delete(file.message_id, currentFolderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files', currentFolderId] }),
  })

  const handleDelete = () => {
    toast.promise(deleteMut.mutateAsync(), {
      loading: 'Menghapus file...',
      success: 'File berhasil dihapus',
      error: 'Gagal menghapus file',
    })
  }

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (file.is_encrypted) {
      e.preventDefault()
      const pwd = prompt('File ini terenkripsi E2EE. Masukkan password:')
      if (pwd) {
        downloadEncryptedFile(file.message_id, currentFolderId, file.file_name, pwd)
      }
    } else {
      const link = document.createElement('a')
      link.href = filesApi.downloadUrl(file.message_id, currentFolderId)
      link.download = file.file_name
      link.click()
    }
  }

  const renameMut = useMutation({
    mutationFn: (newName: string) => filesApi.rename(file.message_id, newName, currentFolderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files', currentFolderId] }),
  })

  const handleRename = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newName = prompt('Masukkan nama file baru:', file.file_name)
    if (newName && newName.trim() && newName !== file.file_name) {
      toast.promise(renameMut.mutateAsync(newName.trim()), {
        loading: 'Mengganti nama...',
        success: 'Nama file berhasil diganti',
        error: 'Gagal mengganti nama file',
      })
    }
  }

  return (
    <>
    <div
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setMenuPos({ x: e.clientX, y: e.clientY })
      }}
      onClick={() => {
        if (!file.is_encrypted) {
          if (isImage && onPreview) onPreview()
          else if (isPdf && onPreviewPdf) onPreviewPdf()
        }
      }}
      className="relative group rounded-xl border border-white/5 hover:border-blue-500/30
        transition-all cursor-pointer overflow-hidden"
      style={{ background: '#161b22' }}
    >
      {/* Thumbnail / Icon */}
      <div className="aspect-square flex items-center justify-center relative overflow-hidden"
        style={{ background: '#21262d' }}>
        {file.is_encrypted && (
          <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-bold">
            E2EE
          </div>
        )}
        {!file.is_encrypted && (file.has_thumbnail || isImage || isPdf) ? (
          <img
            src={
              isPdf 
                ? filesApi.pdfThumbnailUrl(file.message_id, currentFolderId)
                : (file.has_thumbnail ? filesApi.previewUrl(file.message_id, currentFolderId) : filesApi.streamUrl(file.message_id, currentFolderId))
            }
            alt={file.file_name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              // Jika thumbnail PDF gagal dimuat (misal error di server), sembunyikan gambar dan tampilkan ikon fallback
              e.currentTarget.style.display = 'none';
              const nextSibling = e.currentTarget.nextElementSibling as HTMLElement;
              if (nextSibling) nextSibling.style.display = 'flex';
            }}
          />
        ) : null}
        
        {(!file.has_thumbnail && !isImage && !isPdf) || file.is_encrypted ? (
          <div className="flex items-center justify-center w-full h-full">
            {getIcon(file.mime_type)}
          </div>
        ) : (
          <div className="items-center justify-center w-full h-full" style={{ display: 'none' }}>
            {getIcon(file.mime_type)}
          </div>
        )}
      </div>

      {/* File info */}
      <div className="p-2.5 flex items-start justify-between gap-2">
        <div className="truncate flex-1">
          <p className="text-xs text-white/80 font-medium truncate" title={file.file_name}>
            {file.is_encrypted ? file.file_name.replace('.enc', '') : file.file_name}
          </p>
          <p className="text-xs text-white/30 mt-0.5">{formatSize(file.file_size)}</p>
        </div>
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const rect = e.currentTarget.getBoundingClientRect()
            setMenuPos({ x: rect.right - 180, y: rect.bottom + 5 })
          }}
          className="p-1 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>

      <ShareDialog
        file={file}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        currentFolderId={currentFolderId}
      />
    </div>

    {menuPos && createPortal(
      <div 
        className="fixed z-[9999] w-48 bg-[#1e2329] border border-white/10 rounded-xl shadow-2xl py-1 text-sm text-gray-200"
        style={{ top: Math.min(menuPos.y, window.innerHeight - 250), left: Math.min(menuPos.x, window.innerWidth - 200) }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={() => { setShareOpen(true); setMenuPos(null) }} className="w-full text-left px-4 py-2 hover:bg-white/10 flex items-center gap-3 transition-colors">
          <LinkIcon className="w-4 h-4" /> Share Link
        </button>
        
        <button
          onClick={(e) => { setMenuPos(null); handleDownload(e) }}
          className="w-full text-left px-4 py-2 hover:bg-white/10 flex items-center gap-3 transition-colors"
        >
          {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download
        </button>

        {!file.is_encrypted && isVideo && (
          <a
            href={filesApi.streamUrl(file.message_id, currentFolderId)}
            target="_blank" rel="noreferrer"
            onClick={() => setMenuPos(null)}
            className="w-full text-left px-4 py-2 hover:bg-white/10 flex items-center gap-3 transition-colors block"
          >
            <Film className="w-4 h-4" /> Play Video
          </a>
        )}

        <button onClick={(e) => { setMenuPos(null); handleRename(e) }} className="w-full text-left px-4 py-2 hover:bg-white/10 flex items-center gap-3 transition-colors">
          <Edit className="w-4 h-4" /> Rename
        </button>
        
        <div className="h-[1px] bg-white/10 my-1 w-full" />
        
        <button onClick={(e) => { setMenuPos(null); handleDelete() }} className="w-full text-left px-4 py-2 hover:bg-red-500/20 text-red-400 flex items-center gap-3 transition-colors">
          <Trash2 className="w-4 h-4" /> Delete
        </button>
      </div>,
      document.body
    )}
    </>
  )
}
