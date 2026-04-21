import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FileText, ChevronDown, ChevronUp, RotateCcw, PanelLeftClose, PanelLeftOpen, Sparkles, ArrowUp } from 'lucide-react'
import { streamChat, type ChatMessage, type Status } from '../api'

interface Props { status: Status; onRefresh: () => void }

const SUGGESTIONS = [
  'Summarize the key contributions',
  'What methods and datasets were used?',
  'How does this differ from related work?',
  'What are the main limitations?',
]

export default function ChatPage({ status }: Props) {
  const [messages,  setMessages]  = useState<ChatMessage[]>([])
  const [input,     setInput]     = useState('')
  const [streaming, setStreaming] = useState(false)
  const [pdfList,   setPdfList]   = useState<string[]>([])
  const [selPdf,    setSelPdf]    = useState('')
  const [pdfOpen,   setPdfOpen]   = useState(true)
  const [focused,   setFocused]   = useState(false)

  const bottomRef    = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLTextAreaElement>(null)
  const scrollRef    = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/library').then(r => r.json()).then(data => {
      const pdfs = (data.files as any[]).filter(f => f.name.toLowerCase().endsWith('.pdf')).map((f: any) => f.name)
      setPdfList(pdfs)
      if (pdfs.length) setSelPdf(pdfs[0])
    }).catch(() => {})
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text: string) {
    if (!text.trim() || streaming) return
    const question = text.trim()
    setInput('')
    inputRef.current && (inputRef.current.style.height = 'auto')

    const userMsg:      ChatMessage = { role: 'user',      content: question }
    const assistantMsg: ChatMessage = { role: 'assistant', content: '', streaming: true }
    setMessages(prev => [...prev, userMsg, assistantMsg])
    setStreaming(true)

    await streamChat(question, messages,
      token => setMessages(prev => {
        const u = [...prev]; const l = u[u.length-1]
        if (l.role === 'assistant') l.content += token
        return u
      }),
      (sources, graph) => setMessages(prev => {
        const u = [...prev]; const l = u[u.length-1]
        if (l.role === 'assistant') { l.streaming = false; l.sources = sources; l.graph = graph }
        setStreaming(false); return u
      }),
      err => setMessages(prev => {
        const u = [...prev]; const l = u[u.length-1]
        if (l.role === 'assistant') { l.content = `Error: ${err}`; l.streaming = false }
        setStreaming(false); return u
      })
    )
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  const hasContent = status.chunks > 0

  return (
    <div className="flex h-full overflow-hidden rounded-2xl">

      {/* ── PDF Panel ── */}
      <AnimatePresence initial={false}>
        {pdfOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: '46%', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            className="flex flex-col flex-shrink-0 overflow-hidden"
            style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}
          >
            {/* PDF toolbar */}
            <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)' }}
            >
              <FileText size={12} className="text-zinc-600 flex-shrink-0" />
              {pdfList.length > 0 ? (
                <select value={selPdf} onChange={e => setSelPdf(e.target.value)}
                  className="flex-1 text-xs bg-transparent text-zinc-400 outline-none truncate cursor-pointer"
                >
                  {pdfList.map(p => <option key={p} value={p} className="bg-zinc-900">{p}</option>)}
                </select>
              ) : (
                <span className="text-xs text-zinc-700">No PDFs uploaded</span>
              )}
            </div>
            <div className="flex-1" style={{ background: '#050507' }}>
              {selPdf ? (
                <iframe src={`/api/pdf/${encodeURIComponent(selPdf)}`} className="w-full h-full border-none" title={selPdf} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-700">
                  <FileText size={26} className="opacity-40" />
                  <p className="text-xs">Upload PDFs to preview</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PDF toggle strip */}
      <button
        onClick={() => setPdfOpen(o => !o)}
        className="w-4 flex-shrink-0 flex items-center justify-center transition-colors"
        style={{
          background: 'rgba(255,255,255,0.015)',
          borderRight: '1px solid rgba(255,255,255,0.04)',
          color: 'rgba(255,255,255,0.2)',
        }}
        title={pdfOpen ? 'Hide PDF' : 'Show PDF'}
      >
        {pdfOpen ? <PanelLeftClose size={11} /> : <PanelLeftOpen size={11} />}
      </button>

      {/* ── Chat Panel ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            background: 'rgba(0,0,0,0.15)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 0 12px rgba(99,102,241,0.4)' }}
              >AI</div>
              {streaming && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#060608] animate-pulse" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-none">Research Chat</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {streaming ? 'Thinking…' : status.chunks > 0 ? `${status.files} paper${status.files !== 1 ? 's' : ''} indexed` : 'No papers yet'}
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <motion.button
              onClick={() => setMessages([])}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors"
              style={{ color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <RotateCcw size={11} /> Clear
            </motion.button>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {!hasContent && messages.length === 0 && <EmptyState />}
          {hasContent  && messages.length === 0 && <SuggestionChips onSelect={send} />}

          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 14, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <MessageBubble msg={msg} />
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>

        {/* ── Premium Chat Input ── */}
        <div className="px-4 pb-4 pt-2 flex-shrink-0">
          <motion.div
            animate={{
              boxShadow: focused
                ? '0 0 0 1px rgba(99,102,241,0.5), 0 0 30px rgba(99,102,241,0.15), 0 8px 32px rgba(0,0,0,0.4)'
                : '0 0 0 1px rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.3)',
            }}
            transition={{ duration: 0.2 }}
            className="relative rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            {/* Animated gradient border on focus */}
            {focused && (
              <motion.div
                className="absolute inset-0 pointer-events-none rounded-2xl"
                style={{
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2), rgba(99,102,241,0.2))',
                  backgroundSize: '200% 200%',
                }}
                animate={{ backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
              />
            )}

            <div className="relative flex items-end gap-2 px-4 py-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={hasContent ? 'Ask anything about your papers…' : 'Upload papers to start asking questions…'}
                disabled={streaming || !hasContent}
                rows={1}
                style={{
                  resize: 'none',
                  maxHeight: '160px',
                  overflowY: 'auto',
                  height: 'auto',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.85)',
                }}
                onInput={e => {
                  const el = e.currentTarget
                  el.style.height = 'auto'
                  el.style.height = el.scrollHeight + 'px'
                }}
                className="flex-1 text-sm outline-none placeholder-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <motion.button
                onClick={() => send(input)}
                disabled={!input.trim() || streaming || !hasContent}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.9 }}
                className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: input.trim() && !streaming && hasContent
                    ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
                    : 'rgba(255,255,255,0.08)',
                  boxShadow: input.trim() && !streaming && hasContent
                    ? '0 0 20px rgba(99,102,241,0.4)'
                    : 'none',
                }}
              >
                {streaming
                  ? <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  : <ArrowUp size={13} className="text-white" />
                }
              </motion.button>
            </div>

            <div className="px-4 pb-2.5 flex items-center justify-between">
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                ↵ Send · Shift+↵ New line
              </p>
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                Grounded in your papers only
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

