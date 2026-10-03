import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Menu, MenuItem } from '@mui/material'
import { Edit, Eye, PlusCircle, Trash2, Ellipsis } from 'lucide-react'
import toast from 'react-hot-toast'
import PmsPage from 'src/pms/components/PmsPage'
import StatCard from 'src/pms/components/StatCard'
import PmsPagination from 'src/pms/components/PmsPagination'
import ConfirmDialog from 'src/pms/components/ConfirmDialog'
import ListToolbar, { useHiddenColumns } from 'src/pms/components/ListToolbar'
import { Chip, formatDate, NameAvatar, PrimaryButton, PRIORITY_TONE, TASK_STATUS_STYLE } from 'src/pms/components/ui'
import { taskDetailsPath } from 'src/pms/tasks/paths'
import { usePmsPermissions } from 'src/pms/adapters/permissions'
import { getScreen } from 'src/pms/config/pmsModules'
import { projectDetailsPath } from 'src/pms/projects/ProjectsListView'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import TaskDrawer from './TaskDrawer'
import { useGetProjectOptionsQuery } from 'src/store/apps/pms/projectsApi'
import { useChangeTaskStatusMutation, useDeleteTaskMutation, useGetTaskListQuery, useGetTaskMetaQuery } from 'src/store/apps/pms/tasksApi'


const useDebouncedValue = (value, delay = 600) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

