import { type FileItem, useDriveStore } from '@/stores'
import { filesApi } from '@/api'
import { Download, Trash2, Film, Music, Image, FileText, Archive, File } from 'lucide-react'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

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
  const isImage = file.mime_type.startsWith('image/')
  const isVideo = file.mime_type.startsWith('video/')
  const isAudio = file.mime_type.startsWith('audio/')

  const deleteMut = useMutation({
    mutationFn: () => filesApi.delete(file.message_id, currentFolderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files', currentFolderId] }),
  })

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
            <a
              href={filesApi.downloadUrl(file.message_id, currentFolderId)}
              download={file.file_name}
              className="p-2 rounded-lg bg-white/10 hover:bg-blue-600 text-white transition-all"
              onClick={(e) => e.stopPropagation()}>
              <Download className="w-4 h-4" />
            </a>
            {(isVideo || isAudio || isImage) && (
              <a
                href={filesApi.streamUrl(file.message_id, currentFolderId)}
                target="_blank" rel="noreferrer"
                className="p-2 rounded-lg bg-white/10 hover:bg-purple-600 text-white transition-all"
                onClick={(e) => e.stopPropagation()}>
                <Film className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); deleteMut.mutate() }}
              className="p-2 rounded-lg bg-white/10 hover:bg-red-600 text-white transition-all">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* File info */}
      <div className="p-2.5">
        <p className="text-xs text-white/80 font-medium truncate" title={file.file_name}>
          {file.file_name}
        </p>
        <p className="text-xs text-white/30 mt-0.5">{formatSize(file.file_size)}</p>
      </div>
    </div>
  )
}
