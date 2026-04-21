import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Network, RefreshCw, Search } from 'lucide-react'
import { fetchGraphData, type GraphData } from '../api'

export default function GraphPage() {
  const [data,      setData]      = useState<GraphData>({ nodes: [], edges: [] })
  const [loading,   setLoading]   = useState(true)
  const [focusNode, setFocusNode] = useState('')
  const [search,    setSearch]    = useState('')
  const [iframeSrc, setIframeSrc] = useState('/api/graph/html')

  useEffect(() => {
    fetchGraphData().then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [])

  function applyFocus(node = focusNode) {
    setIframeSrc(node ? `/api/graph/html?node=${encodeURIComponent(node)}` : '/api/graph/html')
  }

  const filtered = data.nodes.filter(n => !search || n.label.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex h-full overflow-hidden rounded-2xl">

      {/* ── Controls panel ── */}
      <motion.div
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="w-52 flex-shrink-0 flex flex-col"
        style={{
          background: 'rgba(255,255,255,0.02)',
          borderRight: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        {/* Header */}
        <div className="px-3 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.3)' }}
            >
              <Network size={12} className="text-violet-400" />
            </div>
            <span className="text-sm font-semibold text-white">Graph</span>
          </div>
          {!loading && (
            <div className="flex gap-3 text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                {data.nodes.length} nodes
              </span>
              <span>{data.edges.length} edges</span>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="p-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.2)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search concepts…"
              className="w-full pl-6 pr-2 py-1.5 text-xs outline-none transition-all"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 10,
                color: 'rgba(255,255,255,0.7)',
              }}
            />
          </div>
        </div>

        {/* Node list */}
        <div className="flex-1 overflow-y-auto py-1">
          <button
            onClick={() => { setFocusNode(''); applyFocus('') }}
            className="w-full text-left text-xs px-3 py-1.5 transition-colors rounded-lg mx-1 my-0.5"
            style={{
              color: !focusNode ? 'rgba(165,180,252,0.9)' : 'rgba(255,255,255,0.3)',
              background: !focusNode ? 'rgba(99,102,241,0.12)' : 'transparent',
              width: 'calc(100% - 8px)',
            }}
          >
            Show full graph
          </button>

          {loading && (
            <div className="flex items-center justify-center py-8" style={{ color: 'rgba(255,255,255,0.2)' }}>
              <RefreshCw size={13} className="animate-spin" />
            </div>
          )}

          {filtered.map((n, i) => (
            <motion.button
              key={n.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.012 }}
              whileHover={{ x: 3 }}
              onClick={() => { setFocusNode(n.id); applyFocus(n.id) }}
              className="w-full text-left text-xs px-3 py-1.5 transition-colors rounded-lg mx-1 my-0.5 truncate"
              style={{
                color: focusNode === n.id ? 'rgba(165,180,252,0.9)' : 'rgba(255,255,255,0.28)',
                background: focusNode === n.id ? 'rgba(99,102,241,0.12)' : 'transparent',
                width: 'calc(100% - 8px)',
              }}
            >
              {n.label}
            </motion.button>
          ))}
        </div>

        {/* Refresh */}
        <div className="p-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => { applyFocus(); fetchGraphData().then(setData).catch(() => {}) }}
            className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg transition-colors"
            style={{
              color: 'rgba(255,255,255,0.25)',
              border: '1px solid rgba(255,255,255,0.05)',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <RefreshCw size={11} /> Refresh
          </motion.button>
        </div>
      </motion.div>

      {/* ── Graph iframe ── */}
      <div className="flex-1 relative" style={{ background: '#040406' }}>
        <AnimatePresence mode="wait">
          {data.nodes.length === 0 && !loading ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full gap-4 text-center"
            >
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <Network size={24} style={{ color: 'rgba(255,255,255,0.1)' }} />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>No graph built yet</p>
                <p className="text-xs mt-1 max-w-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  Upload and process files — the knowledge graph builds automatically.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.iframe
              key={iframeSrc}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              src={iframeSrc}
              className="w-full h-full border-none"
              title="Knowledge Graph"
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
