import { useCallback, useRef } from 'react'
import { useUploadStore } from '@/stores'
import { useDriveStore } from '@/stores'

export function useUpload() {
  const { addTask, updateTask } = useUploadStore()
  const { currentFolderId, setFiles, files } = useDriveStore()
  const wsRef = useRef<WebSocket | null>(null)

  const uploadFile = useCallback(async (file: File) => {
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

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:8000/api/files/ws/upload`)
      wsRef.current = ws

      ws.onopen = async () => {
        // Kirim metadata
        ws.send(JSON.stringify({
          folder_id: currentFolderId ?? null,
          file_name: file.name,
          file_size: file.size,
        }))

        // Kirim data file dalam chunks
        const CHUNK = 64 * 1024 // 64 KB
        let offset = 0
        while (offset < file.size) {
          const slice = file.slice(offset, offset + CHUNK)
          const buffer = await slice.arrayBuffer()
          ws.send(buffer)
          offset += buffer.byteLength
        }
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.error) {
            updateTask(id, { status: 'error', error: data.error })
            ws.close()
            reject(new Error(data.error))
            return
          }
          if (data.done) {
            updateTask(id, { status: 'done', percent: 100 })
            ws.close()
            resolve()
          } else {
            updateTask(id, {
              percent: data.percent,
              uploaded: data.uploaded,
              speed: data.speed ?? 0,
            })
          }
        } catch {
          // bukan JSON, abaikan
        }
      }

      ws.onerror = () => {
        updateTask(id, { status: 'error', error: 'Koneksi WebSocket gagal.' })
        reject(new Error('WebSocket error'))
      }
    })
  }, [currentFolderId, addTask, updateTask])

  return { uploadFile }
}
