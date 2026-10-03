import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Icon } from '@iconify/react'
import PerfectScrollbar from 'react-perfect-scrollbar'
import { pmsNavFor } from 'src/pms/config/pmsNav'
import { PMS_BASE } from 'src/pms/config/pmsModules'
import { isClient, useMe } from 'src/pms/access/useAccess'
import { isSignedIn, loginPath } from 'src/pms/auth/session'
import { inter } from './font'
import PmsHeader from './PmsHeader'

// STANDALONE ONLY - a sidebar + header + content frame that copies the look and behaviour of the
// Lingsaa_Accounts layout (section headings, accordion groups, gradient on the open group, thin
// perfect-scrollbar, slide-in menu below 1024px) so PMS screens can be run and tested on their own.
// Not copied at merge time: the root app's own layout, sidebar and permission filtering replace it.

const GRADIENT = 'linear-gradient(to right, var(--theme-grad-start), var(--theme-grad-end))'

const normalise = path => (path || '').split('?')[0].replace(/\/+$/, '') || '/'
const isActivePath = (current, path) => Boolean(path) && (current === path || current.startsWith(`${path}/`))
const hasActiveChild = (item, current) =>
  Boolean(item.children?.some(child => isActivePath(current, child.path)) || item.hiddenPaths?.some(path => isActivePath(current, path)))

const SectionTitle = ({ title }) => <div className='px-5 pb-1 pt-5 text-[13px] font-medium text-gray-500'>{title}</div>

const rowBase = 'mx-3 mt-1 flex w-[calc(100%-1.5rem)] items-center gap-3 rounded-md px-3 py-2 text-left transition-colors'

const TopLink = ({ item, active }) => (
  <Link
    href={item.path}
    className={`${rowBase} ${active ? 'text-white' : 'pms-nav-row hover:bg-gray-100'}`}
    style={active ? { background: GRADIENT } : undefined}
  >
    <Icon icon={item.icon} width={18} className='shrink-0' />
    <span title={item.title} className='flex-1 truncate text-[15px] font-semibold'>{item.title}</span>
  </Link>
)

const NavGroup = ({ item, open, onToggle, current }) => (
  <div>
    <button
      type='button'
      onClick={onToggle}
      aria-expanded={open}
      className={`${rowBase} cursor-pointer ${open ? 'text-white' : 'pms-nav-row hover:bg-gray-100'}`}
      style={open ? { background: GRADIENT } : undefined}
    >
      <Icon icon={item.icon} width={18} className='shrink-0' />
      <span title={item.title} className='flex-1 truncate text-[15px] font-semibold'>{item.title}</span>
      <Icon icon={open ? 'tabler:chevron-down' : 'tabler:chevron-right'} width={18} className='shrink-0' />
    </button>

    <div className={`grid transition-all duration-200 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
      <div className='overflow-hidden'>
        {item.children.map(child => {
          const active = isActivePath(current, child.path)

          return (
            <Link
              key={child.path}
              href={child.path}
              tabIndex={open ? 0 : -1}
              className={`ml-6 mr-3 mt-1 flex items-center gap-3 rounded-md px-3 py-2 text-[14px] hover:bg-gray-100 ${
                active ? 'font-semibold text-[var(--theme-solid)]' : 'pms-nav-child font-medium'
              }`}
            >
              <Icon icon='tabler:circle' width={8} className='ml-1 shrink-0' />
              <span className='truncate'>{child.title}</span>
            </Link>
          )
        })}
      </div>
    </div>
  </div>
)

const PmsAppShell = ({ children }) => {
  const router = useRouter()
  const { asPath } = router
  const current = normalise(asPath)
  // Every PMS page needs a signed-in person; anyone else goes to the login page (and comes back after).
  const [allowed, setAllowed] = useState(false)
  useEffect(() => {
    if (isSignedIn()) setAllowed(true)
    else router.replace(loginPath(asPath))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const { me, failed } = useMe()
  // The sidebar follows the login's PMS role. It stays empty while the role loads (no flash of screens the person
  // cannot use); if the role cannot be read, every screen is listed and the server still refuses what is not allowed.
  const navRoutes = React.useMemo(() => (me ? pmsNavFor(me.permissions) : failed ? pmsNavFor(null) : []), [me, failed])
  const portalPath = `${PMS_BASE}/portal`

  // A Client login only has the client portal.
  useEffect(() => {
    if (isClient(me) && !isActivePath(current, portalPath)) router.replace(`${portalPath}/`)
  }, [me, current]) // eslint-disable-line react-hooks/exhaustive-deps
  const [openGroup, setOpenGroup] = useState(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Drawers, menus and dialogs render outside this component, so the font goes on <body>.
  useEffect(() => {
    document.body.classList.add(inter.className)
  }, [])

  // Accordion, like the root app: opening one section closes the others, and the section
  // that contains the current page opens by itself. Navigating closes the mobile menu.
  useEffect(() => {
    const active = navRoutes.find(item => item.children && hasActiveChild(item, current))
    if (active) setOpenGroup(active.title)
    setMobileOpen(false)
  }, [current, navRoutes])

  // Escape closes the mobile menu.
  useEffect(() => {
    if (!mobileOpen) return undefined
    const onKey = e => e.key === 'Escape' && setMobileOpen(false)
    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  // Nothing is shown until the sign-in check has run (a signed-out visitor is on the way to the login page).
  if (!allowed) return null

  return (
    <div className={`${inter.className} pms-layout flex min-h-screen bg-gray-50 text-gray-900`}>
      {mobileOpen && <div className='fixed inset-0 z-40 bg-black/40 lg:hidden' onClick={() => setMobileOpen(false)} aria-hidden='true' />}

      <aside
        className={`layout-vertical-nav pms-sidebar fixed inset-y-0 left-0 z-50 flex w-[260px] shrink-0 flex-col border-r border-gray-200 bg-white transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'
        }`}
      >
        <div className='flex h-16 shrink-0 items-center gap-2 px-4'>
          <div className='flex h-8 w-8 items-center justify-center rounded-lg text-white' style={{ background: GRADIENT }}>
            <Icon icon='tabler:briefcase' width={18} />
          </div>
          <span className='flex-1 text-[17px] font-bold text-[var(--theme-solid)]'>LINGSAA PMS</span>
          <button type='button' className='pms-nav-row cursor-pointer rounded-md p-1 hover:bg-gray-100 lg:hidden' onClick={() => setMobileOpen(false)} aria-label='Close menu'>
            <Icon icon='tabler:x' width={20} />
          </button>
        </div>

        <PerfectScrollbar className='flex-1 pb-6' options={{ wheelPropagation: false, suppressScrollX: true }}>
          <nav>
            {navRoutes.map(item => {
              if (item.sectionTitle) return <SectionTitle key={`section-${item.sectionTitle}`} title={item.sectionTitle} />
              if (!item.children) return <TopLink key={item.title} item={item} active={isActivePath(current, item.path) || Boolean(item.hiddenPaths?.some(path => isActivePath(current, path)))} />

              return (
                <NavGroup
                  key={item.title}
                  item={item}
                  current={current}
                  open={openGroup === item.title}
                  onToggle={() => setOpenGroup(prev => (prev === item.title ? null : item.title))}
                />
              )
            })}
          </nav>
        </PerfectScrollbar>
      </aside>

      <div className='flex min-w-0 flex-1 flex-col'>
        <PmsHeader onMenuClick={() => setMobileOpen(true)} />
        <main className='min-w-0 flex-1 p-3 sm:p-4 lg:p-6'>{children}</main>
      </div>
    </div>
  )
}

export default PmsAppShell
