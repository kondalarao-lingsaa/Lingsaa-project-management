import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Dialog, DialogActions, DialogContent, DialogTitle, Menu, MenuItem } from '@mui/material'
import { Icon } from '@iconify/react'
import { Ellipsis, PlusCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import StatCard from 'src/pms/components/StatCard'
import ConfirmDialog from 'src/pms/components/ConfirmDialog'
import ChooseProjectDialog from 'src/pms/components/ChooseProjectDialog'
import usePagedRows from 'src/pms/components/usePagedRows'
import { Chip, formatDate, GhostButton, inr, PrimaryButton } from 'src/pms/components/ui'
import { projectDetailsPath } from 'src/pms/projects/ProjectsListView'
import { taskDetailsPath } from 'src/pms/tasks/paths'
import { capitalizeFirst } from 'src/pms/utils/validation'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useCan, useMe } from 'src/pms/access/useAccess'
import {
  useChangeIssueStatusMutation,
  useChangeRiskStatusMutation,
  useCreateFixTaskMutation,
  useDecideChangeRequestMutation,
  useDeleteIssueMutation,
  useDeleteRiskMutation,
  useGetChangeRequestsQuery,
  useGetIssuesQuery,
  useGetRisksQuery,
  useRiskOccurredMutation,
  useWithdrawChangeRequestMutation
} from 'src/store/apps/pms/risksApi'
import ChangeDrawer from './ChangeDrawer'
import IssueDrawer from './IssueDrawer'
import RiskDrawer, { LEVEL_TONE } from './RiskDrawer'

const RISK_STATUS_TONE = { Open: 'red', Monitoring: 'amber', Mitigated: 'blue', Occurred: 'violet', Closed: 'slate' }
const SEVERITY_TONE = { Critical: 'red', High: 'orange', Medium: 'amber', Low: 'slate' }
const ISSUE_STATUS_TONE = { Open: 'red', 'In Progress': 'blue', Resolved: 'green', Closed: 'slate' }
const CHANGE_STATUS_TONE = { Submitted: 'amber', Approved: 'green', Rejected: 'red' }
const RISK_ACTION = { Open: 'Reopen', Monitoring: 'Monitor', Mitigated: 'Mark Mitigated', Closed: 'Close' }
const ISSUE_ACTION = { Open: 'Back to Open', 'In Progress': 'Start Work', Resolved: 'Resolve', Closed: 'Close' }

const useDebouncedValue = (value, delay = 500) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

// Asks for a note (resolution, rejection reason, approval note); `min` > 0 makes it required.
const TextDialog = ({ open, title, message, label, placeholder, min, confirmText, onClose, onConfirm, busy }) => {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    if (open) {
      setText('')
      setError('')
    }
  }, [open])

  const submit = () => {
    if (min && text.trim().length < min) return setError(`Please Enter ${label} (at least ${min} characters)`)
    onConfirm(text.trim())
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle className='!text-[17px] !font-semibold'>{title}</DialogTitle>
      <DialogContent>
        {message && <p className='mb-2 text-sm text-gray-500'>{message}</p>}
        <span className={ThemeStyles.formLabels}>
          {label}{' '}
          {min ? (
            <span className='text-red-500'>*</span>
          ) : (
            <span className='text-xs font-normal text-gray-400'>(optional)</span>
          )}
        </span>
        <textarea
          id='dialog_text'
          rows={3}
          maxLength={1000}
          value={text}
          onChange={e => {
            setText(capitalizeFirst(e.target.value))
            setError('')
          }}
          placeholder={placeholder}
          className={`${ThemeStyles.formsInputs} mt-1${error ? ' !border !border-red-500' : ''}`}
        />
        {error && <span className='!mt-1 block text-xs font-semibold text-red-500'>{error}</span>}
      </DialogContent>
      <DialogActions className='!px-6 !pb-4'>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton onClick={submit} disabled={busy}>
          {confirmText}
        </PrimaryButton>
      </DialogActions>
    </Dialog>
  )
}

