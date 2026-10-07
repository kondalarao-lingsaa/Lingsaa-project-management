import React from 'react'
import { PMS_BASE } from 'src/pms/config/pmsModules'

// Shared look for notifications, mentions and activity rows.

export const KIND = {
  mention: { icon: 'tabler:at', color: '#7c3aed', label: 'Mention' },
  comment: { icon: 'tabler:message-circle', color: '#2563eb', label: 'Comment' },
  assigned: { icon: 'tabler:user-check', color: '#059669', label: 'Assigned' },
  status: { icon: 'tabler:arrows-exchange', color: '#d97706', label: 'Status' },
  timesheet: { icon: 'tabler:clock-check', color: '#0891b2', label: 'Timesheet' },
  expense: { icon: 'tabler:receipt', color: '#16a34a', label: 'Expense' },
  approval: { icon: 'tabler:rosette-discount-check', color: '#4f46e5', label: 'Approval' },
  message: { icon: 'tabler:messages', color: '#db2777', label: 'Client message' },
  reminder: { icon: 'tabler:bell-ringing', color: '#dc2626', label: 'Reminder' },
  report: { icon: 'tabler:report-analytics', color: '#0d9488', label: 'Report' },
  automation: { icon: 'tabler:robot', color: '#475569', label: 'Automatic' }
}

export const ACTION = {
  created: { icon: 'tabler:plus', color: '#059669', label: 'Created', verb: 'created' },
  status: { icon: 'tabler:arrows-exchange', color: '#d97706', label: 'Status', verb: 'changed the status of' },
  updated: { icon: 'tabler:pencil', color: '#2563eb', label: 'Updated', verb: 'edited' },
  comment: { icon: 'tabler:message-circle', color: '#7c3aed', label: 'Comment', verb: 'commented on' },
  comment_deleted: {
    icon: 'tabler:message-off',
    color: '#64748b',
    label: 'Comment deleted',
    verb: 'deleted a comment on'
  },
  dependency: { icon: 'tabler:link', color: '#0891b2', label: 'Dependency', verb: 'linked' },
  dependency_removed: { icon: 'tabler:unlink', color: '#64748b', label: 'Dependency removed', verb: 'unlinked' },
  time: { icon: 'tabler:clock', color: '#0891b2', label: 'Time', verb: 'reviewed time on' },
  sprint: { icon: 'tabler:run', color: '#4f46e5', label: 'Sprint', verb: 'changed the sprint of' },
  deleted: { icon: 'tabler:trash', color: '#dc2626', label: 'Deleted', verb: 'deleted' }
}

export const ACTION_FILTERS = [
  ['created', 'Created'],
  ['status', 'Status changes'],
  ['updated', 'Edits'],
  ['comment', 'Comments'],
  ['dependency', 'Dependencies'],
  ['time', 'Timesheets'],
  ['sprint', 'Sprints'],
  ['deleted', 'Deleted']
]

// Notification links are stored relative to the PMS ("tasks/taskDetails/?id=5").
export const notificationPath = link => (link ? `${PMS_BASE}/${link.replace(/^\//, '')}` : null)

export const IconBubble = ({ meta, size = 32, children }) => (
  <span
    className='flex shrink-0 items-center justify-center rounded-full'
    style={{
      width: size,
      height: size,
      background: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
      color: meta.color
    }}
  >
    {children}
  </span>
)

// Shows "@Full Name" parts of a comment as highlighted chips. names: team member names (longest matched first).
export const MentionText = ({ text, names = [], className = '' }) => {
  if (!text) return null
  const sorted = [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length)
  const escaped = sorted.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  // Known member names first; otherwise "@Word" or "@Word Word" in capitals.
  const pattern = new RegExp(
    `@(?:${escaped.length ? `${escaped.join('|')}|` : ''}[A-Z][\\w.]*(?: [A-Z][\\w.]*)?)`,
    'gi'
  )
  const parts = []
  let last = 0
  text.replace(pattern, (match, offset) => {
    if (offset > last) parts.push(text.slice(last, offset))
    parts.push(
      <span
        key={offset}
        className='rounded px-1 font-semibold'
        style={{ color: 'var(--theme-solid)', background: 'color-mix(in srgb, var(--theme-solid) 12%, transparent)' }}
      >
        {match}
      </span>
    )
    last = offset + match.length

    return match
  })
  if (last < text.length) parts.push(text.slice(last))

  return <span className={`whitespace-pre-line break-words ${className}`}>{parts}</span>
}

export const dayLabel = iso => {
  const d = new Date(iso)
  const today = new Date()
  const y = new Date()
  y.setDate(today.getDate() - 1)
  const same = (a, b) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Today'
  if (same(d, y)) return 'Yesterday'

  return d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })
}

export const timeOfDay = iso => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
