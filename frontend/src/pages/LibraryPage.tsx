import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useInView } from 'framer-motion'
import { FileText, RefreshCw, Layers, Tag, Cpu, ChevronDown, Zap } from 'lucide-react'
import { fetchLibrary, type LibraryFile } from '../api'

interface Props { onRefresh: () => void }

const CAT_COLORS: Record<string, string> = {
  Title:          'rgba(99,102,241,0.15)',
  NarrativeText:  'rgba(59,130,246,0.15)',
  Table:          'rgba(245,158,11,0.15)',
  Image:          'rgba(16,185,129,0.15)',
  ListItem:       'rgba(167,139,250,0.15)',
  Header:         'rgba(236,72,153,0.15)',
  Footer:         'rgba(113,113,122,0.15)',
  FigureCaption:  'rgba(20,184,166,0.15)',
}
const CAT_TEXT: Record<string, string> = {
  Title:          'rgba(165,180,252,0.9)',
  NarrativeText:  'rgba(147,197,253,0.9)',
  Table:          'rgba(252,211,77,0.9)',
  Image:          'rgba(110,231,183,0.9)',
  ListItem:       'rgba(196,181,253,0.9)',
  Header:         'rgba(249,168,212,0.9)',
  Footer:         'rgba(161,161,170,0.9)',
  FigureCaption:  'rgba(94,234,212,0.9)',
}
const CAT_BAR: Record<string, string> = {
  Title:          '#6366f1',
  NarrativeText:  '#3b82f6',
  Table:          '#f59e0b',
  Image:          '#10b981',
  ListItem:       '#a78bfa',
  Header:         '#ec4899',
  Footer:         '#71717a',
  FigureCaption:  '#14b8a6',
}

