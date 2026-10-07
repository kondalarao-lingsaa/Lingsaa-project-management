import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import PmsPage from 'src/pms/components/PmsPage'
import PmsPagination from 'src/pms/components/PmsPagination'
import useProjectPicker from 'src/pms/components/useProjectPicker'
import { GhostButton, NameAvatar, TaskStatusPill, timeAgo } from 'src/pms/components/ui'
import { taskDetailsPath } from 'src/pms/tasks/paths'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import {
  useGetActivityFeedQuery,
  useGetCommentsFeedQuery,
  useGetCommunicationMetaQuery,
  useGetMentionsQuery,
  useMarkNotificationsReadMutation
} from 'src/store/apps/pms/communicationApi'
import { ACTION, ACTION_FILTERS, dayLabel, IconBubble, MentionText, timeOfDay } from './commUi'

const useDebouncedValue = (value, delay = 400) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(t)
  }, [value, delay])

  return debounced
}

const Pill = ({ active, onClick, children }) => (
  <button
    type='button'
    onClick={onClick}
    className={`cursor-pointer rounded-full border px-3 py-1 text-[13px] font-semibold transition ${
      active ? 'border-transparent text-white' : 'border-gray-300 bg-white text-slate-600 hover:bg-gray-50'
    }`}
    style={
      active ? { background: 'linear-gradient(to right, var(--theme-grad-start), var(--theme-grad-end))' } : undefined
    }
  >
    {children}
  </button>
)

const TaskRef = ({ id, taskKey, title, projectCode, deleted }) =>
  deleted ? (
    <span className='text-gray-400 line-through'>
      {taskKey} · {title}
    </span>
  ) : (
    <Link href={taskDetailsPath(id)} className='font-semibold text-slate-700 hover:underline'>
      <span style={{ color: 'var(--theme-solid)' }}>{taskKey}</span> · {title}
      {projectCode && <span className='font-normal text-gray-400'> · {projectCode}</span>}
    </Link>
  )

const Empty = ({ icon, children }) => (
  <div className='flex flex-col items-center gap-2 py-12 text-center text-sm text-gray-500'>
    <Icon icon={icon} width={30} className='text-gray-300' />
    {children}
  </div>
)

/* ------------------------------------------------------------------------------ Comments */

export const CommentsView = () => {
  const { projectId, picker, ready } = useProjectPicker({ allowAll: true })
  const [pagination, setPagination] = useState({ currentPage: 1, itemsPerPage: 5 })
  const [searchInput, setSearchInput] = useState('')
  const [involvingMe, setInvolvingMe] = useState(false)
  const search = useDebouncedValue(searchInput)
  const { data, isFetching } = useGetCommentsFeedQuery(
    { ...pagination, projectId: projectId || undefined, search: search.trim() || undefined, involvingMe },
    { refetchOnMountOrArgChange: true, skip: !ready }
  )
  const rows = data?.detail || []

  useEffect(() => setPagination(p => ({ ...p, currentPage: 1 })), [projectId, search, involvingMe])

  return (
    <PmsPage screenId='communication.comments'>
      <div className={`${ThemeStyles.tableColor} rounded-md`}>
        <div className='flex flex-col gap-2 p-3 md:flex-row md:flex-wrap md:items-center'>
          {picker}
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder='Search with comment text, task, person...'
            className={`${ThemeStyles.formsInputs} search-input text-gray-900 md:max-w-sm`}
            aria-label='Search comments'
          />
          <div className='flex gap-2'>
            <Pill active={!involvingMe} onClick={() => setInvolvingMe(false)}>
              All comments
            </Pill>
            <Pill active={involvingMe} onClick={() => setInvolvingMe(true)}>
              Involving me
            </Pill>
          </div>
        </div>
        <ul
          className={`divide-y divide-gray-100 border-t border-gray-200 transition-opacity ${
            isFetching ? 'opacity-60' : ''
          }`}
        >
          {rows.length === 0 && (
            <li>
              <Empty icon='tabler:messages'>
                {isFetching
                  ? 'Loading...'
                  : involvingMe
                  ? 'No comments by you, on your tasks or mentioning you.'
                  : 'No comments yet. Discussions on tasks appear here.'}
              </Empty>
            </li>
          )}
          {rows.map(c => (
            <li key={c.id} className='flex gap-3 px-4 py-3' data-comment={c.id}>
              <NameAvatar name={c.author_name} />
              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-x-2 text-[13px]'>
                  <span className='font-semibold text-slate-800'>{c.author_name}</span>
                  <span className='text-gray-400'>on</span>
                  <TaskRef id={c.task_id} taskKey={c.task_key} title={c.task_title} projectCode={c.project_code} />
                  <span className='ms-auto text-xs text-gray-400' title={c.created_at}>
                    {timeAgo(c.created_at)}
                  </span>
                </div>
                <div className='mt-1 text-[14px] text-slate-700'>
                  <MentionText text={c.body} />
                </div>
              </div>
            </li>
          ))}
        </ul>
        <PmsPagination
          pagination={pagination}
          handleChange={page => setPagination(p => ({ ...p, currentPage: page }))}
          handleipp={value => setPagination({ currentPage: 1, itemsPerPage: value })}
          total={data?.stack_values?.count_pg || 0}
        />
      </div>
    </PmsPage>
  )
}