const Toolbar = ({ search, setSearch, placeholder, filters, action }) => (
  <div className='flex flex-col gap-2 p-3 md:flex-row md:items-center'>
    <input
      type='text'
      value={search}
      onChange={e => setSearch(e.target.value)}
      placeholder={placeholder}
      className={`${ThemeStyles.formsInputs} search-input text-gray-900 md:max-w-sm`}
    />
    {filters}
    {action && <div className='md:ms-auto'>{action}</div>}
  </div>
)

const Th = ({ children, center }) => (
  <th className={`${ThemeStyles.tableHeadCellsHeight} !px-3`}>
    <div className={`pms-th-text ${center ? 'text-center' : ''}`}>{children}</div>
  </th>
)

const ProjectCell = ({ row }) => (
  <td className='px-3 py-2'>
    <Link href={`${projectDetailsPath(row.project_id)}&tab=risks`} className={`${ThemeStyles.listNoColor} text-[13px]`}>
      {row.project_code}
    </Link>
    <div className='max-w-[180px] truncate text-xs text-gray-500'>{row.project_name}</div>
  </td>
)

const RowMenu = ({ items }) => {
  const [anchor, setAnchor] = useState(null)
  const shown = items.filter(Boolean)
  if (!shown.length) return <span className='text-gray-400'>-</span>

  return (
    <>
      <Ellipsis className={ThemeStyles.tableActionsIcon} onClick={e => setAnchor(e.currentTarget)} />
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} autoFocus={false}>
        {shown.map(item => (
          <MenuItem
            key={item.label}
            className={ThemeStyles.actionMenuItem}
            onClick={() => {
              setAnchor(null)
              item.onClick()
            }}
          >
            <div className={`${ThemeStyles.actionMenuBox} ${item.danger ? 'text-red-600' : ''}`}>
              <Icon icon={item.icon} width={16} />
              {item.label}
            </div>
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

// A project reference good enough for the drawers (members, milestones and dates are fetched by id).
const projectRef = (project, row) =>
  project || { id: row.project_id, project_code: row.project_code, project_name: row.project_name }

/* ------------------------------------------------------------------------------ risks */

const RiskMatrix = ({ matrix }) => (
  <div>
    <div className='mb-1 text-xs font-semibold text-gray-500'>Open risks: impact (up) x probability (right)</div>
    <div className='grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-1 text-center text-xs'>
      {[5, 4, 3, 2, 1].map(impact => (
        <React.Fragment key={impact}>
          <div className='flex items-center justify-end pr-1 text-gray-400'>{impact}</div>
          {[1, 2, 3, 4, 5].map(prob => {
            const score = impact * prob
            const count = matrix?.[impact - 1]?.[prob - 1] || 0
            const bg = score >= 15 ? 'rgba(239,68,68,' : score >= 8 ? 'rgba(245,158,11,' : 'rgba(34,197,94,'

            return (
              <div
                key={prob}
                title={`Probability ${prob} x impact ${impact} = ${score}`}
                className='flex h-9 items-center justify-center rounded font-bold tabular-nums text-slate-800'
                style={{ background: `${bg}${count ? 0.55 : 0.15})` }}
              >
                {count || ''}
              </div>
            )
          })}
        </React.Fragment>
      ))}
      <div />
      {[1, 2, 3, 4, 5].map(p => (
        <div key={p} className='text-gray-400'>
          {p}
        </div>
      ))}
    </div>
  </div>
)

const RisksPanel = ({ project, rights }) => {
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState('')
  const debounced = useDebouncedValue(search)
  const { data, isFetching } = useGetRisksQuery(
    project ? { projectId: project.id, scoped: true } : { search: debounced, level }
  )
  const [changeStatus] = useChangeRiskStatusMutation()
  const [occurred, { isLoading: isRaising }] = useRiskOccurredMutation()
  const [remove, { isLoading: isDeleting }] = useDeleteRiskMutation()
  const [drawer, setDrawer] = useState(null)
  const [chooser, setChooser] = useState(false)
  const [happened, setHappened] = useState(null)
  const [deleting, setDeleting] = useState(null)

  let rows = data?.detail || []
  if (project && debounced)
    rows = rows.filter(r =>
      `${r.title} ${r.risk_key} ${r.owner_name || ''}`.toLowerCase().includes(debounced.toLowerCase())
    )
  if (project && level) rows = rows.filter(r => r.level === level)
  const sv = data?.stack_values || {}
  const { pageRows, pager } = usePagedRows(rows, { resetKey: `${debounced}|${level}` })

  const run = async (fn, args, fallback) => {
    try {
      const resp = await fn(args).unwrap()
      toast.success(resp?.detail || fallback)
    } catch {
      // The shared base query already showed why.
    }
  }

  return (
    <div>
      <ChooseProjectDialog
        open={chooser}
        title='Add Risk'
        onClose={() => setChooser(false)}
        onChoose={p => {
          setChooser(false)
          setDrawer({ project: p, risk: null })
        }}
      />
      <RiskDrawer
        open={Boolean(drawer)}
        onClose={() => setDrawer(null)}
        project={drawer?.project}
        risk={drawer?.risk || null}
      />
      <ConfirmDialog
        open={Boolean(happened)}
        onClose={() => setHappened(null)}
        onConfirm={async () => {
          await run(occurred, { projectId: happened.project_id, id: happened.id }, 'Issue raised')
          setHappened(null)
        }}
        title='Did this risk happen?'
        message={
          happened
            ? `${happened.risk_key} becomes an issue with the same owner, due in 7 days. Handle it on the Issues tab.`
            : ''
        }
        confirmText='Yes, raise an issue'
        cancelText='Cancel'
        busy={isRaising}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await run(remove, { projectId: deleting.project_id, id: deleting.id }, 'Risk deleted')
          setDeleting(null)
        }}
        title='Delete risk?'
        message={
          deleting ? `${deleting.risk_key} will be removed. Consider closing it instead to keep the history.` : ''
        }
        confirmText='Delete'
        cancelText='Cancel'
        busy={isDeleting}
      />

      <div className='mb-3 grid grid-cols-1 gap-3 xl:grid-cols-3'>
        <div className='grid grid-cols-2 gap-3 md:gap-4 xl:col-span-2'>
          <StatCard
            icon='tabler:shield-exclamation'
            tone='indigo'
            label='Open Risks'
            value={sv.open || 0}
            hint={`${sv.count_pg || 0} in the register`}
          />
          <StatCard
            icon='tabler:flame'
            tone='red'
            label='High'
            value={sv.levels?.High || 0}
            hint='score 15-25, plan required'
          />
          <StatCard
            icon='tabler:alert-triangle'
            tone='amber'
            label='Medium'
            value={sv.levels?.Medium || 0}
            hint={`${sv.levels?.Low || 0} low`}
          />
          <StatCard
            icon='tabler:calendar-due'
            tone='violet'
            label='Review Due'
            value={sv.review_due || 0}
            hint='review date reached'
          />
        </div>
        <div className='rounded-xl border border-gray-200 bg-white p-3 shadow-sm'>
          <RiskMatrix matrix={sv.matrix} />
        </div>
      </div>

      <div className={`${ThemeStyles.tableColor} rounded-md`}>
        <Toolbar
          search={search}
          setSearch={setSearch}
          placeholder='Search with Risk, Key, Owner...'
          filters={
            <select
              value={level}
              onChange={e => setLevel(e.target.value)}
              className={`${ThemeStyles.formsInputsDropdown} md:max-w-[170px]`}
              aria-label='Level'
            >
              <option value=''>All Levels</option>
              {['High', 'Medium', 'Low'].map(l => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          }
          action={
            rights.add && (
              <PrimaryButton onClick={() => (project ? setDrawer({ project, risk: null }) : setChooser(true))}>
                Add Risk <PlusCircle size={16} />
              </PrimaryButton>
            )
          }
        />
        <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <table className='w-full min-w-[1000px] text-left text-sm'>
            <thead className={ThemeStyles.tableHeaderBg}>
              <tr>
                <Th>Risk</Th>
                {!project && <Th>Project</Th>}
                <Th center>Score</Th>
                <Th center>Status</Th>
                <Th>Owner</Th>
                <Th>Mitigation</Th>
                <Th>Review</Th>
                <Th center>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className='py-10 text-center text-slate-600'>
                    {isFetching
                      ? 'Loading...'
                      : project
                      ? 'No risks yet. What could stop this project? Add it here before it happens.'
                      : 'No risks match.'}
                  </td>
                </tr>
              ) : (
                pageRows.map(r => (
                  <tr key={r.id} className='border-t border-gray-200 hover:bg-gray-50/70'>
                    <td className='px-3 py-2'>
                      <span className={`${ThemeStyles.listNoColor} text-[13px]`}>{r.risk_key}</span>
                      <div className='pms-td-text max-w-[300px] font-semibold'>{r.title}</div>
                      <div className='text-xs text-gray-500'>
                        {r.category}
                        {r.milestone_name ? ` · threatens ${r.milestone_name}` : ''}
                        {r.issue_count ? ` · ${r.issue_count} issue${r.issue_count > 1 ? 's' : ''}` : ''}
                      </div>
                    </td>
                    {!project && <ProjectCell row={r} />}
                    <td className='px-3 py-2 text-center'>
                      <Chip tone={LEVEL_TONE[r.level]}>
                        {r.level} {r.score}
                      </Chip>
                      <div className='mt-0.5 text-[11px] text-gray-500'>
                        P{r.probability} x I{r.impact}
                      </div>
                    </td>
                    <td className='px-3 py-2 text-center'>
                      <Chip tone={RISK_STATUS_TONE[r.status]}>{r.status}</Chip>
                    </td>
                    <td className='pms-td-text px-3 py-2'>
                      {r.owner_name || <span className='text-amber-600'>No owner</span>}
                    </td>
                    <td className='px-3 py-2'>
                      <div className='max-w-[260px] truncate text-[13px] text-slate-700' title={r.mitigation || ''}>
                        {r.mitigation || <span className='text-gray-400'>-</span>}
                      </div>
                    </td>
                    <td className={`pms-td-text px-3 py-2 ${r.review_due ? '!text-red-600 font-semibold' : ''}`}>
                      {r.review_date ? formatDate(r.review_date) : '-'}
                    </td>
                    <td className='px-3 py-2 text-center'>
                      {(rights.edit || rights.delete) && r.project_status !== 'Closed' ? (
                        <RowMenu
                          items={[
                            rights.edit && r.status !== 'Closed' && {
                              label: 'Edit',
                              icon: 'tabler:pencil',
                              onClick: () => setDrawer({ project: projectRef(project, r), risk: r })
                            },
                            rights.edit && ['Open', 'Monitoring', 'Mitigated'].includes(r.status) && {
                              label: 'It Happened',
                              icon: 'tabler:bolt',
                              onClick: () => setHappened(r)
                            },
                            ...(rights.edit ? r.next_statuses : []).map(s => ({
                              label: RISK_ACTION[s] || s,
                              icon: 'tabler:arrows-exchange',
                              onClick: () =>
                                run(changeStatus, { projectId: r.project_id, id: r.id, status: s }, `Moved to ${s}`)
                            })),
                            rights.delete && !r.issue_count && {
                              label: 'Delete',
                              icon: 'tabler:trash',
                              danger: true,
                              onClick: () => setDeleting(r)
                            }
                          ]}
                        />
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pager}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------------ issues */

const IssuesPanel = ({ project, rights }) => {
  const [search, setSearch] = useState('')
  const [severity, setSeverity] = useState('')
  const debounced = useDebouncedValue(search)
  const { data, isFetching } = useGetIssuesQuery(
    project ? { projectId: project.id, scoped: true } : { search: debounced, severity }
  )
  const [changeStatus, { isLoading: isChanging }] = useChangeIssueStatusMutation()
  const [createTask, { isLoading: isCreatingTask }] = useCreateFixTaskMutation()
  const [remove, { isLoading: isDeleting }] = useDeleteIssueMutation()
  const [drawer, setDrawer] = useState(null)
  const [chooser, setChooser] = useState(false)
  const [resolving, setResolving] = useState(null)
  const [deleting, setDeleting] = useState(null)

  let rows = data?.detail || []
  if (project && debounced)
    rows = rows.filter(i =>
      `${i.title} ${i.issue_key} ${i.owner_name || ''}`.toLowerCase().includes(debounced.toLowerCase())
    )
  if (project && severity) rows = rows.filter(i => i.severity === severity)
  const sv = data?.stack_values || {}
  const { pageRows, pager } = usePagedRows(rows, { resetKey: `${debounced}|${severity}` })

  const run = async (fn, args, fallback) => {
    try {
      const resp = await fn(args).unwrap()
      toast.success(resp?.detail || fallback)

      return true
    } catch {
      return false
    }
  }

  return (
    <div>
      <ChooseProjectDialog
        open={chooser}
        title='Raise Issue'
        onClose={() => setChooser(false)}
        onChoose={p => {
          setChooser(false)
          setDrawer({ project: p, issue: null })
        }}
      />
      <IssueDrawer
        open={Boolean(drawer)}
        onClose={() => setDrawer(null)}
        project={drawer?.project}
        issue={drawer?.issue || null}
      />
      <TextDialog
        open={Boolean(resolving)}
        title='Resolve issue?'
        message={resolving ? `${resolving.issue_key}: ${resolving.title}` : ''}
        label='Resolution'
        placeholder='How was it fixed?'
        min={10}
        confirmText='Resolve'
        busy={isChanging}
        onClose={() => setResolving(null)}
        onConfirm={async text =>
          (await run(
            changeStatus,
            { projectId: resolving.project_id, id: resolving.id, status: 'Resolved', resolution: text },
            'Resolved'
          )) && setResolving(null)
        }
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await run(remove, { projectId: deleting.project_id, id: deleting.id }, 'Issue deleted')
          setDeleting(null)
        }}
        title='Delete issue?'
        message={deleting ? `${deleting.issue_key} will be removed.` : ''}
        confirmText='Delete'
        cancelText='Cancel'
        busy={isDeleting}
      />

      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
        <StatCard
          icon='tabler:alert-circle'
          tone='red'
          label='Open Issues'
          value={sv.open || 0}
          hint={`${sv.count_pg || 0} in total`}
        />
        <StatCard
          icon='tabler:flame'
          tone='orange'
          label='High / Critical'
          value={sv.critical || 0}
          hint='open, severe'
        />
        <StatCard
          icon='tabler:alarm'
          tone='amber'
          label='Overdue'
          value={sv.overdue || 0}
          hint='past due, not resolved'
        />
        <StatCard
          icon='tabler:circle-check'
          tone='emerald'
          label='Resolved'
          value={(sv.status_counts?.Resolved || 0) + (sv.status_counts?.Closed || 0)}
          hint='resolved or closed'
        />
      </div>

      <div className={`${ThemeStyles.tableColor} rounded-md`}>
        <Toolbar
          search={search}
          setSearch={setSearch}
          placeholder='Search with Issue, Key, Owner...'
          filters={
            <select
              value={severity}
              onChange={e => setSeverity(e.target.value)}
              className={`${ThemeStyles.formsInputsDropdown} md:max-w-[170px]`}
              aria-label='Severity'
            >
              <option value=''>All Severities</option>
              {['Critical', 'High', 'Medium', 'Low'].map(l => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          }
          action={
            rights.add && (
              <PrimaryButton onClick={() => (project ? setDrawer({ project, issue: null }) : setChooser(true))}>
                Raise Issue <PlusCircle size={16} />
              </PrimaryButton>
            )
          }
        />
        <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <table className='w-full min-w-[1000px] text-left text-sm'>
            <thead className={ThemeStyles.tableHeaderBg}>
              <tr>
                <Th>Issue</Th>
                {!project && <Th>Project</Th>}
                <Th center>Severity</Th>
                <Th center>Status</Th>
                <Th>Owner</Th>
                <Th>Due</Th>
                <Th>Fix Task</Th>
                <Th center>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className='py-10 text-center text-slate-600'>
                    {isFetching
                      ? 'Loading...'
                      : project
                      ? 'No issues. Raise one when something goes wrong, or use "It Happened" on a risk.'
                      : 'No issues match.'}
                  </td>
                </tr>
              ) : (
                pageRows.map(i => (
                  <tr key={i.id} className='border-t border-gray-200 hover:bg-gray-50/70'>
                    <td className='px-3 py-2'>
                      <span className={`${ThemeStyles.listNoColor} text-[13px]`}>{i.issue_key}</span>
                      <div className='pms-td-text max-w-[300px] font-semibold'>{i.title}</div>
                      {(i.risk_key || i.resolution) && (
                        <div className='max-w-[300px] truncate text-xs text-gray-500' title={i.resolution || ''}>
                          {i.risk_key ? `From risk ${i.risk_key}` : ''}
                          {i.resolution ? `${i.risk_key ? ' · ' : ''}Fixed: ${i.resolution}` : ''}
                        </div>
                      )}
                    </td>
                    {!project && <ProjectCell row={i} />}
                    <td className='px-3 py-2 text-center'>
                      <Chip tone={SEVERITY_TONE[i.severity]}>{i.severity}</Chip>
                    </td>
                    <td className='px-3 py-2 text-center'>
                      <Chip tone={ISSUE_STATUS_TONE[i.status]}>{i.status}</Chip>
                    </td>
                    <td className='pms-td-text px-3 py-2'>
                      {i.owner_name || <span className='text-amber-600'>No owner</span>}
                    </td>
                    <td className={`pms-td-text px-3 py-2 ${i.is_overdue ? '!text-red-600 font-semibold' : ''}`}>
                      {i.due_date ? formatDate(i.due_date) : '-'}
                    </td>
                    <td className='px-3 py-2'>
                      {i.task_id && i.task_key ? (
                        <Link href={taskDetailsPath(i.task_id)} className='hover:underline'>
                          <span className={`${ThemeStyles.listNoColor} text-[13px]`}>{i.task_key}</span>
                          <div className='text-xs text-gray-500'>{i.task_status}</div>
                        </Link>
                      ) : rights.fixTask && i.project_status !== 'Closed' && ['Open', 'In Progress'].includes(i.status) ? (
                        <GhostButton
                          onClick={() => run(createTask, { projectId: i.project_id, id: i.id }, 'Fix task created')}
                          disabled={isCreatingTask}
                          className='!px-2 !py-1 text-xs'
                        >
                          <Icon icon='tabler:plus' width={14} /> Create Fix Task
                        </GhostButton>
                      ) : (
                        <span className='text-gray-400'>-</span>
                      )}
                    </td>
                    <td className='px-3 py-2 text-center'>
                      {(rights.edit || rights.delete) && i.project_status !== 'Closed' ? (
                        <RowMenu
                          items={[
                            rights.edit && i.status !== 'Closed' && {
                              label: 'Edit',
                              icon: 'tabler:pencil',
                              onClick: () => setDrawer({ project: projectRef(project, i), issue: i })
                            },
                            ...(rights.edit ? i.next_statuses : []).map(s => ({
                              label: ISSUE_ACTION[s] || s,
                              icon: s === 'Resolved' ? 'tabler:circle-check' : 'tabler:arrows-exchange',
                              onClick: () =>
                                s === 'Resolved'
                                  ? setResolving(i)
                                  : run(changeStatus, { projectId: i.project_id, id: i.id, status: s }, `Moved to ${s}`)
                            })),
                            rights.delete && { label: 'Delete', icon: 'tabler:trash', danger: true, onClick: () => setDeleting(i) }
                          ]}
                        />
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pager}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------- change requests */

const ChangesPanel = ({ project, rights }) => {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const debounced = useDebouncedValue(search)
  const { data, isFetching } = useGetChangeRequestsQuery(
    project ? { projectId: project.id, scoped: true } : { search: debounced, status }
  )
  const [decide, { isLoading: isDeciding }] = useDecideChangeRequestMutation()
  const [withdraw, { isLoading: isWithdrawing }] = useWithdrawChangeRequestMutation()
  const [drawer, setDrawer] = useState(null)
  const [chooser, setChooser] = useState(false)
  const [deciding, setDeciding] = useState(null) // { change, approve }
  const [withdrawing, setWithdrawing] = useState(null)

  let rows = data?.detail || []
  if (project && debounced)
    rows = rows.filter(c => `${c.title} ${c.cr_key}`.toLowerCase().includes(debounced.toLowerCase()))
  if (project && status) rows = rows.filter(c => c.status === status)
  const sv = data?.stack_values || {}
  const { pageRows, pager } = usePagedRows(rows, { resetKey: `${debounced}|${status}` })

  const doDecide = async note => {
    try {
      const resp = await decide({
        projectId: deciding.change.project_id,
        id: deciding.change.id,
        approve: deciding.approve,
        note
      }).unwrap()
      toast.success(resp?.detail || 'Done')
      setDeciding(null)
    } catch {
      // The shared base query already showed why (e.g. your own request).
    }
  }

  return (
    <div>
      <ChooseProjectDialog
        open={chooser}
        title='New Change Request'
        onClose={() => setChooser(false)}
        onChoose={p => {
          setChooser(false)
          setDrawer({ project: p, change: null })
        }}
      />
      <ChangeDrawer
        open={Boolean(drawer)}
        onClose={() => setDrawer(null)}
        project={drawer?.project}
        change={drawer?.change || null}
      />
      <TextDialog
        open={Boolean(deciding)}
        title={deciding?.approve ? 'Approve change?' : 'Reject change?'}
        message={
          deciding
            ? deciding.approve
              ? `${deciding.change.cr_key}: its impact is applied to the project right away.`
              : `${deciding.change.cr_key} stays on record as Rejected.`
            : ''
        }
        label={deciding?.approve ? 'Note' : 'Reason'}
        placeholder={deciding?.approve ? 'e.g. Agreed with the client on the call' : 'Why it is rejected'}
        min={deciding?.approve ? 0 : 5}
        confirmText={deciding?.approve ? 'Approve' : 'Reject'}
        busy={isDeciding}
        onClose={() => setDeciding(null)}
        onConfirm={doDecide}
      />
      <ConfirmDialog
        open={Boolean(withdrawing)}
        onClose={() => setWithdrawing(null)}
        onConfirm={async () => {
          try {
            await withdraw({ projectId: withdrawing.project_id, id: withdrawing.id }).unwrap()
            toast.success('Change request withdrawn')
          } catch {
            // The shared base query already showed why.
          }
          setWithdrawing(null)
        }}
        title='Withdraw change request?'
        message={withdrawing ? `${withdrawing.cr_key} will be removed.` : ''}
        confirmText='Withdraw'
        cancelText='Cancel'
        busy={isWithdrawing}
      />

      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
        <StatCard
          icon='tabler:hourglass'
          tone='amber'
          label='Waiting'
          value={sv.status_counts?.Submitted || 0}
          hint='submitted, not decided'
        />
        <StatCard
          icon='tabler:circle-check'
          tone='emerald'
          label='Approved'
          value={sv.status_counts?.Approved || 0}
          hint={`${sv.status_counts?.Rejected || 0} rejected`}
        />
        <StatCard
          icon='tabler:coin-rupee'
          tone='violet'
          label='Approved Cost'
          value={inr(sv.approved_cost || 0)}
          hint='added to budgets / milestones'
        />
        <StatCard
          icon='tabler:calendar-plus'
          tone='blue'
          label='Approved Days'
          value={sv.approved_days || 0}
          hint='added to end dates'
        />
      </div>

      <div className={`${ThemeStyles.tableColor} rounded-md`}>
        <Toolbar
          search={search}
          setSearch={setSearch}
          placeholder='Search with Change, Key...'
          filters={
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className={`${ThemeStyles.formsInputsDropdown} md:max-w-[170px]`}
              aria-label='Status'
            >
              <option value=''>All Statuses</option>
              {['Submitted', 'Approved', 'Rejected'].map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          }
          action={
            rights.add && (
              <PrimaryButton onClick={() => (project ? setDrawer({ project, change: null }) : setChooser(true))}>
                New Change Request <PlusCircle size={16} />
              </PrimaryButton>
            )
          }
        />
        <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <table className='w-full min-w-[1000px] text-left text-sm'>
            <thead className={ThemeStyles.tableHeaderBg}>
              <tr>
                <Th>Change</Th>
                {!project && <Th>Project</Th>}
                <Th>Type</Th>
                <Th>Impact</Th>
                <Th center>Status</Th>
                <Th>Raised / Decided</Th>
                <Th center>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className='py-10 text-center text-slate-600'>
                    {isFetching
                      ? 'Loading...'
                      : project
                      ? 'No change requests. Log scope, cost or schedule changes here so they are approved, not just done.'
                      : 'No change requests match.'}
                  </td>
                </tr>
              ) : (
                pageRows.map(c => (
                  <tr key={c.id} className='border-t border-gray-200 hover:bg-gray-50/70'>
                    <td className='px-3 py-2'>
                      <span className={`${ThemeStyles.listNoColor} text-[13px]`}>{c.cr_key}</span>
                      <div className='pms-td-text max-w-[300px] font-semibold'>{c.title}</div>
                      <div className='max-w-[300px] truncate text-xs text-gray-500' title={c.reason}>
                        {c.reason}
                      </div>
                    </td>
                    {!project && <ProjectCell row={c} />}
                    <td className='pms-td-text px-3 py-2'>{c.change_type}</td>
                    <td className='pms-td-text px-3 py-2'>
                      {c.cost_impact ? (
                        <div className={c.cost_impact < 0 ? 'text-emerald-600' : ''}>
                          {c.cost_impact > 0 ? '+' : '-'}
                          {inr(Math.abs(c.cost_impact))}
                          {c.milestone_name ? (
                            <span className='text-xs text-gray-500'> on {c.milestone_name}</span>
                          ) : (
                            <span className='text-xs text-gray-500'> budget</span>
                          )}
                        </div>
                      ) : null}
                      {c.days_impact ? (
                        <div>
                          {c.days_impact > 0 ? '+' : ''}
                          {c.days_impact} days
                        </div>
                      ) : null}
                      {!c.cost_impact && !c.days_impact && <span className='text-gray-400'>Scope only</span>}
                    </td>
                    <td className='px-3 py-2 text-center' title={c.decision_note || ''}>
                      <Chip tone={CHANGE_STATUS_TONE[c.status]}>{c.status}</Chip>
                    </td>
                    <td className='px-3 py-2 text-xs text-gray-600'>
                      <div>By {c.raised_by_name || '-'}</div>
                      {c.decided_by_name && (
                        <div>
                          {c.status} by {c.decided_by_name}
                          {c.applied_summary ? (
                            <div className='max-w-[260px] truncate text-slate-700' title={c.applied_summary}>
                              {c.applied_summary}
                            </div>
                          ) : null}
                          {c.status === 'Rejected' && c.decision_note ? (
                            <div className='max-w-[260px] truncate text-red-600'>{c.decision_note}</div>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className='px-3 py-2 text-center'>
                      {c.project_status !== 'Closed' && c.status === 'Submitted' && ((rights.approve && !rights.isOwn(c)) || rights.isOwn(c)) ? (
                        <RowMenu
                          items={[
                            rights.approve && !rights.isOwn(c) && {
                              label: 'Approve',
                              icon: 'tabler:circle-check',
                              onClick: () => setDeciding({ change: c, approve: true })
                            },
                            rights.approve && !rights.isOwn(c) && {
                              label: 'Reject',
                              icon: 'tabler:circle-x',
                              onClick: () => setDeciding({ change: c, approve: false })
                            },
                            rights.isOwn(c) && {
                              label: 'Edit',
                              icon: 'tabler:pencil',
                              onClick: () => setDrawer({ project: projectRef(project, c), change: c })
                            },
                            rights.isOwn(c) && { label: 'Withdraw', icon: 'tabler:trash', danger: true, onClick: () => setWithdrawing(c) }
                          ]}
                        />
                      ) : (
                        <span className='text-gray-400'>-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pager}
      </div>
    </div>
  )
}

// mode: 'risks' | 'issues' | 'changes'. With `project`: that project's register (Project Details > Risks);
// without: every project (Risks & Issues screens in the sidebar).
// What the signed-in person may do here: each button follows the exact right the server checks.
const useRiskRights = project => {
  const can = useCan()
  const { me } = useMe()
  const open = !project || project.status !== 'Closed'

  return {
    add: open && can('risks', 'add'),
    edit: open && can('risks', 'edit'),
    delete: open && can('risks', 'delete'),
    approve: open && can('risks', 'approve'),
    fixTask: open && can('tasks', 'add'),
    // A change request is edited or withdrawn only by the person who raised it, and never approved by them.
    isOwn: c => open && Boolean(me?.user_id) && c.raised_by === me.user_id
  }
}

const RisksWorkspace = ({ mode, project }) => {
  const Panel = mode === 'issues' ? IssuesPanel : mode === 'changes' ? ChangesPanel : RisksPanel
  const rights = useRiskRights(project)

  return <Panel project={project} rights={rights} />
}

export default RisksWorkspace
