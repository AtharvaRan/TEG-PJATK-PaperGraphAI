import { useEffect, useRef } from 'react'

/** Ambient particle graph — identical to LandingPage's ParticleCanvas but dimmer */
export default function AppBackground() {
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

    const resize = () => {
      W = canvas.width  = window.innerWidth
      H = canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    type Node = { x: number; y: number; vx: number; vy: number; r: number }
    const nodes: Node[] = Array.from({ length: 50 }, () => ({
      x:  Math.random() * window.innerWidth,
      y:  Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      r:  Math.random() * 1.2 + 1,
    }))

    type Spark = { i: number; j: number; t: number; speed: number }
    const sparks: Spark[] = []
    const sparkTick = setInterval(() => {
      if (sparks.length < 6) {
        const i = Math.floor(Math.random() * nodes.length)
        let   j = Math.floor(Math.random() * nodes.length)
        while (j === i) j = Math.floor(Math.random() * nodes.length)
        sparks.push({ i, j, t: 0, speed: 0.003 + Math.random() * 0.004 })
      }
    }, 900)

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      const { x: mx, y: my } = mouseRef.current

      for (const n of nodes) {
        const dx = mx - n.x, dy = my - n.y
        const d2 = dx*dx + dy*dy
        if (d2 < 100*100 && d2 > 0) {
          const inv = 0.018 / Math.sqrt(d2)
          n.vx += dx*inv; n.vy += dy*inv
        }
        n.vx *= 0.97; n.vy *= 0.97
        const sp = Math.sqrt(n.vx*n.vx + n.vy*n.vy)
        if (sp > 0.4) { n.vx = n.vx/sp*0.4; n.vy = n.vy/sp*0.4 }
        n.x += n.vx; n.y += n.vy
        if (n.x < 0) { n.x = 0; n.vx = Math.abs(n.vx) }
        if (n.x > W) { n.x = W; n.vx = -Math.abs(n.vx) }
        if (n.y < 0) { n.y = 0; n.vy = Math.abs(n.vy) }
        if (n.y > H) { n.y = H; n.vy = -Math.abs(n.vy) }
      }

      // edges
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i+1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y
          const d  = Math.sqrt(dx*dx + dy*dy)
          if (d < 140) {
            ctx.beginPath()
            ctx.strokeStyle = `rgba(99,102,241,${(1 - d/140) * 0.07})`
            ctx.lineWidth = 0.5
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.stroke()
          }
        }
      }

      // sparks
      for (let s = sparks.length-1; s >= 0; s--) {
        const sp = sparks[s]; sp.t += sp.speed
        if (sp.t >= 1) { sparks.splice(s, 1); continue }
        const ni = nodes[sp.i], nj = nodes[sp.j]
        ctx.beginPath()
        ctx.arc(ni.x + (nj.x-ni.x)*sp.t, ni.y + (nj.y-ni.y)*sp.t, 1.8, 0, Math.PI*2)
        ctx.fillStyle = `rgba(167,139,250,${(1-sp.t)*0.5})`
        ctx.fill()
      }

      // nodes
      for (const n of nodes) {
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI*2)
        ctx.fillStyle = 'rgba(129,140,248,0.25)'
        ctx.fill()
      }

      rafId = requestAnimationFrame(draw)
    }
    rafId = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafId)
      clearInterval(sparkTick)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0,
        pointerEvents: 'none', zIndex: 0,
        opacity: 0.5,
      }}
    />
  )
}
