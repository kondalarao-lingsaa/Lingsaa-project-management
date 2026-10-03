import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Badge, IconButton, Popover, Tooltip } from '@mui/material'
import { Icon } from '@iconify/react'
import { timeAgo } from 'src/pms/components/ui'
import { PMS_BASE } from 'src/pms/config/pmsModules'
import { useGetNotificationsQuery, useMarkNotificationsReadMutation } from 'src/store/apps/pms/communicationApi'
import { IconBubble, KIND, notificationPath } from './commUi'

// Header bell: unread count, the latest notifications, mark read. Self-contained so the root app's header
// can use it too. Checks for new notifications every 30 seconds.
const NotificationBell = () => {
  const router = useRouter()
  const [anchor, setAnchor] = useState(null)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const { data } = useGetNotificationsQuery({ itemsPerPage: 8, currentPage: 1, unreadOnly }, { pollingInterval: 30000 })
  const [markRead] = useMarkNotificationsReadMutation()
  const rows = data?.detail || []
  const unread = data?.stack_values?.unread || 0

  const open = async n => {
    setAnchor(null)
    if (!n.is_read) markRead({ ids: [n.id] })
    const path = notificationPath(n.link)
    if (path) router.push(path)
  }

  return (
    <>
      <Tooltip title='Notifications' arrow>
        <IconButton color='inherit' onClick={e => setAnchor(e.currentTarget)} aria-label='Notifications' data-bell>
          <Badge badgeContent={unread} max={99} color='error' overlap='circular' data-unread={unread}>
            <Icon icon='tabler:bell' width={24} />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { className: 'mt-2 w-[380px] max-w-[calc(100vw-24px)] overflow-hidden !rounded-xl' } }}
      >
        <div className='flex items-center justify-between border-b border-gray-200 px-4 py-3'>
          <div>
            <div className='text-[15px] font-semibold text-slate-800'>Notifications</div>
            <div className='text-xs text-gray-500'>{unread ? `${unread} unread` : 'All caught up'}</div>
          </div>
          <button
            type='button'
            disabled={!unread}
            onClick={() => markRead({})}
            className='cursor-pointer text-xs font-semibold disabled:cursor-default disabled:opacity-40'
            style={{ color: 'var(--theme-solid)' }}
          >
            Mark all read
          </button>
        </div>
        <div className='flex gap-1 border-b border-gray-100 px-3 py-2'>
          {[
            [false, 'All'],
            [true, `Unread${unread ? ` (${unread})` : ''}`]
          ].map(([value, label]) => (
            <button
              key={label}
              type='button'
              onClick={() => setUnreadOnly(value)}
              className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold ${
                unreadOnly === value ? 'text-white' : 'text-slate-600 hover:bg-gray-100'
              }`}
              style={unreadOnly === value ? { background: 'var(--theme-solid)' } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
        <div className='max-h-[420px] overflow-y-auto'>
          {rows.length === 0 && (
            <div className='flex flex-col items-center gap-2 py-10 text-center text-sm text-gray-500'>
              <Icon icon='tabler:bell-off' width={28} className='text-gray-300' />
              {unreadOnly
                ? 'No unread notifications'
                : 'Nothing yet. Mentions, assignments and updates on your tasks appear here.'}
            </div>
          )}
          {rows.map(n => {
            const meta = KIND[n.kind] || KIND.comment

            return (
              <button
                key={n.id}
                type='button'
                onClick={() => open(n)}
                data-notification={n.kind}
                className={`flex w-full cursor-pointer gap-3 border-b border-gray-100 px-4 py-3 text-left transition hover:bg-gray-50 ${
                  n.is_read ? '' : 'bg-[color-mix(in_srgb,var(--theme-solid)_5%,transparent)]'
                }`}
              >
                <IconBubble meta={meta}>
                  <Icon icon={meta.icon} width={16} />
                </IconBubble>
                <div className='min-w-0 flex-1'>
                  <div className={`text-[13px] leading-snug text-slate-800 ${n.is_read ? '' : 'font-semibold'}`}>
                    {n.title}
                  </div>
                  {n.body && <div className='mt-0.5 line-clamp-2 text-xs text-gray-500'>{n.body}</div>}
                  <div className='mt-1 text-[11px] text-gray-400'>{timeAgo(n.created_at)}</div>
                </div>
                {!n.is_read && (
                  <span className='mt-1.5 h-2 w-2 shrink-0 rounded-full' style={{ background: 'var(--theme-solid)' }} />
                )}
              </button>
            )
          })}
        </div>
        <div className='flex justify-between px-4 py-2.5 text-xs font-semibold'>
          <Link
            href={`${PMS_BASE}/communication/mentions/`}
            onClick={() => setAnchor(null)}
            style={{ color: 'var(--theme-solid)' }}
          >
            My mentions
          </Link>
          <Link
            href={`${PMS_BASE}/communication/activity/`}
            onClick={() => setAnchor(null)}
            style={{ color: 'var(--theme-solid)' }}
          >
            All activity
          </Link>
        </div>
      </Popover>
    </>
  )
}

export default NotificationBell
