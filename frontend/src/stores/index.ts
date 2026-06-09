import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Auth Store ──────────────────────────────────────────
interface User {
  id: number
  first_name: string
  last_name?: string
  username?: string
  phone?: string
  is_premium?: boolean
}

interface AuthStore {
  user: User | null
  isAuthenticated: boolean
  
  // Security
  pin: string | null
  isLocked: boolean
  
  setUser: (u: User | null) => void
  setAuthenticated: (v: boolean) => void
  reset: () => void
  
  setPin: (pin: string | null) => void
  lock: () => void
  unlock: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      pin: null,
      isLocked: false,
      
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
      reset: () => set({ user: null, isAuthenticated: false, pin: null, isLocked: false }),
      
      setPin: (pin) => set({ pin }),
      lock: () => set({ isLocked: true }),
      unlock: () => set({ isLocked: false }),
    }),
    {
      name: 'auth-storage',
    }
  )
)


// ─── Drive Store ─────────────────────────────────────────
export interface Folder {
  id: number
  name: string
  username?: string
  is_public: boolean
}

export interface FileItem {
  message_id: number
  folder_id?: number | null
  file_name: string
  file_size: number
  mime_type: string
  date: string
  has_thumbnail: boolean
  duration?: number
  width?: number
  height?: number
  is_encrypted?: boolean
}

type ViewMode = 'grid' | 'list'

interface ClipboardState {
  action: 'copy' | 'cut'
  fileIds: number[]
  sourceFolderId: number | null
}

interface DriveStore {
  folders: Folder[]
  currentFolderId: number | null
  currentView: 'folder' | 'recent'
  files: FileItem[]
  selectedFiles: Set<number>
  viewMode: ViewMode
  isLoading: boolean
  searchQuery: string
  clipboard: ClipboardState | null
  isDraggingFile: boolean

  setFolders: (f: Folder[]) => void
  setCurrentFolder: (id: number | null) => void
  setCurrentView: (view: 'folder' | 'recent') => void
  setFiles: (files: FileItem[]) => void
  toggleSelectFile: (id: number) => void
  clearSelection: () => void
  setViewMode: (m: ViewMode) => void
  setLoading: (v: boolean) => void
  setSearchQuery: (q: string) => void
  setClipboard: (c: ClipboardState | null) => void
  setIsDraggingFile: (b: boolean) => void
}

export const useDriveStore = create<DriveStore>((set) => ({
  folders: [],
  currentFolderId: null,
  currentView: 'folder',
  files: [],
  selectedFiles: new Set(),
  viewMode: 'grid',
  isLoading: false,
  searchQuery: '',
  clipboard: null,
  isDraggingFile: false,

  setFolders: (folders) => set({ folders }),
  setCurrentFolder: (currentFolderId) => set({ currentFolderId, currentView: 'folder', selectedFiles: new Set(), files: [] }),
  setCurrentView: (currentView) => set({ currentView, selectedFiles: new Set(), files: [], currentFolderId: null }),
  setFiles: (files) => set({ files }),
  toggleSelectFile: (id) => set((s) => {
    const next = new Set(s.selectedFiles)
    next.has(id) ? next.delete(id) : next.add(id)
    return { selectedFiles: next }
  }),
  clearSelection: () => set({ selectedFiles: new Set() }),
  setViewMode: (viewMode) => set({ viewMode }),
  setLoading: (isLoading) => set({ isLoading }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setClipboard: (clipboard) => set({ clipboard }),
  setIsDraggingFile: (isDraggingFile) => set({ isDraggingFile }),
}))


// ─── Upload Store ─────────────────────────────────────────
export interface UploadTask {
  id: string
  fileName: string
  fileSize: number
  percent: number
  uploaded: number
  speed: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
}

interface UploadStore {
  tasks: UploadTask[]
  addTask: (task: UploadTask) => void
  updateTask: (id: string, updates: Partial<UploadTask>) => void
  removeTask: (id: string) => void
  clearDone: () => void
}

export const useUploadStore = create<UploadStore>((set) => ({
  tasks: [],
  addTask: (task) => set((s) => ({ tasks: [...s.tasks, task] })),
  updateTask: (id, updates) =>
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)) })),
  removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
  clearDone: () => set((s) => ({ tasks: s.tasks.filter((t) => t.status !== 'done') })),
}))
