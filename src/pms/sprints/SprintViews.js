import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import { Icon } from '@iconify/react'
import { PlusCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import PmsPage from 'src/pms/components/PmsPage'
import StatCard from 'src/pms/components/StatCard'
import ConfirmDialog from 'src/pms/components/ConfirmDialog'
import useProjectPicker from 'src/pms/components/useProjectPicker'
import {
  Chip,
  formatDate,
  GhostButton,
  PrimaryButton,
  PRIORITY_TONE,
  ProgressBar,
  TaskStatusPill
} from 'src/pms/components/ui'
import { taskDetailsPath } from 'src/pms/tasks/paths'
import KanbanBoard from 'src/pms/tasks/KanbanBoard'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import {
  useAddSprintTasksMutation,
  useCompleteSprintMutation,
  useDeleteSprintMutation,
  useGetBacklogQuery,
  useGetBurndownQuery,
  useGetProjectSprintsQuery,
  useRemoveSprintTaskMutation,
  useStartSprintMutation
} from 'src/store/apps/pms/sprintsApi'
import { useGetTaskListQuery } from 'src/store/apps/pms/tasksApi'
import SprintDrawer from './SprintDrawer'

const SPRINT_TONE = { Planned: 'slate', Active: 'blue', Completed: 'green' }
const sprintsPath = (screen, projectId, sprintId) =>
  `/appModules/projects/sprints/${screen}/?projectId=${projectId}${sprintId ? `&sprintId=${sprintId}` : ''}`

const run = async (fn, args, fallback) => {
  try {
    const resp = await fn(args).unwrap()
    toast.success(resp?.detail || fallback)

    return true
  } catch {
    return false
  }
}

// Committed hours against the team's capacity for the sprint.
const LoadBar = ({ sprint }) => {
  const pct = sprint.load_pct
  const color = pct === null ? '#94a3b8' : pct > 100 ? '#dc2626' : pct >= 85 ? '#d97706' : '#22c55e'

  return (
    <div className='min-w-[160px]'>
      <div className='mb-1 flex justify-between text-xs text-gray-500'>
        <span>
          {sprint.committed_hours} h of {sprint.capacity_hours} h capacity
        </span>
        <span className='font-semibold' style={{ color }}>
          {pct === null ? 'no team' : `${pct}%`}
        </span>
      </div>
      <div className='h-2 overflow-hidden rounded-full bg-gray-100'>
        <div className='h-full rounded-full' style={{ width: `${Math.min(100, pct || 0)}%`, background: color }} />
      </div>
    </div>
  )
}

const CompleteDialog = ({ sprint, planned, onClose, onConfirm, busy }) => {
  const [target, setTarget] = useState('')
  useEffect(() => setTarget(planned[0] ? String(planned[0].id) : ''), [sprint]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!sprint) return null
  const unfinished = sprint.task_count - sprint.by_status.Done

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle className='!text-[17px] !font-semibold'>Complete {sprint.name}?</DialogTitle>
      <DialogContent>
        <p className='mb-3 text-sm text-gray-600'>
          {sprint.by_status.Done} of {sprint.task_count} tasks are done ({sprint.done_hours} of {sprint.committed_hours}{' '}
          estimated hours). The numbers are saved as this sprint&apos;s velocity.
        </p>
        {unfinished > 0 && (
          <>
            <span className={ThemeStyles.formLabels}>
              Move the {unfinished} unfinished task{unfinished === 1 ? '' : 's'} to
            </span>
            <select
              id='complete_target'
              value={target}
              onChange={e => setTarget(e.target.value)}
              className={`${ThemeStyles.formsInputsDropdown} mt-1`}
            >
              {planned.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({formatDate(p.start_date)} - {formatDate(p.end_date)})
                </option>
              ))}
              <option value=''>The backlog</option>
            </select>
          </>
        )}
      </DialogContent>
      <DialogActions className='!px-6 !pb-4'>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton onClick={() => onConfirm(target ? Number(target) : null)} disabled={busy}>
          <Icon icon='tabler:flag-check' width={16} /> Complete Sprint
        </PrimaryButton>
      </DialogActions>
    </Dialog>
  )
}

const useSprintActions = () => {
  const [start, { isLoading: starting }] = useStartSprintMutation()
  const [complete, { isLoading: completing }] = useCompleteSprintMutation()
  const [remove, { isLoading: deleting }] = useDeleteSprintMutation()

  return { start, complete, remove, busy: starting || completing || deleting }
}

/* -------------------------------------------------------------------------- Sprint List */

