import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Network, RefreshCw, Search, Maximize2, ZoomIn, ZoomOut, Play, Loader2, Square } from 'lucide-react'
import ForceGraph2D from 'react-force-graph-2d'
import { fetchGraphData, fetchGraphBuildStatus, type GraphData } from '../api'

const COLORS = {
  node:        '#4f46e5',
  nodeHover:   '#818cf8',
  nodeFocus:   '#a78bfa',
  link:        'rgba(99,102,241,0.18)',
  linkHover:   'rgba(129,140,248,0.6)',
  labelNormal: 'rgba(255,255,255,0.45)',
  labelFocus:  '#e0e7ff',
}

interface GraphNode { id: string; label: string; __highlight?: boolean }
interface GraphLink { source: string; target: string; label: string }

export default function GraphPage() {
  const [data,      setData]      = useState<GraphData>({ nodes: [], edges: [] })
  const [loading,   setLoading]   = useState(true)
  const [focusNode, setFocusNode] = useState('')
  const [search,    setSearch]    = useState('')
  const [hoverNode, setHoverNode] = useState<string | null>(null)
  const [building,  setBuilding]  = useState(false)
  const [buildProgress, setBuildProgress] = useState({ progress: 0, total: 0 })
  const [pending,   setPending]   = useState(0)
  const graphRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  useEffect(() => {
    fetchGraphData().then(setData).catch(() => {}).finally(() => setLoading(false))
    fetchGraphBuildStatus().then(s => setPending(s.pending_chunks)).catch(() => {})
  }, [])

  // Poll progress while building
  useEffect(() => {
    if (!building) return
    const interval = setInterval(async () => {
      try {
        const s = await fetchGraphBuildStatus()
        setBuildProgress({ progress: s.progress, total: s.total })
        setPending(s.pending_chunks)
        if (!s.running && (s.done || s.total === 0)) {
          setBuilding(false)
          setPending(0)
          fetchGraphData().then(setData).catch(() => {})
        }
      } catch { /* ignore */ }
    }, 2000)
    return () => clearInterval(interval)
  }, [building])

  async function startBuild() {
    setBuilding(true)
    setBuildProgress({ progress: 0, total: 0 })
    try {
      await fetch('/api/build-graph', { method: 'POST' })
    } catch { /* ignore — polling handles status */ }
  }

  async function stopBuild() {
    try {
      await fetch('/api/build-graph/cancel', { method: 'POST' })
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!graphRef.current || data.nodes.length === 0) return
    const interval = setInterval(() => {
      graphRef.current?.d3ReheatSimulation()
    }, 10000)
    return () => clearInterval(interval)
  }, [data.nodes.length])

  const graphData = useMemo(() => ({
    nodes: data.nodes.map(n => ({ id: n.id, label: n.label })) as GraphNode[],
    links: data.edges.map(e => ({ source: e.source, target: e.target, label: e.label })) as GraphLink[],
  }), [data])

  const neighborSet = useMemo(() => {
    const s = new Set<string>()
    if (!focusNode) return s
    s.add(focusNode)
    data.edges.forEach(e => {
      if (e.source === focusNode) s.add(e.target)
      if (e.target === focusNode) s.add(e.source)
    })
    return s
  }, [focusNode, data.edges])

  const focusRef = useRef(focusNode)
  const hoverRef = useRef(hoverNode)
  const neighborRef = useRef(neighborSet)
  focusRef.current = focusNode
  hoverRef.current = hoverNode
  neighborRef.current = neighborSet

  const nodeColor = useCallback((node: any) => {
    const f = focusRef.current, h = hoverRef.current, ns = neighborRef.current
    if (node.id === f) return COLORS.nodeFocus
    if (node.id === h) return COLORS.nodeHover
    if (f && !ns.has(node.id)) return 'rgba(99,102,241,0.12)'
    return COLORS.node
  }, [])

  const linkColor = useCallback((link: any) => {
    const f = focusRef.current
    const src = typeof link.source === 'object' ? link.source.id : link.source
    const tgt = typeof link.target === 'object' ? link.target.id : link.target
    if (f && (src === f || tgt === f)) return COLORS.linkHover
    if (f) return 'rgba(99,102,241,0.05)'
    return COLORS.link
  }, [])

  const nodeLabel = useCallback((node: any) =>
    `<div style="background:rgba(0,0,0,0.85);border:1px solid rgba(99,102,241,0.4);color:#e0e7ff;padding:4px 10px;border-radius:8px;font-size:12px;font-family:Inter,sans-serif">${node.label}</div>`
  , [])

  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const f = focusRef.current, h = hoverRef.current
    const r = f === node.id ? 14 : 10
    const col = nodeColor(node)

    if (node.id === f || node.id === h) {
      ctx.beginPath()
      ctx.arc(node.x, node.y, r + 6, 0, 2 * Math.PI)
      ctx.fillStyle = node.id === f ? 'rgba(167,139,250,0.25)' : 'rgba(129,140,248,0.18)'
      ctx.fill()
    }

    ctx.beginPath()
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI)
    ctx.fillStyle = col
    ctx.fill()

    if (globalScale > 1.2 || node.id === f || node.id === h) {
      ctx.font = `${Math.max(11 / globalScale, 3.5)}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = node.id === f ? COLORS.labelFocus : COLORS.labelNormal
      ctx.fillText(node.label, node.x, node.y + r + 3)
    }
  }, [nodeColor])

  function handleNodeClick(node: any) {
    setFocusNode(prev => prev === node.id ? '' : node.id)
    // Re-render the canvas with updated highlight state
    requestAnimationFrame(() => graphRef.current?.refresh())
    if (graphRef.current) {
      graphRef.current.centerAt(node.x, node.y, 400)
      graphRef.current.zoom(3, 400)
    }
  }

  function handleNodeHover(node: any) {
    setHoverNode(node?.id ?? null)
    requestAnimationFrame(() => graphRef.current?.refresh())
  }

  function zoomToFit() {
    graphRef.current?.zoomToFit(400, 60)
  }

  function refresh() {
    setLoading(true)
    setFocusNode('')
    fetchGraphData().then(setData).catch(() => {}).finally(() => setLoading(false))
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
            <div className="space-y-1">
              <div className="flex gap-3 text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  {data.nodes.length} nodes
                </span>
                <span>{data.edges.length} edges</span>
              </div>
              {pending > 0 && !building && (
                <div className="text-[10px] px-1.5 py-0.5 rounded-md inline-block"
                  style={{ color: '#fbbf24', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.15)' }}
                >
                  {pending} chunks pending
                </div>
              )}
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
            onClick={() => { setFocusNode(''); zoomToFit() }}
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
              transition={{ delay: Math.min(i * 0.012, 0.6) }}
              whileHover={{ x: 3 }}
              onClick={() => {
                setFocusNode(n.id)
                const graphNode = graphRef.current?.graphData().nodes.find((gn: any) => gn.id === n.id)
                if (graphNode && graphRef.current) {
                  graphRef.current.centerAt(graphNode.x, graphNode.y, 400)
                  graphRef.current.zoom(3, 400)
                }
              }}
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

        {/* Bottom buttons */}
        <div className="p-2 space-y-1" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex gap-1">
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={zoomToFit}
              title="Fit to view"
              className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg transition-colors"
              style={{ color: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}
            >
              <Maximize2 size={10} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => graphRef.current?.zoom(graphRef.current.zoom() * 1.5, 300)}
              title="Zoom in"
              className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg transition-colors"
              style={{ color: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}
            >
              <ZoomIn size={10} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => graphRef.current?.zoom(graphRef.current.zoom() * 0.6, 300)}
              title="Zoom out"
              className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg transition-colors"
              style={{ color: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}
            >
              <ZoomOut size={10} />
            </motion.button>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={refresh}
            className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg transition-colors"
            style={{ color: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}
          >
            <RefreshCw size={11} /> Refresh
          </motion.button>
          {building ? (
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={stopBuild}
              className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg transition-colors"
              style={{
                color: '#f87171',
                border: '1px solid rgba(239,68,68,0.2)',
                background: 'rgba(239,68,68,0.08)',
              }}
            >
              <Square size={9} /> Stop {buildProgress.total > 0 ? `(${buildProgress.progress}/${buildProgress.total})` : ''}
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={startBuild}
              className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg transition-colors"
              style={{
                color: '#c4b5fd',
                border: '1px solid rgba(124,58,237,0.2)',
                background: 'rgba(124,58,237,0.08)',
              }}
            >
              <Play size={11} /> {data.nodes.length > 0 ? 'Rebuild' : 'Build'}{pending > 0 ? ` (${pending})` : ''}
            </motion.button>
          )}
        </div>
      </motion.div>

      {/* ── Graph canvas ── */}
      <div ref={containerRef} className="flex-1 relative" style={{ background: '#040406' }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <RefreshCw size={18} className="animate-spin" style={{ color: 'rgba(255,255,255,0.15)' }} />
          </div>
        )}

        {data.nodes.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)' }}
            >
              {building
                ? <Loader2 size={24} className="animate-spin text-violet-400" />
                : <Network size={24} style={{ color: 'rgba(167,139,250,0.5)' }} />
              }
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {building ? 'Building knowledge graph…' : 'No graph built yet'}
              </p>
              <p className="text-xs mt-1 max-w-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
                {building
                  ? `Processing chunks${buildProgress.total > 0 ? ` · ${buildProgress.progress}/${buildProgress.total}` : '…'}`
                  : 'Upload papers first, then build the knowledge graph to visualize concepts and relationships.'}
              </p>
            </div>
            {building ? (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={stopBuild}
                className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
                style={{
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: '#f87171',
                }}
              >
                <Square size={12} /> Stop
              </motion.button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.03, boxShadow: '0 0 30px rgba(124,58,237,0.3)' }}
                whileTap={{ scale: 0.97 }}
                onClick={startBuild}
                className="flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
                style={{
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  color: '#fff',
                  boxShadow: '0 4px 20px rgba(79,70,229,0.3)',
                }}
              >
                <Play size={14} /> Build Graph
              </motion.button>
            )}
          </div>
        )}

        {data.nodes.length > 0 && (
          <ForceGraph2D
            ref={graphRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={graphData}
            nodeCanvasObject={paintNode}
            nodePointerAreaPaint={(node: any, color, ctx) => {
              ctx.beginPath()
              ctx.arc(node.x, node.y, 16, 0, 2 * Math.PI)
              ctx.fillStyle = color
              ctx.fill()
            }}
            linkColor={linkColor}
            linkWidth={1.5}
            linkDirectionalArrowLength={5}
            linkDirectionalArrowRelPos={1}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            nodeLabel={nodeLabel}
            backgroundColor="transparent"
            cooldownTime={Infinity}
            d3AlphaDecay={0.005}
            d3AlphaMin={0.005}
            d3VelocityDecay={0.3}
            warmupTicks={100}
            onEngineStop={() => graphRef.current?.zoomToFit(400, 60)}
          />
        )}
      </div>
    </div>
  )
}
