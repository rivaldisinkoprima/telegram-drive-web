import { useCallback } from 'react'
import { useUploadStore, useDriveStore, useAuthStore } from '@/stores'
import { filesApi } from '@/api'
import { useQueryClient } from '@tanstack/react-query'

export function useUpload() {
  const { addTask, updateTask } = useUploadStore()
  const { currentFolderId } = useDriveStore()
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const uploadFile = useCallback(async (file: File) => {
    // 1. Cek Limit Ukuran File
    const isPremium = user?.is_premium || false
    const maxSize = isPremium ? 4 * 1024 * 1024 * 1024 : 2 * 1024 * 1024 * 1024 // 4GB or 2GB
    if (file.size > maxSize) {
      throw new Error(`Ukuran file melebihi batas maksimal (${isPremium ? '4GB' : '2GB'}).`)
    }

    const id = crypto.randomUUID()
    addTask({
      id,
      fileName: file.name,
      fileSize: file.size,
      percent: 0,
      uploaded: 0,
      speed: 0,
      status: 'uploading',
    })

    try {
      // 2. Init Upload (Resume capability)
      const initRes = await filesApi.uploadInit(file.name, file.size, currentFolderId ?? null)
      const uploadId = initRes.data.upload_id
      let offset = initRes.data.uploaded_bytes || 0

      // Jika sudah ada part yang tersimpan, update persentase UI
      if (offset > 0) {
        updateTask(id, {
          uploaded: offset,
          percent: Math.floor((offset / file.size) * 100)
        })
      }

      // 3. Upload Chunks (1MB per chunk untuk stabilitas)
      const CHUNK_SIZE = 1024 * 1024 
      let lastTime = Date.now()
      let lastOffset = offset

      while (offset < file.size) {
        // Cek apakah di-cancel (opsional, untuk kedepannya jika ada fitur cancel)
        const currentTask = useUploadStore.getState().tasks.find(t => t.id === id)
        if (currentTask?.status === 'error') {
          throw new Error('Upload dibatalkan.')
        }

        const slice = file.slice(offset, offset + CHUNK_SIZE)
        const buffer = await slice.arrayBuffer()
        
        await filesApi.uploadChunk(uploadId, buffer)
        
        offset += buffer.byteLength
        
        // Hitung kecepatan
        const now = Date.now()
        const elapsed = (now - lastTime) / 1000
        let speed = 0
        if (elapsed > 0.5) { // update speed setiap 0.5 detik
          speed = (offset - lastOffset) / elapsed
          lastTime = now
          lastOffset = offset
        }

        updateTask(id, {
          percent: Math.floor((offset / file.size) * 100),
          uploaded: offset,
          speed: Math.floor(speed)
        })
      }

      // 4. Finish Upload
      updateTask(id, { status: 'pending', percent: 100 }) // Pending saat mengirim ke Telegram
      const finishRes = await filesApi.uploadFinish(uploadId, file.name, file.size, currentFolderId ?? null)
      
      // Update Cache UI 
      qc.invalidateQueries({ queryKey: ['files', currentFolderId] })

      updateTask(id, { status: 'done', percent: 100 })
    } catch (e: any) {
      updateTask(id, { status: 'error', error: e.response?.data?.detail || e.message || 'Gagal mengunggah file' })
      throw e
    }
  }, [currentFolderId, addTask, updateTask, user, qc])

  return { uploadFile }
}
