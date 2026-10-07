import React, { useState } from 'react'
import Link from 'next/link'
import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import { Icon } from '@iconify/react'
import { Check, X } from 'lucide-react'
import toast from 'react-hot-toast'
import PmsPage from 'src/pms/components/PmsPage'
import StatCard from 'src/pms/components/StatCard'
import { formatDate, GhostButton, inr, NameAvatar, PrimaryButton } from 'src/pms/components/ui'
import { taskDetailsPath } from 'src/pms/tasks/paths'
import { capitalizeFirst } from 'src/pms/utils/validation'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useCan } from 'src/pms/access/useAccess'
import { useGetProjectOptionsQuery } from 'src/store/apps/pms/projectsApi'
import { useApproveEntriesMutation, useGetApprovalsQuery, useRejectEntriesMutation } from 'src/store/apps/pms/timesheetsApi'

const weekLabel = ws => {
  const [y, m, d] = ws.split('-').map(Number)
  const end = new Date(y, m - 1, d + 6)

  return `${formatDate(ws)} - ${formatDate(`${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`)}`
}

const RejectDialog = ({ group, onClose, onConfirm, busy }) => {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    const text = reason.trim()
    if (text.length < 5) {
      setError('Please Enter a Reason (at least 5 characters) so the person knows what to fix')
      document.getElementById('reject_reason')?.focus()

      return
    }
    onConfirm(text)
  }

  return (
    <Dialog open={Boolean(group)} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle className='!text-[17px] !font-semibold'>Send hours back?</DialogTitle>
      <DialogContent>
        <p className='mb-2 text-sm text-gray-500'>
          {group ? `${group.member_name}'s ${group.hours} h for ${weekLabel(group.week_start)} go back to them to fix and submit again.` : ''}
        </p>
        <span className={ThemeStyles.formLabels}>
          Reason <span className='text-red-500'>*</span>
        </span>
        <textarea
          id='reject_reason'
          rows={3}
          maxLength={500}
          value={reason}
          onChange={e => {
            setReason(capitalizeFirst(e.target.value))
            setError('')
          }}
          placeholder='e.g. Split the 8 hours on Tuesday between the two tasks you worked on'
          className={`${ThemeStyles.formsInputs} mt-1${error ? ' !border !border-red-500' : ''}`}
        />
        {error && <span className='!mt-1 block text-xs font-semibold text-red-500'>{error}</span>}
      </DialogContent>
      <DialogActions className='!px-6 !pb-4'>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton onClick={submit} disabled={busy}>
          <X size={15} /> Send Back
        </PrimaryButton>
      </DialogActions>
    </Dialog>
  )
}

