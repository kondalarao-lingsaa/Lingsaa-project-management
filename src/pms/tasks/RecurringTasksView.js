import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { PlusCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import PmsPage from 'src/pms/components/PmsPage'
import ConfirmDialog from 'src/pms/components/ConfirmDialog'
import StatCard from 'src/pms/components/StatCard'
import usePagedRows from 'src/pms/components/usePagedRows'
import useProjectPicker from 'src/pms/components/useProjectPicker'
import { Chip, formatDate, PRIORITY_TONE, PrimaryButton } from 'src/pms/components/ui'
import { useCan } from 'src/pms/access/useAccess'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { taskDetailsPath } from 'src/pms/tasks/paths'
import { projectDetailsPath } from 'src/pms/projects/ProjectsListView'
import {
  useDeleteRecurringTaskMutation,
  useGetRecurringTasksQuery,
  useSaveRecurringTaskMutation
} from 'src/store/apps/pms/automationApi'
import RecurringTaskDrawer, { formToPayload, ruleToForm } from './RecurringTaskDrawer'

const useDebouncedValue = (value, delay = 400) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(t)
  }, [value, delay])

  return debounced
}

// Tasks > Recurring Tasks: tasks created again on a schedule by the "Create recurring tasks" automation.
const RecurringTasksView = () => {
  const can = useCan()
  const { projectId, picker, ready } = useProjectPicker({ allowAll: true })
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput)
  const { data, isFetching } = useGetRecurringTasksQuery(
    { projectId: projectId || undefined, search: search.trim() || undefined },
    { skip: !ready }
  )
  const [save] = useSaveRecurringTaskMutation()
  const [remove, { isLoading: deleting }] = useDeleteRecurringTaskMutation()
  const [editing, setEditing] = useState(null) // {} = new, row = edit
  const [deletingRow, setDeletingRow] = useState(null)
  const rows = data?.detail || []
  const { pageRows, pager } = usePagedRows(rows)
  const canAdd = can('tasks', 'add')

  const active = rows.filter(r => r.is_active)
  const next = active.filter(r => r.next_run_on).sort((a, b) => a.next_run_on.localeCompare(b.next_run_on))[0]

  const toggle = async r => {
    try {
      const resp = await save({ id: r.id, body: { ...formToPayload(ruleToForm(r)), is_active: !r.is_active } }).unwrap()
      toast.success(resp.detail)
    } catch {
      // The shared error toast explains why.
    }
  }

  const btn = 'cursor-pointer rounded-md border px-2 py-1 text-xs font-semibold'

  return (
    <PmsPage
      screenId='tasks.recurring'
      actions={
        canAdd && (
          <PrimaryButton onClick={() => setEditing({})}>
            New Recurring Task <PlusCircle size={16} />
          </PrimaryButton>
        )
      }
    >
      <RecurringTaskDrawer
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        rule={editing?.id ? editing : null}
        projectId={!editing?.id && projectId ? projectId : undefined}
      />
      <ConfirmDialog
        open={Boolean(deletingRow)}
        onClose={() => setDeletingRow(null)}
        onConfirm={async () => {
          try {
            const resp = await remove(deletingRow.id).unwrap()
            toast.success(resp.detail)
          } catch {
            // shown by the shared error toast
          }
          setDeletingRow(null)
        }}
        title='Stop repeating this task?'
        message={deletingRow ? `'${deletingRow.title}' will no longer be created. The ${deletingRow.created_count} task(s) already created stay.` : ''}
        confirmText='Delete'
        cancelText='Cancel'
        busy={deleting}
      />

      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
        <StatCard icon='tabler:repeat' tone='indigo' label='Repeating' value={active.length} hint='active schedules' />
        <StatCard icon='tabler:player-pause' tone='amber' label='Paused or Ended' value={rows.length - active.length} hint='not creating tasks' />
        <StatCard icon='tabler:checklist' tone='emerald' label='Tasks Created' value={rows.reduce((n, r) => n + r.created_count, 0)} hint='so far, by automation' />
        <StatCard
          icon='tabler:calendar-event'
          tone='blue'
          label='Next Task'
          value={next ? formatDate(next.next_run_on) : '-'}
          hint={next ? next.title : 'nothing scheduled'}
        />
      </div>

      <div className={`${ThemeStyles.tableColor} rounded-md`}>
        <div className='flex flex-wrap items-center gap-3 p-3'>
          {picker}
          <input
            id='recurring_search'
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder='Search with task, project or assignee...'
            className={`${ThemeStyles.formsInputs} search-input text-gray-900 md:max-w-sm`}
            aria-label='Search recurring tasks'
          />
        </div>
        <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <table className='w-full min-w-[1000px] text-left text-sm'>
            <thead className={ThemeStyles.tableHeaderBg}>
              <tr>
                {['Task', 'Project', 'Repeats', 'Assignee', 'Next Task', 'Created', 'Status', 'Actions'].map(h => (
                  <th key={h} className={`${ThemeStyles.tableHeadCellsHeight} !px-3`}>
                    <div className='pms-th-text'>{h}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className='py-10 text-center text-slate-600'>
                    {isFetching || !ready
                      ? 'Loading...'
                      : 'No recurring tasks yet. Use New Recurring Task for work that comes back every day, week or month (a client call, a GST filing, a backup check).'}
                  </td>
                </tr>
              ) : (
                pageRows.map(r => (
                  <tr key={r.id} className='border-t border-gray-200 align-top hover:bg-gray-50/70' data-recurring={r.title}>
                    <td className='px-3 py-2'>
                      <div className='pms-td-text font-semibold'>{r.title}</div>
                      <div className='mt-0.5 flex flex-wrap items-center gap-1 text-xs text-gray-500'>
                        <Chip tone={PRIORITY_TONE[r.priority]}>{r.priority}</Chip>
                        {r.estimated_hours ? <span>{r.estimated_hours} h</span> : null}
                      </div>
                    </td>
                    <td className='px-3 py-2'>
                      <Link href={projectDetailsPath(r.project_id)} className='pms-td-text hover:underline'>
                        {r.project_code}
                      </Link>
                      <div className='max-w-[180px] truncate text-xs text-gray-500' title={r.project_name}>
                        {r.project_name}
                      </div>
                    </td>
                    <td className='px-3 py-2'>
                      <div className='pms-td-text'>{r.schedule_text}</div>
                      <div className='text-xs text-gray-500'>
                        due {r.due_in_days ? `${r.due_in_days} day${r.due_in_days === 1 ? '' : 's'} later` : 'same day'}
                        {r.end_date ? `, until ${formatDate(r.end_date)}` : ''}
                      </div>
                    </td>
                    <td className='pms-td-text px-3 py-2'>{r.assignee_name || 'Unassigned'}</td>
                    <td className='pms-td-text whitespace-nowrap px-3 py-2'>{r.next_run_on ? formatDate(r.next_run_on) : '-'}</td>
                    <td className='px-3 py-2'>
                      <div className='pms-td-text'>{r.created_count}x</div>
                      {r.last_task_id && (
                        <Link href={taskDetailsPath(r.last_task_id)} className='text-xs hover:underline' style={{ color: 'var(--theme-solid)' }}>
                          {r.last_task_key}
                        </Link>
                      )}
                    </td>
                    <td className='px-3 py-2'>
                      <Chip tone={r.is_active ? 'green' : 'slate'}>{r.is_active ? 'Active' : r.next_run_on === null && r.created_count ? 'Ended' : 'Paused'}</Chip>
                      {r.last_note && (
                        <div className='mt-1 max-w-[220px] text-xs text-amber-700' title={r.last_note}>
                          {r.last_note}
                        </div>
                      )}
                    </td>
                    <td className='px-3 py-2'>
                      {canAdd && (
                        <div className='flex flex-wrap gap-1'>
                          <button type='button' onClick={() => setEditing(r)} className={`${btn} border-gray-200 text-slate-700`} aria-label={`Edit ${r.title}`}>
                            Edit
                          </button>
                          <button type='button' onClick={() => toggle(r)} className={`${btn} border-gray-200 text-slate-700`} aria-label={`${r.is_active ? 'Pause' : 'Resume'} ${r.title}`}>
                            {r.is_active ? 'Pause' : 'Resume'}
                          </button>
                          {can('tasks', 'delete') && (
                            <button type='button' onClick={() => setDeletingRow(r)} className={`${btn} border-red-200 text-red-600`} aria-label={`Delete ${r.title}`}>
                              Delete
                            </button>
                          )}
                        </div>
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
    </PmsPage>
  )
}

export default RecurringTasksView