/* ------------------------------------------------------------------------------ Mentions */

export const MentionsView = () => {
  const [pagination, setPagination] = useState({ currentPage: 1, itemsPerPage: 5 })
  const [unreadOnly, setUnreadOnly] = useState(false)
  const { data, isFetching } = useGetMentionsQuery({ ...pagination, unreadOnly }, { refetchOnMountOrArgChange: true })
  const [markRead, { isLoading: marking }] = useMarkNotificationsReadMutation()
  const rows = data?.detail || []
  const sv = data?.stack_values || {}

  useEffect(() => setPagination(p => ({ ...p, currentPage: 1 })), [unreadOnly])

  return (
    <PmsPage
      screenId='communication.mentions'
      actions={
        <GhostButton disabled={!sv.unread || marking} onClick={() => markRead({ kind: 'mention' })}>
          <Icon icon='tabler:checks' width={16} /> Mark all read
        </GhostButton>
      }
    >
      <div className={`${ThemeStyles.tableColor} rounded-md`}>
        <div className='flex flex-wrap gap-2 p-3'>
          <Pill active={!unreadOnly} onClick={() => setUnreadOnly(false)}>
            All
          </Pill>
          <Pill active={unreadOnly} onClick={() => setUnreadOnly(true)}>
            Unread <span className={unreadOnly ? 'opacity-90' : 'text-gray-400'}>({sv.unread || 0})</span>
          </Pill>
        </div>
        <ul
          className={`divide-y divide-gray-100 border-t border-gray-200 transition-opacity ${
            isFetching ? 'opacity-60' : ''
          }`}
        >
          {rows.length === 0 && (
            <li>
              <Empty icon='tabler:at'>
                {isFetching
                  ? 'Loading...'
                  : unreadOnly
                  ? 'No unread mentions.'
                  : 'Nobody has mentioned you yet. When someone writes @your name in a task comment, it shows here.'}
              </Empty>
            </li>
          )}
          {rows.map(m => (
            <li
              key={m.id}
              className={`flex gap-3 px-4 py-3 ${
                m.is_read ? '' : 'bg-[color-mix(in_srgb,var(--theme-solid)_5%,transparent)]'
              }`}
              data-mention={m.id}
            >
              <NameAvatar name={m.actor_name} />
              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-x-2 text-[13px]'>
                  <span className='font-semibold text-slate-800'>{m.actor_name}</span>
                  <span className='text-gray-400'>mentioned you on</span>
                  {m.task_key ? (
                    <TaskRef id={m.task_id} taskKey={m.task_key} title={m.task_title} projectCode={m.project_code} />
                  ) : (
                    <span className='text-gray-400'>a deleted task</span>
                  )}
                  {m.task_status && <TaskStatusPill status={m.task_status} />}
                  <span className='ms-auto text-xs text-gray-400'>{timeAgo(m.created_at)}</span>
                </div>
                <div className='mt-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[14px] text-slate-700'>
                  {m.comment_deleted ? (
                    <span className='italic text-gray-400'>This comment was deleted.</span>
                  ) : (
                    <MentionText text={m.comment} />
                  )}
                </div>
                <div className='mt-1.5 flex gap-3 text-xs font-semibold'>
                  {m.task_key && (
                    <Link
                      href={taskDetailsPath(m.task_id)}
                      onClick={() => !m.is_read && markRead({ ids: [m.id] })}
                      style={{ color: 'var(--theme-solid)' }}
                    >
                      Reply on the task
                    </Link>
                  )}
                  <button
                    type='button'
                    onClick={() => markRead({ ids: [m.id], read: !m.is_read })}
                    className='cursor-pointer text-gray-500 hover:text-slate-800'
                    aria-label={m.is_read ? 'Mark unread' : 'Mark read'}
                  >
                    {m.is_read ? 'Mark unread' : 'Mark read'}
                  </button>
                </div>
              </div>
              {!m.is_read && (
                <span className='mt-2 h-2 w-2 shrink-0 rounded-full' style={{ background: 'var(--theme-solid)' }} />
              )}
            </li>
          ))}
        </ul>
        <PmsPagination
          pagination={pagination}
          handleChange={page => setPagination(p => ({ ...p, currentPage: page }))}
          handleipp={value => setPagination({ currentPage: 1, itemsPerPage: value })}
          total={sv.count_pg || 0}
        />
      </div>
    </PmsPage>
  )
}

