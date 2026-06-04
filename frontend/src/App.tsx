import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { authApi, setupApi } from '@/api'
import { useAuthStore } from '@/stores'
import AuthPage from '@/pages/AuthPage'
import DashboardPage from '@/pages/DashboardPage'
import SettingsPage from '@/pages/SettingsPage'
import SetupPage from '@/pages/SetupPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function AppRoutes() {
  const { setAuthenticated, setUser } = useAuthStore()

  // Cek apakah API credentials sudah dikonfigurasi
  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ['setup-config'],
    queryFn: () => setupApi.getConfig(),
    retry: false,
    staleTime: Infinity,
  })

  // Cek apakah sudah login
  const { isLoading: authLoading } = useQuery({
    queryKey: ['auth-status'],
    queryFn: async () => {
      try {
        const statusRes = await authApi.status()
        if (statusRes.data.authorized) {
          const meRes = await authApi.getMe()
          setUser(meRes.data)
          setAuthenticated(true)
        }
      } catch {
        setAuthenticated(false)
      }
      return null
    },
    retry: false,
    staleTime: Infinity,
  })

  // Tampilkan loading spinner sebelum routing ditentukan
  if (configLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d1117' }}>
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isConfigured = configData?.data?.configured === true
  const isAuthenticated = useAuthStore.getState().isAuthenticated

  return (
    <Routes>
      {/* Setup — pertama kali konfigurasi API credentials */}
      <Route path="/setup" element={<SetupPage />} />

      {/* Login — redirect ke /setup jika belum dikonfigurasi */}
      <Route
        path="/login"
        element={isConfigured ? <AuthPage /> : <Navigate to="/setup" replace />}
      />

      {/* Dashboard — protected */}
      <Route
        path="/"
        element={
          isAuthenticated ? (
            <DashboardPage />
          ) : isConfigured ? (
            <Navigate to="/login" replace />
          ) : (
            <Navigate to="/setup" replace />
          )
        }
      />

      {/* Settings — protected */}
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

import { Toaster } from 'react-hot-toast'

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="bottom-right" toastOptions={{
        style: { background: '#161b22', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
      }} />
      <AppRoutes />
    </BrowserRouter>
  )
}
