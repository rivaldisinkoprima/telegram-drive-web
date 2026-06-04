import { useCallback } from 'react'
import { useUploadStore, useDriveStore, useAuthStore } from '@/stores'
import { filesApi } from '@/api'
import { useQueryClient } from '@tanstack/react-query'
import { deriveKey, encryptChunk } from '@/utils/crypto'

export function useUpload() {
  const { addTask, updateTask } = useUploadStore()
  const { currentFolderId } = useDriveStore()
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const uploadFile = useCallback(async (file: File, password?: string) => {
    // 1. Cek Limit Ukuran File
    const isPremium = user?.is_premium || false
    const maxSize = isPremium ? 4 * 1024 * 1024 * 1024 : 2 * 1024 * 1024 * 1024 // 4GB or 2GB
    if (file.size > maxSize) {
      throw new Error(`Ukuran file melebihi batas maksimal (${isPremium ? '4GB' : '2GB'}).`)
    }

    const isEncrypted = !!password
    const finalFileName = isEncrypted ? `${file.name}.enc` : file.name

    const id = crypto.randomUUID()
    addTask({
      id,
      fileName: finalFileName,
      fileSize: file.size,
      percent: 0,
      uploaded: 0,
      speed: 0,
      status: 'uploading',
    })

    try {
      // 2. Init Upload (Resume capability)
      const initRes = await filesApi.uploadInit(finalFileName, file.size, currentFolderId ?? null, isEncrypted)
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
      
      let aesKey: CryptoKey | null = null
      let salt: Uint8Array | null = null
      if (password) {
        salt = window.crypto.getRandomValues(new Uint8Array(16))
        aesKey = await deriveKey(password, salt)
      }

      while (offset < file.size) {
        // Cek apakah di-cancel
        const currentTask = useUploadStore.getState().tasks.find(t => t.id === id)
        if (currentTask?.status === 'error') throw new Error('Upload dibatalkan.')

        const slice = file.slice(offset, offset + CHUNK_SIZE)
        const rawBuffer = await slice.arrayBuffer()
        
        let chunkData: ArrayBuffer = rawBuffer
        
        if (aesKey && salt) {
          const { encrypted, iv } = await encryptChunk(rawBuffer, aesKey)
          const isFirst = offset === 0
          
          // Format: [Salt 16b (if first)] + [IV 12b] + [Encrypted]
          const totalLen = (isFirst ? 16 : 0) + 12 + encrypted.byteLength
          const combined = new Uint8Array(totalLen)
          
          let p = 0
          if (isFirst) {
            combined.set(salt, p)
            p += 16
          }
          combined.set(iv, p)
          p += 12
          combined.set(new Uint8Array(encrypted), p)
          
          chunkData = combined.buffer
        }
        
        await filesApi.uploadChunk(uploadId, chunkData)
        
        offset += rawBuffer.byteLength
        
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
      await filesApi.uploadFinish(uploadId, finalFileName, file.size, currentFolderId ?? null, isEncrypted)
      
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
