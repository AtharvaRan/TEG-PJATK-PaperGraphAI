import { useEffect, useRef, useState } from 'react'

/** Smooth lerped mouse position in px relative to viewport center */
export function useMouseParallax(strength = 1) {
  const raw  = useRef({ x: 0, y: 0 })
  const lerp = useRef({ x: 0, y: 0 })
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      raw.current.x = e.clientX - window.innerWidth  / 2
      raw.current.y = e.clientY - window.innerHeight / 2
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    let raf: number
    const tick = () => {
      lerp.current.x += (raw.current.x - lerp.current.x) * 0.06
      lerp.current.y += (raw.current.y - lerp.current.y) * 0.06
      setPos({ x: lerp.current.x * strength, y: lerp.current.y * strength })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [strength])

  return pos
}

/** Per-element 3D tilt — returns style object for the element */
export function useTilt3D(maxDeg = 8) {
  const ref   = useRef<HTMLElement>(null)
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onMove = (e: MouseEvent) => {
      const r  = el.getBoundingClientRect()
      const nx = (e.clientX - r.left) / r.width   // 0-1
      const ny = (e.clientY - r.top)  / r.height  // 0-1
      setTilt({
        rx:  (0.5 - ny) * maxDeg * 2,
        ry:  (nx - 0.5) * maxDeg * 2,
        gx:  nx * 100,
        gy:  ny * 100,
      })
    }
    const onLeave = () => setTilt({ rx: 0, ry: 0, gx: 50, gy: 50 })
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
    }
  }, [maxDeg])

  const style: React.CSSProperties = {
    transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateZ(0)`,
    transition: tilt.rx === 0 ? 'transform 0.6s cubic-bezier(.03,.98,.52,.99)' : 'transform 0.08s linear',
    willChange: 'transform',
  }
  const glareStyle: React.CSSProperties = {
    background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.07) 0%, transparent 60%)`,
    position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none', zIndex: 1,
  }

  return { ref, style, glareStyle }
}
