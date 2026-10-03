import React from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { PMS_BASE } from 'src/pms/config/pmsModules'
import { Chip, formatDate, inr, PRIORITY_TONE } from 'src/pms/components/ui'

export { Chip, formatDate, inr, PRIORITY_TONE }

// Where each dashboard card sends the user - this is the visible map of how sections connect.
export const SECTION_LINKS = {
  projects: { label: 'Projects', href: `${PMS_BASE}/projects/allProjects` },
  tasks: { label: 'Tasks', href: `${PMS_BASE}/tasks/allTasks` },
  milestones: { label: 'Milestones', href: `${PMS_BASE}/deliverables` },
  resources: { label: 'Team', href: `${PMS_BASE}/resources/team` },
  budget: { label: 'Budget', href: `${PMS_BASE}/budget/budget` },
  deliverables: { label: 'Deliverables', href: `${PMS_BASE}/deliverables` },
  risks: { label: 'Risks', href: `${PMS_BASE}/risks/risks` },
  activity: { label: 'Activity', href: `${PMS_BASE}/communication/activity` },
  kanban: { label: 'Board', href: `${PMS_BASE}/tasks/kanban` },
  billing: { label: 'Billing', href: `${PMS_BASE}/billing` },
  approval: { label: 'Approval', href: `${PMS_BASE}/timesheets/approval` },
  issues: { label: 'Issues', href: `${PMS_BASE}/risks/issues` },
  activity: { label: 'Activity', href: `${PMS_BASE}/communication/activity` }
}

export const HEALTH_TONE = { 'On Track': 'green', 'At Risk': 'amber', Delayed: 'red' }
export const RISK_TONE = { High: 'red', Medium: 'amber', Low: 'green' }

export const CardShell = ({ icon, iconClass, title, subtitle, link, children }) => (
  <section className='flex h-full flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm'>
    <header className='mb-3 flex items-start justify-between gap-2 border-b border-gray-100 pb-2'>
      <div className='flex min-w-0 items-center gap-2'>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
          <Icon icon={icon} width={18} />
        </div>
        <div className='min-w-0'>
          <div className='truncate text-[15px] font-semibold text-slate-800'>{title}</div>
          {subtitle && <div className='truncate text-xs text-gray-500'>{subtitle}</div>}
        </div>
      </div>
      {link && (
        <Link
          href={link.href}
          className='flex shrink-0 items-center gap-0.5 pt-1 text-[13px] font-medium hover:underline'
          style={{ color: 'var(--theme-solid)' }}
        >
          Open {link.label}
          <Icon icon='tabler:arrow-right' width={14} />
        </Link>
      )}
    </header>
    <div className='min-h-0 flex-1'>{children}</div>
  </section>
)

export const Empty = ({ children }) => <div className='py-10 text-center text-sm text-gray-500'>{children}</div>
