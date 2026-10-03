import { Plus, Settings as SettingsIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { useComposer } from '@/features/transactions/ComposerProvider'
import { useNetWorth } from '@/store/selectors'
import { useIsTimeTraveling } from '@/store/time'
import { Button, Money } from '@/ui'
import { BrandMark } from './BrandMark'
import { NAV, type NavItemDef } from './nav'
import { TimeScrubber } from './TimeScrubber'

function NetWorthSummary() {
  const net = useNetWorth(undefined, false)
  const includingAssets = useNetWorth()
  return (
    <div className="px-2">
      <div className="text-[11px] uppercase tracking-[0.1em] text-faint">Net worth · regular boxes</div>
      <Money
        report
        amount={net}
        animate
        compact={false}
        className="mt-2 block font-serif text-[1.6rem] leading-tight text-ink"
      />
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-2 text-xs text-muted">
        <span>Including assets</span>
        <Money amount={includingAssets} compact className="text-ink" />
      </div>
    </div>
  )
}

function SidebarNavItem({ item }: { item: NavItemDef }) {
  return (
    <NavLink to={item.to} end={item.end}>
      {({ isActive }) => (
        <span
          className={cn(
            'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200',
            isActive ? 'text-ink' : 'text-faint hover:text-muted',
          )}
        >
          {isActive && (
            <motion.span
              layoutId="nav-pill"
              className="absolute inset-0 -z-10 rounded-xl border border-line-2 bg-raised shadow-soft"
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            />
          )}
          <item.icon className="size-[18px]" />
          {item.label}
        </span>
      )}
    </NavLink>
  )
}

function DesktopSidebar() {
  const composer = useComposer()
  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-line bg-surface/40 px-3 py-4 md:flex">
      <Link to="/" className="mb-5 flex items-center gap-2.5 px-2">
        <BrandMark />
        <div className="leading-none">
          <div className="font-serif text-lg text-ink">Money</div>
          <div className="mt-0.5 text-xs text-faint">a cozy home</div>
        </div>
      </Link>

      <NetWorthSummary />

      <nav className="mt-5 flex flex-1 flex-col gap-1">
        {NAV.map((item) => (
          <SidebarNavItem key={item.to} item={item} />
        ))}
      </nav>

      <Button onClick={() => composer.open()} className="mt-4 w-full">
        <Plus className="size-4" />
        Add entry
      </Button>
    </aside>
  )
}

function MobileHeader() {
  const net = useNetWorth(undefined, false)
  const includingAssets = useNetWorth()
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-canvas/80 px-5 py-3 backdrop-blur-md md:hidden">
      <Link to="/" className="flex items-center gap-2">
        <BrandMark className="size-8" />
        <span className="font-serif text-lg text-ink">Money</span>
      </Link>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-[10px] uppercase leading-none tracking-[0.1em] text-faint">
            Net worth · regular boxes
          </div>
          <Money report amount={net} className="font-serif text-base text-ink" />
          <div className="text-[10px] text-muted">
            Including assets <Money amount={includingAssets} compact />
          </div>
        </div>
        <Link
          to="/settings"
          aria-label="Settings"
          className="grid size-9 shrink-0 place-items-center rounded-xl text-faint transition-colors hover:text-ink"
        >
          <SettingsIcon className="size-5" />
        </Link>
      </div>
    </header>
  )
}

function TabLink({ item }: { item: NavItemDef }) {
  return (
    <NavLink to={item.to} end={item.end} className="flex flex-1 flex-col items-center gap-1 py-1">
      {({ isActive }) => (
        <>
          <item.icon className={cn('size-5 transition-colors', isActive ? 'text-clay' : 'text-faint')} />
          <span className={cn('text-[10px] transition-colors', isActive ? 'text-ink' : 'text-faint')}>
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  )
}

function MobileTabBar() {
  const composer = useComposer()
  // Overview · Boxes · [Add] · Planning · Goals  (Settings lives in the header gear)
  const byTo = (to: string) => NAV.find((n) => n.to === to)!
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-line bg-canvas/90 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur-lg md:hidden">
      <TabLink item={byTo('/')} />
      <TabLink item={byTo('/boxes')} />
      <button
        onClick={() => composer.open()}
        aria-label="Add entry"
        className="-mt-7 grid size-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-clay to-honey text-canvas shadow-lift ring-4 ring-canvas transition-transform active:scale-95"
      >
        <Plus className="size-6" />
      </button>
      <TabLink item={byTo('/planning')} />
      <TabLink item={byTo('/goals')} />
    </nav>
  )
}

/** A whisper-thin glow pinned to the top of the viewport while time-travelling. */
function TimeTravelHalo() {
  const traveling = useIsTimeTraveling()
  return (
    <motion.div
      aria-hidden
      initial={false}
      animate={{ opacity: traveling ? 1 : 0 }}
      transition={{ duration: 0.4 }}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-px bg-gradient-to-r from-transparent via-clay to-transparent"
    />
  )
}

export function AppShell() {
  return (
    <div className="flex min-h-screen">
      <TimeTravelHalo />
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30">
          <MobileHeader />
          <TimeScrubber />
        </div>
        <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-28 pt-6 md:px-10 md:pb-16 md:pt-10">
          <Outlet />
        </main>
      </div>
      <MobileTabBar />
    </div>
  )
}
