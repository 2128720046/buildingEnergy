import { useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'

type FrameLimiterProps = {
  fps?: number
}

const FrameLimiter: React.FC<FrameLimiterProps> = ({ fps = 50 }) => {
  const advance = useThree((state) => state.advance)
  const frameloop = useThree((state) => state.frameloop)
  const set = useThree((state) => state.set)

  useLayoutEffect(() => {
    let elapsed = 0
    let previous = 0
    let frameTime = 0
    let raf: number | null = null
    const interval = 1000 / fps

    function tick(timestamp: DOMHighResTimeStamp) {
      raf = requestAnimationFrame(tick)
      elapsed = timestamp - previous

      if (elapsed > interval) {
        advance(frameTime)
        frameTime += elapsed / 1000 - (elapsed % interval) / 1000
        previous = timestamp - (elapsed % interval)
      }
    }

    set({ frameloop: 'never' })
    raf = requestAnimationFrame(tick)

    return () => {
      if (raf !== null) {
        cancelAnimationFrame(raf)
      }
      set({ frameloop })
    }
  }, [advance, fps, frameloop, set])

  return null
}

export default FrameLimiter
