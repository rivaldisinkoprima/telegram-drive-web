/**
 * Client-Side End-to-End Encryption Utility
 * Menggunakan Web Crypto API (AES-GCM 256-bit)
 */

// Menurunkan (derive) kunci AES-GCM dari password teks (PBKDF2)
export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  )
  
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
}

// Mengenrkipsi ArrayBuffer chunk. Mengembalikan { encryptedChunk, iv }
export async function encryptChunk(chunk: ArrayBuffer, key: CryptoKey): Promise<{ encrypted: ArrayBuffer, iv: Uint8Array }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12)) // Standar IV 12-byte untuk AES-GCM
  
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    chunk
  )
  
  return { encrypted, iv }
}

// Mendekripsi ArrayBuffer chunk
export async function decryptChunk(encryptedChunk: ArrayBuffer, key: CryptoKey, iv: Uint8Array): Promise<ArrayBuffer> {
  return window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encryptedChunk
  )
}
