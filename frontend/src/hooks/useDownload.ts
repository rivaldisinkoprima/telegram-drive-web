import { useState } from 'react'
import { deriveKey, decryptChunk } from '@/utils/crypto'
import { filesApi } from '@/api'
import toast from 'react-hot-toast'

export function useDownload() {
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)

  const downloadEncryptedFile = async (
    messageId: number, 
    folderId: number | null, 
    fileName: string, 
    password: string
  ) => {
    setIsDownloading(true)
    setDownloadProgress(0)
    
    try {
      const downloadUrl = filesApi.downloadUrl(messageId, folderId)
      
      const response = await fetch(downloadUrl)
      if (!response.body) throw new Error('No response body')
      
      const reader = response.body.getReader()
      const contentLength = +(response.headers.get('Content-Length') || 0)
      
      // Let's read it into memory. (Stream API is complex for browser saving without ServiceWorker).
      // Untuk file sangat besar (misal 2GB), pendekatan ini akan memakan RAM 2GB.
      // Namun Web Crypto API tidak bisa mendekripsi stream dengan lancar di browser tanpa overhead memory yang sama.
      // Untuk simplisitas dan keamanan dasar, kita asumsikan file yang di-encrypt E2EE tidak lebih besar dari kapasitas RAM.
      
      let receivedLength = 0
      const chunks: Uint8Array[] = []
      
      while(true) {
        const {done, value} = await reader.read()
        if (done) break
        chunks.push(value)
        receivedLength += value.length
        
        if (contentLength > 0) {
          setDownloadProgress(Math.floor((receivedLength / contentLength) * 100))
        }
      }
      
      // Menggabungkan semua chunks
      const encryptedBuffer = new Uint8Array(receivedLength)
      let position = 0
      for(const chunk of chunks) {
        encryptedBuffer.set(chunk, position)
        position += chunk.length
      }
      
      // Mendekripsi
      // Format file E2EE: [Salt (16 bytes)] + [Chunk 1 IV (12 bytes)] + [Chunk 1 Encrypted] + [Chunk 2 IV] + [Chunk 2 Encrypted] ...
      // Karena kita menggunakan chunking saat upload (1MB chunk), maka dekripsinya juga harus per chunk.
      toast.loading('Mendekripsi file...', { id: 'decrypt' })
      
      const salt = encryptedBuffer.slice(0, 16)
      const aesKey = await deriveKey(password, salt)
      
      // Membaca per chunk
      const CHUNK_SIZE = 1024 * 1024 // Ini adalah original rawBuffer size saat encrypt. 
      // Saat encrypted, ukurannya nambah 16 bytes auth tag = 1048592
      const ENCRYPTED_CHUNK_SIZE = CHUNK_SIZE + 16
      const TOTAL_CHUNK_OVERHEAD = 12 + ENCRYPTED_CHUNK_SIZE // IV + Encrypted Data
      
      let p = 16 // Mulai setelah salt
      const decryptedChunks: ArrayBuffer[] = []
      
      while (p < encryptedBuffer.length) {
        // Jika sisa buffer kurang dari overhead IV (12 bytes), error
        if (p + 12 > encryptedBuffer.length) break;
        
        const iv = encryptedBuffer.slice(p, p + 12)
        p += 12
        
        // Sisa buffer
        const remainingLength = encryptedBuffer.length - p
        const currentEncryptedSize = Math.min(ENCRYPTED_CHUNK_SIZE, remainingLength)
        
        const encryptedData = encryptedBuffer.slice(p, p + currentEncryptedSize)
        p += currentEncryptedSize
        
        try {
          const decryptedChunk = await decryptChunk(encryptedData.buffer, aesKey, iv)
          decryptedChunks.push(decryptedChunk)
        } catch (err) {
          throw new Error('Password salah atau file korup.')
        }
      }
      
      toast.success('Dekripsi berhasil!', { id: 'decrypt' })
      
      // Unduh hasil dekripsi
      const finalBlob = new Blob(decryptedChunks)
      const blobUrl = URL.createObjectURL(finalBlob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName.replace('.enc', '') // Hapus ekstensi .enc
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
      
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengunduh file terenkripsi', { id: 'decrypt' })
      console.error(e)
    } finally {
      setIsDownloading(false)
      setDownloadProgress(0)
    }
  }
  
  return { downloadEncryptedFile, isDownloading, downloadProgress }
}
