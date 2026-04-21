import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, useInView } from 'framer-motion'
import {
  ChevronDown, UploadCloud, Layers, Share2, MessageSquare,
  ArrowRight, ExternalLink, FileText, Network, Zap,
  Shield, BarChart2, Sparkles,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

/* ─────────────────────────────────────────────────────────────────────────────
   HOOKS
───────────────────────────────────────────────────────────────────────────── */

function useLerpedMouse(speed = 0.08) {
  const rawRef  = useRef({ x: 0, y: 0 })
  const lerpRef = useRef({ x: 0, y: 0 })
  const [lerped, setLerped] = useState({ x: 0, y: 0 })
  useEffect(() => {
    const h = (e: MouseEvent) => {
      rawRef.current = {
        x: (e.clientX / window.innerWidth)  * 2 - 1,
        y: (e.clientY / window.innerHeight) * 2 - 1,
      }
    }
    window.addEventListener('mousemove', h, { passive: true })
    return () => window.removeEventListener('mousemove', h)
  }, [])
  useEffect(() => {
    let raf: number
    const tick = () => {
      lerpRef.current.x += (rawRef.current.x - lerpRef.current.x) * speed
      lerpRef.current.y += (rawRef.current.y - lerpRef.current.y) * speed
      setLerped({ x: lerpRef.current.x, y: lerpRef.current.y })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [speed])
  return lerped
}

function useScrollY() {
  const [y, setY] = useState(0)
  useEffect(() => {
    const h = () => setY(window.scrollY)
    window.addEventListener('scroll', h, { passive: true })
    return () => window.removeEventListener('scroll', h)
  }, [])
  return y
}

/* ─────────────────────────────────────────────────────────────────────────────
   PARTICLE CANVAS
───────────────────────────────────────────────────────────────────────────── */

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef  = useRef({ x: -9999, y: -9999 })
  useEffect(() => {
    const mv = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY } }
    window.addEventListener('mousemove', mv, { passive: true })
    return () => window.removeEventListener('mousemove', mv)
  }, [])
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx    = canvas.getContext('2d')!
    let W = 0, H = 0, rafId: number
    const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)
    type Node = { x: number; y: number; vx: number; vy: number; r: number }
    const nodes: Node[] = Array.from({ length: 70 }, () => ({
      x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.5 + 1.5,
    }))
    type Spark = { i: number; j: number; t: number; speed: number }
    const sparks: Spark[] = []
    const sparkTick = setInterval(() => {
      if (sparks.length < 10) {
        const i = Math.floor(Math.random() * nodes.length)
        let j = Math.floor(Math.random() * nodes.length)
        while (j === i) j = Math.floor(Math.random() * nodes.length)
        sparks.push({ i, j, t: 0, speed: 0.004 + Math.random() * 0.005 })
      }
    }, 600)
    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      const { x: mx, y: my } = mouseRef.current
      for (const n of nodes) {
        const dx = mx - n.x, dy = my - n.y
        const d2 = dx*dx + dy*dy
        if (d2 < 120*120 && d2 > 0) { const inv = 0.035/Math.sqrt(d2); n.vx += dx*inv; n.vy += dy*inv }
        n.vx *= 0.97; n.vy *= 0.97
        const sp = Math.sqrt(n.vx*n.vx + n.vy*n.vy)
        if (sp > 0.6) { n.vx = n.vx/sp*0.6; n.vy = n.vy/sp*0.6 }
        n.x += n.vx; n.y += n.vy
        if (n.x < 0) { n.x = 0; n.vx = Math.abs(n.vx) }
        if (n.x > W) { n.x = W; n.vx = -Math.abs(n.vx) }
        if (n.y < 0) { n.y = 0; n.vy = Math.abs(n.vy) }
        if (n.y > H) { n.y = H; n.vy = -Math.abs(n.vy) }
      }
      for (let i = 0; i < nodes.length; i++) for (let j = i+1; j < nodes.length; j++) {
        const dx = nodes[i].x-nodes[j].x, dy = nodes[i].y-nodes[j].y
        const d = Math.sqrt(dx*dx+dy*dy)
        if (d < 150) {
          ctx.beginPath(); ctx.strokeStyle = `rgba(99,102,241,${(1-d/150)*0.18})`
          ctx.lineWidth = 0.7; ctx.moveTo(nodes[i].x,nodes[i].y); ctx.lineTo(nodes[j].x,nodes[j].y); ctx.stroke()
        }
      }
      for (let s = sparks.length-1; s >= 0; s--) {
        const sp = sparks[s]; sp.t += sp.speed
        if (sp.t >= 1) { sparks.splice(s,1); continue }
        const ni = nodes[sp.i], nj = nodes[sp.j]
        ctx.beginPath(); ctx.arc(ni.x+(nj.x-ni.x)*sp.t, ni.y+(nj.y-ni.y)*sp.t, 2.5, 0, Math.PI*2)
        ctx.fillStyle = `rgba(167,139,250,${(1-sp.t)*0.85})`; ctx.fill()
      }
      for (const n of nodes) {
        const dx = mx-n.x, dy = my-n.y
        const prox = Math.max(0, 1-Math.sqrt(dx*dx+dy*dy)/120)
        if (prox > 0.2) { ctx.beginPath(); ctx.arc(n.x,n.y,n.r*4,0,Math.PI*2); ctx.fillStyle=`rgba(99,102,241,${prox*0.12})`; ctx.fill() }
        ctx.beginPath(); ctx.arc(n.x,n.y,n.r+prox*2,0,Math.PI*2); ctx.fillStyle=`rgba(129,140,248,${0.5+prox*0.5})`; ctx.fill()
      }
      rafId = requestAnimationFrame(draw)
    }
    rafId = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(rafId); clearInterval(sparkTick); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }} />
}

