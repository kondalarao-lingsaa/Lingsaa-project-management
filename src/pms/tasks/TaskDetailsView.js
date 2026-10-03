import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Icon } from '@iconify/react'
import { Edit, Eye, EyeOff, Plus, Send, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import PmsPage from 'src/pms/components/PmsPage'
import ConfirmDialog from 'src/pms/components/ConfirmDialog'
import {
  Chip,
  formatDate,
  GhostButton,
  NameAvatar,
  PrimaryButton,
  PRIORITY_TONE,
  TASK_STATUS_STYLE,
  TaskStatusPill,
  timeAgo
} from 'src/pms/components/ui'
import { usePmsPermissions } from 'src/pms/adapters/permissions'
import { getScreen, PMS_BASE } from 'src/pms/config/pmsModules'
import { projectDetailsPath } from 'src/pms/projects/ProjectsListView'
import { capitalizeFirst } from 'src/pms/utils/validation'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { getAuthParams } from 'src/store/rtkQuery/baseQuery'
import {
  useAddTaskCommentMutation,
  useAddTaskDependencyMutation,
  useChangeTaskStatusMutation,
  useDeleteTaskCommentMutation,
  useDeleteTaskMutation,
  useGetTaskActivityQuery,
  useGetTaskCommentsQuery,
  useGetTaskDependenciesQuery,
  useGetTaskDetailQuery,
  useGetTaskListQuery,
  useGetTaskMetaQuery,
  useGetTaskWatchersQuery,
  useRemoveTaskDependencyMutation,
  useSetTaskWatchingMutation
} from 'src/store/apps/pms/tasksApi'
import { useGetProjectMembersQuery } from 'src/store/apps/pms/teamApi'
import MentionTextarea from 'src/pms/communication/MentionTextarea'
import { MentionText } from 'src/pms/communication/commUi'
import TaskDrawer from './TaskDrawer'
import DocumentsPanel from 'src/pms/documents/DocumentsPanel'
import { taskDetailsPath } from './paths'

const SCREEN_ID = 'tasks.taskDetails'
const COMMENT_MAX = 4000

const TABS = [
  { key: 'comments', label: 'Comments' },
  { key: 'dependencies', label: 'Dependencies' },
  { key: 'history', label: 'History' }
]

const ACTIVITY_ICON = {
  created: 'tabler:plus',
  status: 'tabler:arrows-exchange',
  updated: 'tabler:pencil',
  comment: 'tabler:message',
  comment_deleted: 'tabler:message-off',
  dependency: 'tabler:link',
  dependency_removed: 'tabler:unlink',
  deleted: 'tabler:trash',
  sprint: 'tabler:run',
  time: 'tabler:clock'
}

const Card = ({ title, action, children, className = '' }) => (
  <section className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
    {title && (
      <div className='mb-3 flex items-center justify-between gap-2 border-b border-gray-100 pb-2'>
        <div className='text-[15px] font-semibold text-slate-800'>{title}</div>
        {action}
      </div>
    )}
    {children}
  </section>
)

const Field = ({ label, children }) => (
  <div>
    <div className='text-xs font-medium text-gray-500'>{label}</div>
    <div className='mt-0.5 text-[14px] font-medium text-slate-800'>{children || '-'}</div>
  </div>
)

const TaskLink = ({ task }) => (
  <Link href={taskDetailsPath(task.id)} className='flex min-w-0 items-center gap-2 hover:underline'>
    <span className={ThemeStyles.listNoColor}>{task.task_key}</span>
    <span className='truncate text-[14px] font-medium text-slate-800'>{task.title}</span>
  </Link>
)

/* ----------------------------------------------------------------- comments */

const CommentsTab = ({ task, canEdit }) => {
  const { userId } = getAuthParams()
  const { data, isFetching } = useGetTaskCommentsQuery(task.id)
  const [addComment, { isLoading: isAdding }] = useAddTaskCommentMutation()
  const [deleteComment, { isLoading: isDeleting }] = useDeleteTaskCommentMutation()
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const comments = data?.detail || []
  const { data: membersResp } = useGetProjectMembersQuery(task.project_id)
  const members = membersResp?.detail || []

  const submit = async () => {
    if (isAdding) return
    const text = body.trim()
    if (!text) {
      setError('Please Enter a Comment')
      toast.error('Please Enter a Comment')
      document.getElementById('task_comment')?.focus()

      return
    }
    try {
      await addComment({ id: task.id, body: text }).unwrap()
      setBody('')
      setError('')
    } catch {
      // The shared base query already showed the error.
    }
  }

  const remove = async () => {
    try {
      await deleteComment({ id: task.id, commentId: deleteTarget.id }).unwrap()
      toast.success('Comment deleted')
    } catch {
      // The shared base query already showed the error.
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title='Delete comment?'
        message='This comment will be removed for everyone.'
        confirmText='Delete'
        cancelText='Cancel'
        busy={isDeleting}
      />

      {canEdit && (
        <div className='mb-4'>
          <MentionTextarea
            id='task_comment'
            rows={3}
            maxLength={COMMENT_MAX}
            value={body}
            members={members}
            onChange={text => {
              setBody(capitalizeFirst(text))
              setError('')
            }}
            onKeyDown={e => (e.ctrlKey || e.metaKey) && e.key === 'Enter' && submit()}
            placeholder='Write a comment... Type @ to mention a team member (Ctrl + Enter to send)'
            className={`${ThemeStyles.formsInputs}${error ? ' !border !border-red-500' : ''}`}
          />
          <div className='mt-1 flex items-center justify-between gap-2'>
            {error ? (
              <span className='text-xs font-semibold text-red-500'>{error}</span>
            ) : (
              <span className='text-xs text-gray-400'>
                {body.length}/{COMMENT_MAX}
              </span>
            )}
            <PrimaryButton onClick={submit} disabled={isAdding}>
              <Send size={15} /> {isAdding ? 'Sending...' : 'Comment'}
            </PrimaryButton>
          </div>
        </div>
      )}

      {comments.length === 0 ? (
        <div className='py-8 text-center text-sm text-gray-500'>
          {isFetching ? 'Loading comments...' : 'No comments yet. Start the conversation.'}
        </div>
      ) : (
        <ul className='flex flex-col gap-4'>
          {comments.map(c => (
            <li key={c.id} className='flex gap-3'>
              <NameAvatar name={c.author_name || '?'} />
              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='text-[14px] font-semibold text-slate-800'>{c.author_name || 'Unknown user'}</span>
                  <span className='text-xs text-gray-500' title={c.created_at}>
                    {timeAgo(c.created_at)}
                  </span>
                  {String(c.author_id) === String(userId) && (
                    <button
                      type='button'
                      onClick={() => setDeleteTarget(c)}
                      className='ms-auto cursor-pointer text-gray-400 hover:text-red-600'
                      aria-label='Delete comment'
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <p className='mt-1 text-[14px] text-slate-700'>
                  <MentionText text={c.body} names={members.map(m => m.member_name)} />
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- dependencies */

const DependencyRow = ({ item, onRemove, canEdit }) => (
  <li className='flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2'>
    <TaskLink task={item} />
    <div className='flex shrink-0 items-center gap-2'>
      <TaskStatusPill status={item.status} />
      {canEdit && (
        <button
          type='button'
          onClick={() => onRemove(item)}
          className='cursor-pointer text-gray-400 hover:text-red-600'
          aria-label='Remove dependency'
        >
          <Icon icon='tabler:unlink' width={17} />
        </button>
      )}
    </div>
  </li>
)

const DependenciesTab = ({ task, canEdit }) => {
  const { data, isFetching } = useGetTaskDependenciesQuery(task.id)
  const { data: projectTasks } = useGetTaskListQuery({
    projectId: task.project_id,
    itemsPerPage: 1000,
    currentPage: 1,
    sortBy: 'task_key',
    sortOrder: 'asc'
  })
  const [addDependency, { isLoading: isAdding }] = useAddTaskDependencyMutation()
  const [removeDependency] = useRemoveTaskDependencyMutation()
  const [picked, setPicked] = useState('')
  const [error, setError] = useState('')

  const deps = data?.detail || { blocked_by: [], blocking: [], open_blockers: 0 }
  const linked = new Set([task.id, ...deps.blocked_by.map(d => d.id), ...deps.blocking.map(d => d.id)])
  const candidates = (Array.isArray(projectTasks?.detail) ? projectTasks.detail : []).filter(t => !linked.has(t.id))

  const add = async () => {
    if (!picked) {
      setError('Please Select a Task')

      return
    }
    try {
      await addDependency({ id: task.id, dependsOnId: picked }).unwrap()
      toast.success('Dependency added')
      setPicked('')
      setError('')
    } catch {
      // The shared base query already showed the error (e.g. a loop).
    }
  }

  const remove = async item => {
    try {
      await removeDependency({ id: task.id, dependencyId: item.dependency_id }).unwrap()
      toast.success('Dependency removed')
    } catch {
      // The shared base query already showed the error.
    }
  }

  return (
    <div className='flex flex-col gap-5'>
      <div>
        <div className='mb-1 text-[14px] font-semibold text-slate-800'>Blocked by</div>
        <p className='mb-2 text-xs text-gray-500'>This task cannot be marked Done until these tasks are Done.</p>
        {canEdit && (
          <div className='mb-3'>
            <div className='flex flex-col gap-2 sm:flex-row'>
              <select
                id='depends_on'
                value={picked}
                onChange={e => {
                  setPicked(e.target.value)
                  setError('')
                }}
                className={`${ThemeStyles.formsInputsDropdown}${error ? ' !border !border-red-500' : ''}`}
              >
                <option value=''>
                  {candidates.length ? 'Select a task of this project' : 'No other tasks to link'}
                </option>
                {candidates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.task_key} - {t.title} ({t.status})
                  </option>
                ))}
              </select>
              <GhostButton onClick={add} disabled={isAdding} className='shrink-0'>
                <Plus size={16} /> Add
              </GhostButton>
            </div>
            {error && <span className='!mt-1 block text-xs font-semibold text-red-500'>{error}</span>}
          </div>
        )}
        {deps.blocked_by.length === 0 ? (
          <div className='text-sm text-gray-500'>{isFetching ? 'Loading...' : 'Nothing blocks this task.'}</div>
        ) : (
          <ul className='flex flex-col gap-2'>
            {deps.blocked_by.map(item => (
              <DependencyRow key={item.dependency_id} item={item} onRemove={remove} canEdit={canEdit} />
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className='mb-1 text-[14px] font-semibold text-slate-800'>Blocking</div>
        <p className='mb-2 text-xs text-gray-500'>These tasks are waiting for this one.</p>
        {deps.blocking.length === 0 ? (
          <div className='text-sm text-gray-500'>No task is waiting for this one.</div>
        ) : (
          <ul className='flex flex-col gap-2'>
            {deps.blocking.map(item => (
              <DependencyRow key={item.dependency_id} item={item} onRemove={remove} canEdit={canEdit} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ history */

const HistoryTab = ({ task }) => {
  const { data, isFetching } = useGetTaskActivityQuery(task.id)
  const items = data?.detail || []

  if (!items.length)
    return (
      <div className='py-8 text-center text-sm text-gray-500'>
        {isFetching ? 'Loading history...' : 'No history yet.'}
      </div>
    )

  return (
    <ol className='relative ms-3 border-s border-gray-200'>
      {items.map(a => (
        <li key={a.id} className='mb-4 ms-5'>
          <span
            className='absolute -start-3 flex h-6 w-6 items-center justify-center rounded-full bg-white ring-1 ring-gray-200'
            style={{ color: 'var(--theme-solid)' }}
          >
            <Icon icon={ACTIVITY_ICON[a.action] || 'tabler:point'} width={14} />
          </span>
          <div className='text-[14px] text-slate-800'>
            <span className='font-semibold'>{a.actor_name || 'Someone'}</span>{' '}
            <span className='text-slate-600'>{a.detail}</span>
          </div>
          <div className='text-xs text-gray-500' title={a.created_at}>
            {timeAgo(a.created_at)}
          </div>
        </li>
      ))}
    </ol>
  )
}

/* --------------------------------------------------------------------- page */

const TaskDetailsView = () => {
  const router = useRouter()
  const id = router.query.id
  const screen = getScreen(SCREEN_ID)
  const { userPermissions } = usePmsPermissions(screen?.permissionName)
  const canEdit = Boolean(userPermissions?.edit)
  const canDelete = Boolean(userPermissions?.delete)
  // Set while deleting, so the page does not reload the task it is removing.
  const [deleted, setDeleted] = useState(false)

  const { data: resp, isFetching, isUninitialized } = useGetTaskDetailQuery(id, { skip: !router.isReady || !id || deleted })
  const { data: metaResp } = useGetTaskMetaQuery()
  const { data: watchersResp } = useGetTaskWatchersQuery(id, { skip: !router.isReady || !id || deleted })
  const { data: depsResp } = useGetTaskDependenciesQuery(id, { skip: !router.isReady || !id || deleted })
  const [changeStatus, { isLoading: isChanging }] = useChangeTaskStatusMutation()
  const [setWatching, { isLoading: isWatchBusy }] = useSetTaskWatchingMutation()
  const [deleteTask, { isLoading: isDeleting }] = useDeleteTaskMutation()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [drawer, setDrawer] = useState(null) // { taskId } to edit, { parentTaskId } to add a subtask
  const [tab, setTab] = useState('comments')

  const task = resp?.detail
  const meta = metaResp?.detail
  const watchers = watchersResp?.detail || []
  const isWatching = Boolean(watchersResp?.stack_values?.is_watching)
  const openBlockers = depsResp?.detail?.open_blockers || 0

  const backLink = (
    <Link
      href={`${PMS_BASE}/tasks/allTasks/`}
      className='inline-flex items-center gap-1 text-[13px] font-medium hover:underline'
      style={{ color: 'var(--theme-solid)' }}
    >
      <Icon icon='tabler:arrow-left' width={14} /> All Tasks
    </Link>
  )

  if (!router.isReady || isUninitialized || (isFetching && !task)) {
    return (
      <PmsPage screenId={SCREEN_ID}>
        <div className='py-16 text-center text-sm text-gray-500'>Loading task...</div>
      </PmsPage>
    )
  }

  if (!task) {
    return (
      <PmsPage screenId={SCREEN_ID}>
        <div className='rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm'>
          <Icon icon='tabler:file-off' width={36} className='mx-auto mb-3 text-slate-400' />
          <div className='mb-1 text-lg font-semibold text-slate-800'>Task not found</div>
          <div className='mb-4 text-sm text-gray-500'>It may have been deleted, or it belongs to another company.</div>
          {backLink}
        </div>
      </PmsPage>
    )
  }

  const handleStatus = async status => {
    if (status === task.status) return
    try {
      const result = await changeStatus({ id: task.id, status, projectId: task.project_id }).unwrap()
      toast.success(result?.detail || `Moved to ${status}`)
    } catch {
      // The shared base query already showed the error (e.g. blocked by another task).
    }
  }

  // After deleting, go to the parent task (for a subtask) or the project's task list.
  const handleDelete = async () => {
    setDeleted(true)
    try {
      const result = await deleteTask({ id: task.id, projectId: task.project_id }).unwrap()
      toast.success(result?.detail || 'Task deleted')
      setConfirmDelete(false)
      router.push(
        task.parent_task_id ? taskDetailsPath(task.parent_task_id) : `${projectDetailsPath(task.project_id)}&tab=tasks`
      )
    } catch {
      // The shared base query already showed the error (e.g. the project is Closed).
      setDeleted(false)
      setConfirmDelete(false)
    }
  }

  const toggleWatch = async () => {
    try {
      const result = await setWatching({ id: task.id, watching: !isWatching }).unwrap()
      toast.success(result?.detail)
    } catch {
      // The shared base query already showed the error.
    }
  }

  return (
    <PmsPage
      screenId={SCREEN_ID}
      actions={
        <div className='flex flex-wrap gap-2'>
          <GhostButton onClick={toggleWatch} disabled={isWatchBusy}>
            {isWatching ? <EyeOff size={16} /> : <Eye size={16} />} {isWatching ? 'Unwatch' : 'Watch'}
          </GhostButton>
          {canEdit && (
            <GhostButton onClick={() => setDrawer({ taskId: task.id })}>
              <Edit size={16} /> Edit
            </GhostButton>
          )}
          {canDelete && (
            <GhostButton onClick={() => setConfirmDelete(true)} className='!text-red-600'>
              <Trash2 size={16} /> Delete
            </GhostButton>
          )}
        </div>
      }
    >
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title='Delete task?'
        message={`${task.task_key} - ${task.title} will be removed${
          task.subtask_count ? ` along with its ${task.subtask_count} subtask(s)` : ''
        }.`}
        confirmText='Delete'
        cancelText='Cancel'
        busy={isDeleting}
      />
      <TaskDrawer
        open={Boolean(drawer)}
        onClose={() => setDrawer(null)}
        taskId={drawer?.taskId}
        projectId={task.project_id}
        parentTaskId={drawer?.parentTaskId}
        meta={meta}
      />

      <div className='mb-3 flex flex-wrap items-center gap-x-3 gap-y-1'>
        {backLink}
        <span className='text-gray-300'>|</span>
        <Link
          href={projectDetailsPath(task.project_id)}
          className='text-[13px] font-medium hover:underline'
          style={{ color: 'var(--theme-solid)' }}
        >
          {task.project_code} · {task.project_name}
        </Link>
        {task.parent_task_id && (
          <>
            <span className='text-gray-300'>|</span>
            <Link
              href={taskDetailsPath(task.parent_task_id)}
              className='text-[13px] font-medium hover:underline'
              style={{ color: 'var(--theme-solid)' }}
            >
              Subtask of {task.parent_key}
            </Link>
          </>
        )}
      </div>

      <section className='mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className={ThemeStyles.listNoColor}>{task.task_key}</span>
              {task.task_type !== 'Task' && <Chip tone='violet'>{task.task_type}</Chip>}
              <Chip tone={PRIORITY_TONE[task.priority]}>{task.priority} priority</Chip>
              {task.is_overdue && <Chip tone='red'>Overdue</Chip>}
            </div>
            <h2 className='mt-1 break-words text-xl font-semibold text-slate-900'>{task.title}</h2>
          </div>

          <div className='flex items-center gap-2'>
            <span className='text-xs font-medium text-gray-500'>Status</span>
            <select
              id='task_status'
              value={task.status}
              disabled={!canEdit || isChanging}
              onChange={e => handleStatus(e.target.value)}
              className={`cursor-pointer rounded-full border px-3 py-1 text-sm font-semibold focus:outline-none disabled:cursor-default ${
                TASK_STATUS_STYLE[task.status]
              }`}
            >
              {(meta?.statuses || [task.status]).map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {openBlockers > 0 && task.status !== 'Done' && (
          <button
            type='button'
            onClick={() => setTab('dependencies')}
            className='mt-3 flex w-full cursor-pointer items-center gap-2 rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-left text-[13px] font-medium text-amber-700'
          >
            <Icon icon='tabler:lock' width={16} />
            Blocked by {openBlockers} open task{openBlockers > 1 ? 's' : ''}. It can move to Done once{' '}
            {openBlockers > 1 ? 'they are' : 'it is'} finished.
          </button>
        )}
      </section>

      <div className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
        <div className='flex min-w-0 flex-col gap-4 xl:col-span-2'>
          <Card title='Description'>
            <p className='whitespace-pre-line break-words text-[14px] text-slate-700'>
              {task.description || 'No description added.'}
            </p>
          </Card>

          {!task.parent_task_id && (
            <Card
              title={`Subtasks${
                task.subtasks?.length
                  ? ` (${task.subtasks.filter(s => s.status === 'Done').length}/${task.subtasks.length} done)`
                  : ''
              }`}
              action={
                canEdit && (
                  <button
                    type='button'
                    onClick={() => setDrawer({ parentTaskId: task.id })}
                    className='inline-flex cursor-pointer items-center gap-1 text-[13px] font-semibold hover:underline'
                    style={{ color: 'var(--theme-solid)' }}
                  >
                    <Plus size={15} /> Add Subtask
                  </button>
                )
              }
            >
              {task.subtasks?.length ? (
                <ul className='flex flex-col gap-2'>
                  {task.subtasks.map(sub => (
                    <li
                      key={sub.id}
                      className='flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2'
                    >
                      <TaskLink task={sub} />
                      <div className='flex shrink-0 items-center gap-2'>
                        {sub.assignee_name && (
                          <span className='hidden text-xs text-gray-500 sm:inline'>{sub.assignee_name}</span>
                        )}
                        <TaskStatusPill status={sub.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className='text-sm text-gray-500'>No subtasks. Break big work into smaller steps.</div>
              )}
            </Card>
          )}

          <Card title='Attachments'>
            <DocumentsPanel compact project={{ id: task.project_id }} taskId={task.id} canEdit={canEdit} />
          </Card>

          <Card>
            <div className='mb-4 flex gap-1 overflow-x-auto border-b border-gray-200'>
              {TABS.map(t => (
                <button
                  key={t.key}
                  type='button'
                  onClick={() => setTab(t.key)}
                  className={`cursor-pointer whitespace-nowrap border-b-2 px-4 py-2 text-[14px] font-semibold ${
                    tab === t.key
                      ? 'border-[var(--theme-solid)] text-[var(--theme-solid)]'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                  {t.key === 'dependencies' && openBlockers > 0 && (
                    <span className='ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700'>
                      {openBlockers}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {tab === 'comments' && <CommentsTab task={task} canEdit={canEdit} />}
            {tab === 'dependencies' && <DependenciesTab task={task} canEdit={canEdit} />}
            {tab === 'history' && <HistoryTab task={task} />}
          </Card>
        </div>

        <div className='flex min-w-0 flex-col gap-4'>
          <Card title='Details'>
            <div className='grid grid-cols-2 gap-4'>
              <Field label='Assignee'>
                {task.assignee_name ? (
                  <span className='flex items-center gap-2'>
                    <NameAvatar name={task.assignee_name} />
                    {task.assignee_name}
                  </span>
                ) : (
                  <span className='text-gray-400'>Unassigned</span>
                )}
              </Field>
              <Field label='Reporter'>{task.reporter_name}</Field>
              <Field label='Milestone'>
                {task.milestone_name ? (
                  <Link
                    href={`${projectDetailsPath(task.project_id)}&tab=milestones`}
                    className='hover:underline'
                    style={{ color: 'var(--theme-solid)' }}
                  >
                    {task.milestone_name}
                  </Link>
                ) : null}
              </Field>
              <Field label='Project'>{task.project_code}</Field>
              <Field label='Start Date'>{formatDate(task.start_date)}</Field>
              <Field label='Due Date'>
                <span className={task.is_overdue ? 'text-red-600' : ''}>{formatDate(task.due_date)}</span>
              </Field>
              <Field label='Estimated Hours'>{task.estimated_hours ?? '-'}</Field>
              <Field label='Actual Hours (approved)'>{task.actual_hours ?? '-'}</Field>
              <Field label='Created'>{formatDate(task.created_at)}</Field>
              <Field label='Updated'>{timeAgo(task.updated_at)}</Field>
            </div>
            {task.labels.length > 0 && (
              <div className='mt-4 border-t border-gray-100 pt-3'>
                <div className='mb-1 text-xs font-medium text-gray-500'>Labels</div>
                <div className='flex flex-wrap gap-1'>
                  {task.labels.map(label => (
                    <span
                      key={label}
                      className='rounded bg-gray-100 px-1.5 py-0.5 text-[12px] font-medium text-gray-600'
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card title={`Watchers (${watchers.length})`}>
            {watchers.length ? (
              <ul className='flex flex-col gap-2'>
                {watchers.map(w => (
                  <li key={w.user_id} className='flex items-center gap-2 text-[14px] text-slate-800'>
                    <NameAvatar name={w.user_name || '?'} />
                    {w.user_name || `User ${w.user_id}`}
                  </li>
                ))}
              </ul>
            ) : (
              <div className='text-sm text-gray-500'>
                Nobody is watching yet. Watchers follow comments and changes on this task.
              </div>
            )}
          </Card>
        </div>
      </div>
    </PmsPage>
  )
}

export default TaskDetailsView
