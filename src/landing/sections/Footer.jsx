import { FacebookLogo, InstagramLogo, TiktokLogo } from '@phosphor-icons/react'
import { footer, nav } from '../content'
import Logo from '../ui/Logo'

const SOCIAL_ICON = { instagram: InstagramLogo, tiktok: TiktokLogo, facebook: FacebookLogo }

export default function Footer() {
  return (
    <footer className="mx-auto w-full max-w-page px-4 pb-10 sm:px-6 lg:px-10">
      <div className="flex flex-col gap-10 border-t border-white/[0.07] pt-12 md:flex-row md:items-start md:justify-between">
        <div>
          <Logo />
          <p className="mt-3 text-sm text-zinc-500">{footer.tagline}</p>
        </div>

        <nav aria-label={footer.navLabel} className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm sm:grid-cols-[auto_auto]">
          <ul className="space-y-3">
            {nav.links.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="rounded text-zinc-400 transition hover:text-zinc-100">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <ul className="space-y-3">
            {footer.links.map((l) => (
              <li key={l.label}>
                <a href={l.href} className="rounded text-zinc-400 transition hover:text-zinc-100">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <ul className="flex gap-2">
          {footer.social.map((s) => {
            const Icon = SOCIAL_ICON[s.key]
            return (
              <li key={s.key}>
                <a
                  href={s.href}
                  aria-label={s.label}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.04] text-zinc-400 ring-1 ring-inset ring-white/10 transition hover:text-zinc-100"
                >
                  <Icon size={20} />
                </a>
              </li>
            )
          })}
        </ul>
      </div>
      <p className="mt-12 text-xs text-zinc-600">{footer.copyright}</p>
    </footer>
  )
}
