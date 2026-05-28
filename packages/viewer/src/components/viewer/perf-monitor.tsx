import { useScene } from '@pascal-app/core'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef, useState, useEffect } from 'react'
import { readGpuStats, setPerfOverlayEnabled } from '../../lib/gpu-perf'

const SAMPLE_INTERVAL = 0.5 // seconds between display updates

export const PerfMonitor = () => {
  const [stats, setStats] = useState({
    fps: 0,
    frameMs: 0,
    drawCalls: 0,
    triangles: 0,
    dirty: 0,
    meshes: 0,
    gpuMs: 0,
    gpuMsMax: 0,
  })
  const frameCount = useRef(0)
  const elapsed = useRef(0)
  const lastMs = useRef(0)

  // Enable GPU perf overlay when monitor is mounted, clean up on unmount
  useEffect(() => {
    setPerfOverlayEnabled(true)
    return () => setPerfOverlayEnabled(false)
  }, [])

  useFrame(({ gl, clock }) => {
    frameCount.current++
    const now = clock.elapsedTime
    const dt = now - elapsed.current

    if (dt >= SAMPLE_INTERVAL) {
      const fps = Math.round(frameCount.current / dt)
      const frameMs = lastMs.current
      const info = gl.info
      const drawCalls = info.render?.calls ?? 0
      const triangles = info.render?.triangles ?? 0
      const meshes = info.memory?.geometries ?? 0
      const dirty = useScene.getState().dirtyNodes.size
      const gpuStats = readGpuStats()

      setStats({
        fps,
        frameMs,
        drawCalls,
        triangles,
        dirty,
        meshes,
        gpuMs: Math.round(gpuStats.avg * 10) / 10,
        gpuMsMax: Math.round(gpuStats.max * 10) / 10,
      })
      frameCount.current = 0
      elapsed.current = now
    }

    lastMs.current = Math.round(clock.getDelta() * 1000 * 10) / 10
  })

  return (
    <Html
      position={[0, 0, 0]}
      style={{ position: 'fixed', top: 8, left: 8, pointerEvents: 'none' }}
      zIndexRange={[100, 100]}
    >
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 11,
          lineHeight: 1.5,
          color: stats.fps < 30 ? '#f87171' : stats.fps < 55 ? '#fbbf24' : '#4ade80',
          background: 'rgba(0,0,0,0.7)',
          borderRadius: 6,
          padding: '6px 10px',
          whiteSpace: 'pre',
        }}
      >
        {`FPS  ${stats.fps}
DRAW ${stats.drawCalls}
TRI  ${(stats.triangles / 1000).toFixed(1)}k
GPU  ${stats.gpuMs}ms (max ${stats.gpuMsMax}ms)
MESH ${stats.meshes}
DIRTY ${stats.dirty}`}
      </div>
    </Html>
  )
}
