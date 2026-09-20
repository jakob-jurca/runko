import { NavLink } from 'react-router-dom'
import { t } from '../core/strings'

const items = [
  {
    to: '/',
    label: t.nav.home,
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 12l9-8 9 8M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10"
      />
    ),
  },
  {
    to: '/chat',
    label: t.nav.coach,
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 10h8m-8 4h5m7-2a9 9 0 11-4-7.5L21 3l-1.2 3.6A8.96 8.96 0 0121 12z"
      />
    ),
  },
  {
    to: '/log',
    label: t.nav.log,
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />,
  },
  {
    to: '/settings',
    label: t.nav.settings,
    icon: (
      <>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10.3 4.3a1.7 1.7 0 013.4 0l.1.6a1.7 1.7 0 002.5 1.1l.5-.3a1.7 1.7 0 012.4 2.4l-.3.5a1.7 1.7 0 001 2.5l.6.1a1.7 1.7 0 010 3.4l-.6.1a1.7 1.7 0 00-1 2.5l.3.5a1.7 1.7 0 01-2.4 2.4l-.5-.3a1.7 1.7 0 00-2.5 1l-.1.6a1.7 1.7 0 01-3.4 0l-.1-.6a1.7 1.7 0 00-2.5-1l-.5.3a1.7 1.7 0 01-2.4-2.4l.3-.5a1.7 1.7 0 00-1-2.5l-.6-.1a1.7 1.7 0 010-3.4l.6-.1a1.7 1.7 0 001-2.5l-.3-.5a1.7 1.7 0 012.4-2.4l.5.3a1.7 1.7 0 002.5-1.1z"
        />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
]

function Item({ to, label, icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium transition
         md:flex-row md:gap-3 md:px-4 md:py-3 md:text-sm ${
           isActive ? 'text-primary md:bg-primary-faint' : 'text-zinc-500 hover:text-zinc-200'
         }`
      }
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
        {icon}
      </svg>
      {label}
    </NavLink>
  )
}

/** Bottom tab bar on mobile, fixed sidebar on desktop. */
export default function NavBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t
        border-zinc-800 bg-zinc-950/90 px-2 py-1.5 backdrop-blur
        md:inset-y-0 md:left-0 md:right-auto md:w-60 md:flex-col md:items-stretch
        md:justify-start md:gap-1 md:border-r md:border-t-0 md:p-4"
    >
      <div className="hidden items-center gap-2 px-2 pb-8 pt-2 md:flex">
        <img src="/runko.svg" alt="" className="h-9 w-9" />
        <span className="text-xl font-extrabold tracking-tight">
          Run<span className="text-primary">ko</span>
        </span>
      </div>
      {items.map((item) => (
        <Item key={item.to} {...item} />
      ))}
    </nav>
  )
}
