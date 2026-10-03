import React, { useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Icon } from '@iconify/react'
import PmsPage from 'src/pms/components/PmsPage'
import ReasonDialog from 'src/pms/components/ReasonDialog'
import { GhostButton, inr, PrimaryButton, timeAgo } from 'src/pms/components/ui'
import { PMS_BASE } from 'src/pms/config/pmsModules'
import { useMe } from 'src/pms/access/useAccess'
import { useGetApprovalInboxQuery } from 'src/store/apps/pms/accessApi'
import { useChangeProjectStatusMutation } from 'src/store/apps/pms/projectsApi'
import { useDecideChangeRequestMutation } from 'src/store/apps/pms/risksApi'
import { useApproveExpensesMutation, useRejectExpensesMutation } from 'src/store/apps/pms/expensesApi'
import { useChangeMilestoneStatusMutation } from 'src/store/apps/pms/billingApi'

// Everything waiting for this person's decision, in one list (projects, budget changes, expenses, hours,
// milestones). Each row is decided here; the server applies the approval rules again when it is clicked.
const KINDS = {
  project: { label: 'Project', icon: 'tabler:briefcase', tone: '#4f46e5' },
  change: { label: 'Change request', icon: 'tabler:arrows-diff', tone: '#d97706' },
  expense: { label: 'Expense', icon: 'tabler:receipt-2', tone: '#0891b2' },
  timesheet: { label: 'Timesheet', icon: 'tabler:clock-hour-4', tone: '#16a34a' },
  milestone: { label: 'Milestone', icon: 'tabler:flag', tone: '#db2777' }
}

