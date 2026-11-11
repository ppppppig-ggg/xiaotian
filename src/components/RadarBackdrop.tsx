import { useEffect, useRef } from 'react'

interface Props {
  /** 0–1，进入工作台后可以压低背景存在感 */
  intensity?: number
}

interface Signal {
  angle: number
  radius: number
  speed: number
  size: number
  depth: number
  phase: number
  warm: boolean
}

/**
 * 夜航雷达背景。
 * 画布上的扫描圆心会缓慢跟随鼠标，光点、连线和扫描扇面持续低速运动。
 * 降低动态偏好时只绘制一帧静态图，不启动动画循环。
 */
export function RadarBackdrop({ intensity = 1 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const intensityRef = useRef(intensity)

  useEffect(() => {
    intensityRef.current = intensity
  }, [intensity])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reduced = motionQuery.matches
    let width = 0
    let height = 0
    let raf = 0
    let last = 0
    let time = 0
    let sweep = -0.7
    let glowFrame = 0
    let centerX = 0
    let centerY = 0
    let ready = false

    const pointer = { x: 0.74, y: 0.34 }
    const reticle = { x: window.innerWidth * 0.74, y: window.innerHeight * 0.34 }

    const signals: Signal[] = Array.from({ length: 72 }, (_, index) => ({
      angle: (index / 72) * Math.PI * 2 + Math.random() * 0.7,
      radius: 0.1 + Math.random() * 0.86,
      speed: (Math.random() - 0.5) * 0.00006,
      size: 0.8 + Math.random() * 1.6,
      depth: 0.35 + Math.random() * 0.65,
      phase: Math.random() * Math.PI * 2,
      warm: Math.random() > 0.66,
    }))

    const anchor = () => ({
      x: width < 860 ? 0.5 : 0.74,
      y: width < 860 ? 0.3 : 0.34,
    })

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const a = anchor()
      if (!ready) {
        centerX = a.x * width
        centerY = a.y * height
        ready = true
      }
    }

    const draw = () => {
      const k = Math.max(0, Math.min(1.4, intensityRef.current))
      const a = anchor()
      const targetX = a.x * width + (pointer.x - a.x) * width * 0.16
      const targetY = a.y * height + (pointer.y - a.y) * height * 0.14

      centerX += (targetX - centerX) * 0.045
      centerY += (targetY - centerY) * 0.045
      reticle.x += (pointer.x * width - reticle.x) * 0.16
      reticle.y += (pointer.y * height - reticle.y) * 0.16

      const radius = Math.min(width, height) * (width < 860 ? 0.58 : 0.47)

      ctx.clearRect(0, 0, width, height)

      // 圆心周围的低亮度空气感
      const halo = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.3)
      halo.addColorStop(0, `rgba(201, 168, 106, ${0.085 * k})`)
      halo.addColorStop(0.38, `rgba(126, 158, 146, ${0.04 * k})`)
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = halo
      ctx.fillRect(centerX - radius * 1.4, centerY - radius * 1.4, radius * 2.8, radius * 2.8)

      // 同心圆
      for (let ring = 1; ring <= 4; ring += 1) {
        ctx.beginPath()
        ctx.arc(centerX, centerY, radius * (ring / 4), 0, Math.PI * 2)
        ctx.lineWidth = 1
        ctx.strokeStyle = `rgba(237, 232, 220, ${(ring === 4 ? 0.11 : 0.058) * k})`
        if (ring === 2) ctx.setLineDash([2, 8])
        ctx.stroke()
        ctx.setLineDash([])
      }

      // 最外圈虚线刻度
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius * 1.13, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(237, 232, 220, ${0.04 * k})`
      ctx.setLineDash([1, 9])
      ctx.stroke()
      ctx.setLineDash([])

      // 缓慢扩散的扫描脉冲
      const pulse = (time % 5600) / 5600
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius * (0.14 + pulse * 0.86), 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(226, 199, 145, ${(1 - pulse) * 0.11 * k})`
      ctx.stroke()

      // 方位刻度
      ctx.strokeStyle = `rgba(237, 232, 220, ${0.028 * k})`
      ctx.lineWidth = 1
      for (let spoke = 0; spoke < 12; spoke += 1) {
        const angle = (spoke / 12) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(centerX + Math.cos(angle) * radius * 0.14, centerY + Math.sin(angle) * radius * 0.14)
        ctx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius)
        ctx.stroke()
      }

      // 扫描扇面
      const sweepGradient = ctx.createConicGradient(sweep, centerX, centerY)
      sweepGradient.addColorStop(0, `rgba(201, 168, 106, ${0.06 * k})`)
      sweepGradient.addColorStop(0.05, `rgba(201, 168, 106, ${0.015 * k})`)
      sweepGradient.addColorStop(0.13, 'rgba(201, 168, 106, 0)')
      sweepGradient.addColorStop(1, 'rgba(201, 168, 106, 0)')
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.fillStyle = sweepGradient
      ctx.fill()

      // 扫描前沿
      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.lineTo(centerX + Math.cos(sweep) * radius, centerY + Math.sin(sweep) * radius)
      ctx.strokeStyle = `rgba(226, 199, 145, ${0.18 * k})`
      ctx.stroke()

      // 信号点
      const plotted = signals.map((signal) => {
        const angle = signal.angle + time * signal.speed
        const distance = signal.radius * radius * (1 + Math.sin(time * 0.00024 + signal.phase) * 0.018)
        return {
          signal,
          x: centerX + Math.cos(angle) * distance,
          y: centerY + Math.sin(angle) * distance,
        }
      })

      // 近邻连线
      for (let i = 0; i < plotted.length; i += 1) {
        for (let j = i + 1; j < plotted.length; j += 1) {
          const dx = plotted[i].x - plotted[j].x
          const dy = plotted[i].y - plotted[j].y
          const distance = Math.sqrt(dx * dx + dy * dy)
          if (distance < 72) {
            ctx.beginPath()
            ctx.moveTo(plotted[i].x, plotted[i].y)
            ctx.lineTo(plotted[j].x, plotted[j].y)
            ctx.strokeStyle = `rgba(201, 168, 106, ${0.07 * (1 - distance / 72) * k})`
            ctx.stroke()
          }
        }
      }

      for (const point of plotted) {
        const pulse = 0.75 + Math.sin(time * 0.0011 + point.signal.phase) * 0.25
        const alpha = (0.24 + point.signal.depth * 0.6) * pulse * k
        ctx.beginPath()
        ctx.arc(point.x, point.y, point.signal.size, 0, Math.PI * 2)
        ctx.fillStyle = point.signal.warm
          ? `rgba(226, 199, 145, ${alpha})`
          : `rgba(237, 232, 220, ${alpha * 0.62})`
        ctx.fill()

        if (point.signal.warm && point.signal.depth > 0.82) {
          ctx.beginPath()
          ctx.arc(point.x, point.y, point.signal.size * 4.5, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(226, 199, 145, ${alpha * 0.18})`
          ctx.stroke()
        }
      }

      // 鼠标处的锁定位
      ctx.save()
      ctx.translate(reticle.x, reticle.y)
      ctx.lineWidth = 1
      ctx.strokeStyle = `rgba(226, 199, 145, ${0.24 * k})`
      for (let corner = 0; corner < 4; corner += 1) {
        const start = corner * (Math.PI / 2) + 0.16
        ctx.beginPath()
        ctx.arc(0, 0, 17, start, start + 0.48)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(0, 0, 1.8, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(226, 199, 145, ${0.42 * k})`
      ctx.fill()
      ctx.restore()
    }

    const loop = (now: number) => {
      const delta = Math.min(64, now - last || 16)
      last = now
      time += delta
      sweep += delta * 0.00028
      draw()
      raf = window.requestAnimationFrame(loop)
    }

    const start = () => {
      if (raf || reduced) return
      last = performance.now()
      raf = window.requestAnimationFrame(loop)
    }

    const stop = () => {
      if (raf) window.cancelAnimationFrame(raf)
      raf = 0
    }

    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX / Math.max(1, window.innerWidth)
      pointer.y = event.clientY / Math.max(1, window.innerHeight)
      if (glowFrame) return
      glowFrame = window.requestAnimationFrame(() => {
        glowFrame = 0
        const root = document.documentElement
        root.style.setProperty('--mx', `${event.clientX}px`)
        root.style.setProperty('--my', `${event.clientY}px`)
      })
      if (reduced) draw()
    }

    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }

    const onMotionChange = () => {
      reduced = motionQuery.matches
      stop()
      if (reduced) draw()
      else start()
    }

    resize()
    draw()
    if (!reduced) start()

    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    motionQuery.addEventListener('change', onMotionChange)

    return () => {
      stop()
      if (glowFrame) window.cancelAnimationFrame(glowFrame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('visibilitychange', onVisibility)
      motionQuery.removeEventListener('change', onMotionChange)
    }
  }, [])

  return <canvas ref={canvasRef} className="radar-backdrop" aria-hidden="true" />
}