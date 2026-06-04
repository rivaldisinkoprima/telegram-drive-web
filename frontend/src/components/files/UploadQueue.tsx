import { useUploadStore } from '@/stores'
import { X, CheckCircle, AlertCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

function formatSpeed(bps: number) {
  if (bps < 1024) return `${bps} B/s`
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
  return `${(bps / 1024 / 1024).toFixed(1)} MB/s`
}

export default function UploadQueue() {
  const { tasks, removeTask, clearDone } = useUploadStore()

  return (
    <div className="fixed bottom-6 right-6 w-80 z-40">
      <div className="glass rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <span className="text-sm font-medium text-white">
            Upload Queue ({tasks.length})
          </span>
          <button onClick={clearDone}
            className="text-xs text-white/40 hover:text-white transition-colors">
            Hapus Selesai
          </button>
        </div>

        {/* Task list */}
        <div className="max-h-72 overflow-y-auto divide-y divide-white/5">
          <AnimatePresence>
            {tasks.map((task) => (
              <motion.div key={task.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-4 py-3">
                <div className="flex items-start gap-3">
                  {/* Status icon */}
                  <div className="mt-0.5 flex-shrink-0">
                    {task.status === 'done' && <CheckCircle className="w-4 h-4 text-green-400" />}
                    {task.status === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
                    {(task.status === 'uploading' || task.status === 'pending') && (
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/80 truncate font-medium">{task.fileName}</p>
                    {task.status === 'uploading' && (
                      <>
                        <div className="mt-1.5 h-1 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-300"
                            style={{ width: `${task.percent}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-xs text-white/30">{task.percent}%</span>
                          {task.speed > 0 && (
                            <span className="text-xs text-white/30">{formatSpeed(task.speed)}</span>
                          )}
                        </div>
                      </>
                    )}
                    {task.status === 'done' && (
                      <p className="text-xs text-green-400 mt-0.5">Selesai</p>
                    )}
                    {task.status === 'error' && (
                      <p className="text-xs text-red-400 mt-0.5">{task.error}</p>
                    )}
                  </div>

                  {/* Remove */}
                  {task.status !== 'uploading' && (
                    <button onClick={() => removeTask(task.id)}
                      className="text-white/20 hover:text-white/60 transition-colors flex-shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
