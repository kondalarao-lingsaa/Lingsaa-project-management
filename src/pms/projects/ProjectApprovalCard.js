import React from 'react'
import { Icon } from '@iconify/react'
import { formatDate, inr, timeAgo } from 'src/pms/components/ui'

const DECISION_TONE = {
  Submitted: '#64748b',
  Approved: '#16a34a',
  'Auto-approved': '#16a34a',
  Rejected: '#dc2626',
  Withdrawn: '#d97706'
}

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000)

// The approved plan (frozen at approval) next to the live one: how far dates and money have moved since.
const Baseline = ({ project }) => {
  const b = project.baseline
  const slip = b.end_date && project.end_date ? daysBetween(b.end_date, project.end_date) : 0
  const budgetChange = (project.budget || 0) - (b.budget || 0)
  const tone = n => (n > 0 ? 'text-red-600' : n < 0 ? 'text-emerald-700' : 'text-slate-500')

  return (
    <div className='mb-3 grid grid-cols-1 gap-3 rounded-lg bg-gray-50 p-3 text-[13px] sm:grid-cols-2' data-baseline>
      <div>
        <div className='text-xs font-medium text-gray-500'>End date: approved → now</div>
        <div className='font-semibold text-slate-800'>
          {formatDate(b.end_date)} → {formatDate(project.end_date)}{' '}
          <span className={tone(slip)}>{slip ? `(${slip > 0 ? '+' : ''}${slip} days)` : '(on plan)'}</span>
        </div>
      </div>
      <div>
        <div className='text-xs font-medium text-gray-500'>Budget: approved → now</div>
        <div className='font-semibold text-slate-800'>
          {b.budget === null ? '-' : inr(b.budget)} → {project.budget === null ? '-' : inr(project.budget)}{' '}
          <span className={tone(budgetChange)}>
            {budgetChange ? `(${budgetChange > 0 ? '+' : '-'}${inr(Math.abs(budgetChange))} by change requests)` : '(on plan)'}
          </span>
        </div>
      </div>
    </div>
  )
}

// Overview card: which approval rule applies to this project, who it waits for, and every decision so far.
const ProjectApprovalCard = ({ project }) => {
  const a = project.approval
  if (!a) return null
  const pending = project.status === 'Pending Approval'
  const returned = project.status === 'Draft' && project.approval_note

  return (
    <section className='mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm' data-approval-card>
      <div className='mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 pb-2'>
        <div>
          <div className='text-[15px] font-semibold text-slate-800'>Approval</div>
          <div className='text-xs text-gray-500' data-approval-rule>
            {a.rule}
          </div>
        </div>
        {project.approved_at && (
          <span className='rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700'>
            Approved by {project.approved_by_name} on {formatDate(project.approved_at)}
          </span>
        )}
      </div>

      {pending && (
        <div className='mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800' data-approval-waiting>
          <Icon icon='tabler:hourglass' width={18} className='mt-0.5 shrink-0' />
          <div>
            <b>
              Waiting for {a.waiting_for} (level {project.approval_level} of {project.approval_levels})
            </b>
            {a.can_approve ? (
              <div>You can approve this level. Use Approve at the top, or Send Back to Draft with a reason.</div>
            ) : (
              a.blocked_reason && <div>{a.blocked_reason}</div>
            )}
          </div>
        </div>
      )}

      {returned && (
        <div className='mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-800' data-approval-returned>
          <Icon icon='tabler:arrow-back-up' width={18} className='mt-0.5 shrink-0' />
          <div>
            <b>Sent back by the approver.</b> Reason: {project.approval_note}. Fix it, then Submit for Approval again.
          </div>
        </div>
      )}

      {project.baseline && <Baseline project={project} />}

      {a.history.length ? (
        <ol className='flex flex-col gap-2' data-approval-history>
          {a.history.map(h => (
            <li key={h.id} className='flex items-start gap-3 text-[13px]'>
              <span className='mt-1 h-2.5 w-2.5 shrink-0 rounded-full' style={{ background: DECISION_TONE[h.decision] || '#64748b' }} />
              <div className='min-w-0 flex-1'>
                <span className='font-semibold text-slate-800'>{h.decision}</span>
                {h.level > 0 && <span className='text-gray-500'> · level {h.level}</span>}
                <span className='text-gray-600'>
                  {' '}
                  by {h.decided_by_name}
                  {h.decided_role ? ` (${h.decided_role})` : ''}
                </span>
                {h.remarks && <div className='text-gray-500'>{h.remarks}</div>}
              </div>
              <span className='shrink-0 text-xs text-gray-400'>{timeAgo(h.decided_at)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className='text-[13px] text-gray-500'>Not sent for approval yet.</div>
      )}
    </section>
  )
}

export default ProjectApprovalCard
