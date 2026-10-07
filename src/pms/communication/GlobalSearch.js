import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { Dialog } from '@mui/material'
import { Icon } from '@iconify/react'
import { PMS_BASE, PMS_SCREENS, screenAllowed } from 'src/pms/config/pmsModules'
import { isClient, useMe } from 'src/pms/access/useAccess'
import { useGlobalSearchQuery } from 'src/store/apps/pms/communicationApi'

// Ctrl+K (or the header search box): jump to any screen by name, or find any record across the PMS.
// Self-contained like the bell, so the root app's header can use it too.

const GROUP_ICON = {
  Screens: 'tabler:layout-grid',
  Projects: 'tabler:briefcase',
  Tasks: 'tabler:checklist',
  Milestones: 'tabler:flag',
  Documents: 'tabler:file-text',
  'Risks & Issues': 'tabler:alert-triangle',
  Expenses: 'tabler:receipt',
  Invoices: 'tabler:file-invoice',
  People: 'tabler:user'
}

const useDebounced = (value, ms = 250) => {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)

    return () => clearTimeout(t)
  }, [value, ms])

  return v
}

const GlobalSearch = () => {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef(null)
  const term = useDebounced(q.trim())
  const { me } = useMe()
  const client = isClient(me)
  const { data, isFetching } = useGlobalSearchQuery(term, { skip: !open || term.length < 2 || !me || client })

  // Ctrl+K / Cmd+K anywhere opens it.
  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (open) {
      setQ('')
      setActive(0)
    }
  }, [open])

  const groups = useMemo(() => {
    const text = q.trim().toLowerCase()
    const screens = PMS_SCREENS.filter(
      s => !s.hidden && screenAllowed(me?.permissions, s) && (!text || `${s.title} ${s.groupTitle}`.toLowerCase().includes(text))
    )
      .slice(0, text ? 6 : 8)
      .map(s => ({
        title: s.title,
        subtitle: s.groupTitle === s.title ? 'Screen' : `${s.groupTitle} screen`,
        href: `${s.path}/`
      }))
    const records =
      !client && term.length >= 2 && term === q.trim()
        ? (data?.detail || []).map(g => ({
            kind: g.kind,
            items: g.items.map(i => ({ ...i, href: `${PMS_BASE}/${i.link}` }))
          }))
        : []

    return [...(screens.length ? [{ kind: 'Screens', items: screens }] : []), ...records]
  }, [q, term, data, client, me?.permissions])
  const flat = groups.flatMap(g => g.items)

  useEffect(() => setActive(0), [q, data])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const go = item => {
    setOpen(false)
    router.push(item.href)
  }

  const onKeyDown = e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(i => Math.min(flat.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && flat[active]) {
      e.preventDefault()
      go(flat[active])
    }
  }

  let index = -1

  return (
    <>
      <button
        type='button'
        onClick={() => setOpen(true)}
        data-search-open
        className='hidden h-9 min-w-[220px] cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-400 transition hover:border-gray-300 md:flex'
        aria-label='Search'
      >
        <Icon icon='tabler:search' width={16} />
        <span className='flex-1 text-left'>Search anything...</span>
        <kbd className='rounded border border-gray-200 bg-gray-50 px-1.5 text-[10px] font-semibold text-gray-500'>
          Ctrl K
        </kbd>
      </button>
      <button
        type='button'
        onClick={() => setOpen(true)}
        className='flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-slate-600 hover:bg-gray-100 md:hidden'
        aria-label='Search'
      >
        <Icon icon='tabler:search' width={22} />
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth='sm'
        slotProps={{ paper: { className: '!rounded-xl !mt-[10vh] !self-start overflow-hidden' } }}
      >
        <div className='flex items-center gap-2 border-b border-gray-200 px-4 py-3'>
          <Icon icon='tabler:search' width={18} className='text-gray-400' />
          <input
            autoFocus
            id='global_search'
            value={q}
            maxLength={100}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder='Search projects, tasks, people, invoices... or type a screen name'
            className='flex-1 bg-transparent text-[15px] text-slate-800 outline-none placeholder:text-gray-400'
          />
          {isFetching && <Icon icon='tabler:loader-2' width={16} className='animate-spin text-gray-400' />}
          <kbd className='rounded border border-gray-200 bg-gray-50 px-1.5 text-[10px] font-semibold text-gray-500'>
            Esc
          </kbd>
        </div>
        <div ref={listRef} className='max-h-[60vh] overflow-y-auto py-2' data-search-results>
          {groups.map(g => (
            <div key={g.kind} className='px-2 pb-1'>
              <div className='flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-gray-400'>
                <Icon icon={GROUP_ICON[g.kind] || 'tabler:circle'} width={13} /> {g.kind}
              </div>
              {g.items.map(item => {
                index += 1
                const i = index

                return (
                  <button
                    key={`${g.kind}-${item.href}-${item.title}`}
                    type='button'
                    data-index={i}
                    data-result={g.kind}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(item)}
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left ${
                      active === i ? 'bg-[color-mix(in_srgb,var(--theme-solid)_10%,transparent)]' : ''
                    }`}
                  >
                    <div className='min-w-0 flex-1'>
                      <div className='truncate text-[13px] font-semibold text-slate-800'>{item.title}</div>
                      <div className='truncate text-[11px] text-gray-500'>{item.subtitle}</div>
                    </div>
                    {active === i && <Icon icon='tabler:corner-down-left' width={14} className='text-gray-400' />}
                  </button>
                )
              })}
            </div>
          ))}
          {q.trim().length >= 2 && !isFetching && term === q.trim() && !(data?.detail || []).length && (
            <div className='px-4 py-6 text-center text-sm text-gray-500'>No records match &quot;{q.trim()}&quot;.</div>
          )}
          {q.trim().length === 1 && (
            <div className='px-4 py-2 text-xs text-gray-400'>Type at least 2 characters to search records.</div>
          )}
        </div>
        <div className='flex gap-4 border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400'>
          <span>↑ ↓ to move</span>
          <span>Enter to open</span>
          <span>Esc to close</span>
        </div>
      </Dialog>
    </>
  )
}

export default GlobalSearch
