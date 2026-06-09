import { useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Folder, File, Upload, Grid3x3, List, Search,
  Plus, Settings, LogOut, CloudUpload, X, ChevronRight, Trash2, RefreshCw, Edit, Copy, Scissors, ClipboardPaste, XCircle, Clock
} from 'lucide-react'
import { foldersApi, filesApi, authApi } from '@/api'
import { useDriveStore, useAuthStore, useUploadStore } from '@/stores'
import { useUpload } from '@/hooks/useUpload'
import { useNavigate } from 'react-router-dom'
import FileCard from '@/components/files/FileCard'
import FileRow from '@/components/files/FileRow'
import UploadQueue from '@/components/files/UploadQueue'
import CreateFolderDialog from '@/components/files/CreateFolderDialog'
import PreviewModal from '@/components/files/PreviewModal'
import PdfModal from '@/components/files/PdfModal'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useState } from 'react'
import clsx from 'clsx'
import toast from 'react-hot-toast'

export default function DashboardPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user, reset: resetAuth } = useAuthStore()
  const {
    folders, setFolders, currentFolderId, setCurrentFolder,
    files, setFiles, viewMode, setViewMode, searchQuery, setSearchQuery,
    selectedFiles, toggleSelectFile, clearSelection, clipboard, setClipboard, currentView, setCurrentView,
    isDraggingFile, setIsDraggingFile
  } = useDriveStore()
  const tasks = useUploadStore((s) => s.tasks)
  const { uploadFile } = useUpload()
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [e2eEnabled, setE2eEnabled] = useState(false)
  const [e2ePassword, setE2ePassword] = useState('')
  const [previewFileId, setPreviewFileId] = useState<number | null>(null)
  const [previewPdfFileId, setPreviewPdfFileId] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'folder' | 'batch', id?: number } | null>(null)

  // Load folders
  const { data: foldersData } = useQuery({
    queryKey: ['folders'],
    queryFn: () => foldersApi.list(),
  })

  useEffect(() => {
    if (foldersData?.data) setFolders(foldersData.data)
  }, [foldersData, setFolders])

  // Load files
  const [isSyncing, setIsSyncing] = useState(false)
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery)

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300)
    return () => clearTimeout(handler)
  }, [searchQuery])
  
  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ['search', debouncedSearchQuery],
    queryFn: () => filesApi.search(debouncedSearchQuery),
    enabled: debouncedSearchQuery.length > 0,
  })

  const { data: recentData, isLoading: recentLoading } = useQuery({
    queryKey: ['recent'],
    queryFn: () => filesApi.recent(50),
    enabled: currentView === 'recent' && searchQuery.length === 0,
  })

  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ['files', currentFolderId],
    queryFn: () => filesApi.list(currentFolderId, 0, 50, false),
    enabled: currentView === 'folder' && searchQuery.length === 0,
  })

  const isDataLoading = filesLoading || searchLoading || recentLoading

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      const res = await filesApi.list(currentFolderId, 0, 50, true)
      qc.setQueryData(['files', currentFolderId], res)
      toast.success('Sinkronisasi selesai!')
    } catch (e) {
      toast.error('Gagal sinkronisasi')
    } finally {
      setIsSyncing(false)
    }
  }

  useEffect(() => {
    if (searchQuery.length > 0) {
      if (searchData?.data) setFiles(searchData.data.files)
    } else if (currentView === 'recent') {
      if (recentData?.data) setFiles(recentData.data.files)
    } else {
      if (filesData?.data) {
        setFiles(filesData.data.files)
        setHasMore(filesData.data.has_more ?? false)
      }
    }
  }, [filesData, searchData, recentData, searchQuery, currentView, setFiles])

  const handleLoadMore = async () => {
    if (!files.length || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const lastId = files[files.length - 1].message_id
      const res = await filesApi.list(currentFolderId, lastId, 50, false)
      const newFiles = res.data.files ?? []
      setFiles([...files, ...newFiles])
      setHasMore(res.data.has_more ?? false)
    } catch {
      toast.error('Gagal memuat file berikutnya')
    } finally {
      setIsLoadingMore(false)
    }
  }

  // Filtered files is just files now, because search is done backend-side
  const filteredFiles = files

  // Dropzone upload
  const onDrop = useCallback(async (accepted: File[]) => {
    if (e2eEnabled && !e2ePassword) {
      toast.error('Masukkan password untuk E2EE terlebih dahulu!')
      return
    }
    for (const file of accepted) {
      await uploadFile(file, e2eEnabled ? e2ePassword : undefined)
      qc.invalidateQueries({ queryKey: ['files', currentFolderId] })
    }
  }, [uploadFile, currentFolderId, qc, e2eEnabled, e2ePassword])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    disabled: isDraggingFile || isSyncing, // Nonaktifkan dropzone saat drag file internal atau sedang sync
  })

  // Logout
  const logoutMut = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => { resetAuth(); navigate('/login') },
  })

  // Delete folder with Optimistic Update
  const deleteFolderMut = useMutation({
    mutationFn: (id: number) => foldersApi.delete(id),
    onMutate: async (deletedId) => {
      // Hapus folder dari layar seketika
      setFolders(folders.filter(f => f.id !== deletedId))
      if (currentFolderId === deletedId) {
        setCurrentFolder(null)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders'] })
    },
  })

  const executeDeleteFolder = (id: number) => {
    toast.promise(deleteFolderMut.mutateAsync(id), {
      loading: 'Menghapus folder...',
      success: 'Folder berhasil dihapus',
      error: 'Gagal menghapus folder',
    })
  }

  const handleDeleteFolder = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    setDeleteConfirm({ type: 'folder', id })
  }

  // Rename folder
  const renameFolderMut = useMutation({
    mutationFn: ({ id, newName }: { id: number; newName: string }) => foldersApi.rename(id, newName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['folders'] })
    },
  })

  const handleRenameFolder = (e: React.MouseEvent, id: number, oldName: string) => {
    e.stopPropagation()
    const newName = prompt('Masukkan nama folder baru:', oldName)
    if (newName && newName.trim() && newName !== oldName) {
      toast.promise(renameFolderMut.mutateAsync({ id, newName: newName.trim() }), {
        loading: 'Mengganti nama...',
        success: 'Nama folder berhasil diganti',
        error: 'Gagal mengganti nama folder',
      })
    }
  }
  const executeBatchDelete = () => {
    const selectedArr = Array.from(selectedFiles)
    // Hapus dari UI seketika (Optimistic Update)
    setFiles(files.filter(f => !selectedArr.includes(f.message_id)))
    clearSelection()
    
    const promises = selectedArr.map(id => filesApi.delete(id, currentFolderId))
    toast.promise(Promise.all(promises), {
      loading: 'Menghapus file...',
      success: () => {
        qc.invalidateQueries({ queryKey: ['files', currentFolderId] })
        return 'File berhasil dihapus'
      },
      error: 'Gagal menghapus beberapa file'
    })
  }

  const handleBatchDelete = () => {
    setDeleteConfirm({ type: 'batch' })
  }

  const handleCopy = () => {
    setClipboard({ action: 'copy', fileIds: Array.from(selectedFiles), sourceFolderId: currentFolderId })
    clearSelection()
    toast.success(`${selectedFiles.size} file disalin`)
  }

  const handleCut = () => {
    setClipboard({ action: 'cut', fileIds: Array.from(selectedFiles), sourceFolderId: currentFolderId })
    clearSelection()
    toast.success(`${selectedFiles.size} file dipotong`)
  }

  const handlePaste = async () => {
    if (!clipboard || clipboard.fileIds.length === 0) return
    
    if (clipboard.action === 'cut') {
      const promises = clipboard.fileIds.map(id => filesApi.move(id, currentFolderId, clipboard.sourceFolderId))
      toast.promise(Promise.all(promises), {
        loading: 'Memindahkan file...',
        success: () => {
          qc.invalidateQueries({ queryKey: ['files', currentFolderId] })
          if (clipboard.sourceFolderId !== currentFolderId) {
            qc.invalidateQueries({ queryKey: ['files', clipboard.sourceFolderId] })
          }
          setClipboard(null)
          return 'File berhasil dipindahkan'
        },
        error: 'Gagal memindahkan file'
      })
    } else if (clipboard.action === 'copy') {
      const promises = clipboard.fileIds.map(id => filesApi.copy(id, currentFolderId, clipboard.sourceFolderId))
      toast.promise(Promise.all(promises), {
        loading: 'Menyalin file...',
        success: () => {
          qc.invalidateQueries({ queryKey: ['files', currentFolderId] })
          setClipboard(null)
          return 'File berhasil disalin'
        },
        error: 'Gagal menyalin file'
      })
    }
  }

  const moveFileMut = useMutation({
    mutationFn: ({ messageId, targetFolderId }: { messageId: number, targetFolderId: number | null }) => 
      filesApi.move(messageId, targetFolderId, currentFolderId),
    onMutate: ({ messageId }) => {
      // Optimistic: hapus dari view sumber seketika
      setFiles(files.filter(f => f.message_id !== messageId))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['files', currentFolderId] })
    },
    onError: () => {
      // Rollback: refresh dari server
      qc.invalidateQueries({ queryKey: ['files', currentFolderId] })
    }
  })

  const handleDropToFolder = (e: React.DragEvent, targetFolderId: number | null) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.classList.remove('bg-blue-500/20', 'ring-2', 'ring-blue-500')
    setIsDraggingFile(false)
    const messageIdStr = e.dataTransfer.getData('application/telegram-drive-file')
    if (messageIdStr) {
      const messageId = parseInt(messageIdStr)
      if (!isNaN(messageId)) {
        if (targetFolderId === currentFolderId) return // Cannot move to same folder
        toast.promise(moveFileMut.mutateAsync({ messageId, targetFolderId }), {
          loading: 'Memindahkan file...',
          success: 'File berhasil dipindahkan',
          error: 'Gagal memindahkan file'
        })
      }
    }
  }

  const handleDragOverFolder = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDragEnterFolder = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.add('bg-blue-500/20', 'ring-2', 'ring-blue-500')
  }

  const handleDragLeaveFolder = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.remove('bg-blue-500/20', 'ring-2', 'ring-blue-500')
  }

  const currentFolderName = searchQuery.length > 0 
    ? `Pencarian: "${searchQuery}"`
    : currentView === 'recent' 
      ? 'Terbaru'
      : currentFolderId
        ? folders.find((f) => f.id === currentFolderId)?.name ?? 'Folder'
        : 'Saved Messages'

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault()
        filteredFiles.forEach(f => toggleSelectFile(f.message_id))
      }
      if (e.key === 'Delete' && selectedFiles.size > 0) {
        e.preventDefault()
        handleBatchDelete()
      }
      if (e.key === 'Escape') {
        clearSelection()
        setClipboard(null)
      }
      if (e.ctrlKey && e.key === 'c' && selectedFiles.size > 0) {
        e.preventDefault()
        handleCopy()
      }
      if (e.ctrlKey && e.key === 'x' && selectedFiles.size > 0) {
        e.preventDefault()
        handleCut()
      }
      if (e.ctrlKey && e.key === 'v' && clipboard) {
        e.preventDefault()
        handlePaste()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [filteredFiles, selectedFiles, clipboard, toggleSelectFile, clearSelection, setClipboard, handleBatchDelete, handleCopy, handleCut, handlePaste])

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0d1117' }} {...getRootProps()}>
      <input {...getInputProps()} />

      {/* ── Drag Overlay ── */}
      <AnimatePresence>
        {isDragActive && !isDraggingFile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center
              bg-blue-600/20 border-2 border-dashed border-blue-500 backdrop-blur-sm">
            <div className="text-center">
              <CloudUpload className="w-16 h-16 text-blue-400 mx-auto mb-4" />
              <p className="text-2xl font-bold text-white">Lepaskan untuk Upload</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SIDEBAR ── */}
      <aside className="w-64 flex flex-col border-r border-white/5 flex-shrink-0"
        style={{ background: '#161b22' }}>
        {/* Logo */}
        <div className="p-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-400
              flex items-center justify-center shadow-lg shadow-blue-500/20">
              <CloudUpload className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-white text-lg">Telegram Drive</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {/* Saved Messages (root) */}
          <button
            onClick={() => setCurrentFolder(null)}
            onDrop={(e) => handleDropToFolder(e, null)}
            onDragOver={handleDragOverFolder}
            onDragEnter={handleDragEnterFolder}
            onDragLeave={handleDragLeaveFolder}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
              currentView === 'folder' && currentFolderId === null
                ? 'bg-blue-600/20 text-blue-400'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            )}>
            <Folder className="w-4 h-4" />
            <span>Saved Messages</span>
          </button>

          {/* Terbaru (Recents) */}
          <button
            onClick={() => setCurrentView('recent')}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
              currentView === 'recent'
                ? 'bg-blue-600/20 text-blue-400'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            )}>
            <Clock className="w-4 h-4" />
            <span>Terbaru</span>
          </button>

          {/* Folder list */}
          <div className="pt-2">
            <div className="flex items-center justify-between px-3 mb-1">
              <span className="text-xs text-white/30 font-medium uppercase tracking-wider">Folder</span>
              <button onClick={() => setShowCreateFolder(true)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-all">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {folders.map((folder) => (
              <div key={folder.id} className="group relative">
                <button onClick={() => setCurrentFolder(folder.id)}
                  onDrop={(e) => handleDropToFolder(e, folder.id)}
                  onDragOver={handleDragOverFolder}
                  onDragEnter={handleDragEnterFolder}
                  onDragLeave={handleDragLeaveFolder}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all pr-9',
                    currentView === 'folder' && currentFolderId === folder.id
                      ? 'bg-blue-600/20 text-blue-400'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  )}>
                  <Folder className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate text-left">{folder.name}</span>
                </button>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleRenameFolder(e, folder.id, folder.name)}
                    className="p-1.5 rounded-lg text-white/40 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                    title="Ganti nama">
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleDeleteFolder(e, folder.id)}
                    className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="Hapus folder">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Bottom actions */}
        <div className="p-3 border-t border-white/5 space-y-1">
          <button onClick={() => navigate('/settings')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
              text-white/60 hover:text-white hover:bg-white/5 transition-all">
            <Settings className="w-4 h-4" />
            <span>Pengaturan</span>
          </button>
          <button onClick={() => logoutMut.mutate(undefined)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
              text-white/60 hover:text-red-400 hover:bg-red-500/5 transition-all">
            <LogOut className="w-4 h-4" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => setCurrentFolder(null)}
              className="text-white/40 hover:text-white transition-colors">Home</button>
            {currentFolderId && (
              <>
                <ChevronRight className="w-4 h-4 text-white/20" />
                <span className="text-white font-medium">{currentFolderName}</span>
              </>
            )}
          </div>

          {/* Search & Actions */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                className="pl-9 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm
                  text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500 w-56 transition-all"
                placeholder="Cari file..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* View Toggle & Sync */}
            <div className="flex rounded-xl overflow-hidden border border-white/10">
              {clipboard && clipboard.fileIds.length > 0 && (
                <button onClick={handlePaste} title={`Paste ${clipboard.fileIds.length} file`}
                  className="p-2 flex items-center gap-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 transition-all border-r border-white/10 text-sm font-medium px-3">
                  <ClipboardPaste className="w-4 h-4" />
                  Paste
                </button>
              )}
              <button onClick={handleSync} disabled={isSyncing} title="Sync dengan Telegram"
                className="p-2 text-white/40 hover:text-white hover:bg-white/5 transition-all border-r border-white/10">
                <RefreshCw className={clsx("w-4 h-4", isSyncing && "animate-spin text-blue-400")} />
              </button>
              <button onClick={() => setViewMode('grid')}
                className={clsx('p-2 transition-all', viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-white/40 hover:text-white hover:bg-white/5')}>
                <Grid3x3 className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('list')}
                className={clsx('p-2 transition-all', viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-white/40 hover:text-white hover:bg-white/5')}>
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* E2EE Settings */}
            <div className="flex items-center gap-2 mr-2">
              <label className="flex items-center gap-1.5 cursor-pointer text-white/60 hover:text-white transition-colors">
                <input type="checkbox" checked={e2eEnabled} onChange={e => setE2eEnabled(e.target.checked)} className="rounded bg-white/5 border-white/20" />
                <span className="text-xs font-medium">E2EE</span>
              </label>
              {e2eEnabled && (
                <input 
                  type="password" 
                  placeholder="Password..." 
                  className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500 w-24"
                  value={e2ePassword}
                  onChange={e => setE2ePassword(e.target.value)}
                />
              )}
            </div>

            {/* Upload Button */}
            <label className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-sm font-medium transition-all shadow-lg shadow-blue-500/20",
              isSyncing && "pointer-events-none opacity-50"
            )}>
              <Upload className="w-4 h-4" />
              Upload
              <input type="file" multiple className="hidden" disabled={isSyncing} onChange={(e) => {
                if (e.target.files) onDrop(Array.from(e.target.files))
              }} />
            </label>
          </div>
        </header>

        {/* File area */}
        <div className="flex-1 overflow-y-auto p-6">
          {isDataLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-white/20">
              {debouncedSearchQuery.length > 0 ? (
                <>
                  <Search className="w-16 h-16 mb-4" />
                  <p className="text-lg font-medium text-white/40">Tidak ada hasil</p>
                  <p className="text-sm mt-2">Tidak ada file bernama <span className="text-white/60 font-medium">&ldquo;{debouncedSearchQuery}&rdquo;</span></p>
                  <p className="text-xs mt-1 text-white/20">Coba kata kunci yang berbeda</p>
                </>
              ) : currentView === 'recent' ? (
                <>
                  <Clock className="w-16 h-16 mb-4" />
                  <p className="text-lg font-medium">Belum ada aktivitas</p>
                  <p className="text-sm mt-1">File yang baru diunggah akan muncul di sini</p>
                </>
              ) : (
                <>
                  <File className="w-16 h-16 mb-4" />
                  <p className="text-lg font-medium">Folder ini kosong</p>
                  <p className="text-sm mt-1">Drag &amp; drop atau klik Upload untuk menambahkan file</p>
                </>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              <AnimatePresence>
                {filteredFiles.map((file, i) => (
                  <motion.div key={file.message_id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.02 }}>
                    <FileCard 
                      file={file} 
                      onPreview={() => setPreviewFileId(file.message_id)} 
                      onPreviewPdf={() => setPreviewPdfFileId(file.message_id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredFiles.map((file, i) => (
                <motion.div key={file.message_id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}>
                  <FileRow 
                    file={file} 
                    onPreview={() => setPreviewFileId(file.message_id)} 
                    onPreviewPdf={() => setPreviewPdfFileId(file.message_id)}
                  />
                </motion.div>
              ))}
            </div>
          )}

          {/* Load More */}
          {hasMore && !isDataLoading && currentView === 'folder' && debouncedSearchQuery.length === 0 && (
            <div className="flex justify-center mt-6">
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/10 bg-white/5 text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 transition-all disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <><div className="w-4 h-4 border-2 border-white/40 border-t-transparent rounded-full animate-spin" /> Memuat...</>
                ) : (
                  <><RefreshCw className="w-4 h-4" /> Muat Lebih Banyak</>  
                )}
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Upload Queue Panel */}
      {tasks.length > 0 && <UploadQueue />}

      {/* Floating Action Bar */}
      <AnimatePresence>
        {selectedFiles.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0, x: '-50%' }}
            animate={{ y: 0, opacity: 1, x: '-50%' }}
            exit={{ y: 100, opacity: 0, x: '-50%' }}
            className="fixed bottom-6 left-1/2 z-50 flex items-center gap-2 bg-[#1e2329] border border-white/10 rounded-2xl shadow-2xl px-4 py-3"
          >
            <div className="px-3 border-r border-white/10 flex items-center gap-2">
              <span className="text-white font-medium text-sm bg-blue-500 w-6 h-6 flex items-center justify-center rounded-full">
                {selectedFiles.size}
              </span>
              <span className="text-white/60 text-sm font-medium mr-2">terpilih</span>
            </div>
            
            <button onClick={handleCopy} className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors tooltip" title="Copy">
              <Copy className="w-5 h-5" />
            </button>
            <button onClick={handleCut} className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors tooltip" title="Cut">
              <Scissors className="w-5 h-5" />
            </button>
            <button onClick={handleBatchDelete} className="p-2 rounded-xl text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors tooltip" title="Delete">
              <Trash2 className="w-5 h-5" />
            </button>
            
            <div className="w-[1px] h-6 bg-white/10 mx-1" />
            
            <button onClick={clearSelection} className="p-2 rounded-xl text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors tooltip" title="Batal">
              <XCircle className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Folder Dialog */}
      <CreateFolderDialog open={showCreateFolder} onClose={() => setShowCreateFolder(false)} />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title={deleteConfirm?.type === 'folder' ? 'Hapus Folder' : 'Hapus File'}
        message={deleteConfirm?.type === 'folder' 
          ? 'Apakah Anda yakin ingin menghapus folder ini beserta isinya? Tindakan ini tidak dapat dibatalkan.' 
          : `Apakah Anda yakin ingin menghapus ${selectedFiles.size} file yang dipilih?`}
        onConfirm={() => {
          if (deleteConfirm?.type === 'folder' && deleteConfirm.id) {
            executeDeleteFolder(deleteConfirm.id)
          } else if (deleteConfirm?.type === 'batch') {
            executeBatchDelete()
          }
        }}
      />

      {/* Preview Modals */}
      <PreviewModal
        files={filteredFiles}
        currentFolderId={currentFolderId}
        initialFileId={previewFileId}
        onClose={() => setPreviewFileId(null)}
      />
      <PdfModal
        file={files.find((f) => f.message_id === previewPdfFileId) || null}
        currentFolderId={currentFolderId}
        onClose={() => setPreviewPdfFileId(null)}
      />
    </div>
  )
}
