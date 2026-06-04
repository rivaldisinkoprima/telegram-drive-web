import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react'
import { type FileItem } from '@/stores'
import { filesApi } from '@/api'

interface PreviewModalProps {
  files: FileItem[]
  currentFolderId: number | null
  initialFileId: number | null
  onClose: () => void
}

export default function PreviewModal({ files, currentFolderId, initialFileId, onClose }: PreviewModalProps) {
  // Memo so the array reference doesn't change on every render (this was causing
  // the useEffect below to reset currentIndex on every Next/Prev click)
  const previewableFiles = useMemo(
    () => files.filter(f => !f.is_encrypted && f.mime_type.startsWith('image/')),
    [files]
  )

  const [currentIndex, setCurrentIndex] = useState(() => {
    const idx = previewableFiles.findIndex(f => f.message_id === initialFileId)
    return idx >= 0 ? idx : 0
  })
  const [imgLoaded, setImgLoaded] = useState(false)
  const [direction, setDirection] = useState(0) // -1 prev, +1 next

  // Only sync when initialFileId changes (e.g. user clicks a different image to open)
  const prevFileId = useRef(initialFileId)
  useEffect(() => {
    if (initialFileId !== prevFileId.current) {
      prevFileId.current = initialFileId
      const idx = previewableFiles.findIndex(f => f.message_id === initialFileId)
      if (idx >= 0) setCurrentIndex(idx)
    }
  }, [initialFileId, previewableFiles])

  const goNext = useCallback(() => {
    setDirection(1)
    setImgLoaded(false)
    setCurrentIndex(prev => (prev < previewableFiles.length - 1 ? prev + 1 : 0))
  }, [previewableFiles.length])

  const goPrev = useCallback(() => {
    setDirection(-1)
    setImgLoaded(false)
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : previewableFiles.length - 1))
  }, [previewableFiles.length])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, goNext, goPrev])

  if (!initialFileId || previewableFiles.length === 0) return null

  const currentFile = previewableFiles[currentIndex]
  if (!currentFile) return null

  const imageUrl = filesApi.streamUrl(currentFile.message_id, currentFolderId)
  const downloadUrl = filesApi.downloadUrl(currentFile.message_id, currentFolderId)

  const slideVariants = {
    enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 80 : -80 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -80 : 80 }),
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="absolute top-0 left-0 right-0 z-20 p-4 flex items-center justify-between
          bg-gradient-to-b from-black/70 to-transparent pointer-events-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col">
          <span className="text-white font-semibold text-sm truncate max-w-xs md:max-w-lg">
            {currentFile.file_name}
          </span>
          {previewableFiles.length > 1 && (
            <span className="text-white/40 text-xs mt-0.5">
              {currentIndex + 1} / {previewableFiles.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={downloadUrl}
            download={currentFile.file_name}
            className="p-2.5 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-all"
            onClick={e => e.stopPropagation()}
          >
            <Download className="w-4 h-4" />
          </a>
          <button
            onClick={onClose}
            className="p-2.5 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Prev Button */}
      {previewableFiles.length > 1 && (
        <button
          onClick={e => { e.stopPropagation(); goPrev() }}
          className="absolute left-3 md:left-5 z-20 p-3 bg-white/10 hover:bg-white/20 
            text-white/70 hover:text-white rounded-full transition-all backdrop-blur-sm
            hover:scale-110 active:scale-95"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Image Area */}
      <div
        className="relative w-full h-full flex items-center justify-center overflow-hidden px-16"
        onClick={e => e.stopPropagation()}
      >
        {/* Loading spinner */}
        {!imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
          </div>
        )}

        <AnimatePresence mode="wait" custom={direction}>
          <motion.img
            key={currentFile.message_id}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'tween', ease: [0.25, 0.1, 0.25, 1], duration: 0.28 }}
            src={imageUrl}
            alt={currentFile.file_name}
            className="max-w-full max-h-[88vh] object-contain rounded-lg shadow-2xl select-none"
            style={{ opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.2s' }}
            onLoad={() => setImgLoaded(true)}
            draggable={false}
          />
        </AnimatePresence>
      </div>

      {/* Next Button */}
      {previewableFiles.length > 1 && (
        <button
          onClick={e => { e.stopPropagation(); goNext() }}
          className="absolute right-3 md:right-5 z-20 p-3 bg-white/10 hover:bg-white/20 
            text-white/70 hover:text-white rounded-full transition-all backdrop-blur-sm
            hover:scale-110 active:scale-95"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Thumbnail strip (if multiple) */}
      {previewableFiles.length > 1 && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-1.5 px-3 py-2 
            bg-black/50 backdrop-blur-sm rounded-full max-w-[80vw] overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {previewableFiles.map((f, i) => (
            <button
              key={f.message_id}
              onClick={() => { setDirection(i > currentIndex ? 1 : -1); setImgLoaded(false); setCurrentIndex(i) }}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === currentIndex ? 'bg-white w-4' : 'bg-white/30 hover:bg-white/60'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
