import { type FileItem, useDriveStore } from '@/stores'
import { filesApi } from '@/api'
import { useState } from 'react'
import { Download, Trash2, Film, Music, Image, FileText, Archive, File, Link as LinkIcon, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import ShareDialog from './ShareDialog'
import toast from 'react-hot-toast'
import { useDownload } from '@/hooks/useDownload'

interface Props { file: FileItem }

function getIcon(mime: string) {
  if (mime.startsWith('video/')) return <Film className="w-8 h-8 text-purple-400" />
  if (mime.startsWith('audio/')) return <Music className="w-8 h-8 text-pink-400" />
  if (mime.startsWith('image/')) return <Image className="w-8 h-8 text-green-400" />
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

export default function FileCard({ file }: Props) {
  const { currentFolderId } = useDriveStore()
  const qc = useQueryClient()
  const [hovered, setHovered] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const { downloadEncryptedFile, isDownloading } = useDownload()

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
    if (file.is_encrypted) {
      e.preventDefault()
      const pwd = prompt('File ini terenkripsi E2EE. Masukkan password:')
      if (pwd) {
        downloadEncryptedFile(file.message_id, currentFolderId, file.file_name, pwd)
      }
    }
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
        {file.has_thumbnail ? (
          <img
            src={filesApi.previewUrl(file.message_id, currentFolderId)}
            alt={file.file_name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full">
            {getIcon(file.mime_type)}
          </div>
        )}

        {/* Hover overlay */}
        {hovered && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); setShareOpen(true) }}
              className="p-2 rounded-lg bg-white/10 hover:bg-blue-600 text-white transition-all">
              <LinkIcon className="w-4 h-4" />
            </button>
            <a
              href={file.is_encrypted ? '#' : filesApi.downloadUrl(file.message_id, currentFolderId)}
              download={!file.is_encrypted ? file.file_name : undefined}
              onClick={handleDownload}
              className="p-2 rounded-lg bg-white/10 hover:bg-blue-600 text-white transition-all">
              {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            </a>
            {!file.is_encrypted && isMedia && (
              <a
                href={filesApi.streamUrl(file.message_id, currentFolderId)}
                target="_blank" rel="noreferrer"
                className="p-2 rounded-lg bg-white/10 hover:bg-purple-600 text-white transition-all"
                onClick={(e) => e.stopPropagation()}>
                <Film className="w-4 h-4" />
              </a>
            )}
            {!file.is_encrypted && isPdf && (
              <a
                href={filesApi.streamUrl(file.message_id, currentFolderId)}
                target="_blank" rel="noreferrer"
                className="p-2 rounded-lg bg-white/10 hover:bg-red-600 text-white transition-all"
                onClick={(e) => e.stopPropagation()}>
                <FileText className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete() }}
              className="p-2 rounded-lg bg-white/10 hover:bg-red-600 text-white transition-all">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* File info */}
      <div className="p-2.5">
        <p className="text-xs text-white/80 font-medium truncate" title={file.file_name}>
          {file.is_encrypted ? file.file_name.replace('.enc', '') : file.file_name}
        </p>
        <p className="text-xs text-white/30 mt-0.5">{formatSize(file.file_size)}</p>
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
