import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FileText, ChevronDown, ChevronUp, RotateCcw, PanelLeftClose, PanelLeftOpen, Sparkles, ArrowUp, AtSign, X, Bot, GripVertical } from 'lucide-react'
import { streamChat, type ChatMessage, type Status } from '../api'

interface Props {
  status: Status
  onRefresh: () => void
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  onSaveChat: (messages: ChatMessage[]) => void
  onNewChat: () => void
  chatTimestamp?: number | null
}

const SUGGESTIONS = [
  'Summarize the key contributions',
  'What methods and datasets were used?',
  'How does this differ from related work?',
  'What are the main limitations?',
]

export default function ChatPage({ status, messages, setMessages, onSaveChat, onNewChat, chatTimestamp }: Props) {
  const [input,         setInput]         = useState('')
  const [streaming,     setStreaming]     = useState(false)
  const [pdfList,       setPdfList]       = useState<string[]>([])
  const [selPdf,        setSelPdf]        = useState('')
  const [pdfOpen,       setPdfOpen]       = useState(true)
  const [pdfWidth,      setPdfWidth]      = useState(46)   // percentage
  const [draggingResize, setDraggingResize] = useState(false)
  const [focused,       setFocused]       = useState(false)
  const [mentionPapers, setMentionPapers] = useState<string[]>([])
  const [pickerOpen,    setPickerOpen]    = useState(false)

  const bottomRef    = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLTextAreaElement>(null)
  const scrollRef    = useRef<HTMLDivElement>(null)
  const pickerRef    = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Resize drag handler ──
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setDraggingResize(true)
    const startX = e.clientX
    const startWidth = pdfWidth
    const container = containerRef.current
    if (!container) return

    const onMove = (ev: MouseEvent) => {
      const containerRect = container.getBoundingClientRect()
      const dx = ev.clientX - startX
      const pctDelta = (dx / containerRect.width) * 100
      const next = Math.min(75, Math.max(15, startWidth + pctDelta))
      setPdfWidth(next)
    }
    const onUp = () => {
      setDraggingResize(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [pdfWidth])

  useEffect(() => {
    fetch('/api/library').then(r => r.json()).then(data => {
      const pdfs = (data.files as any[]).filter(f => f.name.toLowerCase().endsWith('.pdf')).map((f: any) => f.name)
      setPdfList(pdfs)
      if (pdfs.length) setSelPdf(pdfs[0])
    }).catch(() => {})
  }, [])

  const isNearBottom = useRef(true)
  useEffect(() => {
    if (isNearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const threshold = 120
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }

  // Auto-save chat when assistant finishes responding
  useEffect(() => {
    const finished = messages.filter(m => m.role === 'assistant' && !m.streaming && m.content)
    if (finished.length === 0 || messages.some(m => m.streaming)) return
    onSaveChat(messages)
  }, [messages, onSaveChat])

  useEffect(() => {
    if (!pickerOpen) return
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [pickerOpen])

  async function send(text: string) {
    if (!text.trim() || streaming) return
    const question = text.trim()
    setInput('')
    setPickerOpen(false)
    inputRef.current && (inputRef.current.style.height = 'auto')

    const userMsg:      ChatMessage = { role: 'user',      content: question }
    const assistantMsg: ChatMessage = { role: 'assistant', content: '', streaming: true }
    setMessages(prev => [...prev, userMsg, assistantMsg])
    setStreaming(true)

    if (mentionPapers.length > 0) {
      const first = mentionPapers[0]
      if (pdfList.includes(first)) {
        setSelPdf(first)
      }
    }

    const scopeArg = mentionPapers.length === 1 ? mentionPapers[0] : mentionPapers.length > 1 ? mentionPapers : null

    await streamChat(question, messages,
      token => setMessages(prev => {
        const u = [...prev]
        const last = u[u.length - 1]
        if (last.role === 'assistant') {
          u[u.length - 1] = { ...last, content: last.content + token }
        }
        return u
      }),
      (sources, graph) => {
        setMessages(prev => {
          const u = [...prev]
          const last = u[u.length - 1]
          if (last.role === 'assistant') {
            u[u.length - 1] = { ...last, streaming: false, sources, graph }
          }
          setStreaming(false); return u
        })
        if (mentionPapers.length === 0 && sources.length === 1 && pdfList.includes(sources[0])) {
          setSelPdf(sources[0])
        }
      },
      err => setMessages(prev => {
        const u = [...prev]
        const last = u[u.length - 1]
        if (last.role === 'assistant') {
          u[u.length - 1] = { ...last, content: `Error: ${err}`, streaming: false }
        }
        setStreaming(false); return u
      }),
      scopeArg,
    )
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setPickerOpen(false); return }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  const hasContent = status.chunks > 0

  return (
    <div ref={containerRef} className="flex h-full overflow-hidden rounded-2xl" style={{ userSelect: draggingResize ? 'none' : undefined }}>

      {/* ── PDF Panel ── */}
      <AnimatePresence initial={false}>
        {pdfOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: `${pdfWidth}%`, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={draggingResize ? { duration: 0 } : { type: 'spring', stiffness: 280, damping: 30 }}
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

      {/* Resize handle / PDF toggle strip */}
      <div
        onMouseDown={pdfOpen ? onResizeStart : undefined}
        onClick={!pdfOpen ? () => setPdfOpen(true) : undefined}
        className={`flex-shrink-0 flex items-center justify-center transition-colors ${pdfOpen ? 'cursor-col-resize hover:bg-indigo-500/10' : 'cursor-pointer'}`}
        style={{
          width: pdfOpen ? 8 : 16,
          background: draggingResize ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.015)',
          borderRight: '1px solid rgba(255,255,255,0.04)',
          color: 'rgba(255,255,255,0.2)',
        }}
        title={pdfOpen ? 'Drag to resize' : 'Show PDF'}
      >
        {pdfOpen ? (
          <div
            className="flex flex-col items-center gap-0.5 transition-opacity"
            style={{ opacity: draggingResize ? 1 : 0.4 }}
          >
            <GripVertical size={10} />
          </div>
        ) : (
          <PanelLeftOpen size={11} />
        )}
      </div>

      {/* Overlay to capture mouse during resize */}
      {draggingResize && (
        <div className="fixed inset-0 z-[9999]" style={{ cursor: 'col-resize' }} />
      )}

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
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 0 12px rgba(99,102,241,0.4)' }}
              ><Bot size={14} className="text-white" /></div>
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
          <div className="flex items-center gap-1.5">
            {/* PDF toggle */}
            <motion.button
              onClick={() => setPdfOpen(o => !o)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title={pdfOpen ? 'Hide PDF' : 'Show PDF'}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors"
              style={{ color: pdfOpen ? '#a5b4fc' : 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.06)', background: pdfOpen ? 'rgba(99,102,241,0.08)' : 'transparent' }}
            >
              {pdfOpen ? <PanelLeftClose size={11} /> : <PanelLeftOpen size={11} />}
              <span className="hidden sm:inline">{pdfOpen ? 'Hide PDF' : 'PDF'}</span>
            </motion.button>
            {/* New chat */}
            {messages.length > 0 && (
              <motion.button
                onClick={onNewChat}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors"
                style={{ color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <RotateCcw size={11} /> New
              </motion.button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {!hasContent && messages.length === 0 && <EmptyState />}
          {hasContent  && messages.length === 0 && <SuggestionChips onSelect={send} />}

          <AnimatePresence initial={false}>
            {messages.map((msg, i) => {
              const isFirstUser = msg.role === 'user' && messages.findIndex(m => m.role === 'user') === i
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  <MessageBubble msg={msg} timestamp={isFirstUser ? chatTimestamp : undefined} />
                </motion.div>
              )
            })}
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
            className="relative rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.04)', overflow: 'visible' }}
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

            {/* Scoped-paper chip */}
            {mentionPapers.length > 0 && (
              <div className="px-4 pt-2.5 pb-0 flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Scoped to:</span>
                {mentionPapers.map(paper => (
                  <span
                    key={paper}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}
                  >
                    <FileText size={9} />
                    {paper.replace('.pdf', '')}
                    <button onClick={() => setMentionPapers(prev => prev.filter(p => p !== paper))} className="ml-0.5 hover:text-white transition-colors">
                      <X size={9} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Paper picker dropdown (button-driven) */}
            <AnimatePresence>
              {pickerOpen && pdfList.length > 0 && (
                <motion.div
                  ref={pickerRef}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.14 }}
                  className="absolute bottom-full left-4 right-4 mb-2 rounded-xl overflow-hidden z-50 max-h-52 overflow-y-auto"
                  style={{
                    background: 'rgba(18,18,22,0.97)',
                    border: '1px solid rgba(99,102,241,0.25)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(12px)',
                  }}
                >
                  <div className="flex items-center justify-between px-3 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <p className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'rgba(255,255,255,0.25)' }}>
                      Query one paper
                    </p>
                    <button onClick={() => setPickerOpen(false)} className="text-zinc-600 hover:text-zinc-400 transition-colors"><X size={11} /></button>
                  </div>
                  {/* All papers option */}
                  <button
                    onClick={() => { setMentionPapers([]); setPickerOpen(false); inputRef.current?.focus() }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-indigo-500/10"
                    style={{ color: mentionPapers.length === 0 ? '#a5b4fc' : 'rgba(255,255,255,0.5)', background: mentionPapers.length === 0 ? 'rgba(99,102,241,0.08)' : undefined }}
                  >
                    <Sparkles size={11} className="flex-shrink-0" />
                    <span>All papers</span>
                  </button>
                  {pdfList.map(paper => {
                    const selected = mentionPapers.includes(paper)
                    return (
                      <button
                        key={paper}
                        onClick={() => {
                          setMentionPapers(prev => selected ? prev.filter(p => p !== paper) : [...prev, paper])
                          inputRef.current?.focus()
                        }}
                        className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-indigo-500/10"
                        style={{ color: selected ? '#a5b4fc' : 'rgba(255,255,255,0.7)', background: selected ? 'rgba(99,102,241,0.08)' : undefined }}
                      >
                        <FileText size={11} className={`flex-shrink-0 ${selected ? 'text-indigo-400' : 'text-zinc-600'}`} />
                        <span className="truncate flex-1">{paper}</span>
                        {selected && <span className="text-indigo-400 text-[10px]">✓</span>}
                      </button>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative flex items-end gap-2 px-4 py-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={hasContent ? (mentionPapers.length > 0 ? `Ask about ${mentionPapers.map(p => p.replace('.pdf','')).join(', ')}…` : 'Ask anything about your papers…') : 'Upload papers to start asking questions…'}
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
              <div className="flex items-center gap-2">
                {pdfList.length > 0 && (
                  <button
                    onClick={() => setPickerOpen(o => !o)}
                    title="Scope query to one paper"
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md transition-colors"
                    style={{
                      color: mentionPapers.length > 0 ? '#a5b4fc' : 'rgba(255,255,255,0.25)',
                      background: mentionPapers.length > 0 ? 'rgba(99,102,241,0.1)' : 'transparent',
                      border: mentionPapers.length > 0 ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                    }}
                  >
                    <AtSign size={10} />
                    <span>{mentionPapers.length > 0 ? `${mentionPapers.length} paper${mentionPapers.length > 1 ? 's' : ''}` : 'Scope'}</span>
                  </button>
                )}
                <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.15)' }}>
                  ↵ Send · Shift+↵ New line
                </p>
              </div>
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.15)' }}>
                {mentionPapers.length > 0 ? `Querying ${mentionPapers.length} paper${mentionPapers.length > 1 ? 's' : ''}` : 'All papers'}
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

/* ── Message Bubble ── */
function MessageBubble({ msg, timestamp }: { msg: ChatMessage; timestamp?: number | null }) {
  const [graphOpen, setGraphOpen] = useState(false)
  const [showTime, setShowTime] = useState(false)
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div
          onDoubleClick={timestamp ? () => setShowTime(t => !t) : undefined}
          className="max-w-[78%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed text-white"
          style={{
            background: 'linear-gradient(135deg, rgba(79,70,229,0.8), rgba(124,58,237,0.8))',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(99,102,241,0.3)',
            boxShadow: '0 4px 20px rgba(79,70,229,0.2)',
            cursor: timestamp ? 'default' : undefined,
          }}
        >
          {msg.content}
        </div>
        <AnimatePresence>
          {showTime && timestamp && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="text-[10px] px-2 select-none"
              style={{ color: 'rgba(255,255,255,0.2)' }}
            >
              {new Date(timestamp).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              {' · '}
              {new Date(timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      {/* Avatar */}
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{
          background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
          boxShadow: '0 0 14px rgba(99,102,241,0.35)',
        }}
      ><Bot size={13} className="text-white" /></div>

      <div className="flex-1 min-w-0">
        {/* Content card */}
        <div
          className="prose-chat rounded-2xl rounded-tl-sm px-4 py-3"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          {msg.streaming && !msg.content ? (
            <div className="thinking-dots">
              <span /><span /><span />
            </div>
          ) : msg.content ? (
            <>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              {msg.streaming && <span className="cursor" />}
            </>
          ) : null}
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
