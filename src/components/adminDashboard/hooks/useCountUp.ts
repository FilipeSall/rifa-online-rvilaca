import { useEffect, useState } from 'react'

export function useCountUp(targetValue: number, durationMs = 1600) {
  const [animatedValue, setAnimatedValue] = useState(0)

  useEffect(() => {
    const start = performance.now()
    let frameId = 0

    const tick = (now: number) => {
      const elapsed = now - start
      const linearProgress = Math.min(elapsed / durationMs, 1)
      const easedProgress = 1 - (1 - linearProgress) ** 3
      setAnimatedValue(targetValue * easedProgress)

      if (linearProgress < 1) {
        frameId = window.requestAnimationFrame(tick)
      }
    }

    frameId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [durationMs, targetValue])

  return animatedValue
}
