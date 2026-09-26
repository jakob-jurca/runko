import { NavLink } from 'react-router-dom'
import { House, ChatCircleText, PlusCircle, GearSix } from '@phosphor-icons/react'
import { t } from '../core/strings'

const items = [
  { to: '/', label: t.nav.home, Icon: House },
  { to: '/chat', label: t.nav.coach, Icon: ChatCircleText },
  { to: '/log', label: t.nav.log, Icon: PlusCircle },
  { to: '/settings', label: t.nav.settings, Icon: GearSix },
]

function Item({ to, label, Icon }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `group relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-medium transition duration-200
         md:flex-none md:flex-row md:justify-start md:gap-3 md:px-3.5 md:py-2.5 md:text-sm ${
           isActive ? 'text-primary md:bg-primary-faint' : 'text-zinc-500 hover:text-zinc-200 md:hover:bg-surface-raised'
         }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={24} weight={isActive ? 'fill' : 'regular'} className="transition-transform duration-200 group-active:scale-90" />
          {label}
        </>
      )}
    </NavLink>
  )
}

/** Bottom tab bar on mobile, fixed sidebar on desktop. */
export default function NavBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-1 border-t border-surface-line
        bg-canvas/85 px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur-xl
        md:inset-y-0 md:left-0 md:right-auto md:w-60 md:flex-col md:gap-1 md:border-r md:border-t-0 md:p-4"
    >
      <div className="hidden items-center gap-2.5 px-2 pb-8 pt-2 md:flex">
        <img src="/runko.svg" alt="Runko" className="h-9 w-9" />
        <span className="text-xl font-bold tracking-tight">
          Run<span className="text-primary">ko</span>
        </span>
      </div>
      {items.map((item) => (
        <Item key={item.to} {...item} />
      ))}
    </nav>
  )
}
