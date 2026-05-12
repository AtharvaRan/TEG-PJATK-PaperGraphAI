import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

interface CosmicParallaxBgProps {
  head?: string
  text?: string
  loop?: boolean
  children?: React.ReactNode
  className?: string
}

export function CosmicParallaxBg({
  head,
  text,
  loop = true,
  children,
  className = '',
}: CosmicParallaxBgProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef  = useRef({ x: 0, y: 0 })
  const lerpRef   = useRef({ x: 0, y: 0 })
  const [lerped, setLerped] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const h = (e: MouseEvent) => {
      mouseRef.current = {
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
      lerpRef.current.x += (mouseRef.current.x - lerpRef.current.x) * 0.06
      lerpRef.current.y += (mouseRef.current.y - lerpRef.current.y) * 0.06
      setLerped({ x: lerpRef.current.x, y: lerpRef.current.y })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Star canvas — three depth layers with parallax
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx    = canvas.getContext('2d')!
    let W = 0, H = 0, rafId: number

    const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    type Star = { ox: number; oy: number; r: number; opacity: number; depth: number }
    const stars: Star[] = Array.from({ length: 220 }, () => {
      const d = Math.random()
      return { ox: Math.random(), oy: Math.random(), r: d * 1.1 + 0.3, opacity: 0.25 + d * 0.6, depth: d }
    })

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      const mx = lerpRef.current.x
      const my = lerpRef.current.y
      for (const s of stars) {
        const px = s.depth * 22
        const sx = (s.ox * W + mx * px + W) % W
        const sy = (s.oy * H + my * px + H) % H
        ctx.beginPath()
        ctx.arc(sx, sy, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(200,215,255,${s.opacity})`
        ctx.fill()
      }
      rafId = requestAnimationFrame(draw)
    }
    rafId = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(rafId); window.removeEventListener('resize', resize) }
  }, [])

  const px = -lerped.x * 20
  const py = -lerped.y * 10

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #0d2322 0%, #071514 35%, #050d0d 70%, #04090a 100%)' }}
    >
      {/* Star canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }} />

      {/* Planet body */}
      <div
        className="absolute pointer-events-none"
        style={{
          zIndex: 2,
          width: '220vw', height: '220vw',
          borderRadius: '50%',
          bottom: 'calc(-110vw + 44vh)',
          left: '50%',
          transform: `translateX(-50%) translate(${px}px, ${py}px)`,
          background: 'radial-gradient(ellipse at 50% 6%, #0e1844 0%, #080d28 30%, #040917 58%, transparent 82%)',
        }}
      />

      {/* Atmosphere glow ring */}
      <div
        className="absolute pointer-events-none"
        style={{
          zIndex: 2,
          width: '224vw', height: '224vw',
          borderRadius: '50%',
          bottom: 'calc(-112vw + 44vh)',
          left: '50%',
          transform: `translateX(-50%) translate(${px}px, ${py}px)`,
          border: '1px solid rgba(20,184,166,0.18)',
          boxShadow: [
            '0 0 12px rgba(190,205,255,0.75)',
            '0 0 40px rgba(20,184,166,0.55)',
            '0 0 90px rgba(13,148,136,0.35)',
            '0 0 200px rgba(6,182,212,0.2)',
          ].join(', '),
        }}
      />

      {/* Optional head/text */}
      {(head || text) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ zIndex: 10 }}>
          {head && (
            <motion.h1
              initial={{ opacity: 0, y: 24, filter: 'blur(10px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="font-bold tracking-[0.18em] uppercase select-none"
              style={{
                fontSize: 'clamp(2.8rem, 9vw, 7.5rem)',
                background: 'linear-gradient(180deg, #ffffff 0%, #c7d2fe 45%, #2dd4bf 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 0 28px rgba(20,184,166,0.45))',
              }}
            >
              {head}
            </motion.h1>
          )}
          {text && (
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.5 }}
              className="text-sm font-semibold tracking-[0.42em] uppercase text-indigo-300/65 mt-3"
            >
              {text}
            </motion.p>
          )}
        </div>
      )}

      {children && (
        <div className="relative w-full h-full" style={{ zIndex: 10 }}>
          {children}
        </div>
      )}
    </div>
  )
}