export default function LibraryPage({ onRefresh }: Props) {
  const [files,   setFiles]   = useState<LibraryFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  async function load() {
    setLoading(true); setError('')
    try { setFiles(await fetchLibrary()) }
    catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const totalChunks     = files.reduce((a, f) => a + f.chunks, 0)
  const allCats         = Array.from(new Set(files.flatMap(f => Object.keys(f.categories))))
  const useUnstructured = files.some(f => f.parser === 'unstructured')

  return (
    <div className="flex flex-col h-full" style={{ background: 'transparent' }}>

      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.15)' }}
      >
        <div>
          <h1 className="text-sm font-semibold text-white flex items-center gap-2">
            <Layers size={14} className="text-indigo-400" />
            Library
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {files.length} file{files.length !== 1 ? 's' : ''} · {totalChunks} chunks indexed
          </p>
        </div>
        <motion.button
          onClick={() => { load(); onRefresh() }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={{
            color: 'rgba(255,255,255,0.3)',
            border: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </motion.button>
      </div>

      {/* Unstructured callout */}
      <AnimatePresence>
        {useUnstructured && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-6 mt-4 flex items-start gap-3 p-4 rounded-xl flex-shrink-0 overflow-hidden relative"
            style={{
              background: 'rgba(79,70,229,0.06)',
              border: '1px solid rgba(99,102,241,0.2)',
              borderLeft: '3px solid rgba(99,102,241,0.8)',
            }}
          >
            {/* glow */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(circle at 0% 50%, rgba(99,102,241,0.08), transparent 60%)' }}
            />
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 relative"
              style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 0 14px rgba(99,102,241,0.3)' }}
            >
              <Cpu size={14} className="text-white" />
            </div>
            <div className="relative">
              <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'rgba(165,180,252,0.9)' }}>
                <Zap size={10} /> Processed with Unstructured.io
              </p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'rgba(165,180,252,0.5)' }}>
                Layout-aware parsing — titles, tables, figures identified separately for cleaner retrieval.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && (
          <div className="flex items-center justify-center py-16" style={{ color: 'rgba(255,255,255,0.2)' }}>
            <RefreshCw size={16} className="animate-spin mr-2" />
            <span className="text-sm">Loading library…</span>
          </div>
        )}
        {error && (
          <div className="text-sm text-red-400 py-8 text-center">{error}</div>
        )}
        {!loading && !error && files.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <FileText size={18} style={{ color: 'rgba(255,255,255,0.15)' }} />
            </div>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
              No files indexed yet. Upload via sidebar.
            </p>
          </div>
        )}
        <div className="space-y-3">
          {!loading && files.map((file, i) => (
            <FileCard3D key={file.name} file={file} index={i} catColors={CAT_COLORS} catText={CAT_TEXT} catBar={CAT_BAR} />
          ))}
        </div>
      </div>

      {/* Legend */}
      {!loading && allCats.length > 0 && (
        <div className="px-6 py-3 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.1)' }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Tag size={10} style={{ color: 'rgba(255,255,255,0.2)' }} />
            <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>Element types:</span>
            {allCats.map(c => (
              <span key={c}
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                style={{ background: CAT_COLORS[c] ?? 'rgba(255,255,255,0.05)', color: CAT_TEXT[c] ?? 'rgba(255,255,255,0.4)' }}
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── 3D scroll-reveal file card ── */
function FileCard3D({
  file, index, catColors, catText, catBar,
}: {
  file: LibraryFile
  index: number
  catColors: Record<string, string>
  catText: Record<string, string>
  catBar: Record<string, string>
}) {
  const [open, setOpen] = useState(false)
  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-30px' })

  const ext  = file.name.split('.').pop()?.toLowerCase() ?? ''
  const icon = ext === 'pdf' ? '📄' : ext === 'docx' ? '📝' : ext === 'md' ? '📃' : ext.match(/png|jpg|jpeg/) ? '🖼️' : '📄'
  const totalCats = Object.values(file.categories).reduce((a,b) => a+b, 0)

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, rotateX: -8, y: 20, scale: 0.97 }}
      animate={inView ? { opacity: 1, rotateX: 0, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.45, delay: index * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{
        transformStyle: 'preserve-3d',
        perspective: '800px',
      }}
    >
      <motion.div
        whileHover={{ y: -2, boxShadow: '0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)' }}
        transition={{ duration: 0.2 }}
        className="rounded-xl overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Card header */}
        <div
          className="flex items-center gap-3 px-4 py-3.5 cursor-pointer"
          onClick={() => setOpen(o => !o)}
        >
          <span className="text-xl flex-shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{file.name}</p>
            <div className="flex items-center gap-2.5 mt-0.5">
              <span className="text-xs flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                <Layers size={10} /> {file.chunks} chunks
              </span>
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                style={
                  file.parser === 'unstructured'
                    ? { background: 'rgba(99,102,241,0.15)', color: 'rgba(165,180,252,0.8)' }
                    : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)' }
                }
              >
                {file.parser === 'unstructured' ? '⚡ Unstructured' : 'PyPDF'}
              </span>
            </div>
          </div>
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={13} style={{ color: 'rgba(255,255,255,0.3)' }} />
          </motion.div>
        </div>

        {/* Expanded breakdown */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-3"
                style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.15)' }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3"
                  style={{ color: 'rgba(255,255,255,0.2)' }}
                >
                  Element breakdown
                </p>
                <div className="space-y-2">
                  {Object.entries(file.categories).sort((a,b) => b[1]-a[1]).map(([cat, count]) => (
                    <div key={cat} className="flex items-center gap-2.5">
                      <div className="flex-1 h-1 rounded-full overflow-hidden"
                        style={{ background: 'rgba(255,255,255,0.06)' }}
                      >
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.round((count/totalCats)*100)}%` }}
                          transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
                          className="h-full rounded-full"
                          style={{
                            background: catBar[cat] ?? '#6366f1',
                            boxShadow: `0 0 6px ${catBar[cat] ?? '#6366f1'}60`,
                          }}
                        />
                      </div>
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap"
                        style={{
                          background: catColors[cat] ?? 'rgba(255,255,255,0.05)',
                          color: catText[cat] ?? 'rgba(255,255,255,0.4)',
                        }}
                      >
                        {cat}
                      </span>
                      <span className="text-[10px] w-5 text-right" style={{ color: 'rgba(255,255,255,0.2)' }}>
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
