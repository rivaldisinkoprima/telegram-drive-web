import { useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Folder, File, Upload, Grid3x3, List, Search,
  Plus, Settings, LogOut, CloudUpload, X, ChevronRight
} from 'lucide-react'
import { foldersApi, filesApi, authApi } from '@/api'
import { useDriveStore, useAuthStore, useUploadStore } from '@/stores'
import { useUpload } from '@/hooks/useUpload'
import { useNavigate } from 'react-router-dom'
import FileCard from '@/components/files/FileCard'
import FileRow from '@/components/files/FileRow'
import UploadQueue from '@/components/files/UploadQueue'
import CreateFolderDialog from '@/components/files/CreateFolderDialog'
import { useState } from 'react'
import clsx from 'clsx'

export default function DashboardPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user, reset: resetAuth } = useAuthStore()
  const {
    folders, setFolders, currentFolderId, setCurrentFolder,
    files, setFiles, viewMode, setViewMode, searchQuery, setSearchQuery,
  } = useDriveStore()
  const tasks = useUploadStore((s) => s.tasks)
  const { uploadFile } = useUpload()
  const [showCreateFolder, setShowCreateFolder] = useState(false)

  // Load folders
  const { data: foldersData } = useQuery({
    queryKey: ['folders'],
    queryFn: () => foldersApi.list(),
  })

  useEffect(() => {
    if (foldersData?.data) setFolders(foldersData.data)
  }, [foldersData, setFolders])

  // Load files
  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ['files', currentFolderId],
    queryFn: () => filesApi.list(currentFolderId),
  })

  useEffect(() => {
    if (filesData?.data) setFiles(filesData.data.files)
  }, [filesData, setFiles])

  // Filtered files
  const filteredFiles = files.filter((f) =>
    f.file_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Dropzone upload
  const onDrop = useCallback(async (accepted: File[]) => {
    for (const file of accepted) {
      await uploadFile(file)
      qc.invalidateQueries({ queryKey: ['files', currentFolderId] })
    }
  }, [uploadFile, currentFolderId, qc])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
  })

  // Logout
  const logoutMut = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => { resetAuth(); navigate('/login') },
  })

  const currentFolderName = currentFolderId
    ? folders.find((f) => f.id === currentFolderId)?.name ?? 'Folder'
    : 'Saved Messages'

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0d1117' }} {...getRootProps()}>
      <input {...getInputProps()} />

      {/* ── Drag Overlay ── */}
      <AnimatePresence>
        {isDragActive && (
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
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
              currentFolderId === null
                ? 'bg-blue-600/20 text-blue-400'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            )}>
            <Folder className="w-4 h-4" />
            <span>Saved Messages</span>
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
              <button key={folder.id} onClick={() => setCurrentFolder(folder.id)}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                  currentFolderId === folder.id
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                )}>
                <Folder className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{folder.name}</span>
              </button>
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

            {/* View Toggle */}
            <div className="flex rounded-xl overflow-hidden border border-white/10">
              <button onClick={() => setViewMode('grid')}
                className={clsx('p-2 transition-all', viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-white/40 hover:text-white hover:bg-white/5')}>
                <Grid3x3 className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('list')}
                className={clsx('p-2 transition-all', viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-white/40 hover:text-white hover:bg-white/5')}>
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Upload Button */}
            <label className="flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer
              bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400
              text-white text-sm font-medium transition-all shadow-lg shadow-blue-500/20">
              <Upload className="w-4 h-4" />
              Upload
              <input type="file" multiple className="hidden" onChange={(e) => {
                if (e.target.files) onDrop(Array.from(e.target.files))
              }} />
            </label>
          </div>
        </header>

        {/* File area */}
        <div className="flex-1 overflow-y-auto p-6">
          {filesLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-white/20">
              <File className="w-16 h-16 mb-4" />
              <p className="text-lg font-medium">Folder ini kosong</p>
              <p className="text-sm mt-1">Drag & drop atau klik Upload untuk menambahkan file</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              <AnimatePresence>
                {filteredFiles.map((file, i) => (
                  <motion.div key={file.message_id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.02 }}>
                    <FileCard file={file} />
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
                  <FileRow file={file} />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Upload Queue Panel */}
      {tasks.length > 0 && <UploadQueue />}

      {/* Create Folder Dialog */}
      <CreateFolderDialog open={showCreateFolder} onClose={() => setShowCreateFolder(false)} />
    </div>
  )
}