// scope 'all' = every task, 'mine' = tasks assigned to me.
// projectId + embedded = the Tasks tab inside a project page: the same list, already filtered to that project.
const TasksListView = ({ screenId = 'tasks.allTasks', scope = 'all', subtitle, projectId, embedded = false }) => {
  const mine = scope === 'mine'
  const router = useRouter()
  const screen = getScreen(screenId)
  const { userPermissions } = usePmsPermissions(screen?.permissionName)

  const [pagination, setPagination] = useState({
    search: '',
    status: '',
    priority: '',
    projectFilter: '',
    sortBy: 'created_at',
    sortOrder: 'desc',
    currentPage: 1,
    itemsPerPage: 5
  })
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [anchorEl, setAnchorEl] = useState(null)
  const [menuRow, setMenuRow] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const activeProjectId = projectId || pagination.projectFilter || undefined
  const { data: listResp, isFetching } = useGetTaskListQuery({ ...pagination, projectId: activeProjectId, mine })
  const { data: metaResp } = useGetTaskMetaQuery()
  const { data: projectsResp } = useGetProjectOptionsQuery(undefined, { skip: Boolean(projectId) })
  const [changeStatus] = useChangeTaskStatusMutation()
  const [deleteTask, { isLoading: isDeleting }] = useDeleteTaskMutation()

  const rows = Array.isArray(listResp?.detail) ? listResp.detail : []
  const total = listResp?.stack_values?.count_pg || 0
  const counts = useMemo(() => listResp?.stack_values?.status_counts || {}, [listResp])
  const allCount = listResp?.stack_values?.all_count || 0
  const overdue = listResp?.stack_values?.overdue || 0
  const meta = metaResp?.detail
  const projects = Array.isArray(projectsResp?.detail) ? projectsResp.detail : []

  useEffect(() => {
    setPagination(prev => (prev.search === debouncedSearch ? prev : { ...prev, search: debouncedSearch, currentPage: 1 }))
  }, [debouncedSearch])

  // Sidebar "+" quick-add lands here with ?openCreate=1.
  useEffect(() => {
    if (!embedded && router.isReady && router.query.openCreate === '1' && userPermissions?.add) {
      setSelectedId(null)
      setDrawerOpen(true)
      router.replace(router.pathname, undefined, { shallow: true })
    }
  }, [embedded, router, router.isReady, router.query.openCreate, userPermissions?.add])

  const stats = useMemo(
    () => [
      { label: mine ? 'My Tasks' : 'Total Tasks', value: allCount, icon: 'tabler:checklist', tone: 'indigo' },
      { label: 'In Progress', value: counts['In Progress'] || 0, icon: 'tabler:loader', tone: 'blue' },
      { label: 'Done', value: counts.Done || 0, icon: 'tabler:circle-check', tone: 'emerald' },
      { label: 'Overdue', value: overdue, icon: 'tabler:alarm', tone: 'red' }
    ],
    [allCount, counts, overdue, mine]
  )

  const columns = [
    { key: 'task_key', label: 'Task', sortable: true, fixed: true },
    ...(projectId ? [] : [{ key: 'project', label: 'Project', sortable: true }]),
    { key: 'assignee_name', label: 'Assignee', sortable: true },
    { key: 'priority', label: 'Priority', sortable: true, align: 'center' },
    { key: 'status', label: 'Status', sortable: true, align: 'center' },
    { key: 'due_date', label: 'Due', sortable: true },
    { key: 'hours', label: 'Hours', align: 'right' },
    { key: 'actions', label: 'Actions', align: 'center', fixed: true }
  ]

  const [hiddenColumns, toggleColumn] = useHiddenColumns(`pms.columns.${screenId}${projectId ? '.project' : ''}`)
  const visibleColumns = columns.filter(col => col.fixed || !hiddenColumns.includes(col.key))

  const setFilter = (name, value) => setPagination(prev => ({ ...prev, [name]: value, currentPage: 1 }))

  const handleSort = key =>
    setPagination(prev => ({
      ...prev,
      sortBy: key,
      sortOrder: prev.sortBy === key && prev.sortOrder === 'asc' ? 'desc' : 'asc',
      currentPage: 1
    }))

  const closeMenu = () => {
    setAnchorEl(null)
    setMenuRow(null)
  }

  const openEdit = row => {
    setSelectedId(row.id)
    setDrawerOpen(true)
  }

  const handleStatus = async (row, status) => {
    try {
      const resp = await changeStatus({ id: row.id, status, projectId: row.project_id }).unwrap()
      toast.success(resp?.detail || 'Status updated')
    } catch {
      // The shared base query already showed the error.
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const resp = await deleteTask({ id: deleteTarget.id, projectId: deleteTarget.project_id }).unwrap()
      toast.success(resp?.detail || 'Task deleted')
      if (rows.length === 1 && pagination.currentPage > 1) setPagination(prev => ({ ...prev, currentPage: prev.currentPage - 1 }))
    } catch {
      // The shared base query already showed the error.
    } finally {
      setDeleteTarget(null)
    }
  }

  const renderCell = (row, col) => {
    switch (col.key) {
      case 'task_key':
        return (
          <div className='min-w-0'>
            <div className='flex items-center gap-2'>
              <Link href={taskDetailsPath(row.id)} className={ThemeStyles.listNoColor}>
                {row.task_key}
              </Link>
              {row.task_type !== 'Task' && <Chip tone='violet'>{row.task_type}</Chip>}
            </div>
            <Link href={taskDetailsPath(row.id)} className='block font-semibold hover:underline'>
              {row.title}
            </Link>
            {(row.parent_key || row.labels.length > 0 || row.subtask_count > 0) && (
              <div className='mt-0.5 flex flex-wrap items-center gap-1 text-xs text-gray-500'>
                {row.parent_key && <span>Subtask of {row.parent_key}</span>}
                {row.subtask_count > 0 && <span>{row.subtask_count} subtask{row.subtask_count > 1 ? 's' : ''}</span>}
                {row.labels.map(label => (
                  <span key={label} className='rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600'>
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      case 'project':
        return (
          <Link href={projectDetailsPath(row.project_id)} className='block min-w-0 hover:underline'>
            <div className='font-semibold'>{row.project_name}</div>
            <div className='text-xs text-gray-500'>{row.project_code}</div>
          </Link>
        )
      case 'assignee_name':
        return row.assignee_name ? (
          <div className='flex items-center gap-2'>
            <NameAvatar name={row.assignee_name} />
            <span>{row.assignee_name}</span>
          </div>
        ) : (
          <span className='text-gray-400'>Unassigned</span>
        )
      case 'priority':
        return <Chip tone={PRIORITY_TONE[row.priority]}>{row.priority}</Chip>
      case 'status':
        return (
          <select
            value={row.status}
            disabled={!userPermissions?.edit}
            onChange={e => handleStatus(row, e.target.value)}
            className={`cursor-pointer rounded-full border px-2 py-0.5 text-xs font-semibold focus:outline-none disabled:cursor-default ${TASK_STATUS_STYLE[row.status]}`}
          >
            {(meta?.statuses || [row.status]).map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )
      case 'due_date':
        return row.due_date ? (
          <div className='leading-tight'>
            <div className={row.is_overdue ? 'font-semibold text-red-600' : ''}>{formatDate(row.due_date)}</div>
            {row.is_overdue && <div className='text-[11px] font-medium text-red-500'>Overdue</div>}
          </div>
        ) : (
          <span className='text-gray-400'>-</span>
        )
      case 'hours':
        return row.estimated_hours === null && row.actual_hours === null ? (
          <span className='text-gray-400'>-</span>
        ) : (
          <span className='tabular-nums'>
            {row.actual_hours ?? 0} <span className='text-gray-400'>/ {row.estimated_hours ?? '-'}h</span>
          </span>
        )
      case 'actions':
        return <Ellipsis className={ThemeStyles.tableActionsIcon} onClick={e => { setAnchorEl(e.currentTarget); setMenuRow(row) }} />
      default:
        return row[col.key] || '-'
    }
  }

  const alignClass = align => (align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : '')
  const filtered = Boolean(pagination.search || pagination.status || pagination.priority || pagination.projectFilter)

  const addButton = userPermissions?.add ? (
    <PrimaryButton onClick={() => { setSelectedId(null); setDrawerOpen(true) }}>
      Add Task <PlusCircle size={16} />
    </PrimaryButton>
  ) : null

  const body = (
    <>
      <TaskDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} taskId={selectedId} projectId={projectId} meta={meta} mine={mine} />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title='Delete task?'
        message={deleteTarget ? `${deleteTarget.task_key} - ${deleteTarget.title} will be removed${deleteTarget.subtask_count ? ` along with its ${deleteTarget.subtask_count} subtask(s)` : ''}.` : ''}
        confirmText='Delete'
        cancelText='Cancel'
        busy={isDeleting}
      />

      {!embedded && subtitle && <p className='-mt-1 mb-3 text-sm text-gray-500'>{subtitle}</p>}

      {!embedded && (
        <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
          {stats.map(stat => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>
      )}

      <div className={`overflow-hidden rounded-lg ${ThemeStyles.tableColor}`}>
        {embedded && addButton && <div className='flex justify-end px-3 pt-3'>{addButton}</div>}

        <ListToolbar
          searchValue={searchInput}
          onSearch={setSearchInput}
          placeholder='Search with Task Name, Key, Assignee, Project...'
          activeFilterCount={(pagination.priority ? 1 : 0) + (!projectId && pagination.projectFilter ? 1 : 0)}
          columns={columns}
          hidden={hiddenColumns}
          onToggleColumn={toggleColumn}
          filterPanel={
            <>
              {!projectId && (
                <div className='w-full md:w-[30%] xl:w-[25%]'>
                  <span className={ThemeStyles.formLabels}>Project</span>
                  <select value={pagination.projectFilter} onChange={e => setFilter('projectFilter', e.target.value)} className={ThemeStyles.formsInputsDropdown}>
                    <option value=''>All Projects</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.project_code} - {p.project_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className='w-full md:w-[23%] xl:w-[23%] 2xl:w-[18%]'>
                <span className={ThemeStyles.formLabels}>Priority</span>
                <select value={pagination.priority} onChange={e => setFilter('priority', e.target.value)} className={ThemeStyles.formsInputsDropdown}>
                  <option value=''>All Priorities</option>
                  {(meta?.priorities || []).map(p => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </>
          }
        />

        <div className='flex flex-wrap gap-2 px-3 pb-3 pt-1'>
          {[['', 'All', allCount], ...(meta?.statuses || []).map(s => [s, s, counts[s] || 0])].map(([value, label, count]) => {
            const active = pagination.status === value

            return (
              <button
                key={label}
                type='button'
                onClick={() => setFilter('status', value)}
                className={`rounded-full border px-3 py-1 text-[13px] font-semibold transition ${active ? 'border-transparent text-white' : 'border-gray-300 bg-white text-slate-600 hover:bg-gray-50'}`}
                style={active ? { background: 'linear-gradient(to right, var(--theme-grad-start), var(--theme-grad-end))' } : undefined}
              >
                {label} <span className={active ? 'opacity-90' : 'text-gray-400'}>({count})</span>
              </button>
            )
          })}
        </div>

        <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <table className='w-full min-w-[980px] text-left text-sm'>
            <thead className={ThemeStyles.tableHeaderBg}>
              <tr>
                {visibleColumns.map(col => (
                  <th key={col.key} className={`${ThemeStyles.tableHeadCellsHeight} !px-3 ${col.sortable ? 'cursor-pointer select-none' : ''} ${col.key === 'actions' ? 'pms-sticky-head sticky right-0 z-[1]' : ''}`} onClick={() => col.sortable && handleSort(col.key)}>
                    <div className={`flex items-center gap-1 pms-th-text ${alignClass(col.align)}`}>
                      {col.label}
                      {pagination.sortBy === col.key && <span className='text-xs'>{pagination.sortOrder === 'asc' ? '▲' : '▼'}</span>}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map(row => (
                  <tr key={row.id} className='border-t border-gray-200 hover:bg-gray-50/70'>
                    {visibleColumns.map(col => (
                      <td key={col.key} className={`${ThemeStyles.tableBodyCellsHeight} !px-3 !text-nowrap !py-2 align-top pms-td-text ${col.key === 'actions' ? 'pms-sticky-cell sticky right-0' : ''}`}>
                        <div className={`flex ${alignClass(col.align)}`}>{renderCell(row, col)}</div>
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={visibleColumns.length} className='py-10 text-center text-slate-600'>
                    {isFetching
                      ? 'Loading tasks...'
                      : filtered
                        ? 'No tasks match your search or filters.'
                        : projectId
                          ? 'This project has no tasks yet. Add the first one.'
                          : mine
                            ? 'No tasks are assigned to you.'
                            : "You don't have any tasks yet, please create a new one."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PmsPagination
          pagination={pagination}
          handleChange={page => setPagination(prev => ({ ...prev, currentPage: page }))}
          handleipp={value => setPagination(prev => ({ ...prev, itemsPerPage: value, currentPage: 1 }))}
          total={total}
        />
      </div>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={closeMenu} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }} autoFocus={false}>
        <MenuItem
          className={ThemeStyles.actionMenuItem}
          onClick={() => {
            router.push(taskDetailsPath(menuRow.id))
            closeMenu()
          }}
        >
          <div className={ThemeStyles.actionMenuBox}>
            <Eye className={ThemeStyles.actionMenuIcon} />
            View
          </div>
        </MenuItem>
        {userPermissions?.edit && (
          <MenuItem
            className={ThemeStyles.actionMenuItem}
            onClick={() => {
              openEdit(menuRow)
              closeMenu()
            }}
          >
            <div className={ThemeStyles.actionMenuBox}>
              <Edit className={ThemeStyles.actionMenuIcon} />
              Edit
            </div>
          </MenuItem>
        )}
        {userPermissions?.delete && (
          <MenuItem
            className={ThemeStyles.actionMenuItem}
            onClick={() => {
              setDeleteTarget(menuRow)
              closeMenu()
            }}
          >
            <div className={`${ThemeStyles.actionMenuBox} text-red-600`}>
              <Trash2 className={`${ThemeStyles.actionMenuIcon} text-red-600`} />
              Delete
            </div>
          </MenuItem>
        )}
      </Menu>
    </>
  )

  return embedded ? body : <PmsPage screenId={screenId} actions={addButton}>{body}</PmsPage>
}

export default TasksListView
