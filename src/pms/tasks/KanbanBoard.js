import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Icon } from '@iconify/react'
import { PlusCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import PmsPage from 'src/pms/components/PmsPage'
import { Chip, formatDate, NameAvatar, PrimaryButton, PRIORITY_TONE, TASK_STATUS_DOT } from 'src/pms/components/ui'
import { usePmsPermissions } from 'src/pms/adapters/permissions'
import { getScreen } from 'src/pms/config/pmsModules'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useGetProjectOptionsQuery } from 'src/store/apps/pms/projectsApi'
import { useGetTaskBoardQuery, useGetTaskMetaQuery, useMoveTaskMutation } from 'src/store/apps/pms/tasksApi'
import { useGetProjectMembersQuery } from 'src/store/apps/pms/teamApi'
import TaskDrawer from './TaskDrawer'
import { taskDetailsPath } from './paths'

const SCREEN_ID = 'tasks.kanban'

const useDebouncedValue = (value, delay = 500) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

const TaskCard = ({ task, canEdit, statuses, onDragStart, onDragEnd, dragging, onMove, onEdit, showProject }) => (
  <div
    data-card-id={task.id}
    draggable={canEdit}
    onDragStart={e => onDragStart(e, task)}
    onDragEnd={onDragEnd}
    className={`group rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition ${
      canEdit ? 'cursor-grab active:cursor-grabbing' : ''
    } ${dragging ? 'opacity-40' : 'hover:shadow-md'}`}
  >
    <div className='mb-1 flex items-center justify-between gap-2'>
      <Link href={taskDetailsPath(task.id)} className={`${ThemeStyles.listNoColor} text-[13px]`} draggable={false}>
        {task.task_key}
      </Link>
      <div className='flex items-center gap-1'>
        {canEdit && (
          <button
            type='button'
            onClick={() => onEdit(task)}
            draggable={false}
            aria-label={`Edit ${task.task_key}`}
            title='Edit task'
            data-card-edit
            className='cursor-pointer rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-[var(--theme-solid)] lg:opacity-0 lg:group-hover:opacity-100'
          >
            <Icon icon='tabler:pencil' width={15} />
          </button>
        )}
        <Chip tone={PRIORITY_TONE[task.priority]}>{task.priority}</Chip>
      </div>
    </div>
    <Link
      href={taskDetailsPath(task.id)}
      draggable={false}
      className='block break-words text-[14px] font-semibold text-slate-800 hover:underline'
    >
      {task.title}
    </Link>
    {showProject && <div className='mt-0.5 truncate text-xs text-gray-500'>{task.project_name}</div>}

    {(task.labels.length > 0 || task.task_type !== 'Task') && (
      <div className='mt-2 flex flex-wrap gap-1'>
        {task.task_type !== 'Task' && <Chip tone='violet'>{task.task_type}</Chip>}
        {task.labels.slice(0, 3).map(label => (
          <span key={label} className='rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600'>
            {label}
          </span>
        ))}
      </div>
    )}

    <div className='mt-3 flex items-center justify-between gap-2'>
      <div className='flex min-w-0 items-center gap-3 text-xs text-gray-500'>
        {task.due_date && (
          <span
            className={`inline-flex items-center gap-1 ${task.is_overdue ? 'font-semibold text-red-600' : ''}`}
            title='Due date'
          >
            <Icon icon='tabler:calendar' width={14} />
            {formatDate(task.due_date)}
          </span>
        )}
        {task.subtask_count > 0 && (
          <span className='inline-flex items-center gap-1' title='Subtasks'>
            <Icon icon='tabler:subtask' width={14} />
            {task.subtask_count}
          </span>
        )}
      </div>
      {task.assignee_name ? (
        <span title={task.assignee_name}>
          <NameAvatar name={task.assignee_name} />
        </span>
      ) : (
        <span className='text-xs text-gray-400'>Unassigned</span>
      )}
    </div>

    {/* Touch screens cannot drag, so every card can also be moved from here. */}
    {canEdit && (
      <select
        aria-label={`Move ${task.task_key}`}
        value={task.status}
        onChange={e => onMove(task, e.target.value)}
        className='mt-2 w-full cursor-pointer rounded-md border border-gray-200 bg-transparent px-2 py-1 text-xs text-gray-500 lg:hidden'
      >
        {statuses.map(s => (
          <option key={s} value={s}>
            Move to: {s}
          </option>
        ))}
      </select>
    )}
  </div>
)

