import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Menu, MenuItem } from '@mui/material'
import { Edit, Ellipsis, PlusCircle, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import ConfirmDialog from 'src/pms/components/ConfirmDialog'
import { usePmsPermissions } from 'src/pms/adapters/permissions'
import { getScreen } from 'src/pms/config/pmsModules'
import PmsPage from 'src/pms/components/PmsPage'
import usePagedRows from 'src/pms/components/usePagedRows'
import StatCard from 'src/pms/components/StatCard'
import { Chip, formatDate, inr, PrimaryButton, ProgressBar } from 'src/pms/components/ui'
import { projectDetailsPath } from 'src/pms/projects/ProjectsListView'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import {
  useDeleteMilestoneMutation,
  useGetAllMilestonesQuery,
  useGetMilestoneMetaQuery
} from 'src/store/apps/pms/billingApi'
import { useGetProjectOptionsQuery } from 'src/store/apps/pms/projectsApi'
import ChooseProjectDialog from 'src/pms/components/ChooseProjectDialog'
import { MILESTONE_TONE } from './ProjectMilestonesTab'
import MilestoneDrawer from './MilestoneDrawer'

const useDebouncedValue = (value, delay = 500) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

// Every milestone of every project: what is due, what is waiting for client review, what can be billed.
const MilestonesOverviewView = ({ screenId = 'deliverables' }) => {
  const [status, setStatus] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput)
  const { data, isFetching } = useGetAllMilestonesQuery({ status, search })
  const { data: metaResp } = useGetMilestoneMetaQuery()

  // Same rules as Project Details > Milestones: needs edit permission; Accepted milestones and Closed projects are locked.
  const { userPermissions } = usePmsPermissions(getScreen('deliverables')?.permissionName)
  const canEdit = Boolean(userPermissions?.edit)
  const { data: projectsResp } = useGetProjectOptionsQuery()
  const projectOf = id => (projectsResp?.detail || []).find(p => p.id === id)
  const [deleteMilestone, { isLoading: isDeleting }] = useDeleteMilestoneMutation()

  // Add: choose the project first. Edit: the row's project. drawer = { project, milestone }.
  const [chooser, setChooser] = useState(false)
  const [drawer, setDrawer] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [anchorEl, setAnchorEl] = useState(null)
  const [menuRow, setMenuRow] = useState(null)
  const editable = m =>
    canEdit && m.status !== 'Accepted' && projectOf(m.project_id) && projectOf(m.project_id).status !== 'Closed'

  const remove = async () => {
    try {
      const resp = await deleteMilestone({ projectId: deleteTarget.project_id, milestoneId: deleteTarget.id }).unwrap()
      toast.success(resp?.detail || 'Milestone deleted')
    } catch {
      // The shared base query already showed why.
    } finally {
      setDeleteTarget(null)
    }
  }

  const rows = data?.detail || []
  const { pageRows, pager } = usePagedRows(rows, { resetKey: `${status}|${search}` })
  const sv = data?.stack_values || {}
  const counts = sv.status_counts || {}
  const statuses = metaResp?.detail?.statuses || Object.keys(MILESTONE_TONE)

  return (
    <PmsPage
      screenId={screenId}
      actions={
        canEdit && (
          <PrimaryButton onClick={() => setChooser(true)}>
            Add Milestone <PlusCircle size={16} />
          </PrimaryButton>
        )
      }
    >
      <ChooseProjectDialog
        open={chooser}
        title='Add Milestone'
        onClose={() => setChooser(false)}
        onChoose={project => {
          setChooser(false)
          setDrawer({ project, milestone: null })
        }}
      />
      <MilestoneDrawer
        open={Boolean(drawer)}
        onClose={() => setDrawer(null)}
        project={drawer?.project}
        milestone={drawer?.milestone || null}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title='Delete milestone?'
        message={deleteTarget ? `'${deleteTarget.name}' will be removed. Its tasks stay in the project.` : ''}
        confirmText='Delete'
        cancelText='Cancel'
        busy={isDeleting}
      />
      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
        <StatCard
          icon='tabler:flag'
          tone='indigo'
          label='Milestones'
          value={Object.values(counts).reduce((a, b) => a + b, 0)}
          hint='across all projects'
        />
        <StatCard
          icon='tabler:eye-check'
          tone='amber'
          label='Waiting for Review'
          value={counts['Ready for Review'] || 0}
          hint='ready for client sign-off'
        />
        <StatCard
          icon='tabler:alarm'
          tone='red'
          label='Overdue'
          value={sv.overdue || 0}
          hint='past due, not accepted'
        />
        <StatCard
          icon='tabler:circle-check'
          tone='emerald'
          label='Accepted Value'
          value={inr(sv.accepted_value || 0)}
          hint='signed off, billable'
        />
      </div>

      <div className={`${ThemeStyles.tableColor} rounded-md`}>
        <div className='flex flex-col gap-2 p-3 md:flex-row md:items-center'>
          <input
            type='text'
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder='Search with Milestone, Project...'
            className={`${ThemeStyles.formsInputs} search-input text-gray-900 md:max-w-sm`}
          />
        </div>
        <div className='flex flex-wrap gap-2 px-3 pb-3'>
          {[['', 'All'], ...statuses.map(s => [s, s])].map(([value, label]) => {
            const active = status === value

            return (
              <button
                key={label}
                type='button'
                onClick={() => setStatus(value)}
                className={`cursor-pointer rounded-full border px-3 py-1 text-[13px] font-semibold transition ${
                  active ? 'border-transparent text-white' : 'border-gray-300 bg-white text-slate-600 hover:bg-gray-50'
                }`}
                style={
                  active
                    ? { background: 'linear-gradient(to right, var(--theme-grad-start), var(--theme-grad-end))' }
                    : undefined
                }
              >
                {label}
              </button>
            )
          })}
        </div>

        <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <table className='w-full min-w-[1080px] text-left text-sm'>
            <thead className={ThemeStyles.tableHeaderBg}>
              <tr>
                {[
                  'Milestone',
                  'Project',
                  'Due',
                  'Progress',
                  'Deliverables',
                  'Amount',
                  'Status',
                  'Invoice',
                  'Actions'
                ].map(h => (
                  <th key={h} className={`${ThemeStyles.tableHeadCellsHeight} !px-3`}>
                    <div
                      className={`pms-th-text ${
                        h === 'Amount'
                          ? 'text-right'
                          : ['Status', 'Invoice', 'Actions'].includes(h)
                          ? 'text-center'
                          : ''
                      }`}
                    >
                      {h}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className='py-10 text-center text-slate-600'>
                    {isFetching ? 'Loading...' : 'No milestones match. Click Add Milestone to create one.'}
                  </td>
                </tr>
              ) : (
                pageRows.map(m => (
                  <tr key={m.id} className='border-t border-gray-200 hover:bg-gray-50/70'>
                    <td className='px-3 py-2'>
                      <Link
                        href={`${projectDetailsPath(m.project_id)}&tab=milestones`}
                        className='pms-td-text font-semibold hover:underline'
                      >
                        {m.name}
                      </Link>
                      {m.feedback && m.status === 'Changes Requested' && (
                        <div className='max-w-[260px] truncate text-xs text-red-600'>{m.feedback}</div>
                      )}
                    </td>
                    <td className='px-3 py-2'>
                      <span className={`${ThemeStyles.listNoColor} text-[13px]`}>{m.project_code}</span>
                      <div className='max-w-[220px] truncate text-xs text-gray-500'>{m.project_name}</div>
                    </td>
                    <td className={`pms-td-text px-3 py-2 ${m.is_overdue ? '!text-red-600 font-semibold' : ''}`}>
                      {formatDate(m.due_date)}
                    </td>
                    <td className='px-3 py-2'>
                      <div className='flex min-w-[120px] items-center gap-2'>
                        <div className='flex-1'>
                          <ProgressBar value={m.progress} />
                        </div>
                        <span className='text-xs font-semibold tabular-nums'>{m.progress}%</span>
                      </div>
                      <div className='text-xs text-gray-500'>
                        {m.tasks_done}/{m.task_count} tasks
                      </div>
                    </td>
                    <td className='pms-td-text px-3 py-2'>
                      {m.deliverables_done}/{m.deliverables.length}
                    </td>
                    <td className='pms-td-text px-3 py-2 text-right tabular-nums'>
                      {m.amount === null ? '-' : inr(m.amount)}
                    </td>
                    <td className='px-3 py-2 text-center'>
                      <Chip tone={MILESTONE_TONE[m.status]}>{m.status}</Chip>
                    </td>
                    <td className='px-3 py-2 text-center'>
                      {m.invoice ? (
                        <Chip tone={m.invoice.status === 'Paid' ? 'green' : 'blue'}>{m.invoice.invoice_no}</Chip>
                      ) : (
                        <span className='text-gray-400'>-</span>
                      )}
                    </td>
                    <td className='px-3 py-2 text-center'>
                      {editable(m) ? (
                        <button
                          type='button'
                          aria-label='Actions'
                          data-row-actions
                          onClick={e => {
                            setMenuRow(m)
                            setAnchorEl(e.currentTarget)
                          }}
                          className='cursor-pointer rounded-md p-1 text-slate-500 hover:bg-gray-100'
                        >
                          <Ellipsis size={18} />
                        </button>
                      ) : (
                        <span
                          className='text-xs text-gray-400'
                          title={m.status === 'Accepted' ? 'Accepted milestones are locked' : 'Locked'}
                        >
                          {m.status === 'Accepted' ? 'Locked' : '-'}
                        </span>
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

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)} autoFocus={false}>
        <MenuItem
          className={ThemeStyles.actionMenuItem}
          onClick={() => {
            setDrawer({ project: projectOf(menuRow.project_id), milestone: menuRow })
            setAnchorEl(null)
          }}
        >
          <div className={ThemeStyles.actionMenuBox}>
            <Edit className={ThemeStyles.actionMenuIcon} />
            Edit
          </div>
        </MenuItem>
        <MenuItem
          className={ThemeStyles.actionMenuItem}
          onClick={() => {
            setDeleteTarget(menuRow)
            setAnchorEl(null)
          }}
        >
          <div className={`${ThemeStyles.actionMenuBox} text-red-600`}>
            <Trash2 className={`${ThemeStyles.actionMenuIcon} text-red-600`} />
            Delete
          </div>
        </MenuItem>
      </Menu>
    </PmsPage>
  )
}

export default MilestonesOverviewView