/* ─────────────────────────────────────────────────────────────────────────────
   MORPHING ORBS (new)
───────────────────────────────────────────────────────────────────────────── */

function MorphingOrbs() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {/* Top-left violet orb — no filter:blur, use a large soft gradient instead */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 800, height: 800, top: '-20%', left: '-15%',
          background: 'radial-gradient(circle, rgba(124,58,237,0.09) 0%, rgba(124,58,237,0.03) 45%, transparent 70%)',
          willChange: 'transform',
        }}
        animate={{ x: [0, 40, -20, 0], y: [0, -30, 20, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Bottom-right indigo orb */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 900, height: 900, bottom: '-20%', right: '-15%',
          background: 'radial-gradient(circle, rgba(79,70,229,0.08) 0%, rgba(79,70,229,0.02) 45%, transparent 70%)',
          willChange: 'transform',
        }}
        animate={{ x: [0, -50, 30, 0], y: [0, 40, -20, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
      />
      {/* Center faint purple */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 500, height: 500, top: '35%', left: '38%',
          background: 'radial-gradient(circle, rgba(168,85,247,0.05) 0%, transparent 65%)',
          willChange: 'transform',
        }}
        animate={{ x: [0, 60, -40, 0], y: [0, -50, 30, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut', delay: 7 }}
      />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   GRID BACKGROUND
───────────────────────────────────────────────────────────────────────────── */

function GridBackground({ lerped }: { lerped: { x: number; y: number } }) {
  return (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{
        zIndex: 0,
        backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)`,
        backgroundSize: '32px 32px',
        backgroundPosition: `${-lerped.x * 12}px ${-lerped.y * 12}px`,
        transition: 'background-position 0.05s linear',
      }}
    />
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   TILT CARD — with glare (upgraded)
───────────────────────────────────────────────────────────────────────────── */

function TiltCard({
  children, className = '', maxDeg = 7, style,
}: { children: React.ReactNode; className?: string; maxDeg?: number; style?: React.CSSProperties }) {
  const ref   = useRef<HTMLDivElement>(null)
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50 })

  const onMove = useCallback((e: React.MouseEvent) => {
    const rect = ref.current!.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width
    const ny = (e.clientY - rect.top)  / rect.height
    setTilt({ rx: (0.5 - ny) * maxDeg * 2, ry: (nx - 0.5) * maxDeg * 2, gx: nx * 100, gy: ny * 100 })
  }, [maxDeg])

  const onLeave = useCallback(() => setTilt({ rx: 0, ry: 0, gx: 50, gy: 50 }), [])

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{
        transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
        transition: tilt.rx === 0 ? 'transform 0.6s cubic-bezier(.03,.98,.52,.99)' : 'transform 0.08s linear',
        willChange: 'transform',
        position: 'relative',
        ...style,
      }}
      className={className}
    >
      {/* Glare layer */}
      <div
        style={{
          position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none', zIndex: 2,
          background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.08) 0%, transparent 55%)`,
          transition: tilt.rx === 0 ? 'background 0.6s' : 'background 0.08s',
        }}
      />
      {children}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   SCROLL 3D REVEAL  (new)
───────────────────────────────────────────────────────────────────────────── */

function Reveal3D({
  children, delay = 0, direction = 'up',
}: { children: React.ReactNode; delay?: number; direction?: 'up' | 'left' | 'right' }) {
  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.15 })

  // Keep only opacity + translate — no rotateX/Y (too many compositing layers = scroll jank)
  const variants = {
    hidden: {
      opacity: 0,
      y: direction === 'up'   ? 32 : 0,
      x: direction === 'left' ? -28 : direction === 'right' ? 28 : 0,
    },
    visible: {
      opacity: 1, y: 0, x: 0,
      transition: { duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] },
    },
  }

  return (
    <div ref={ref}>
      <motion.div variants={variants} initial="hidden" animate={inView ? 'visible' : 'hidden'}>
        {children}
      </motion.div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   3D APP MOCKUP (new)  — floating browser preview in hero
───────────────────────────────────────────────────────────────────────────── */

function AppMockup3D({ lerped }: { lerped: { x: number; y: number } }) {
  const rotateX = -lerped.y * 6 - 8  // base tilt + mouse
  const rotateY =  lerped.x * 8

  return (
    <div
      className="relative w-full max-w-2xl mx-auto select-none"
      style={{ perspective: '1200px', perspectiveOrigin: '50% 40%' }}
    >
      <motion.div
        style={{
          transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
          transition: 'transform 0.06s linear',
          willChange: 'transform',
          transformStyle: 'preserve-3d',
        }}
        animate={{ y: [0, -10, 0] }}
        transition={{ y: { duration: 5, repeat: Infinity, ease: 'easeInOut' } }}
      >
        {/* Browser chrome */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 40px 120px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05), 0 0 80px rgba(99,102,241,0.15)',
          }}
        >
          {/* Title bar */}
          <div
            className="flex items-center gap-2 px-4 py-3"
            style={{ background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
          >
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/70" />
              <div className="w-3 h-3 rounded-full bg-amber-500/70" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/70" />
            </div>
            <div
              className="flex-1 mx-4 rounded-md px-3 py-1 text-xs text-center"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.25)', maxWidth: 240, margin: '0 auto' }}
            >
              localhost:5173/app
            </div>
          </div>

          {/* App interior */}
          <div className="flex" style={{ height: 340 }}>
            {/* Fake sidebar */}
            <div className="w-44 flex-shrink-0 flex flex-col" style={{ background: 'rgba(0,0,0,0.3)', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="flex items-center gap-2 px-3 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="w-5 h-5 rounded-md flex items-center justify-center text-xs"
                  style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>🔬</div>
                <span className="text-xs font-semibold text-white">PaperGraph AI</span>
              </div>
              {[
                { icon: '💬', label: 'Chat', active: true },
                { icon: '📚', label: 'Library', active: false },
                { icon: '🕸', label: 'Knowledge Graph', active: false },
                { icon: '⚖', label: 'Compare', active: false },
              ].map(item => (
                <div key={item.label}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs mx-1 mt-0.5 rounded-lg"
                  style={{
                    background: item.active ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color: item.active ? 'rgba(165,180,252,0.9)' : 'rgba(255,255,255,0.3)',
                    border: item.active ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                  }}
                >
                  <span style={{ fontSize: 11 }}>{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </div>
              ))}
            </div>

            {/* Fake chat */}
            <div className="flex-1 flex flex-col" style={{ background: 'rgba(6,6,8,0.8)' }}>
              {/* Chat header */}
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>AI</div>
                <span className="text-xs font-semibold text-white">Research Chat</span>
                <span className="text-[10px] ml-1" style={{ color: 'rgba(255,255,255,0.3)' }}>· 3 papers indexed</span>
              </div>
              {/* Messages */}
              <div className="flex-1 px-4 py-3 space-y-3 overflow-hidden">
                {/* User message */}
                <div className="flex justify-end">
                  <div className="text-[11px] px-3 py-1.5 rounded-xl rounded-tr-sm text-white max-w-[70%]"
                    style={{ background: 'rgba(79,70,229,0.7)', border: '1px solid rgba(99,102,241,0.3)' }}>
                    How does BERT relate to the Transformer?
                  </div>
                </div>
                {/* AI response */}
                <div className="flex gap-2">
                  <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-bold text-white mt-0.5"
                    style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>AI</div>
                  <div className="text-[11px] px-3 py-2 rounded-xl rounded-tl-sm max-w-[80%]"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)' }}>
                    BERT is directly based on the Transformer encoder architecture. While the original Transformer uses both encoder and decoder stacks…
                    <span className="inline-block w-1.5 h-3 ml-1 bg-indigo-400 animate-pulse align-middle rounded-sm" />
                  </div>
                </div>
                {/* Source chips */}
                <div className="flex gap-1.5 ml-7">
                  {['attention_is_all_you_need.pdf', 'bert_paper.pdf'].map(s => (
                    <span key={s} className="text-[9px] px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(99,102,241,0.1)', color: 'rgba(165,180,252,0.7)', border: '1px solid rgba(99,102,241,0.15)' }}>
                      📄 {s.replace('.pdf', '')}
                    </span>
                  ))}
                </div>
              </div>
              {/* Input */}
              <div className="px-4 pb-3">
                <div className="rounded-xl px-3 py-2 flex items-center gap-2"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <span className="text-[11px] flex-1" style={{ color: 'rgba(255,255,255,0.25)' }}>Ask about your papers…</span>
                  <div className="w-5 h-5 rounded-lg flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
                    <ArrowRight size={9} className="text-white" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Reflection — gradient only, no filter:blur */}
        <div
          className="absolute left-8 right-8 -bottom-4 rounded-2xl"
          style={{
            height: 30,
            background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.2) 0%, transparent 70%)',
            transform: 'scaleY(0.5)',
          }}
        />
      </motion.div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   SPOTLIGHT CARD (new) — mouse-tracking spotlight for feature cards
───────────────────────────────────────────────────────────────────────────── */

function SpotlightCard({
  children, className = '',
}: { children: React.ReactNode; className?: string }) {
  const ref  = useRef<HTMLDivElement>(null)
  const [spot, setSpot] = useState({ x: 0, y: 0, opacity: 0 })

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current!.getBoundingClientRect()
    setSpot({ x: e.clientX - rect.left, y: e.clientY - rect.top, opacity: 1 })
  }
  const onLeave = () => setSpot(s => ({ ...s, opacity: 0 }))

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={`relative ${className}`}
    >
      {/* Spotlight — absolutely positioned, pointer-events:none, sits above content */}
      <div
        style={{
          position: 'fixed',
          pointerEvents: 'none',
          zIndex: 50,
          width: 320,
          height: 320,
          borderRadius: '50%',
          left: spot.x - 160,
          top:  spot.y - 160,
          background: 'radial-gradient(circle, rgba(99,102,241,0.13) 0%, transparent 65%)',
          opacity: spot.opacity,
          transition: 'opacity 0.25s',
        }}
      />
      {children}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   NAVBAR
───────────────────────────────────────────────────────────────────────────── */

function Navbar({ scrollY, onOpenApp }: { scrollY: number; onOpenApp: () => void }) {
  const scrolled = scrollY > 50
  return (
    <motion.nav
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-10 h-14 transition-all duration-300 ${
        scrolled ? 'backdrop-blur-md bg-zinc-950/80 border-b border-zinc-800/40' : 'bg-transparent'
      }`}
    >
      <div className="flex items-center gap-2.5 select-none">
        <span className="text-lg">🔬</span>
        <span className="font-semibold text-sm text-white tracking-tight">PaperGraph AI</span>
      </div>
      <div className="flex items-center gap-3">
        <a href="https://github.com" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition-colors">
          GitHub <ExternalLink size={12} className="opacity-60" />
        </a>
        <motion.button
          onClick={onOpenApp}
          whileHover={{ scale: 1.04, boxShadow: '0 0 20px rgba(99,102,241,0.4)' }}
          whileTap={{ scale: 0.96 }}
          className="flex items-center gap-1.5 text-sm font-medium text-white px-4 py-1.5 rounded-lg transition-colors"
          style={{ background: 'linear-gradient(135deg,#4f46e5,#6d28d9)' }}
        >
          Open App <ArrowRight size={14} />
        </motion.button>
      </div>
    </motion.nav>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   HERO — with 3D mockup
───────────────────────────────────────────────────────────────────────────── */

const WORDS_L1 = ['Chat', 'with', 'any']
const WORDS_L2 = ['document,', 'instantly.']
const WORDS_L3 = ['Understand', 'how', 'ideas', 'connect.']

function Hero({ lerped, scrollY, onOpenApp }: {
  lerped: { x: number; y: number }; scrollY: number; onOpenApp: () => void
}) {
  const glowX = ((lerped.x + 1) / 2) * 100
  const glowY = ((lerped.y + 1) / 2) * 100
  const headlineX = -lerped.x * 8
  const headlineY = -lerped.y * 8
  const chevronOpacity = Math.max(0, 1 - scrollY / 200)

  const wordVariants = {
    hidden: { opacity: 0, y: 22, filter: 'blur(4px)' },
    show:   { opacity: 1, y: 0,  filter: 'blur(0px)' },
  }
  const containerVariants = {
    hidden: {},
    show:   { transition: { staggerChildren: 0.08, delayChildren: 0.3 } },
  }

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-14" style={{ zIndex: 1 }}>
      {/* Radial glow follows mouse */}
      <div className="pointer-events-none fixed" style={{
        left: `${glowX}%`, top: `${glowY}%`, width: 700, height: 700,
        transform: 'translate(-50%,-50%)',
        background: 'radial-gradient(circle,rgba(99,102,241,0.13) 0%,transparent 70%)',
        zIndex: 0, transition: 'left 0.05s,top 0.05s',
      }} />

      {/* Text — top half */}
      <div className="relative text-center mb-12" style={{ zIndex: 1 }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full border border-indigo-500/40 bg-indigo-500/8 text-indigo-300 mb-8"
        >
          <Zap size={11} className="text-indigo-400" />
          PDF · DOCX · TXT · Images · and more
        </motion.div>

        <div style={{ transform: `translate(${headlineX}px,${headlineY}px)`, transition: 'transform 0.05s linear' }}>
          <motion.h1
            variants={containerVariants} initial="hidden" animate="show"
            className="text-5xl md:text-[64px] font-bold leading-[1.1] tracking-tight text-white max-w-3xl mx-auto"
          >
            <span className="inline-block">
              {WORDS_L1.map((w, i) => (
                <motion.span key={i} variants={wordVariants} className="inline-block mr-[0.28em]"
                  transition={{ duration: 0.45, ease: [0.25,0.46,0.45,0.94] }}>{w}</motion.span>
              ))}
              {WORDS_L2.map((w, i) => (
                <motion.span key={i} variants={wordVariants} className="inline-block mr-[0.28em]"
                  transition={{ duration: 0.45, ease: [0.25,0.46,0.45,0.94] }}>
                  <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">{w}</span>
                </motion.span>
              ))}
            </span>
            <br />
            <span className="inline-block mt-1">
              {WORDS_L3.map((w, i) => (
                <motion.span key={i} variants={wordVariants} className="inline-block mr-[0.28em]"
                  transition={{ duration: 0.45, ease: [0.25,0.46,0.45,0.94] }}>{w}</motion.span>
              ))}
            </span>
          </motion.h1>
        </div>

        <motion.p
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 0.55 }}
          className="mt-7 text-lg text-zinc-400 max-w-[540px] mx-auto leading-relaxed"
        >
          Upload any documents — PDFs, reports, books, notes, contracts.
          PaperGraph AI builds a knowledge graph across all of them and lets
          you ask questions that span your entire collection at once.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.4, duration: 0.5 }}
          className="mt-9 flex flex-wrap items-center justify-center gap-3"
        >
          <motion.button
            onClick={onOpenApp} whileHover={{ scale: 1.03, boxShadow: '0 0 30px rgba(99,102,241,0.5)' }} whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 px-6 py-3 text-white font-semibold rounded-xl text-sm"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow: '0 8px 24px rgba(79,70,229,0.3)' }}
          >
            <ArrowRight size={16} /> Open App
          </motion.button>
          <motion.a
            href="https://github.com" target="_blank" whileHover={{ scale: 1.02 }}
            className="flex items-center gap-2 px-6 py-3 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white font-medium rounded-xl transition-all text-sm"
          >
            View on GitHub <ExternalLink size={14} className="opacity-60" />
          </motion.a>
        </motion.div>
      </div>

      {/* 3D App Mockup */}
      <motion.div
        initial={{ opacity: 0, y: 40, rotateX: 10 }}
        animate={{ opacity: 1, y: 0,  rotateX: 0 }}
        transition={{ delay: 1.7, duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="w-full max-w-3xl"
        style={{ zIndex: 1 }}
      >
        <AppMockup3D lerped={lerped} />
      </motion.div>

      {/* Chevron */}
      <motion.div
        animate={{ y: [0, -6, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-zinc-600"
        style={{ opacity: chevronOpacity }}
      >
        <ChevronDown size={22} />
      </motion.div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   PROBLEM CARDS
───────────────────────────────────────────────────────────────────────────── */

const PROBLEMS = [
  { icon: '📚', title: 'Reading 20 docs is hard.', body: 'You forget what Doc 3 said when you\'re on Doc 17. Key details get lost. Cross-document connections never form.', label: 'The Problem' },
  { icon: '🤖', title: '"Upload PDF to ChatGPT"', body: 'Works for one file at a time. No cross-document memory. No concept mapping. You lose the forest for the trees.', label: 'The Old Way' },
  { icon: '🕸', title: 'Your entire collection. At once.', body: 'Vector search + knowledge graph across all your docs. Ask anything that spans your whole library — instantly.', label: 'The PaperGraph Way', highlight: true },
]

function ProblemSection() {
  return (
    <section className="relative z-10 max-w-5xl mx-auto px-6 py-28">
      <Reveal3D>
        <p className="text-center text-xs font-semibold tracking-widest uppercase text-zinc-500 mb-4">Why this exists</p>
        <h2 className="text-center text-3xl font-bold text-white mb-14">Managing a document library is harder than it should be</h2>
      </Reveal3D>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {PROBLEMS.map((c, i) => (
          <Reveal3D key={i} delay={i * 0.1} direction={i === 0 ? 'left' : i === 2 ? 'right' : 'up'}>
            <TiltCard
              className={`h-full p-6 rounded-2xl border transition-colors ${
                c.highlight
                  ? 'bg-indigo-950/40 border-indigo-700/60 hover:border-indigo-400'
                  : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'
              }`}
            >
              <span className="text-xs font-semibold tracking-widest uppercase text-zinc-500 block mb-4">{c.label}</span>
              <div className="text-3xl mb-4" style={c.highlight ? { filter: 'drop-shadow(0 0 14px rgba(99,102,241,0.7))' } : {}}>{c.icon}</div>
              <h3 className={`font-semibold text-base mb-2 ${c.highlight ? 'text-white' : 'text-zinc-100'}`}>{c.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{c.body}</p>
            </TiltCard>
          </Reveal3D>
        ))}
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   PIPELINE
───────────────────────────────────────────────────────────────────────────── */

const STEPS = [
  { icon: UploadCloud, num: '01', title: 'Upload',  desc: 'Drop PDFs, Word docs, or images. Unstructured.io detects layout — titles, tables, figures — not just raw text.' },
  { icon: Layers,      num: '02', title: 'Embed',   desc: 'Every chunk is embedded with OpenAI and stored in ChromaDB. Semantic search finds related ideas even without keyword overlap.' },
  { icon: Share2,      num: '03', title: 'Graph',   desc: 'GPT-4o-mini extracts concept relationships: BERT → BASED_ON → Transformer. Stored as a directed knowledge graph.' },
  { icon: MessageSquare, num: '04', title: 'Ask',   desc: 'Four LangGraph agents: question rewriting, vector retrieval, graph lookup, GPT-4o synthesis. Answer streams in real time.' },
]

function PipelineSection() {
  return (
    <section className="relative z-10 max-w-5xl mx-auto px-6 pb-28">
      <Reveal3D>
        <p className="text-center text-xs font-semibold tracking-widest uppercase text-zinc-500 mb-4">Under the hood</p>
        <h2 className="text-center text-3xl font-bold text-white mb-16">How it works</h2>
      </Reveal3D>

      {/* Desktop */}
      <div className="hidden md:grid grid-cols-4 gap-0 relative">
        <div className="absolute top-8 left-[12.5%] right-[12.5%] h-px bg-zinc-800 overflow-hidden">
          <motion.div
            className="h-full w-1/3"
            style={{ background: 'linear-gradient(90deg,transparent,#818cf8,#a78bfa,transparent)' }}
            animate={{ x: ['-100%', '400%'] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
          />
        </div>
        {STEPS.map((s, i) => (
          <Reveal3D key={i} delay={i * 0.12}>
            <TiltCard className="flex flex-col items-center text-center px-4" maxDeg={4}>
              <div className="w-16 h-16 rounded-2xl border border-zinc-800 flex items-center justify-center mb-5 relative z-10"
                style={{ background: 'rgba(255,255,255,0.03)', boxShadow: '0 0 20px rgba(99,102,241,0.08)' }}
              >
                <s.icon size={22} className="text-indigo-400" />
              </div>
              <span className="text-[10px] font-bold tracking-widest uppercase text-indigo-500 mb-1">{s.num}</span>
              <h3 className="font-semibold text-white mb-2">{s.title}</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">{s.desc}</p>
            </TiltCard>
          </Reveal3D>
        ))}
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-5">
        {STEPS.map((s, i) => (
          <Reveal3D key={i} delay={i * 0.1} direction="left">
            <div className="flex items-start gap-4 rounded-xl p-4 border border-zinc-800"
              style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="w-10 h-10 rounded-xl border border-zinc-800 flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(99,102,241,0.08)' }}>
                <s.icon size={18} className="text-indigo-400" />
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-widest uppercase text-indigo-500">{s.num}</span>
                <h3 className="font-semibold text-white text-sm mt-0.5 mb-1">{s.title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          </Reveal3D>
        ))}
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   UNSTRUCTURED CALLOUT
───────────────────────────────────────────────────────────────────────────── */

function UnstructuredSection() {
  return (
    <section className="relative z-10 max-w-5xl mx-auto px-6 pb-28">
      <Reveal3D>
        <div
          className="rounded-2xl border border-zinc-800 overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.02)',
            borderLeft: '3px solid #4f46e5',
            boxShadow: '-4px 0 30px rgba(79,70,229,0.1)',
          }}
        >
          <div className="p-8 md:p-10">
            <div className="flex items-center gap-2.5 mb-8">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center"
                style={{ boxShadow: '0 0 14px rgba(99,102,241,0.4)' }}>
                <Zap size={14} className="text-white" />
              </div>
              <h2 className="text-xl font-bold text-white">Why Unstructured.io matters</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-10 mb-10">
              <div>
                <h3 className="text-sm font-semibold text-zinc-300 mb-3">The problem with most PDF tools</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Most libraries extract raw text — one giant blob. All structure is lost.
                  A table becomes a wall of numbers. A section title becomes orphaned text. Your chunks are noisy.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-300 mb-3">What Unstructured.io does instead</h3>
                <p className="text-sm text-zinc-400 leading-relaxed mb-4">Uses a layout detection model to identify every element:</p>
                <div className="space-y-1.5">
                  {[['Title','Section header — high weight in retrieval'],['NarrativeText','Body paragraph — main content'],['Table','Structured data with preserved headers'],['FigureCaption','Image context — often missed by others'],['ListItem','Bullet / numbered list items']].map(([type,desc]) => (
                    <div key={type} className="flex items-baseline gap-2 text-xs">
                      <span className="font-mono text-indigo-400 flex-shrink-0">{type}</span>
                      <span className="text-zinc-600">→</span>
                      <span className="text-zinc-500">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase text-zinc-600 mb-4">Before / After — same PDF page</p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-red-500/70 mb-3">PyPDF — raw text</p>
                  <pre className="text-[11px] text-zinc-600 font-mono leading-relaxed whitespace-pre-wrap">{`attention mechanism compute
attention scores query key value
matrices softmax normalizes Table
1 BLEU 41.0 41.8 we propose new
architecture based solely on
attention dispensing recurrence`}</pre>
                </div>
                <div className="rounded-xl bg-zinc-950 border border-indigo-900/40 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-indigo-400/70 mb-3">Unstructured.io — structured</p>
                  <div className="space-y-2 text-[11px] font-mono">
                    <div><span className="text-indigo-400">Title</span><span className="text-zinc-600">: </span><span className="text-zinc-400">"Attention Is All You Need"</span></div>
                    <div><span className="text-violet-400">NarrativeText</span><span className="text-zinc-600">: </span><span className="text-zinc-400">"The attention mechanism computes…"</span></div>
                    <div><span className="text-amber-400">Table</span><span className="text-zinc-600">: </span><span className="text-zinc-400">Model | BLEU → Transformer | 41.0</span></div>
                    <div><span className="text-violet-400">NarrativeText</span><span className="text-zinc-600">: </span><span className="text-zinc-400">"We propose a new architecture…"</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal3D>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   FEATURES — spotlight cards
───────────────────────────────────────────────────────────────────────────── */

const FEATURES = [
  { icon: FileText,    title: 'PDF Viewer + Chat',  desc: 'Preview any paper while chatting. Every answer shows exactly which paper it came from.' },
  { icon: Network,     title: 'Knowledge Graph',    desc: 'Visual force-directed graph of concept relationships across your entire library.' },
  { icon: Sparkles,    title: '4 AI Agents',        desc: 'LangGraph chain: question rewriting → vector retrieval → graph lookup → GPT-4o synthesis.' },
  { icon: Zap,         title: 'Streaming Answers',  desc: 'Responses appear word-by-word as GPT generates them. No waiting for the full answer.' },
  { icon: BarChart2,   title: 'RAG vs GraphRAG',    desc: 'Side-by-side comparison of vector-only vs graph-augmented retrieval on any question.' },
  { icon: Shield,      title: 'Strict Guardrails',  desc: 'Answers grounded in your papers only. Explicitly refuses out-of-scope questions.' },
]

function FeaturesSection() {
  return (
    <section className="relative z-10 max-w-5xl mx-auto px-6 pb-28">
      <Reveal3D>
        <p className="text-center text-xs font-semibold tracking-widest uppercase text-zinc-500 mb-4">Everything you need</p>
        <h2 className="text-center text-3xl font-bold text-white mb-14">Built for any document collection</h2>
      </Reveal3D>

      {/* Spotlight grid wrapper */}
      <SpotlightCard className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 rounded-3xl p-1">
        {FEATURES.map((f, i) => (
          <Reveal3D key={i} delay={i * 0.07}>
            <TiltCard
              className="h-full p-6 rounded-2xl border border-zinc-800 hover:border-indigo-700/50 transition-colors group"
              style={{ background: 'rgba(255,255,255,0.02)' } as any}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center mb-4 transition-colors group-hover:bg-indigo-600/20"
                style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}
              >
                <f.icon size={17} className="text-indigo-400" />
              </div>
              <h3 className="font-semibold text-white text-sm mb-2">{f.title}</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">{f.desc}</p>
            </TiltCard>
          </Reveal3D>
        ))}
      </SpotlightCard>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   TECH STACK
───────────────────────────────────────────────────────────────────────────── */

const STACK = ['OpenAI', 'LangChain', 'LangGraph', 'ChromaDB', 'Unstructured.io', 'FastAPI', 'React', 'Tailwind CSS']

function TechSection() {
  return (
    <section className="relative z-10 max-w-4xl mx-auto px-6 pb-28 text-center">
      <Reveal3D>
        <p className="text-xs font-semibold tracking-widest uppercase text-zinc-600 mb-6">Built with</p>
        <div className="flex flex-wrap justify-center gap-2">
          {STACK.map((t, i) => (
            <motion.span
              key={t}
              initial={{ opacity: 0, scale: 0.85 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ borderColor: '#4f46e5', color: '#818cf8', scale: 1.06, y: -2 }}
              className="px-4 py-1.5 rounded-full text-sm text-zinc-400 border border-zinc-700 cursor-default transition-colors"
              style={{ background: 'rgba(255,255,255,0.02)' }}
            >
              {t}
            </motion.span>
          ))}
        </div>
      </Reveal3D>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   FINAL CTA
───────────────────────────────────────────────────────────────────────────── */

function CtaSection({ onOpenApp }: { onOpenApp: () => void }) {
  return (
    <section className="relative z-10 max-w-3xl mx-auto px-6 pb-32 text-center">
      <div className="w-px h-16 bg-gradient-to-b from-transparent to-indigo-500/30 mx-auto mb-16" />
      <Reveal3D>
        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
          Your entire document library.<br />
          <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
            One conversation.
          </span>
        </h2>
        <p className="text-zinc-500 text-sm mb-8">Works with PDF · DOCX · TXT · Markdown · PNG · JPG · and more</p>
        <motion.button
          onClick={onOpenApp}
          whileHover={{ scale: 1.04, boxShadow: '0 0 50px rgba(99,102,241,0.5)' }}
          whileTap={{ scale: 0.97 }}
          animate={{
            boxShadow: ['0 0 0px rgba(99,102,241,0)', '0 0 30px rgba(99,102,241,0.35)', '0 0 0px rgba(99,102,241,0)'],
          }}
          transition={{
            delay: 0.18,
            boxShadow: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' },
          }}
          className="inline-flex items-center gap-2 px-8 py-4 text-white font-semibold rounded-2xl text-base"
          style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
        >
          <ArrowRight size={18} /> Open App
        </motion.button>
      </Reveal3D>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   FOOTER
───────────────────────────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="relative z-10 py-6 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <p className="text-xs text-zinc-600">
        PaperGraph AI &nbsp;·&nbsp; Built with LangChain + Unstructured.io &nbsp;·&nbsp;
        <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors">GitHub</a>
        &nbsp;·&nbsp; MIT License
      </p>
    </footer>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   ROOT
───────────────────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const navigate = useNavigate()
  const scrollY  = useScrollY()
  const lerped   = useLerpedMouse(0.07)
  const openApp  = useCallback(() => navigate('/app'), [navigate])

  return (
    <div className="min-h-screen bg-[#09090b] text-white overflow-x-hidden">
      <ParticleCanvas />
      <MorphingOrbs />
      <GridBackground lerped={lerped} />

      <Navbar scrollY={scrollY} onOpenApp={openApp} />

      <Hero     lerped={lerped} scrollY={scrollY} onOpenApp={openApp} />
      <ProblemSection />
      <PipelineSection />
      <UnstructuredSection />
      <FeaturesSection />
      <TechSection />
      <CtaSection onOpenApp={openApp} />
      <Footer />
    </div>
  )
}
