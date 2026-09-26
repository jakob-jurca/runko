import { useEffect, useRef, useState } from 'react'
import { nav } from '../content'
import Logo from '../ui/Logo'
import { LoginButton, SignupButton } from '../ui/Buttons'

/**
 * Floating glass pill, detached from the top edge. Below lg the links move
 * into a full-screen menu; the hamburger's two lines rotate into an X.
 */
export default function Nav() {
  const [open, setOpen] = useState(false)
  const toggleRef = useRef(null)

  // Lock page scroll behind the menu; Escape closes it and returns focus.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // A desktop-width resize with the menu open would leave the page locked.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = (e) => e.matches && setOpen(false)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return (
    <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-4 sm:pt-4">
      <nav
        aria-label={nav.ariaLabel}
        className="relative z-50 mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 rounded-full bg-canvas/70 pl-5 pr-2
          shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_40px_-10px_rgba(0,0,0,0.6)] ring-1 ring-inset ring-white/10 backdrop-blur-xl"
      >
        <a href="#top" aria-label={nav.homeLabel} className="rounded-full" onClick={() => setOpen(false)}>
          <Logo />
        </a>

        <ul className="hidden items-center gap-1 lg:flex">
          {nav.links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="rounded-full px-4 py-2 text-sm font-medium text-zinc-400 transition duration-300 ease-out hover:bg-white/[0.06] hover:text-zinc-100"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <LoginButton className="hidden !min-h-[44px] !px-5 text-sm lg:inline-flex" />
          <SignupButton className="hidden !min-h-[48px] text-sm sm:inline-flex" />
          <button
            ref={toggleRef}
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="l-mobile-menu"
            aria-label={open ? nav.closeMenu : nav.openMenu}
            className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-inset ring-white/10 lg:hidden"
          >
            <span
              className={`absolute h-[1.5px] w-5 rounded-full bg-zinc-100 transition duration-500 ease-out ${
                open ? 'rotate-45' : '-translate-y-[4px]'
              }`}
            />
            <span
              className={`absolute h-[1.5px] w-5 rounded-full bg-zinc-100 transition duration-500 ease-out ${
                open ? '-rotate-45' : 'translate-y-[4px]'
              }`}
            />
          </button>
        </div>
      </nav>

      {/* Mobile menu: full-screen glass overlay, links slide up in sequence. */}
      <div
        id="l-mobile-menu"
        data-menu={open ? 'open' : 'closed'}
        hidden={!open}
        className="fixed inset-0 z-40 bg-canvas/90 px-6 pb-10 pt-28 backdrop-blur-2xl lg:hidden"
      >
        <ul className="space-y-1">
          {nav.links.map((l, i) => (
            <li key={l.href} data-menu-item style={{ '--i': i }}>
              <a
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-2xl py-3 text-4xl font-semibold tracking-tight text-zinc-100"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-10 flex flex-col gap-3" data-menu-item style={{ '--i': nav.links.length }}>
          <SignupButton className="justify-between" />
          <LoginButton />
        </div>
      </div>
    </header>
  )
}