const ApprovalsView = () => {
  const { me } = useMe()
  const { data, isFetching, isError, refetch } = useGetApprovalInboxQuery()
  const inbox = data?.detail || { items: [], counts: {}, total: 0 }
  const [filter, setFilter] = useState('all')
  const [ask, setAsk] = useState(null) // { item, mode: 'approve' | 'reject' }
  const [busyKey, setBusyKey] = useState(null)

  const [changeProjectStatus] = useChangeProjectStatusMutation()
  const [decideChange] = useDecideChangeRequestMutation()
  const [approveExpenses] = useApproveExpensesMutation()
  const [rejectExpenses] = useRejectExpensesMutation()
  const [changeMilestone] = useChangeMilestoneStatusMutation()

  const decide = async (item, approve, text) => {
    const key = `${item.kind}-${item.id}`
    setBusyKey(key)
    try {
      let resp
      if (item.kind === 'project') {
        resp = await changeProjectStatus({ id: item.id, status: approve ? 'Approved' : 'Draft', remarks: text }).unwrap()
      } else if (item.kind === 'change') {
        resp = await decideChange({ projectId: item.project_id, id: item.id, approve, note: text }).unwrap()
      } else if (item.kind === 'expense') {
        resp = approve ? await approveExpenses([item.id]).unwrap() : await rejectExpenses({ ids: [item.id], reason: text }).unwrap()
      } else if (item.kind === 'milestone') {
        resp = await changeMilestone({
          projectId: item.project_id,
          milestoneId: item.id,
          status: approve ? 'Accepted' : 'Changes Requested',
          feedback: text
        }).unwrap()
      }
      toast.success(resp?.detail || (approve ? 'Approved' : 'Sent back'))
      setAsk(null)
    } catch {
      // The shared error toast explains why (for example: it needs a higher approver).
    }
    setBusyKey(null)
  }

  const items = inbox.items.filter(i => filter === 'all' || i.kind === filter)
  const approving = ask?.mode === 'approve'

  return (
    <PmsPage screenId='approvals'>
      <ReasonDialog
        open={Boolean(ask)}
        onClose={() => setAsk(null)}
        busy={Boolean(busyKey)}
        title={approving ? `Approve ${ask?.item.title}?` : `Send back ${ask?.item.title}?`}
        message={approving ? 'Add a note for the requester if you like.' : 'Say what needs to change. The requester sees this reason.'}
        label={approving ? 'Note' : 'Reason'}
        minLength={approving ? 0 : 5}
        confirmText={approving ? (ask?.item.kind === 'milestone' ? 'Accept' : 'Approve') : 'Send Back'}
        onSubmit={text => decide(ask.item, approving, text)}
      />

      <p className='mb-4 max-w-3xl text-sm text-gray-600'>
        Items that need your decision as <b>{me?.role_title || 'approver'}</b>. You only see what your role and the approval
        limits (Settings &gt; Approval Rules) let you approve, and never your own requests.
      </p>

      <div className='mb-4 flex flex-wrap gap-2' role='tablist'>
        {['all', ...Object.keys(KINDS)].map(kind => {
          const count = kind === 'all' ? inbox.total : inbox.counts[kind] || 0
          if (kind !== 'all' && !count) return null

          return (
            <button
              key={kind}
              type='button'
              role='tab'
              aria-selected={filter === kind}
              onClick={() => setFilter(kind)}
              className={`cursor-pointer rounded-full border px-3 py-1 text-[13px] font-semibold ${
                filter === kind ? 'border-transparent text-white' : 'border-gray-200 bg-white text-slate-600 hover:bg-gray-50'
              }`}
              style={filter === kind ? { background: 'var(--theme-solid)' } : undefined}
            >
              {kind === 'all' ? 'All' : KINDS[kind].label} <span className='tabular-nums'>({count})</span>
            </button>
          )
        })}
      </div>

      {isError ? (
        <div className='rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700'>
          Could not load your approvals.{' '}
          <button type='button' className='cursor-pointer font-semibold underline' onClick={refetch}>
            Retry
          </button>
        </div>
      ) : !items.length ? (
        <div className='rounded-xl border border-gray-200 bg-white p-8 text-center' data-approvals-empty>
          <Icon icon='tabler:circle-check' width={36} className='mx-auto text-emerald-500' />
          <div className='mt-2 text-[15px] font-semibold text-slate-800'>{isFetching ? 'Loading…' : 'Nothing waiting for you'}</div>
          <div className='text-sm text-gray-500'>New requests appear here, and in the bell, as soon as someone sends them.</div>
        </div>
      ) : (
        <ul className='flex flex-col gap-3' data-approvals-list>
          {items.map(item => {
            const kind = KINDS[item.kind]
            const key = `${item.kind}-${item.id}`

            return (
              <li
                key={key}
                data-approval-item={key}
                className='flex flex-wrap items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm'
              >
                <span
                  className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg'
                  style={{ background: `color-mix(in srgb, ${kind.tone} 12%, transparent)`, color: kind.tone }}
                >
                  <Icon icon={kind.icon} width={20} />
                </span>
                <div className='min-w-0 flex-1'>
                  <div className='text-xs font-semibold uppercase tracking-wide' style={{ color: kind.tone }}>
                    {kind.label} · {item.project_code}
                  </div>
                  <div className='text-[15px] font-semibold text-slate-800'>{item.title}</div>
                  <div className='text-[13px] text-slate-600'>{item.detail}</div>
                  <div className='mt-1 text-xs text-gray-500'>
                    {item.amount ? <span className='mr-3 font-semibold tabular-nums text-slate-700'>{inr(item.amount)}</span> : null}
                    {item.requested_by && <span>From {item.requested_by}</span>}
                    {item.requested_at && <span> · {timeAgo(item.requested_at)}</span>}
                    {item.waiting_days >= 2 && (
                      <span className='ml-2 rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700' data-waiting-days>
                        Waiting {item.waiting_days} days
                      </span>
                    )}
                  </div>
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                  <Link
                    href={`${PMS_BASE}/${item.link}`}
                    className='text-[13px] font-semibold hover:underline'
                    style={{ color: 'var(--theme-solid)' }}
                  >
                    Open
                  </Link>
                  {item.kind === 'timesheet' ? (
                    <Link href={`${PMS_BASE}/timesheets/approval/`}>
                      <PrimaryButton>Review Hours</PrimaryButton>
                    </Link>
                  ) : (
                    <>
                      <GhostButton disabled={busyKey === key} onClick={() => setAsk({ item, mode: 'reject' })}>
                        {item.kind === 'milestone' ? 'Ask for Changes' : 'Send Back'}
                      </GhostButton>
                      <PrimaryButton disabled={busyKey === key} onClick={() => setAsk({ item, mode: 'approve' })}>
                        {item.kind === 'milestone' ? 'Accept' : 'Approve'}
                      </PrimaryButton>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </PmsPage>
  )
}

export default ApprovalsView