export const SprintListView = () => {
  const { projectId, project, picker } = useProjectPicker()
  const { data, isFetching } = useGetProjectSprintsQuery(projectId, { skip: !projectId })
  const actions = useSprintActions()
  const [drawer, setDrawer] = useState(null)
  const [completing, setCompleting] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const sprints = data?.detail || []
  const sv = data?.stack_values || {}
  const planned = sprints.filter(s => s.status === 'Planned')

  return (
    <PmsPage
      screenId='sprints.sprintList'
      actions={
        project && (
          <PrimaryButton onClick={() => setDrawer({ sprint: null })}>
            New Sprint <PlusCircle size={16} />
          </PrimaryButton>
        )
      }
    >
      <SprintDrawer
        open={Boolean(drawer)}
        onClose={() => setDrawer(null)}
        project={project}
        sprint={drawer?.sprint || null}
        sprints={sprints}
      />
      <CompleteDialog
        sprint={completing}
        planned={planned}
        onClose={() => setCompleting(null)}
        busy={actions.busy}
        onConfirm={async target =>
          (await run(actions.complete, { id: completing.id, moveToSprintId: target }, 'Sprint completed')) &&
          setCompleting(null)
        }
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await run(actions.remove, deleting.id, 'Sprint deleted')
          setDeleting(null)
        }}
        title='Delete sprint?'
        message={
          deleting ? `${deleting.name} is removed and its ${deleting.task_count} task(s) go back to the backlog.` : ''
        }
        confirmText='Delete'
        cancelText='Cancel'
        busy={actions.busy}
      />

      <div className='mb-3 flex flex-wrap items-center gap-2'>{picker}</div>
      {!projectId ? (
        <div className='py-10 text-center text-sm text-gray-500'>Pick a project.</div>
      ) : (
        <>
          <div className='mb-3 grid grid-cols-1 gap-3 xl:grid-cols-3'>
            <div className='grid grid-cols-2 gap-3 md:gap-4 xl:col-span-2'>
              <StatCard
                icon='tabler:run'
                tone='indigo'
                label='Sprints'
                value={sprints.length}
                hint={`${planned.length} planned`}
              />
              <StatCard
                icon='tabler:player-play'
                tone='blue'
                label='Active'
                value={sprints.find(s => s.status === 'Active')?.name || '-'}
                hint={
                  sprints.find(s => s.status === 'Active')
                    ? `${sprints.find(s => s.status === 'Active').days_left} days left`
                    : 'no sprint running'
                }
              />
              <StatCard
                icon='tabler:gauge'
                tone='emerald'
                label='Average Velocity'
                value={
                  sv.average_velocity === null || sv.average_velocity === undefined ? '-' : `${sv.average_velocity} h`
                }
                hint='estimated hours finished per sprint'
              />
              <StatCard
                icon='tabler:flag-check'
                tone='violet'
                label='Completed'
                value={sprints.filter(s => s.status === 'Completed').length}
                hint='sprints closed'
              />
            </div>
            <div className='h-[180px] rounded-xl border border-gray-200 bg-white p-3 shadow-sm'>
              {sv.velocity?.length ? (
                <ResponsiveContainer initialDimension={{ width: 320, height: 200 }} width='100%' height='100%'>
                  <BarChart data={sv.velocity}>
                    <CartesianGrid strokeDasharray='3 3' vertical={false} />
                    <XAxis dataKey='name' tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={v => `${v} h`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar
                      dataKey='committed'
                      name='Committed'
                      fill='#cbd5e1'
                      maxBarSize={36}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey='completed'
                      name='Completed'
                      fill='var(--theme-solid)'
                      maxBarSize={36}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className='flex h-full items-center justify-center text-center text-xs text-gray-500'>
                  Velocity appears after the first sprint is completed.
                </div>
              )}
            </div>
          </div>

          <div
            className={`${ThemeStyles.tableColor} overflow-x-auto rounded-md transition-opacity ${
              isFetching ? 'opacity-60' : ''
            }`}
          >
            <table className='w-full min-w-[1000px] text-left text-sm'>
              <thead className={ThemeStyles.tableHeaderBg}>
                <tr>
                  {['Sprint', 'Dates', 'Status', 'Progress', 'Load', 'Tasks', 'Actions'].map(h => (
                    <th key={h} className={`${ThemeStyles.tableHeadCellsHeight} !px-3`}>
                      <div className='pms-th-text'>{h}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sprints.length === 0 ? (
                  <tr>
                    <td colSpan={7} className='py-10 text-center text-slate-600'>
                      {isFetching
                        ? 'Loading...'
                        : 'No sprints yet. Create the first sprint, then pick its tasks in Sprint Planning.'}
                    </td>
                  </tr>
                ) : (
                  sprints.map(s => (
                    <tr key={s.id} className='border-t border-gray-200 hover:bg-gray-50/70'>
                      <td className='px-3 py-2'>
                        <span className={`${ThemeStyles.listNoColor} text-[13px]`}>{s.sprint_key}</span>
                        <div className='pms-td-text font-semibold'>{s.name}</div>
                        {s.goal && (
                          <div className='max-w-[280px] truncate text-xs text-gray-500' title={s.goal}>
                            {s.goal}
                          </div>
                        )}
                      </td>
                      <td className='px-3 py-2 text-xs text-gray-600'>
                        {formatDate(s.start_date)} - {formatDate(s.end_date)}
                        <div>
                          {s.working_days} working days{s.days_left !== null ? ` · ${s.days_left} left` : ''}
                        </div>
                      </td>
                      <td className='px-3 py-2'>
                        <Chip tone={s.is_overdue ? 'red' : SPRINT_TONE[s.status]}>
                          {s.is_overdue ? 'Past end date' : s.status}
                        </Chip>
                      </td>
                      <td className='px-3 py-2'>
                        <div className='flex min-w-[120px] items-center gap-2'>
                          <div className='flex-1'>
                            <ProgressBar value={s.progress} />
                          </div>
                          <span className='text-xs font-semibold'>{s.progress}%</span>
                        </div>
                      </td>
                      <td className='px-3 py-2'>
                        <LoadBar sprint={s} />
                      </td>
                      <td className='pms-td-text px-3 py-2'>
                        {s.completed_tasks} / {s.committed_tasks} done
                      </td>
                      <td className='px-3 py-2'>
                        <div className='flex flex-wrap gap-1'>
                          {s.status !== 'Completed' && (
                            <Link
                              href={sprintsPath('sprintPlanning', projectId, s.id)}
                              className='rounded-md border border-gray-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:border-[var(--theme-solid)]'
                            >
                              Plan
                            </Link>
                          )}
                          {s.status === 'Active' && (
                            <Link
                              href={sprintsPath('sprintBoard', projectId, s.id)}
                              className='rounded-md border border-gray-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:border-[var(--theme-solid)]'
                            >
                              Board
                            </Link>
                          )}
                          {s.status === 'Planned' && (
                            <button
                              type='button'
                              onClick={() => run(actions.start, s.id, 'Sprint started')}
                              className='cursor-pointer rounded-md px-2 py-1 text-xs font-semibold text-white'
                              style={{ background: 'var(--theme-solid)' }}
                            >
                              Start
                            </button>
                          )}
                          {s.status === 'Active' && (
                            <button
                              type='button'
                              onClick={() => setCompleting(s)}
                              className='cursor-pointer rounded-md px-2 py-1 text-xs font-semibold text-white'
                              style={{ background: '#16a34a' }}
                            >
                              Complete
                            </button>
                          )}
                          {s.status !== 'Completed' && (
                            <button
                              type='button'
                              onClick={() => setDrawer({ sprint: s })}
                              className='cursor-pointer rounded-md border border-gray-200 px-2 py-1 text-xs font-semibold text-slate-700'
                              aria-label={`Edit ${s.name}`}
                            >
                              Edit
                            </button>
                          )}
                          {s.status === 'Planned' && (
                            <button
                              type='button'
                              onClick={() => setDeleting(s)}
                              className='cursor-pointer rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-600'
                              aria-label={`Delete ${s.name}`}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PmsPage>
  )
}

/* ---------------------------------------------------------------------- Sprint Planning */

const TaskLine = ({ t, selected, onToggle, action }) => (
  <li className='flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2'>
    {onToggle && (
      <input
        type='checkbox'
        checked={selected}
        onChange={onToggle}
        className='h-4 w-4 cursor-pointer accent-[var(--theme-solid)]'
        aria-label={`Select ${t.task_key}`}
      />
    )}
    <div className='min-w-0 flex-1'>
      <Link
        href={taskDetailsPath(t.id)}
        className='block truncate text-[13px] font-semibold text-slate-800 hover:underline'
        title={t.title}
      >
        {t.parent_key && <span className='text-gray-400'>↳ </span>}
        {t.title}
      </Link>
      <div className='flex flex-wrap items-center gap-2 text-[11px] text-gray-500'>
        <span>{t.task_key}</span>
        <Chip tone={PRIORITY_TONE[t.priority]}>{t.priority}</Chip>
        <span>
          {t.estimated_hours ? `${t.estimated_hours} h` : <span className='text-amber-600'>not estimated</span>}
        </span>
        {t.assignee_name && <span>{t.assignee_name}</span>}
      </div>
    </div>
    {t.status && t.status !== 'To Do' && <TaskStatusPill status={t.status} />}
    {action}
  </li>
)

export const SprintPlanningView = ({ backlogOnly = false }) => {
  const { projectId, project, picker } = useProjectPicker()
  const { data: sprintsResp } = useGetProjectSprintsQuery(projectId, { skip: !projectId })
  const { data: backlogResp, isFetching: loadingBacklog } = useGetBacklogQuery(projectId, { skip: !projectId })
  const [add, { isLoading: adding }] = useAddSprintTasksMutation()
  const [remove] = useRemoveSprintTaskMutation()
  const [sprintId, setSprintId] = useState('')
  const [selected, setSelected] = useState([])
  const [drawerOpen, setDrawerOpen] = useState(false)

  const sprints = sprintsResp?.detail || []
  const open = sprints.filter(s => s.status !== 'Completed')
  const sprint = open.find(s => String(s.id) === sprintId)
  const backlog = backlogResp?.detail || []

  // Pick the sprint from the link (?sprintId=), else the next planned one, else the active one.
  useEffect(() => {
    if (!open.length || open.some(s => String(s.id) === sprintId)) return
    const fromUrl = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sprintId')
    const initial = open.find(s => String(s.id) === fromUrl) || open.find(s => s.status === 'Planned') || open[0]
    setSprintId(String(initial.id))
  }, [open, sprintId])
  useEffect(() => setSelected([]), [projectId])

  const { data: sprintTasksResp } = useGetTaskListQuery(
    { projectId, sprintId: sprint?.id, itemsPerPage: 1000, currentPage: 1, sortBy: 'priority', sortOrder: 'asc' },
    { skip: !projectId || !sprint }
  )
  const inSprint = useMemo(
    () => (sprintTasksResp?.detail || []).filter(t => sprint && t.sprint_id === sprint.id),
    [sprintTasksResp, sprint]
  )
  const selectedHours = backlog.filter(t => selected.includes(t.id)).reduce((n, t) => n + (t.estimated_hours || 0), 0)

  const addSelected = async () => {
    if (!sprint) return toast.error('Please Select a Sprint')
    if (!selected.length) return toast.error('Please Select at least one task from the backlog')
    if (await run(add, { id: sprint.id, taskIds: selected }, 'Added')) setSelected([])
  }

  const screenId = backlogOnly ? 'tasks.backlog' : 'sprints.sprintPlanning'

  return (
    <PmsPage screenId={screenId}>
      {project && (
        <SprintDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          project={project}
          sprint={null}
          sprints={sprints}
        />
      )}
      <div className='mb-3 flex flex-wrap items-center gap-2'>
        {picker}
        {projectId && (
          <select
            id='planning_sprint'
            value={sprintId}
            onChange={e => {
              setSprintId(e.target.value)
              setSelected([])
            }}
            className={`${ThemeStyles.formsInputsDropdown} md:max-w-xs`}
            aria-label='Sprint'
          >
            {!open.length && <option value=''>No open sprint</option>}
            {open.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </select>
        )}
        {project && (
          <GhostButton onClick={() => setDrawerOpen(true)}>
            <Icon icon='tabler:plus' width={16} /> New Sprint
          </GhostButton>
        )}
      </div>

      {!projectId ? (
        <div className='py-10 text-center text-sm text-gray-500'>Pick a project.</div>
      ) : (
        <div className={`grid grid-cols-1 gap-4 ${backlogOnly ? '' : 'xl:grid-cols-2'}`}>
          <section className='rounded-xl border border-gray-200 bg-gray-50 p-3'>
            <div className='mb-2 flex flex-wrap items-center gap-2'>
              <div>
                <div className='text-[15px] font-semibold text-slate-800'>Backlog</div>
                <div className='text-xs text-gray-500'>
                  {backlog.length} open task{backlog.length === 1 ? '' : 's'} not in a sprint ·{' '}
                  {backlogResp?.stack_values?.estimated_hours || 0} h estimated
                  {backlogResp?.stack_values?.unestimated
                    ? ` · ${backlogResp.stack_values.unestimated} not estimated`
                    : ''}
                </div>
              </div>
              <PrimaryButton onClick={addSelected} disabled={adding || !sprint} className='ms-auto'>
                Add {selected.length || ''} to {sprint ? sprint.name : 'sprint'}{' '}
                <Icon icon='tabler:arrow-right' width={16} />
              </PrimaryButton>
            </div>
            {selected.length > 0 && sprint && (
              <div className='mb-2 text-xs text-gray-600'>
                Selected: {selectedHours} h → {sprint.name} would be at{' '}
                {sprint.capacity_hours
                  ? Math.round(((sprint.committed_hours + selectedHours) / sprint.capacity_hours) * 100)
                  : '?'}
                % of capacity
              </div>
            )}
            <ul className='flex max-h-[560px] flex-col gap-2 overflow-y-auto'>
              {backlog.map(t => (
                <TaskLine
                  key={t.id}
                  t={t}
                  selected={selected.includes(t.id)}
                  onToggle={() =>
                    setSelected(prev => (prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id]))
                  }
                />
              ))}
              {backlog.length === 0 && (
                <li className='py-8 text-center text-sm text-gray-500'>
                  {loadingBacklog ? 'Loading...' : 'The backlog is empty - every open task is in a sprint.'}
                </li>
              )}
            </ul>
          </section>

          {!backlogOnly && (
            <section className='rounded-xl border border-gray-200 bg-white p-3 shadow-sm'>
              {!sprint ? (
                <div className='py-10 text-center text-sm text-gray-500'>Create a sprint to plan it.</div>
              ) : (
                <>
                  <div className='mb-2 flex flex-wrap items-center gap-2'>
                    <div className='min-w-0'>
                      <div className='text-[15px] font-semibold text-slate-800'>
                        {sprint.name} <Chip tone={SPRINT_TONE[sprint.status]}>{sprint.status}</Chip>
                      </div>
                      <div className='text-xs text-gray-500'>
                        {formatDate(sprint.start_date)} - {formatDate(sprint.end_date)} · {sprint.working_days} working
                        days
                      </div>
                    </div>
                  </div>
                  {sprint.goal && (
                    <div className='mb-2 rounded-lg bg-gray-50 px-3 py-2 text-[13px] text-slate-700'>
                      Goal: {sprint.goal}
                    </div>
                  )}
                  <div className='mb-3'>
                    <LoadBar sprint={sprint} />
                    {sprint.load_pct > 100 && (
                      <div className='mt-1 text-xs font-semibold text-red-600'>
                        Over capacity - the team is unlikely to finish all of this. Move something back to the backlog.
                      </div>
                    )}
                    {sprint.unestimated > 0 && (
                      <div className='mt-1 text-xs text-amber-600'>
                        {sprint.unestimated} task(s) have no estimate, so the load may be higher.
                      </div>
                    )}
                  </div>
                  <ul className='flex max-h-[520px] flex-col gap-2 overflow-y-auto'>
                    {inSprint.map(t => (
                      <TaskLine
                        key={t.id}
                        t={t}
                        action={
                          !t.parent_task_id && (
                            <button
                              type='button'
                              onClick={() => run(remove, { id: sprint.id, taskId: t.id }, 'Moved to backlog')}
                              className='cursor-pointer text-gray-400 hover:text-red-600'
                              aria-label={`Remove ${t.task_key}`}
                              title='Back to the backlog'
                            >
                              <Icon icon='tabler:arrow-back-up' width={18} />
                            </button>
                          )
                        }
                      />
                    ))}
                    {inSprint.length === 0 && (
                      <li className='py-8 text-center text-sm text-gray-500'>
                        Nothing planned yet. Tick tasks in the backlog and click Add.
                      </li>
                    )}
                  </ul>
                </>
              )}
            </section>
          )}
        </div>
      )}
    </PmsPage>
  )
}

export const BacklogView = () => <SprintPlanningView backlogOnly />

/* ------------------------------------------------------------------------- Sprint Board */

export const SprintBoardView = () => {
  const { projectId, picker } = useProjectPicker()
  const { data } = useGetProjectSprintsQuery(projectId, { skip: !projectId })
  const actions = useSprintActions()
  const [completing, setCompleting] = useState(null)
  const sprints = data?.detail || []
  const [sprintId, setSprintId] = useState('')
  const choices = sprints.filter(s => s.status !== 'Planned')
  const sprint = choices.find(s => String(s.id) === sprintId)

  useEffect(() => {
    if (!choices.length || choices.some(s => String(s.id) === sprintId)) return
    const fromUrl = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sprintId')
    const initial =
      choices.find(s => String(s.id) === fromUrl) ||
      choices.find(s => s.status === 'Active') ||
      choices[choices.length - 1]
    setSprintId(String(initial.id))
  }, [choices, sprintId])

  const { data: burnResp } = useGetBurndownQuery(sprint?.id, { skip: !sprint })
  const burn = burnResp?.detail

  return (
    <PmsPage screenId='sprints.sprintBoard'>
      <CompleteDialog
        sprint={completing}
        planned={sprints.filter(s => s.status === 'Planned')}
        onClose={() => setCompleting(null)}
        busy={actions.busy}
        onConfirm={async target =>
          (await run(actions.complete, { id: completing.id, moveToSprintId: target }, 'Sprint completed')) &&
          setCompleting(null)
        }
      />
      <div className='mb-3 flex flex-wrap items-center gap-2'>
        {picker}
        {projectId && (
          <select
            id='board_sprint'
            value={sprintId}
            onChange={e => setSprintId(e.target.value)}
            className={`${ThemeStyles.formsInputsDropdown} md:max-w-xs`}
            aria-label='Sprint'
          >
            {!choices.length && <option value=''>No started sprint</option>}
            {choices.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </select>
        )}
      </div>
      {!sprint ? (
        <div className='py-10 text-center text-sm text-gray-500'>
          {projectId ? (
            <>
              No sprint has started yet.{' '}
              <Link
                href={sprintsPath('sprintList', projectId)}
                className='font-semibold hover:underline'
                style={{ color: 'var(--theme-solid)' }}
              >
                Go to Sprint List
              </Link>
            </>
          ) : (
            'Pick a project.'
          )}
        </div>
      ) : (
        <>
          <div className='mb-3 grid grid-cols-1 gap-3 xl:grid-cols-3'>
            <div className='rounded-xl border border-gray-200 bg-white p-4 shadow-sm'>
              <div className='flex items-center gap-2'>
                <span className='text-[16px] font-semibold text-slate-800'>{sprint.name}</span>
                <Chip tone={sprint.is_overdue ? 'red' : SPRINT_TONE[sprint.status]}>
                  {sprint.is_overdue ? 'Past end date' : sprint.status}
                </Chip>
              </div>
              <div className='mt-1 text-xs text-gray-500'>
                {formatDate(sprint.start_date)} - {formatDate(sprint.end_date)}
                {sprint.days_left !== null ? ` · ${sprint.days_left} days left` : ''}
              </div>
              {sprint.goal && <div className='mt-2 text-[13px] text-slate-700'>Goal: {sprint.goal}</div>}
              <div className='mt-3'>
                <div className='mb-1 flex justify-between text-xs text-gray-500'>
                  <span>
                    {sprint.completed_tasks} / {sprint.committed_tasks} tasks · {sprint.done_hours} /{' '}
                    {sprint.committed_hours} h
                  </span>
                  <span className='font-semibold'>{sprint.progress}%</span>
                </div>
                <ProgressBar value={sprint.progress} />
              </div>
              {sprint.status === 'Active' && (
                <PrimaryButton onClick={() => setCompleting(sprint)} className='mt-3'>
                  <Icon icon='tabler:flag-check' width={16} /> Complete Sprint
                </PrimaryButton>
              )}
            </div>
            <div className='h-[220px] rounded-xl border border-gray-200 bg-white p-3 shadow-sm xl:col-span-2'>
              {burn && burn.total > 0 ? (
                <ResponsiveContainer initialDimension={{ width: 320, height: 200 }} width='100%' height='100%'>
                  <LineChart data={burn.points.map(p => ({ ...p, label: formatDate(p.date).slice(0, 6) }))}>
                    <CartesianGrid strokeDasharray='3 3' vertical={false} />
                    <XAxis dataKey='label' tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={v => (v === null ? '-' : `${v} h`)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type='linear'
                      dataKey='ideal'
                      name='Ideal'
                      stroke='#94a3b8'
                      strokeDasharray='5 4'
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type='linear'
                      dataKey='remaining'
                      name='Remaining'
                      stroke='var(--theme-solid)'
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className='flex h-full items-center justify-center text-center text-xs text-gray-500'>
                  The burndown needs estimated hours on the sprint&apos;s tasks.
                </div>
              )}
            </div>
          </div>
          <KanbanBoard embedded projectId={Number(projectId)} sprintId={sprint.id} />
        </>
      )}
    </PmsPage>
  )
}
