import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // kirim cookie JWT secara otomatis
})

// Interceptor: redirect ke login jika 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

// ─── Setup (public) ───────────────────────────────────────
export const setupApi = {
  getConfig: () =>
    api.get('/setup/telegram-config'),

  saveConfig: (apiId: number, apiHash: string, appName?: string) =>
    api.post('/setup/telegram-config', { api_id: apiId, api_hash: apiHash, app_name: appName }),

  deleteConfig: () =>
    api.delete('/setup/telegram-config'),
}

// ─── Auth ─────────────────────────────────────────────────
export const authApi = {
  sendCode: (phone: string, apiId: number, apiHash: string) =>
    api.post('/auth/send-code', { phone, api_id: apiId, api_hash: apiHash }),

  signIn: (code: string) =>
    api.post('/auth/sign-in', { code }),

  checkPassword: (password: string) =>
    api.post('/auth/check-password', { password }),

  getQrToken: (apiId: number, apiHash: string) =>
    api.post('/auth/qr-token', { api_id: apiId, api_hash: apiHash }),

  pollQr: () =>
    api.get('/auth/qr-poll'),

  getMe: () =>
    api.get('/auth/me'),

  logout: () =>
    api.post('/auth/logout'),

  status: () =>
    api.get('/auth/status'),
}

// ─── Folders ──────────────────────────────────────────────
export const foldersApi = {
  list: () =>
    api.get('/folders'),

  create: (name: string) =>
    api.post('/folders', { name }),

  delete: (id: number) =>
    api.delete(`/folders/${id}`),

  rename: (id: number, newName: string) =>
    api.patch(`/folders/${id}`, { new_name: newName }),
}

// ─── Files ────────────────────────────────────────────────
export const filesApi = {
  list: (folderId?: number | null, offsetId = 0, limit = 50) =>
    api.get('/files', { params: { folder_id: folderId, offset_id: offsetId, limit } }),

  delete: (messageId: number, folderId?: number | null) =>
    api.delete(`/files/${messageId}`, { params: { folder_id: folderId } }),

  rename: (messageId: number, newName: string, folderId?: number | null) =>
    api.patch(`/files/${messageId}`, { new_name: newName }, { params: { folder_id: folderId } }),

  move: (messageId: number, targetFolderId: number | null, folderId?: number | null) =>
    api.post(`/files/${messageId}/move`, { target_folder_id: targetFolderId }, { params: { folder_id: folderId } }),

  downloadUrl: (messageId: number, folderId?: number | null) => {
    const params = folderId ? `?folder_id=${folderId}` : ''
    return `/api/files/${messageId}/download${params}`
  },

  streamUrl: (messageId: number, folderId?: number | null) => {
    const params = folderId ? `?folder_id=${folderId}` : ''
    return `/api/stream/${messageId}${params}`
  },

  previewUrl: (messageId: number, folderId?: number | null) => {
    const params = folderId ? `?folder_id=${folderId}` : ''
    return `/api/stream/preview/${messageId}${params}`
  },
}

// ─── Sharing ──────────────────────────────────────────────
export const sharingApi = {
  list: () =>
    api.get('/share'),

  create: (data: {
    message_id: number
    folder_id?: number | null
    password?: string
    expires_in_hours?: number
  }) => api.post('/share', data),

  delete: (token: string) =>
    api.delete(`/share/${token}`),
}

// ─── Settings ─────────────────────────────────────────────
export const settingsApi = {
  get: () =>
    api.get('/settings'),

  saveProxy: (data: object) =>
    api.post('/settings/proxy', data),

  saveNetwork: (data: object) =>
    api.post('/settings/network', data),

  getApiKey: () =>
    api.get('/settings/api-key'),

  regenerateApiKey: () =>
    api.post('/settings/api-key/regenerate'),

  deleteApiKey: () =>
    api.delete('/settings/api-key'),
}
