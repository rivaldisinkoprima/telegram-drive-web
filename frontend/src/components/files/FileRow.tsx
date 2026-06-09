import { type FileItem, useDriveStore } from '@/stores'
import { filesApi } from '@/api'
import { Download, Trash2, Film, Music, Image as ImageIcon, FileText, Archive, File, Link as LinkIcon, Edit } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import ShareDialog from './ShareDialog'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { useDownload } from '@/hooks/useDownload'

interface Props { file: FileItem; onPreview?: () => void; onPreviewPdf?: () => void }

function getIcon(mime: string) {
  if (mime.startsWith('video/')) return <Film className="w-4 h-4 text-purple-400" />
  if (mime.startsWith('audio/')) return <Music className="w-4 h-4 text-pink-400" />
  if (mime.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-green-400" />
  if (mime === 'application/pdf') return <FileText className="w-4 h-4 text-red-400" />
  if (mime.includes('zip') || mime.includes('rar')) return <Archive className="w-4 h-4 text-yellow-400" />
  return <File className="w-4 h-4 text-blue-400" />
}

function formatSize(bytes: number) {
  if (bytes === 0) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export default function FileRow({ file, onPreview, onPreviewPdf }: Props) {
  const { currentFolderId, selectedFiles, toggleSelectFile, files, setFiles, setIsDraggingFile } = useDriveStore()
  const qc = useQueryClient()
  const [shareOpen, setShareOpen] = useState(false)
  const { downloadEncryptedFile, isDownloading, downloadProgress } = useDownload()

  const deleteMut = useMutation({
    mutationFn: () => filesApi.delete(file.message_id, currentFolderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files', currentFolderId] }),
  })

  const handleDelete = () => {
    // Optimistic Update
    setFiles(files.filter(f => f.message_id !== file.message_id))
    
    toast.promise(deleteMut.mutateAsync(), {
      loading: 'Menghapus file...',
      success: 'File berhasil dihapus',
      error: 'Gagal menghapus file',
    })
  }

  const handleDownload = (e: React.MouseEvent) => {
    if (file.is_encrypted) {
      e.preventDefault()
      const pwd = prompt('File ini terenkripsi E2EE. Masukkan password:')
      if (pwd) {
        downloadEncryptedFile(file.message_id, currentFolderId, file.file_name, pwd)
      }
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

  const safeMime = file.mime_type || 'application/octet-stream'
  const isImage = safeMime.startsWith('image/')
  const isVideo = safeMime.startsWith('video/')
  const isMedia = isVideo || safeMime.startsWith('audio/') || isImage
  const isPdf = safeMime === 'application/pdf'

  // Safe date formatting
  let formattedDate = '—'
  if (file.date) {
    const d = new Date(file.date)
    if (!isNaN(d.getTime())) {
      formattedDate = format(d, 'dd MMM yyyy')
    }
  }

  return (
    <div 
      draggable
      onDragStart={(e) => {
        setIsDraggingFile(true)
        e.dataTransfer.setData('application/telegram-drive-file', file.message_id.toString())
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={() => setIsDraggingFile(false)}
      className={`flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 group transition-all ${
        selectedFiles.has(file.message_id) ? 'bg-blue-500/10' : ''
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          toggleSelectFile(file.message_id)
        }}
        className={`w-5 h-5 flex-shrink-0 rounded border flex items-center justify-center transition-all ${
          selectedFiles.has(file.message_id)
            ? 'bg-blue-500 border-blue-500'
            : 'border-white/20 hover:border-white/50'
        }`}
      >
        {selectedFiles.has(file.message_id) && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </button>

      {/* Icon */}
      <div className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0"
        style={{ background: '#21262d' }}>
        {getIcon(safeMime)}
      </div>

      {/* Name — clickable for images */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {file.is_encrypted && <div className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-bold">E2EE</div>}
        <p
          className={`text-sm text-white/90 font-medium truncate ${!file.is_encrypted && (isImage || isPdf) ? 'cursor-pointer hover:text-blue-400 transition-colors' : ''}`}
          onClick={() => {
            if (!file.is_encrypted) {
              if (isImage && onPreview) onPreview()
              else if (isPdf && onPreviewPdf) onPreviewPdf()
            }
          }}
        >
          {file.is_encrypted ? file.file_name.replace('.enc', '') : file.file_name}
        </p>
      </div>

      {/* Size */}
      <div className="w-20 text-right">
        <span className="text-xs text-white/30">{formatSize(file.file_size)}</span>
      </div>

      {/* Date */}
      <div className="w-32 text-right hidden md:block">
        <span className="text-xs text-white/30">
          {formattedDate}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setShareOpen(true)}
          className="p-1.5 rounded-lg hover:bg-blue-600/20 text-white/40 hover:text-blue-400 transition-all">
          <LinkIcon className="w-3.5 h-3.5" />
        </button>
        <a 
          href={file.is_encrypted ? '#' : filesApi.downloadUrl(file.message_id, currentFolderId)} 
          download={!file.is_encrypted ? file.file_name : undefined}
          onClick={handleDownload}
          className="p-1.5 rounded-lg hover:bg-blue-600/20 text-white/40 hover:text-blue-400 transition-all">
          <Download className="w-3.5 h-3.5" />
        </a>
        {!file.is_encrypted && isVideo && (
          <a href={filesApi.streamUrl(file.message_id, currentFolderId)} target="_blank" rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded-lg hover:bg-purple-600/20 text-white/40 hover:text-purple-400 transition-all">
            <Film className="w-3.5 h-3.5" />
          </a>
        )}
        <button onClick={handleRename}
          className="p-1.5 rounded-lg hover:bg-blue-600/20 text-white/40 hover:text-blue-400 transition-all">
          <Edit className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleDelete}
          className="p-1.5 rounded-lg hover:bg-red-600/20 text-white/40 hover:text-red-400 transition-all">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <ShareDialog
        file={file}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        currentFolderId={currentFolderId}
      />
    </div>
  )
}