/* ── Message Bubble ── */
function MessageBubble({ msg }: { msg: ChatMessage }) {
  const [graphOpen, setGraphOpen] = useState(false)
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[78%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed text-white"
          style={{
            background: 'linear-gradient(135deg, rgba(79,70,229,0.8), rgba(124,58,237,0.8))',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(99,102,241,0.3)',
            boxShadow: '0 4px 20px rgba(79,70,229,0.2)',
          }}
        >
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5"
        style={{
          background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
          boxShadow: '0 0 14px rgba(99,102,241,0.35)',
        }}
      >AI</div>

      <div className="flex-1 min-w-0">
        {/* Content card */}
        <div
          className="prose-chat rounded-2xl rounded-tl-sm px-4 py-3"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          {msg.content
            ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            : null
          }
          {msg.streaming && <span className="cursor" />}
        </div>

        {/* Sources */}
        {msg.sources && msg.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.sources.map((s, i) => (
              <span key={i}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                style={{
                  background: 'rgba(99,102,241,0.1)',
                  color: 'rgba(165,180,252,0.8)',
                  border: '1px solid rgba(99,102,241,0.2)',
                }}
              >
                <FileText size={9} /> {s}
              </span>
            ))}
          </div>
        )}

        {/* Graph context */}
        {msg.graph && (
          <div className="mt-1.5">
            <button onClick={() => setGraphOpen(o => !o)}
              className="flex items-center gap-1 text-[11px] transition-colors"
              style={{ color: 'rgba(129,140,248,0.7)' }}
            >
              {graphOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              {msg.graph.split('\n').filter(Boolean).length} graph relation(s) used
            </button>
            <AnimatePresence>
              {graphOpen && (
                <motion.pre
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-1.5 text-[11px] leading-relaxed rounded-xl p-3 overflow-x-auto font-mono"
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    color: 'rgba(255,255,255,0.35)',
                  }}
                >
                  {msg.graph}
                </motion.pre>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Suggestion Chips ── */
function SuggestionChips({ onSelect }: { onSelect: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-10">
      {/* Glowing icon */}
      <div className="relative">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(79,70,229,0.3), rgba(124,58,237,0.3))',
            border: '1px solid rgba(99,102,241,0.3)',
            boxShadow: '0 0 40px rgba(99,102,241,0.2)',
          }}
        >
          <Sparkles size={24} className="text-indigo-400" />
        </div>
        <div className="absolute inset-0 rounded-2xl animate-pulse"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.15), transparent 70%)' }}
        />
      </div>

      <div className="text-center">
        <p className="text-sm font-semibold text-white">Papers are indexed</p>
        <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Try one of these or ask your own question
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 w-full max-w-md">
        {SUGGESTIONS.map((s, i) => (
          <motion.button
            key={s}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(99,102,241,0.2)' }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect(s)}
            className="text-left text-xs rounded-xl p-3 leading-relaxed transition-all"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.45)',
            }}
          >
            {s}
          </motion.button>
        ))}
      </div>
    </div>
  )
}

/* ── Empty State ── */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-16 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <Sparkles size={26} style={{ color: 'rgba(255,255,255,0.15)' }} />
      </div>
      <div>
        <p className="text-sm font-semibold text-white">No papers yet</p>
        <p className="text-xs mt-1.5 max-w-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Drop PDFs, Word docs, or images in the sidebar. Then ask anything about your research.
        </p>
      </div>
    </div>
  )
}
