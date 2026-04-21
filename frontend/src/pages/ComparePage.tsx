import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { BarChart2, Send, FileText, Network, Loader2, Zap, ArrowRight } from 'lucide-react'
import { compareAnswers, type CompareResult } from '../api'
import { useTilt3D } from '../hooks/use3D'

export default function ComparePage() {
  const [question, setQuestion] = useState('')
  const [result,   setResult]   = useState<CompareResult | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [focused,  setFocused]  = useState(false)

  async function run() {
    if (!question.trim() || loading) return
    setLoading(true); setError(''); setResult(null)
    try { setResult(await compareAnswers(question)) }
    catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-6 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.15)' }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.2)' }}
          >
            <BarChart2 size={12} className="text-amber-400" />
          </div>
          <h1 className="text-sm font-semibold text-white">RAG vs GraphRAG</h1>
        </div>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Run the same question through both retrieval strategies, side-by-side.
        </p>
      </div>

      {/* Input */}
      <div className="px-6 pt-5 pb-4 flex-shrink-0">
        <motion.div
          animate={{
            boxShadow: focused
              ? '0 0 0 1px rgba(99,102,241,0.4), 0 0 24px rgba(99,102,241,0.12)'
              : '0 0 0 1px rgba(255,255,255,0.06)',
          }}
          className="flex gap-2 rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.04)', padding: '6px 6px 6px 16px' }}
        >
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run()}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="e.g. How does BERT relate to the Transformer architecture?"
            className="flex-1 text-sm outline-none"
            style={{ background: 'transparent', color: 'rgba(255,255,255,0.8)' }}
          />
          <motion.button
            onClick={run}
            disabled={!question.trim() || loading}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              boxShadow: '0 4px 14px rgba(79,70,229,0.3)',
            }}
          >
            {loading ? <><Loader2 size={13} className="animate-spin" /> Running…</>
                     : <><Send size={13} /> Compare</>}
          </motion.button>
        </motion.div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">

        {/* Idle */}
        {!result && !loading && !error && (
          <div className="flex flex-col items-center gap-8 py-10">
            <div className="flex items-center gap-6">
              <PanelCard type="rag" />
              <div className="flex flex-col items-center gap-1">
                <ArrowRight size={18} style={{ color: 'rgba(255,255,255,0.1)' }} />
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.15)' }}>vs</span>
                <ArrowRight size={18} style={{ color: 'rgba(255,255,255,0.1)', transform: 'rotate(180deg)' }} />
              </div>
              <PanelCard type="graph" />
            </div>

            <div className="max-w-sm text-center">
              <p className="text-sm font-semibold text-white mb-2">How they differ</p>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
                <span className="text-amber-300 font-medium">RAG</span> finds chunks by similarity.{' '}
                <span className="text-indigo-300 font-medium">GraphRAG</span> also traverses the knowledge
                graph to find conceptual relationships no similarity search can surface.
              </p>
            </div>

            {/* Preset questions */}
            <div className="grid grid-cols-2 gap-2 max-w-md w-full">
              {[
                'How does BERT relate to the Transformer?',
                'What training techniques are shared across papers?',
                'How does attention compare to convolution?',
                'What are the key differences between GPT and T5?',
              ].map((q, i) => (
                <motion.button
                  key={q}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}
                  onClick={() => setQuestion(q)}
                  className="text-xs text-left rounded-xl p-3 leading-relaxed transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.4)',
                  }}
                >
                  {q}
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-400 py-4 text-center rounded-xl mt-2"
            style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.1)' }}
          >
            {error}
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-14 gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full animate-ping"
                style={{ background: 'rgba(99,102,241,0.15)' }}
              />
              <div className="relative w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}
              >
                <Loader2 size={20} className="animate-spin text-indigo-400" />
              </div>
            </div>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Running both pipelines…</p>
            <div className="flex gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-amber-400/60">
                <Zap size={10} /> RAG pipeline
              </span>
              <span className="flex items-center gap-1.5 text-indigo-400/60">
                <Network size={10} /> GraphRAG pipeline
              </span>
            </div>
          </div>
        )}

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="grid grid-cols-2 gap-5 mt-2"
            >
              {/* RAG result */}
              <motion.div
                initial={{ opacity: 0, x: -20, rotateY: -4 }}
                animate={{ opacity: 1, x: 0, rotateY: 0 }}
                transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="flex flex-col gap-3"
                style={{ perspective: '800px' }}
              >
                <ColLabel type="rag" />
                <div className="prose-chat rounded-2xl px-4 py-4"
                  style={{
                    background: 'rgba(245,158,11,0.04)',
                    border: '1px solid rgba(245,158,11,0.12)',
                  }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.rag.answer}</ReactMarkdown>
                </div>
                {result.rag.sources.length > 0 && <Sources sources={result.rag.sources} type="rag" />}
              </motion.div>

              {/* GraphRAG result */}
              <motion.div
                initial={{ opacity: 0, x: 20, rotateY: 4 }}
                animate={{ opacity: 1, x: 0, rotateY: 0 }}
                transition={{ duration: 0.4, delay: 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="flex flex-col gap-3"
                style={{ perspective: '800px' }}
              >
                <ColLabel type="graph" />
                <div className="prose-chat rounded-2xl px-4 py-4"
                  style={{
                    background: 'rgba(99,102,241,0.04)',
                    border: '1px solid rgba(99,102,241,0.15)',
                    boxShadow: '0 0 30px rgba(99,102,241,0.04)',
                  }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.graphrag.answer}</ReactMarkdown>
                </div>
                {result.graphrag.sources.length > 0 && <Sources sources={result.graphrag.sources} type="graph" />}
                {result.graphrag.graph && (
                  <div className="text-xs rounded-xl p-3"
                    style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <div className="flex items-center gap-1.5 mb-2 text-indigo-400 font-medium">
                      <Network size={11} /> Graph relationships used
                    </div>
                    <pre className="text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap font-mono"
                      style={{ color: 'rgba(255,255,255,0.3)' }}
                    >
                      {result.graphrag.graph}
                    </pre>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* Idle preview cards */
function PanelCard({ type }: { type: 'rag' | 'graph' }) {
  const { ref, style, glareStyle } = useTilt3D(6)
  const isRag = type === 'rag'

  return (
    <div ref={ref as React.RefObject<HTMLDivElement>} style={{ ...style, position: 'relative' }}>
      <div className="glare" style={glareStyle} />
      <div className="w-36 h-20 rounded-2xl flex flex-col items-center justify-center gap-2"
        style={{
          background: isRag ? 'rgba(245,158,11,0.06)' : 'rgba(99,102,241,0.08)',
          border: `1px solid ${isRag ? 'rgba(245,158,11,0.2)' : 'rgba(99,102,241,0.2)'}`,
          boxShadow: `0 8px 24px ${isRag ? 'rgba(245,158,11,0.08)' : 'rgba(99,102,241,0.1)'}`,
        }}
      >
        {isRag ? <FileText size={20} className="text-amber-400 opacity-70" /> : <Network size={20} className="text-indigo-400 opacity-70" />}
        <span className="text-[11px] font-bold tracking-widest uppercase"
          style={{ color: isRag ? 'rgba(252,211,77,0.7)' : 'rgba(165,180,252,0.7)' }}
        >
          {isRag ? 'RAG' : 'GraphRAG'}
        </span>
      </div>
    </div>
  )
}

function ColLabel({ type }: { type: 'rag' | 'graph' }) {
  const isRag = type === 'rag'
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-lg flex items-center justify-center"
        style={isRag
          ? { background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.2)' }
          : { background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.2)' }
        }
      >
        {isRag ? <FileText size={11} className="text-amber-400" /> : <Network size={11} className="text-indigo-400" />}
      </div>
      <span className="text-xs font-bold uppercase tracking-widest"
        style={{ color: isRag ? 'rgba(252,211,77,0.8)' : 'rgba(165,180,252,0.8)' }}
      >
        {isRag ? 'RAG only' : 'GraphRAG'}
      </span>
      <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
        {isRag ? '· chunks only' : '· chunks + graph'}
      </span>
    </div>
  )
}

function Sources({ sources, type }: { sources: string[]; type: 'rag' | 'graph' }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {sources.map((s, i) => (
        <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
          style={{
            background: type === 'rag' ? 'rgba(245,158,11,0.08)' : 'rgba(99,102,241,0.08)',
            color: type === 'rag' ? 'rgba(252,211,77,0.6)' : 'rgba(165,180,252,0.6)',
            border: `1px solid ${type === 'rag' ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)'}`,
          }}
        >
          <FileText size={9} /> {s}
        </span>
      ))}
    </div>
  )
}