// sprintId (optional) limits the board to one sprint (Sprints > Sprint Board).
const KanbanBoard = ({ projectId, sprintId, embedded = false }) => {
  const router = useRouter()
  const screen = getScreen(SCREEN_ID)
  const { userPermissions } = usePmsPermissions(screen?.permissionName)
  const canEdit = Boolean(userPermissions?.edit)

  // Standalone board: the project filter can come from the URL (?projectId=), e.g. from a project page.
  const [projectFilter, setProjectFilter] = useState('')
  useEffect(() => {
    if (!embedded && router.isReady && router.query.projectId) setProjectFilter(String(router.query.projectId))
  }, [embedded, router.isReady, router.query.projectId])

  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput)
  const [priority, setPriority] = useState('')
  const [mine, setMine] = useState(false)
  const [assignee, setAssignee] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editTaskId, setEditTaskId] = useState(null)

  const activeProject = projectId || projectFilter || undefined
  const {
    data: boardResp,
    isFetching,
    refetch
  } = useGetTaskBoardQuery({ projectId: activeProject, search, priority, mine, assignee, sprintId })
  // With one project on screen, the board can be filtered by its team members.
  const { data: membersResp } = useGetProjectMembersQuery(activeProject, { skip: !activeProject })
  const members = activeProject ? membersResp?.detail || [] : []
  useEffect(() => setAssignee(''), [activeProject])
  const { data: metaResp } = useGetTaskMetaQuery()
  const { data: projectsResp } = useGetProjectOptionsQuery(undefined, { skip: embedded })
  const [moveTask] = useMoveTaskMutation()

  const meta = metaResp?.detail
  const statuses = meta?.statuses || ['To Do', 'In Progress', 'Testing', 'Done']
  const projects = Array.isArray(projectsResp?.detail) ? projectsResp.detail : []

  // Local copy so a dropped card moves instantly; the server's answer replaces it (or restores it on error).
  const [columns, setColumns] = useState({})
  useEffect(() => {
    if (boardResp?.detail) setColumns(Object.fromEntries(boardResp.detail.map(col => [col.status, col.tasks])))
  }, [boardResp])

  const [dragged, setDragged] = useState(null)
  const [dropTarget, setDropTarget] = useState(null) // { status, index }
  const columnRefs = useRef({})

  const total = boardResp?.stack_values?.count_pg || 0
  const truncated = boardResp?.stack_values?.truncated

  const indexFromPointer = (status, clientY) => {
    const cards = [...(columnRefs.current[status]?.querySelectorAll('[data-card-id]') || [])].filter(
      el => Number(el.dataset.cardId) !== dragged?.id
    )
    const index = cards.findIndex(el => {
      const box = el.getBoundingClientRect()

      return clientY < box.top + box.height / 2
    })

    return index === -1 ? cards.length : index
  }

  const commitMove = async (task, status, index) => {
    const target = (columns[status] || []).filter(t => t.id !== task.id)
    const at = index ?? target.length
    const prev = target[at - 1]
    const next = target[at]
    if (task.status === status && columns[status]?.[at] === task) return

    const snapshot = columns
    const moved = { ...task, status }
    setColumns(prevCols => {
      const nextCols = Object.fromEntries(
        Object.entries(prevCols).map(([key, list]) => [key, list.filter(t => t.id !== task.id)])
      )
      const list = [...(nextCols[status] || [])]
      list.splice(at, 0, moved)
      nextCols[status] = list

      return nextCols
    })

    try {
      const result = await moveTask({
        id: task.id,
        status,
        prevId: prev?.id,
        nextId: next?.id,
        projectId: task.project_id
      }).unwrap()
      if (task.status !== status) toast.success(result?.detail || `Moved to ${status}`)
    } catch {
      // Blocked or failed: the base query showed why; put the card back.
      setColumns(snapshot)
      refetch()
    }
  }

  const onDragStart = (e, task) => {
    setDragged(task)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(task.id))
  }

  const onDragEnd = () => {
    setDragged(null)
    setDropTarget(null)
  }

  const onDragOver = (e, status) => {
    if (!dragged) return
    e.preventDefault()
    const index = indexFromPointer(status, e.clientY)
    if (dropTarget?.status !== status || dropTarget?.index !== index) setDropTarget({ status, index })
  }

  const onDrop = (e, status) => {
    e.preventDefault()
    if (dragged) commitMove(dragged, status, indexFromPointer(status, e.clientY))
    onDragEnd()
  }

  const addButton = canEdit && (
    <PrimaryButton onClick={() => setDrawerOpen(true)}>
      Add Task <PlusCircle size={16} />
    </PrimaryButton>
  )

  const filtersActive = Boolean(search || priority || mine || assignee || (!embedded && projectFilter))

  const body = (
    <>
      <TaskDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        projectId={activeProject}
        meta={meta}
        mine={mine}
      />
      <TaskDrawer open={Boolean(editTaskId)} onClose={() => setEditTaskId(null)} taskId={editTaskId} meta={meta} />

      <div className='mb-3 flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm md:flex-row md:flex-wrap md:items-center'>
        <input
          type='text'
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder='Search with Task, Key, Assignee...'
          className={`${ThemeStyles.formsInputs} search-input text-gray-900 md:max-w-xs`}
        />
        {!embedded && (
          <select
            value={projectFilter}
            onChange={e => setProjectFilter(e.target.value)}
            className={`${ThemeStyles.formsInputsDropdown} md:max-w-[240px]`}
            aria-label='Project'
          >
            <option value=''>All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.project_code} - {p.project_name}
              </option>
            ))}
          </select>
        )}
        <select
          value={priority}
          onChange={e => setPriority(e.target.value)}
          className={`${ThemeStyles.formsInputsDropdown} md:max-w-[170px]`}
          aria-label='Priority'
        >
          <option value=''>All Priorities</option>
          {(meta?.priorities || []).map(p => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {members.length > 0 && (
          <select
            value={assignee}
            onChange={e => setAssignee(e.target.value)}
            className={`${ThemeStyles.formsInputsDropdown} md:max-w-[200px]`}
            aria-label='Member'
          >
            <option value=''>All Members</option>
            {members.map(m => (
              <option key={m.id} value={m.member_name}>
                {m.member_name}
              </option>
            ))}
          </select>
        )}
        <button type='button' onClick={() => setMine(v => !v)} className={`filterCustBtn ${mine ? 'active' : ''}`}>
          <Icon icon='tabler:user' width={16} /> My Tasks
        </button>
        <div className='text-sm text-gray-500 md:ms-auto'>
          {isFetching ? 'Loading...' : `${total} task${total === 1 ? '' : 's'}`}
          {filtersActive && (
            <button
              type='button'
              onClick={() => {
                setSearchInput('')
                setPriority('')
                setMine(false)
                setAssignee('')
                if (!embedded) setProjectFilter('')
              }}
              className='ms-2 cursor-pointer font-semibold hover:underline'
              style={{ color: 'var(--theme-solid)' }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {truncated && (
        <div className='mb-3 rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-[13px] text-amber-700'>
          Showing the first {boardResp?.stack_values?.limit} tasks. Pick a project or use search to narrow the board.
        </div>
      )}

      <div className='flex gap-3 overflow-x-auto pb-2'>
        {statuses.map(status => {
          const cards = columns[status] || []
          const isTarget = dropTarget?.status === status
          // Where the drop line goes: before the card that will follow the dropped one, or at the end.
          const others = cards.filter(t => t.id !== dragged?.id)
          const lineBeforeId = isTarget ? others[dropTarget.index]?.id : null
          const lineAtEnd = isTarget && dropTarget.index >= others.length

          return (
            <div
              key={status}
              className='flex w-[85vw] shrink-0 flex-col rounded-xl border border-gray-200 bg-gray-100 sm:w-[300px] xl:w-auto xl:min-w-[260px] xl:flex-1'
            >
              <div className='flex items-center justify-between gap-2 px-3 py-2.5'>
                <div className='flex items-center gap-2'>
                  <span className='h-2.5 w-2.5 rounded-full' style={{ background: TASK_STATUS_DOT[status] }} />
                  <span className='text-[14px] font-semibold text-slate-800'>{status}</span>
                  <span className='rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-600'>
                    {cards.length}
                  </span>
                </div>
                {canEdit && status === statuses[0] && (
                  <button
                    type='button'
                    onClick={() => setDrawerOpen(true)}
                    className='cursor-pointer text-gray-500 hover:text-[var(--theme-solid)]'
                    aria-label='Add task'
                  >
                    <Icon icon='tabler:plus' width={18} />
                  </button>
                )}
              </div>

              <div
                ref={el => (columnRefs.current[status] = el)}
                onDragOver={e => onDragOver(e, status)}
                onDrop={e => onDrop(e, status)}
                onDragLeave={e => !e.currentTarget.contains(e.relatedTarget) && setDropTarget(null)}
                className={`flex min-h-[160px] flex-1 flex-col gap-2 rounded-b-xl p-2 transition-colors ${
                  isTarget ? 'bg-[color-mix(in_srgb,var(--theme-solid)_8%,transparent)]' : ''
                }`}
              >
                {cards.map(task => (
                  <React.Fragment key={task.id}>
                    {lineBeforeId === task.id && (
                      <div className='h-1 rounded-full' style={{ background: 'var(--theme-solid)' }} />
                    )}
                    <TaskCard
                      task={task}
                      canEdit={canEdit}
                      statuses={statuses}
                      dragging={dragged?.id === task.id}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      onMove={(t, s) => commitMove(t, s)}
                      onEdit={t => setEditTaskId(t.id)}
                      showProject={!activeProject}
                    />
                  </React.Fragment>
                ))}
                {lineAtEnd && <div className='h-1 rounded-full' style={{ background: 'var(--theme-solid)' }} />}
                {cards.length === 0 && !isTarget && (
                  <div className='flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-4 text-center text-xs text-gray-400'>
                    {canEdit ? 'Drop tasks here' : 'No tasks'}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {canEdit && (
        <p className='mt-2 hidden text-xs text-gray-500 lg:block'>
          Drag a card to change its status or its place in a column. A task blocked by open tasks cannot be dropped in
          Done.
        </p>
      )}
    </>
  )

  return embedded ? (
    body
  ) : (
    <PmsPage screenId={SCREEN_ID} actions={addButton}>
      {body}
    </PmsPage>
  )
}

export default KanbanBoard
