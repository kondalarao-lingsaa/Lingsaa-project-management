import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Icon } from '@iconify/react'
import { pmsNavRoutes } from 'src/pms/config/pmsNav'

// STANDALONE ONLY - a minimal sidebar + content frame so PMS screens can be run and tested
// without the Lingsaa_Accounts layout. Not copied at merge time (the root app's layout,
// sidebar and permission filtering replace it).
const NavItem = ({ item, pathname, depth = 0 }) => {
  const active = item.path && pathname.replace(/\/$/, '') === item.path
  const base = 'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors'

  if (item.children) {
    return (
      <div className='mt-1'>
        <div className={`${base} font-semibold text-gray-700`}>
          {item.icon && <Icon icon={item.icon} width={18} />}
          {item.title}
        </div>
        <div className='ml-4 border-l border-gray-200 pl-2'>
          {item.children.map(child => (
            <NavItem key={child.path} item={child} pathname={pathname} depth={depth + 1} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <Link
      href={item.path}
      className={`${base} ${active ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
    >
      {item.icon && <Icon icon={item.icon} width={18} />}
      {item.title}
    </Link>
  )
}

const PmsAppShell = ({ children }) => {
  const { pathname, asPath } = useRouter()

  return (
    <div className='flex min-h-screen bg-gray-50'>
      <aside className='w-64 shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-3'>
        <div className='mb-3 px-3 text-lg font-bold text-gray-900'>LINGSAA PMS</div>
        {pmsNavRoutes.map(item => (
          <NavItem key={item.title} item={item} pathname={asPath.split('?')[0]} />
        ))}
      </aside>
      <main className='flex-1 p-6'>{children}</main>
    </div>
  )
}

export default PmsAppShell