const ApprovalView = () => {
  const [projectId, setProjectId] = useState('')
  const { data, isFetching } = useGetApprovalsQuery({ projectId })
  const { data: projectsResp } = useGetProjectOptionsQuery(undefined)
  const [approve, { isLoading: isApproving }] = useApproveEntriesMutation()
  const [reject, { isLoading: isRejecting }] = useRejectEntriesMutation()
  const [rejectGroup, setRejectGroup] = useState(null)
  // Pay rates and costs are money: the server sends them only to roles that see the budget.
  const can = useCan()
  const showMoney = can('budget', 'view')
  const columns = showMoney ? ['Date', 'Task', 'Hours', 'Rate', 'Cost'] : ['Date', 'Task', 'Hours']

  const groups = data?.detail || []
  const projects = Array.isArray(projectsResp?.detail) ? projectsResp.detail : []
  const totalCost = groups.reduce((sum, g) => sum + (g.cost || 0), 0)

  const doApprove = async group => {
    try {
      const resp = await approve(group.entries.map(e => e.id)).unwrap()
      toast.success(`${group.member_name}: ${resp?.detail || 'approved'}`)
    } catch {
      // The shared base query already showed why.
    }
  }

  const doReject = async reason => {
    try {
      const resp = await reject({ entryIds: rejectGroup.entries.map(e => e.id), reason }).unwrap()
      toast.success(resp?.detail || 'Sent back')
      setRejectGroup(null)
    } catch {
      // The shared base query already showed why.
    }
  }

  return (
    <PmsPage screenId='timesheets.approval'>
      {rejectGroup && <RejectDialog group={rejectGroup} onClose={() => setRejectGroup(null)} onConfirm={doReject} busy={isRejecting} />}

      <div className={`mb-3 grid grid-cols-2 gap-3 md:gap-4 ${showMoney ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
        <StatCard icon='tabler:inbox' tone='amber' label='Waiting' value={groups.length} hint='person-weeks to review' />
        <StatCard icon='tabler:clock' tone='blue' label='Hours' value={data?.stack_values?.hours || 0} hint='submitted, not reviewed' />
        {showMoney && <StatCard icon='tabler:coin-rupee' tone='violet' label='Cost if Approved' value={inr(totalCost)} hint='at current hourly rates' />}
        <StatCard icon='tabler:users' tone='indigo' label='People' value={new Set(groups.map(g => g.member_name)).size} hint='waiting for you' />
      </div>

      <div className={`${ThemeStyles.tableColor} mb-3 flex flex-col gap-2 rounded-md p-3 md:flex-row md:items-center`}>
        <select value={projectId} onChange={e => setProjectId(e.target.value)} className={`${ThemeStyles.formsInputsDropdown} md:max-w-sm`} aria-label='Project'>
          <option value=''>All Projects</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.project_code} - {p.project_name}
            </option>
          ))}
        </select>
        <span className='text-sm text-gray-500 md:ms-auto'>Approved hours update each task&apos;s actual hours and the project budget.</span>
      </div>

      {groups.length === 0 ? (
        <div className={`${ThemeStyles.tableColor} rounded-md p-10 text-center`}>
          <Icon icon='tabler:circle-check' width={36} className='mx-auto mb-2 text-emerald-500' />
          <div className='text-[15px] font-semibold text-slate-800'>{isFetching ? 'Loading...' : 'All caught up'}</div>
          {!isFetching && <div className='text-sm text-gray-500'>No submitted hours are waiting for approval.</div>}
        </div>
      ) : (
        <div className={`flex flex-col gap-3 transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          {groups.map(g => (
            <section key={g.key} className='rounded-xl border border-gray-200 bg-white shadow-sm'>
              <div className='flex flex-wrap items-center gap-3 border-b border-gray-100 p-3'>
                <NameAvatar name={g.member_name} />
                <div className='min-w-0'>
                  <div className='text-[15px] font-semibold text-slate-800'>{g.member_name}</div>
                  <div className='text-xs text-gray-500'>
                    Week of {weekLabel(g.week_start)} · {g.projects.join(', ')}
                  </div>
                </div>
                <div className='flex items-center gap-4 md:ms-auto'>
                  <div className='text-right'>
                    <div className='text-[15px] font-bold tabular-nums text-slate-800'>{g.hours} h</div>
                    {showMoney && <div className='text-xs text-gray-500'>{inr(g.cost || 0)}</div>}
                  </div>
                  {g.is_own ? (
                    <span className='max-w-[180px] text-xs font-medium text-amber-600'>Your own time - another manager must review it</span>
                  ) : (
                    <div className='flex gap-2'>
                      <GhostButton onClick={() => setRejectGroup(g)} disabled={isApproving || isRejecting}>
                        <X size={15} /> Reject
                      </GhostButton>
                      <PrimaryButton onClick={() => doApprove(g)} disabled={isApproving || isRejecting}>
                        <Check size={15} /> Approve
                      </PrimaryButton>
                    </div>
                  )}
                </div>
              </div>
              <div className='overflow-x-auto'>
                <table className='w-full min-w-[720px] text-left text-sm'>
                  <thead className={ThemeStyles.tableHeaderBg}>
                    <tr>
                      {columns.map(h => (
                        <th key={h} className={`${ThemeStyles.tableHeadCellsHeight} !px-3`}>
                          <div className={`pms-th-text ${['Hours', 'Rate', 'Cost'].includes(h) ? 'text-right' : ''}`}>{h}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {g.entries.map(e => (
                      <tr key={e.id} className='border-t border-gray-200'>
                        <td className='pms-td-text px-3 py-2'>{formatDate(e.work_date)}</td>
                        <td className='px-3 py-2'>
                          <Link href={taskDetailsPath(e.task_id)} className='hover:underline'>
                            <span className={`${ThemeStyles.listNoColor} text-[13px]`}>{e.task_key}</span>
                            <span className='pms-td-text ms-2'>{e.task_title}</span>
                          </Link>
                          {e.note && <div className='text-xs text-gray-500'>{e.note}</div>}
                        </td>
                        <td className='pms-td-text px-3 py-2 text-right font-semibold tabular-nums'>{e.hours}</td>
                        {showMoney && (
                          <>
                            <td className='pms-td-text px-3 py-2 text-right tabular-nums'>{e.hourly_rate === null ? <span className='text-amber-600'>No rate</span> : inr(e.hourly_rate)}</td>
                            <td className='pms-td-text px-3 py-2 text-right tabular-nums'>{e.cost === null ? '-' : inr(e.cost)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </PmsPage>
  )
}

export default ApprovalView
