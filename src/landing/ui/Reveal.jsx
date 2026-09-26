import { useEffect, useRef, useState } from 'react'

/**
 * Fades its children up the first time they scroll into view.
 *
 * IntersectionObserver only, never a scroll listener. The visual state lives
 * in landing.css under prefers-reduced-motion: no-preference, so with reduced
 * motion the content is simply there. Phase 2 can swap this for Motion's
 * whileInView without touching the sections: they only use <Reveal>.
 */
export default function Reveal({ as: Tag = 'div', delay = 0, className = '', style, children, ...rest }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShown(true)
      return
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      data-reveal={shown ? 'in' : 'out'}
      className={className}
      style={{ '--reveal-delay': `${delay}ms`, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  )
}
