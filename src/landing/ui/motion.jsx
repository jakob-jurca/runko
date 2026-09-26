import { useEffect, useRef, useState } from 'react'

/**
 * Motion toolkit for the landing page. No animation library: state changes
 * come from IntersectionObserver, the movement itself is CSS (landing.css).
 * No scroll listeners anywhere.
 */

/** True when the visitor asked for less motion. Read once; fine for a page load. */
export function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Tells you once when an element has scrolled into view.
 * Returns [ref, seen]. With reduced motion or no IntersectionObserver,
 * `seen` is true straight away so nothing waits for an animation.
 */
export function useSeen({ amount = 0.25, rootMargin = '0px 0px -8% 0px' } = {}) {
  const ref = useRef(null)
  const [seen, setSeen] = useState(() => prefersReducedMotion() || typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const el = ref.current
    if (seen || !el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold: amount, rootMargin }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [seen, amount, rootMargin])

  return [ref, seen]
}

/**
 * Wrapper that flips data-seen once it is on screen. CSS in landing.css
 * (data-seen='false' rules, motion-allowed only) draws bars, fills gauges and
 * ticks in days; without the rule, or without motion, everything is simply
 * in its final state.
 */
export function Play({ as: Tag = 'div', amount, className = '', children, ...rest }) {
  const [ref, seen] = useSeen({ amount })
  return (
    <Tag ref={ref} data-seen={seen ? 'true' : 'false'} className={className} {...rest}>
      {children}
    </Tag>
  )
}

const format = (n, decimals) => n.toFixed(decimals).replace('.', ',')

/**
 * Counts up to `value` when scrolled into view. Writes straight to the text
 * node on each frame, so React never re-renders during the count.
 */
export function CountUp({ value, decimals = 0, duration = 1400, className }) {
  const [ref, seen] = useSeen({ amount: 0.6 })
  const textRef = useRef(null)
  const reduce = useRef(prefersReducedMotion())
  const final = format(value, decimals)

  useEffect(() => {
    if (!seen || reduce.current || !textRef.current) return
    const node = textRef.current
    let raf
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 4) // ease-out quart
      node.textContent = format(value * eased, decimals)
      if (t < 1) raf = requestAnimationFrame(tick)
      else node.textContent = final
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [seen, value, decimals, duration, final])

  return (
    <span ref={ref} className={className}>
      <span ref={textRef}>{reduce.current ? final : format(0, decimals)}</span>
    </span>
  )
}
