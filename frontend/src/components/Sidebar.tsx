import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare, BookOpen, Network, BarChart2,
  Upload, ChevronLeft, ChevronRight,
  CheckCircle2, AlertCircle, Loader2, X, Home,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Page } from '../App'
import type { Status } from '../api'
import { uploadFiles, buildGraph } from '../api'

interface Props {
  page: Page
  setPage: (p: Page) => void
  status: Status
  onUploadDone: () => void
}

const NAV: { key: Page; icon: typeof MessageSquare; label: string; color: string }[] = [
  { key: 'chat',    icon: MessageSquare, label: 'Chat',            color: '#818cf8' },
  { key: 'library', icon: BookOpen,      label: 'Library',         color: '#a78bfa' },
  { key: 'graph',   icon: Network,       label: 'Knowledge Graph', color: '#c084fc' },
  { key: 'compare', icon: BarChart2,     label: 'Compare',         color: '#f59e0b' },
]

type UploadState = 'idle' | 'uploading' | 'building' | 'done' | 'error'

export default function Sidebar({ page, setPage, status, onUploadDone }: Props) {
  const [collapsed,   setCollapsed]   = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadMsg,   setUploadMsg]   = useState('')
  const [dragging,    setDragging]    = useState(false)
  const fileRef  = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  async function handleFiles(files: File[]) {
    if (!files.length) return
    setUploadState('uploading')
    setUploadMsg(`Parsing ${files.length} file(s)…`)
    try {
      const result = await uploadFiles(files)
      setUploadMsg(`${result.chunks} chunks via ${result.parser}`)
      setUploadState('building')
      await buildGraph()
      setUploadState('done')
      setUploadMsg(`${result.chunks} chunks indexed`)
      onUploadDone()
      setTimeout(() => setUploadState('idle'), 4000)
    } catch (e: any) {
      setUploadState('error')
      setUploadMsg(e.message ?? 'Upload failed')
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    handleFiles(Array.from(e.dataTransfer.files))
  }

  const busy = uploadState === 'uploading' || uploadState === 'building'

  return (
    <motion.aside
      animate={{ width: collapsed ? 56 : 220 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="relative flex flex-col h-full flex-shrink-0 m-2 mr-0 rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.018)',
        border: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.02), 4px 0 24px rgba(0,0,0,0.3)',
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-3 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <motion.div
          whileHover={{ rotate: [0, -10, 10, 0], scale: 1.1 }}
          transition={{ duration: 0.4 }}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0 cursor-default"
          style={{
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            boxShadow: '0 4px 15px rgba(79,70,229,0.4)',
          }}
        >
          🔬
        </motion.div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
              className="font-semibold text-sm text-white tracking-tight truncate"
            >
              PaperGraph AI
            </motion.span>
          )}
        </AnimatePresence>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="ml-auto text-zinc-600 hover:text-zinc-300 transition-colors flex-shrink-0"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden space-y-0.5 px-2">
        {!collapsed && (
          <p className="px-2 pt-1 pb-2 text-[10px] font-semibold tracking-widest uppercase text-zinc-700">
            Navigation
          </p>
        )}

        {NAV.map(({ key, icon: Icon, label, color }) => {
          const active = page === key
          return (
            <motion.button
              key={key}
              onClick={() => setPage(key)}
              title={collapsed ? label : undefined}
              whileHover={{ x: collapsed ? 0 : 3 }}
              whileTap={{ scale: 0.96 }}
              className={`
                relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-medium
                transition-colors duration-150 overflow-hidden
                ${collapsed ? 'justify-center' : ''}
              `}
              style={{
                color: active ? '#fff' : 'rgba(255,255,255,0.4)',
                background: active
                  ? `linear-gradient(135deg, ${color}22, ${color}11)`
                  : 'transparent',
                border: active
                  ? `1px solid ${color}33`
                  : '1px solid transparent',
                boxShadow: active ? `0 0 20px ${color}22` : 'none',
              }}
            >
              {/* glow behind active icon */}
              {active && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at 20% 50%, ${color}18 0%, transparent 60%)`,
                  }}
                />
              )}
              <Icon
                size={15}
                style={{ color: active ? color : undefined, flexShrink: 0 }}
              />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="truncate"
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          )
        })}

        {/* Status */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <p className="px-2 pt-5 pb-2 text-[10px] font-semibold tracking-widest uppercase text-zinc-700">
                Status
              </p>
              <div className="px-2 space-y-1.5">
                <StatusRow ok={status.chunks > 0}
                  label={status.chunks > 0
                    ? `${status.chunks} chunks · ${status.files} file${status.files !== 1 ? 's' : ''}`
                    : 'No files indexed'}
                />
                <StatusRow ok={status.graph_nodes > 0}
                  label={status.graph_nodes > 0
                    ? `Graph · ${status.graph_nodes} nodes`
                    : 'Graph not built'}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Bottom area */}
      <div className="p-2 space-y-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {!collapsed ? (
          <>
            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => !busy && fileRef.current?.click()}
              className="relative rounded-xl p-3 text-center cursor-pointer transition-all duration-200 overflow-hidden"
              style={{
                border: `1.5px dashed ${dragging ? '#6366f1' : 'rgba(255,255,255,0.1)'}`,
                background: dragging ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)',
                opacity: busy ? 0.6 : 1,
              }}
            >
              <input
                ref={fileRef}
                type="file" multiple
                accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg"
                className="hidden"
                onChange={e => handleFiles(Array.from(e.target.files ?? []))}
              />
              {busy ? (
                <div className="flex items-center justify-center gap-2 text-indigo-400">
                  <Loader2 size={13} className="animate-spin" />
                  <span className="text-xs font-medium truncate">{uploadMsg}</span>
                </div>
              ) : (
                <>
                  <Upload size={14} className="mx-auto mb-1.5 text-zinc-600" />
                  <p className="text-[11px] text-zinc-600 leading-snug">
                    Drop files or click<br />
                    <span className="text-zinc-700 text-[10px]">PDF · DOCX · TXT · Images</span>
                  </p>
                </>
              )}
            </div>

            <AnimatePresence>
              {(uploadState === 'done' || uploadState === 'error') && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs ${
                    uploadState === 'done'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}
                >
                  {uploadState === 'done' ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                  <span className="truncate flex-1 text-[10px]">{uploadMsg}</span>
                  <button onClick={() => setUploadState('idle')}><X size={10} /></button>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            title="Upload files"
            className="w-full flex items-center justify-center p-2 rounded-lg transition-colors"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            <Upload size={15} />
            <input ref={fileRef} type="file" multiple className="hidden"
              onChange={e => handleFiles(Array.from(e.target.files ?? []))} />
          </button>
        )}

        {/* Home */}
        <motion.button
          onClick={() => navigate('/')}
          title="Back to Home"
          whileHover={{ x: collapsed ? 0 : 3 }}
          whileTap={{ scale: 0.95 }}
          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs transition-colors ${collapsed ? 'justify-center' : ''}`}
          style={{ color: 'rgba(255,255,255,0.25)' }}
        >
          <Home size={13} />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                Back to Home
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </motion.aside>
  )
}

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex-shrink-0">
        <span className={`block w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
        {ok && (
          <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-40" />
        )}
      </span>
      <span className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>
        {label}
      </span>
    </div>
  )
}
