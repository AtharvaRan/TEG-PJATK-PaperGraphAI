import { useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import LandingPage from './pages/LandingPage'
import Sidebar from './components/Sidebar'
import AppBackground from './components/AppBackground'
import ChatPage from './pages/ChatPage'
import LibraryPage from './pages/LibraryPage'
import GraphPage from './pages/GraphPage'
import InsightsPage from './pages/InsightsPage'
import { fetchStatus, type Status } from './api'
import { useMouseParallax } from './hooks/use3D'
import type { ChatMessage } from './api'

export type Page = 'chat' | 'library' | 'graph' | 'insights'

export interface SavedChat {
  id: string
  title: string
  messages: ChatMessage[]
  timestamp: number
}

function loadHistory(): SavedChat[] {
  try { return JSON.parse(localStorage.getItem('papergraph_chats') || '[]') }
  catch { return [] }
}
function saveHistoryToStorage(chats: SavedChat[]) {
  localStorage.setItem('papergraph_chats', JSON.stringify(chats.slice(0, 10)))
}

const pageVariants = {
  initial: { opacity: 0, y: 16, scale: 0.99 },
  enter:   { opacity: 1, y: 0,  scale: 1,    transition: { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit:    { opacity: 0, y: -8, scale: 0.99, transition: { duration: 0.16 } },
}

function MainApp() {
  const [page,   setPage]   = useState<Page>('chat')
  const [status, setStatus] = useState<Status>({ chunks: 0, graph_nodes: 0, graph_edges: 0, files: 0 })
  const [chatHistory, setChatHistory] = useState<SavedChat[]>(loadHistory)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const mouse = useMouseParallax(0.008)

  const refreshStatus = () => { fetchStatus().then(setStatus).catch(() => {}) }
  useEffect(() => { refreshStatus() }, [])

  const saveChat = useCallback((messages: ChatMessage[]) => {
    if (messages.length === 0) return
    const firstQ = messages.find(m => m.role === 'user')?.content || 'Untitled'
    const title = firstQ.length > 40 ? firstQ.slice(0, 40) + '…' : firstQ
    const id = activeChatId || Date.now().toString()
    if (!activeChatId) setActiveChatId(id)
    setChatHistory(prev => {
      const existing = prev.find(c => c.id === id)
      const updated = [
        { id, title, messages: [...messages], timestamp: existing?.timestamp ?? Date.now() },
        ...prev.filter(c => c.id !== id),
      ]
        .sort((a, b) => b.timestamp - a.timestamp)  // newest first, stable order
        .slice(0, 10)
      saveHistoryToStorage(updated)
      return updated
    })
  }, [activeChatId])

  const loadChat = useCallback((chat: SavedChat) => {
    setActiveChatId(chat.id)
    setChatMessages(chat.messages)
    setPage('chat')
  }, [])

  const deleteChat = useCallback((id: string) => {
    setChatHistory(prev => {
      const updated = prev.filter(c => c.id !== id)
      saveHistoryToStorage(updated)
      return updated
    })
    if (activeChatId === id) {
      setActiveChatId(null)
      setChatMessages([])
    }
  }, [activeChatId])

  const newChat = useCallback(() => {
    setActiveChatId(null)
    setChatMessages([])
    setPage('chat')
  }, [])

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#060608' }}>
      {/* Shared ambient background — seamless continuation from landing */}
      <AppBackground />

      {/* Radial glow that follows mouse — same as landing */}
      <div
        className="pointer-events-none fixed"
        style={{
          left: `calc(50% + ${mouse.x}px)`,
          top:  `calc(50% + ${mouse.y}px)`,
          width: 900, height: 900,
          transform: 'translate(-50%,-50%)',
          background: 'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 65%)',
          zIndex: 0,
          transition: 'left 0.05s, top 0.05s',
        }}
      />

      {/* App chrome — all above the background layers */}
      <div className="relative flex w-full h-full" style={{ zIndex: 1 }}>
        <Sidebar page={page} setPage={setPage} status={status} onUploadDone={refreshStatus}
          chatHistory={chatHistory} onLoadChat={loadChat} onDeleteChat={deleteChat} onNewChat={newChat} />

        <main
          className="flex-1 overflow-hidden flex flex-col min-w-0 relative"
          style={{
            transform: `perspective(1800px) rotateX(${mouse.y * -0.0003}deg) rotateY(${mouse.x * 0.0003}deg)`,
            transition: 'transform 0.05s linear',
            willChange: 'transform',
          }}
        >
          {/* Main content glass panel */}
          <div
            className="flex-1 overflow-hidden flex flex-col m-2 rounded-2xl"
            style={{
              background: 'rgba(255,255,255,0.015)',
              border: '1px solid rgba(255,255,255,0.055)',
              backdropFilter: 'blur(2px)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={page}
                variants={pageVariants}
                initial="initial"
                animate="enter"
                exit="exit"
                className="flex-1 overflow-hidden flex flex-col"
              >
                {page === 'chat'    && <ChatPage    status={status} onRefresh={refreshStatus}
                  messages={chatMessages} setMessages={setChatMessages} onSaveChat={saveChat} onNewChat={newChat}
                  chatTimestamp={activeChatId ? chatHistory.find(c => c.id === activeChatId)?.timestamp ?? null : null} />}
                {page === 'library' && <LibraryPage onRefresh={refreshStatus} />}
                {page === 'graph'   && <GraphPage   />}
                {page === 'insights' && <InsightsPage status={status} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"    element={<LandingPage />} />
        <Route path="/app" element={<MainApp />} />
        <Route path="*"    element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
