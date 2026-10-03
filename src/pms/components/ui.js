import React from 'react'
import { Archive, BadgeCheck, CheckCircle, Clock, FileText, PauseCircle } from 'lucide-react'
import { getInitials } from 'src/helpers/textFormatters'

// Small shared UI pieces used by the dashboard and the project screens.

export const inr = value => `₹${Math.round(value).toLocaleString('en-IN')}`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const formatDate = iso => {
  if (!iso) return '-'
  const text = String(iso)

  // A timestamp ("...T...Z") is shown in the viewer's own timezone; a plain date ("2026-10-01") as is.
  if (text.includes('T')) {
    const local = new Date(text)
    if (!Number.isNaN(local.getTime())) {
      return `${String(local.getDate()).padStart(2, '0')} ${MONTHS[local.getMonth()]} ${local.getFullYear()}`
    }
  }
  const [y, m, d] = text.slice(0, 10).split('-').map(Number)

  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`
}

const CHIP_TONES = {
  green: 'bg-emerald-100 text-emerald-700',
  red: 'bg-red-100 text-red-700',
  amber: 'bg-amber-100 text-amber-700',
  orange: 'bg-orange-100 text-orange-700',
  blue: 'bg-blue-100 text-blue-700',
  violet: 'bg-violet-100 text-violet-700',
  slate: 'bg-slate-100 text-slate-600'
}

export const Chip = ({ tone = 'slate', children }) => (
  <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP_TONES[tone]}`}>{children}</span>
)

export const PRIORITY_TONE = { Low: 'slate', Medium: 'blue', High: 'orange', Critical: 'red' }
export const STATUS_TONE = { Draft: 'slate', 'Pending Approval': 'amber', Approved: 'blue', Active: 'green', 'On Hold': 'orange', Closed: 'violet' }

export const GRADIENT = 'linear-gradient(to right, var(--theme-grad-start), var(--theme-grad-end))'

export const PrimaryButton = ({ children, className = '', ...props }) => (
  <button
    type='button'
    className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    style={{ background: GRADIENT }}
    {...props}
  >
    {children}
  </button>
)

export const GhostButton = ({ children, className = '', ...props }) => (
  <button
    type='button'
    className={`inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    {...props}
  >
    {children}
  </button>
)

export const ProgressBar = ({ value }) => (
  <div className='h-2 w-full overflow-hidden rounded-full bg-gray-100'>
    <div className='h-full rounded-full' style={{ width: `${Math.min(100, value || 0)}%`, background: GRADIENT }} />
  </div>
)

// Status pill in the same shape as StatusBadge in Lingsaa_Accounts (icon + soft fill + thin border).
const STATUS_PILL = {
  Active: ['bg-green-100 text-green-600 border-green-300', CheckCircle],
  Approved: ['bg-blue-100 text-blue-600 border-blue-300', BadgeCheck],
  'Pending Approval': ['bg-amber-100 text-amber-600 border-amber-300', Clock],
  Draft: ['bg-slate-100 text-slate-500 border-slate-300', FileText],
  'On Hold': ['bg-orange-100 text-orange-600 border-orange-300', PauseCircle],
  Closed: ['bg-violet-100 text-violet-600 border-violet-300', Archive]
}

export const StatusPill = ({ status }) => {
  const [tone, IconComponent] = STATUS_PILL[status] || STATUS_PILL.Draft

  return (
    <span className={`inline-flex select-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium ${tone}`}>
      <IconComponent size={15} />
      {status}
    </span>
  )
}

// The tinted initial tile next to a name in list rows (ThemeStyles.tableAvatar look).
export const NameAvatar = ({ name }) => (
  <div className='flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--theme-solid)_25%,transparent)] bg-[color-mix(in_srgb,var(--theme-solid)_12%,transparent)] text-sm font-bold text-[var(--theme-solid)]'>
    {getInitials(name, 1) || '?'}
  </div>
)

// Task status colours shared by the task list, the Kanban board and Task Details.
export const TASK_STATUS_STYLE = {
  'To Do': 'border-slate-300 bg-slate-100 text-slate-700',
  'In Progress': 'border-blue-300 bg-blue-100 text-blue-700',
  Testing: 'border-amber-300 bg-amber-100 text-amber-700',
  Done: 'border-emerald-300 bg-emerald-100 text-emerald-700'
}

export const TASK_STATUS_DOT = { 'To Do': '#94a3b8', 'In Progress': '#3b82f6', Testing: '#f59e0b', Done: '#10b981' }

export const TaskStatusPill = ({ status }) => (
  <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${TASK_STATUS_STYLE[status] || TASK_STATUS_STYLE['To Do']}`}>{status}</span>
)

// "5 min ago", "3 days ago", then a date - for comments and history.
export const timeAgo = iso => {
  if (!iso) return ''
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)} day${seconds < 2 * 86400 ? '' : 's'} ago`

  return formatDate(iso)
}

// Share of a person's time: theme colour, amber from 80%, red when fully booked; 0% = not planned yet.
export const allocationTone = pct => (pct >= 100 ? '#dc2626' : pct >= 80 ? '#d97706' : null)

export const AllocationBar = ({ value, showLabel = true }) => {
  const pct = Math.min(100, Math.max(0, value || 0))
  const tone = allocationTone(value || 0)

  return (
    <div className='flex min-w-[110px] items-center gap-2'>
      <div className='h-2 flex-1 overflow-hidden rounded-full bg-gray-100'>
        <div className='h-full rounded-full' style={{ width: `${pct}%`, background: tone || GRADIENT }} />
      </div>
      {showLabel && (
        <span className='w-10 text-right text-xs font-semibold tabular-nums' style={tone ? { color: tone } : undefined}>
          {value ? `${value}%` : '-'}
        </span>
      )}
    </div>
  )
}