/* ------------------------------------------------------------------------------ Activity */

const PAGE = 20
const MAX_ROWS = 500 // the API's largest page; older rows are reached with the filters

// The activity timeline with its filters. picker: the project picker (company-wide screen); without it the feed
// stays on projectId (Project Details > Activity tab).
export const ActivityFeed = ({ projectId, ready = true, picker = null }) => {
  const [action, setAction] = useState('')
  const [actor, setActor] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput)
  const [limit, setLimit] = useState(PAGE)
  const { data: metaResp } = useGetCommunicationMetaQuery()
  const { data, isFetching } = useGetActivityFeedQuery(
    {
      itemsPerPage: limit,
      currentPage: 1,
      projectId: projectId || undefined,
      action: action || undefined,
      actor: actor || undefined,
      search: search.trim() || undefined
    },
    { refetchOnMountOrArgChange: true, skip: !ready }
  )
  const rows = useMemo(() => data?.detail || [], [data])
  const total = data?.stack_values?.count_pg || 0

  useEffect(() => setLimit(PAGE), [projectId, action, actor, search])

  const groups = useMemo(() => {
    const out = []
    rows.forEach(a => {
      const label = dayLabel(a.created_at)
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, items: [] })
      out[out.length - 1].items.push(a)
    })

    return out
  }, [rows])

  return (
    <>
      <div className='mb-3 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center'>
        {picker}
        <select
          id='activity_action'
          value={action}
          onChange={e => setAction(e.target.value)}
          className={`${ThemeStyles.formsInputsDropdown} md:max-w-[190px]`}
          aria-label='Type'
        >
          <option value=''>All changes</option>
          {ACTION_FILTERS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          id='activity_actor'
          value={actor}
          onChange={e => setActor(e.target.value)}
          className={`${ThemeStyles.formsInputsDropdown} md:max-w-[200px]`}
          aria-label='Person'
        >
          <option value=''>Everyone</option>
          {(metaResp?.detail?.actors || []).map(a => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder='Search with task or change...'
          className={`${ThemeStyles.formsInputs} search-input text-gray-900 md:max-w-xs`}
          aria-label='Search activity'
        />
      </div>

      <div
        className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-opacity ${
          isFetching ? 'opacity-70' : ''
        }`}
      >
        {rows.length === 0 && (
          <Empty icon='tabler:activity'>{isFetching ? 'Loading...' : 'No activity for this filter.'}</Empty>
        )}
        {groups.map(g => (
          <div key={g.label} className='mb-4 last:mb-0'>
            <div className='mb-2 text-[12px] font-bold uppercase tracking-wider text-gray-500'>{g.label}</div>
            <ol className='relative ms-4 border-s border-gray-200'>
              {g.items.map(a => {
                const meta = ACTION[a.action] || ACTION.updated

                return (
                  <li key={a.id} className='relative mb-3 ps-6 last:mb-0' data-activity={a.action}>
                    <span className='absolute -start-4 top-0'>
                      <IconBubble meta={meta} size={30}>
                        <Icon icon={meta.icon} width={15} />
                      </IconBubble>
                    </span>
                    <div className='flex flex-wrap items-center gap-x-2 text-[13px]'>
                      <span className='font-semibold text-slate-800'>{a.actor_name}</span>
                      <span className='text-gray-500'>{meta.verb || meta.label.toLowerCase()}</span>
                      <TaskRef
                        id={a.task_id}
                        taskKey={a.task_key}
                        title={a.task_title}
                        projectCode={a.project_code}
                        deleted={a.task_deleted}
                      />
                      <span className='ms-auto text-xs text-gray-400'>{timeOfDay(a.created_at)}</span>
                    </div>
                    {a.detail && <div className='mt-0.5 break-words text-[13px] text-gray-600'>{a.detail}</div>}
                  </li>
                )
              })}
            </ol>
          </div>
        ))}
        {rows.length < total && limit < MAX_ROWS && (
          <div className='mt-3 text-center'>
            <GhostButton onClick={() => setLimit(l => Math.min(MAX_ROWS, l + PAGE))} disabled={isFetching}>
              Load more ({total - rows.length} older)
            </GhostButton>
          </div>
        )}
        {rows.length < total && limit >= MAX_ROWS && (
          <div className='mt-3 text-center text-xs text-gray-500'>
            Showing the latest {MAX_ROWS} of {total} changes. Use the filters above to find older ones.
          </div>
        )}
      </div>
    </>
  )
}

export const ActivityView = () => {
  const { projectId, picker, ready } = useProjectPicker({ allowAll: true })

  return (
    <PmsPage screenId='communication.activity'>
      <ActivityFeed projectId={projectId} ready={ready} picker={picker} />
    </PmsPage>
  )
}
