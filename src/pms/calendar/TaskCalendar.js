import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Tooltip } from '@mui/material'
import { CalendarDays, ChevronLeft, ChevronRight, Inbox, Plus, User, X } from 'lucide-react'
import toast from 'react-hot-toast'
import PmsPage from 'src/pms/components/PmsPage'
import useProjectPicker from 'src/pms/components/useProjectPicker'
import { formatDate } from 'src/pms/components/ui'
import { PMS_BASE } from 'src/pms/config/pmsModules'
import { taskDetailsPath } from 'src/pms/tasks/paths'
import TaskDrawer from 'src/pms/tasks/TaskDrawer'
import { useRescheduleTaskMutation } from 'src/store/apps/pms/planningApi'
import { useGetTaskMetaQuery } from 'src/store/apps/pms/tasksApi'
import { useGetTaskCalendarQuery } from 'src/store/apps/pms/workloadApi'

// Same look as the Compliance Calendar in Lingsaa_Accounts: one pill per task on the day it is due
// (priority bar on the left, status dot, title), a status legend in the header, and a day agenda panel.

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const STATUS = {
  Overdue: { dot: '#ef4444', badge: 'text-red-700 bg-red-50 border-red-200' },
  'To Do': { dot: '#94a3b8', badge: 'text-slate-600 bg-slate-50 border-slate-200' },
  'In Progress': { dot: '#3b82f6', badge: 'text-blue-700 bg-blue-50 border-blue-200' },
  Testing: { dot: '#f59e0b', badge: 'text-amber-700 bg-amber-50 border-amber-200' },
  Done: { dot: '#22c55e', badge: 'text-green-700 bg-green-50 border-green-200' }
}
const PRIORITY = {
  Low: { bar: '#64748b', badge: 'text-slate-700 bg-slate-50 border-slate-200' },
  Medium: { bar: '#3b82f6', badge: 'text-blue-700 bg-blue-50 border-blue-200' },
  High: { bar: '#f97316', badge: 'text-orange-700 bg-orange-50 border-orange-200' },
  Critical: { bar: '#e11d48', badge: 'text-rose-700 bg-rose-50 border-rose-200' }
}
const MILESTONE_MARK = '#8b5cf6'
const statusOf = t => (t.is_overdue ? 'Overdue' : t.status)

const SKIN = `
  .tc-cal { --tc-surface:#fff; --tc-border:#e8ebf0; --tc-header:#f8fafc; --tc-hover:#f8fafc; --tc-weekend:#fcfcfd; --tc-text:#1e293b; --tc-muted:#64748b; --tc-pill:#fff;
            --tc-today: color-mix(in srgb, var(--theme-solid,#7367f0) 5%, transparent); --tc-ms-tint: rgba(139,92,246,.10); }
  .dark-mode .tc-cal { --tc-surface:#2F3349; --tc-border:#434968; --tc-header:#282C3F; --tc-hover:#363B52; --tc-weekend:#2B2F44; --tc-text:#e2e8f0; --tc-muted:#94a3b8; --tc-pill:#363B52;
            --tc-today: color-mix(in srgb, var(--theme-solid,#7367f0) 14%, transparent); --tc-ms-tint: rgba(139,92,246,.16); }
  .tc-grid { border:1px solid var(--tc-border); border-radius:14px; overflow:hidden; background:var(--tc-surface); }
  .tc-head { background:var(--tc-header); font-size:.68rem; font-weight:700; letter-spacing:.09em; text-transform:uppercase; color:var(--tc-muted); padding:.7rem .6rem; }
  .tc-day { position:relative; border-right:1px solid var(--tc-border); border-top:1px solid var(--tc-border); padding:5px 5px 6px; transition:background-color .18s ease; cursor:pointer; }
  .tc-day:nth-child(7n) { border-right:none; }
  .tc-day:hover { background:var(--tc-hover); }
  .tc-day.tc-weekend { background:var(--tc-weekend); }
  .tc-day.tc-today { background:var(--tc-today); }
  .tc-day.tc-selected { background: color-mix(in srgb, var(--theme-solid,#7367f0) 7%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-solid,#7367f0) 32%, transparent); }
  .tc-day.tc-drop { background: color-mix(in srgb, var(--theme-solid,#7367f0) 12%, transparent); box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--theme-solid,#7367f0) 45%, transparent); }
  .tc-num { font-size:.78rem; font-weight:600; color:var(--tc-text); padding:3px 7px; border-radius:999px; line-height:1; min-width:24px; text-align:center; display:inline-block; }
  .tc-outside .tc-num { color:var(--tc-muted); opacity:.55; }
  .tc-today .tc-num { background:var(--theme-solid,#7367f0); color:#fff; box-shadow:0 2px 8px -2px var(--theme-solid,#7367f0); }
  .tc-add { opacity:0; transition:opacity .15s ease; }
  .tc-day:hover .tc-add, .tc-add:focus { opacity:1; }
  .tc-pill { display:flex; align-items:center; gap:6px; padding:4px 7px 4px 5px; border-radius:7px; background:var(--tc-pill); border:1px solid var(--tc-border); border-left:3px solid var(--pri,#cbd5e1);
             font-size:.715rem; font-weight:600; color:var(--tc-text); overflow:hidden; transition:transform .15s ease, box-shadow .15s ease; margin-top:4px; }
  .tc-pill:hover { transform:translateY(-1px); box-shadow:0 4px 10px -4px rgba(0,0,0,.28); }
  .tc-pill.tc-done .tc-pill-title { text-decoration:line-through; opacity:.6; }
  .tc-pill-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; background:var(--stat,#94a3b8); }
  .tc-pill-title { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .tc-ms { display:flex; align-items:center; gap:6px; padding:3px 7px; border-radius:6px; background:var(--tc-ms-tint); border:1px dashed ${MILESTONE_MARK}; font-size:.69rem; font-weight:600; color:var(--tc-text); overflow:hidden; margin-top:4px; }
  .tc-ms-mark { width:7px; height:7px; border-radius:2px; flex-shrink:0; background:${MILESTONE_MARK}; }
  .tc-more { font-size:.66rem; font-weight:700; color:var(--theme-solid,#7367f0); background:color-mix(in srgb, var(--theme-solid,#7367f0) 10%, transparent); padding:2px 7px; border-radius:6px; margin-top:4px; display:inline-block; }
  .tc-more:hover { background:color-mix(in srgb, var(--theme-solid,#7367f0) 20%, transparent); }
  .tc-panel { border:1px solid var(--tc-border); border-radius:14px; overflow:hidden; background:var(--tc-surface); }
  .tc-panel-head { background:var(--tc-header); border-bottom:1px solid var(--tc-border); }
  .tc-card { border:1px solid var(--tc-border); border-radius:12px; background:var(--tc-pill); padding:10px; text-align:left; transition:box-shadow .15s ease; }
  .tc-card:hover { box-shadow:0 6px 16px -8px rgba(0,0,0,.3); }
  .tc-text { color:var(--tc-text); } .tc-muted { color:var(--tc-muted); }
  .tc-nav { height:36px; width:36px; display:inline-flex; align-items:center; justify-content:center; border-radius:8px; border:1px solid var(--tc-border); background:var(--tc-pill); color:var(--tc-muted); }
  .tc-nav:hover { background:var(--tc-hover); }
`

const iso = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = s => new Date(`${s}T00:00:00`)
const addDays = (s, n) => {
  const d = parse(s)
  d.setDate(d.getDate() + n)

  return iso(d)
}
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000)
const mondayOf = s => addDays(s, -((parse(s).getDay() + 6) % 7))
const projectPath = (id, tab) => `${PMS_BASE}/projects/projectDetails/?id=${id}${tab ? `&tab=${tab}` : ''}`

// A task sits on its due date (a task with only a start date sits on that day), like a compliance on its due date.
const dayOf = t => t.due_date || t.start_date

const TaskTip = ({ t }) => (
  <div className='text-[12px] leading-5'>
    <div className='font-semibold'>
      {t.task_key} · {t.title}
    </div>
    <div>
      {t.project_code} · {t.priority} priority
    </div>
    <div>Status: {statusOf(t)}</div>
    <div>{t.assignee_name ? `Assignee: ${t.assignee_name}` : 'Unassigned'}</div>
    <div>
      {t.start_date && t.start_date !== t.due_date
        ? `${formatDate(t.start_date)} → ${formatDate(t.due_date)}`
        : `Due ${formatDate(dayOf(t))}`}
    </div>
  </div>
)

const TaskPill = ({ t, onOpen, onDragStart, saving }) => {
  const done = t.status === 'Done'

  return (
    <Tooltip arrow placement='top' title={<TaskTip t={t} />} disableInteractive>
      <div
        role='button'
        tabIndex={0}
        data-task={t.task_key}
        data-overdue={t.is_overdue ? 'true' : undefined}
        draggable={!done && !saving}
        onDragStart={e => onDragStart(e, t)}
        onClick={e => {
          e.stopPropagation()
          onOpen(t)
        }}
        onKeyDown={e => e.key === 'Enter' && onOpen(t)}
        className={`tc-pill ${done ? 'tc-done cursor-pointer' : 'cursor-grab'} ${saving ? 'animate-pulse' : ''}`}
        style={{ '--pri': PRIORITY[t.priority]?.bar, '--stat': STATUS[statusOf(t)]?.dot }}
      >
        <span className='tc-pill-dot' />
        <span className='tc-pill-title'>{t.title}</span>
      </div>
    </Tooltip>
  )
}

const MilestoneChip = ({ m, onOpen }) => (
  <Tooltip
    arrow
    placement='top'
    disableInteractive
    title={
      <div className='text-[12px] leading-5'>
        <div className='font-semibold'>{m.name}</div>
        <div>
          Milestone · {m.project_code} · {m.status}
        </div>
      </div>
    }
  >
    <div
      role='button'
      tabIndex={0}
      onClick={e => {
        e.stopPropagation()
        onOpen(m)
      }}
      className='tc-ms cursor-pointer'
    >
      <span className='tc-ms-mark' />
      <span className='tc-pill-title'>{m.name}</span>
    </div>
  </Tooltip>
)

const Badge = ({ className, children }) => (
  <span className={`inline-flex items-center rounded-md border px-2 py-[3px] text-[10.5px] font-semibold ${className}`}>
    {children}
  </span>
)

const TaskCard = ({ t, onOpen, note }) => (
  <button
    type='button'
    onClick={() => onOpen(t)}
    className='tc-card w-full cursor-pointer'
    style={{ borderLeft: `3px solid ${PRIORITY[t.priority]?.bar}` }}
  >
    <div className='tc-text mb-0.5 text-[13px] font-semibold'>{t.title}</div>
    <div className='tc-muted mb-2 text-[11.5px]'>
      {t.task_key} · {t.project_code}
      {t.assignee_name ? ` · ${t.assignee_name}` : ' · Unassigned'}
      {note ? ` · ${note}` : ''}
    </div>
    <div className='flex flex-wrap items-center gap-1.5'>
      <Badge className={STATUS[statusOf(t)]?.badge}>{statusOf(t)}</Badge>
      <Badge className={PRIORITY[t.priority]?.badge}>{t.priority}</Badge>
      {t.estimated_hours ? (
        <Badge className='border-slate-200 bg-slate-50 text-slate-600'>{t.estimated_hours} h</Badge>
      ) : null}
    </div>
  </button>
)

const TaskCalendar = () => {
  const router = useRouter()
  const { projectId, picker, ready } = useProjectPicker({ allowAll: true })
  const today = iso(new Date())
  const [view, setView] = useState('month')
  const [anchor, setAnchor] = useState(today)
  const [mine, setMine] = useState(false)
  const [includeDone, setIncludeDone] = useState(true)
  const [selected, setSelected] = useState(null)
  const [drawerDay, setDrawerDay] = useState(null)
  const [drag, setDrag] = useState(null)
  const [hoverDay, setHoverDay] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const { data: metaResp } = useGetTaskMetaQuery()
  const [reschedule] = useRescheduleTaskMutation()

  const monthKey = anchor.slice(0, 7)
  const gridStart = view === 'month' ? mondayOf(`${monthKey}-01`) : mondayOf(anchor)
  // Month: only as many weeks as the month needs (like the Compliance Calendar); week: 7 days.
  const dayCount = useMemo(() => {
    if (view === 'week') return 7
    const last = parse(`${monthKey}-01`)
    last.setMonth(last.getMonth() + 1, 0)

    return Math.ceil((daysBetween(gridStart, iso(last)) + 1) / 7) * 7
  }, [view, monthKey, gridStart])
  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => addDays(gridStart, i)), [gridStart, dayCount])

  const { data, isFetching } = useGetTaskCalendarQuery(
    { from: days[0], to: days[days.length - 1], projectId: projectId || undefined, mine, includeDone },
    { refetchOnMountOrArgChange: true, skip: !ready }
  )
  const cal = data?.detail
  const tasks = useMemo(() => cal?.tasks || [], [cal])
  const milestones = useMemo(() => cal?.milestones || [], [cal])

  const byDay = useMemo(() => {
    const map = {}
    tasks.forEach(t => {
      const k = dayOf(t)
      ;(map[k] = map[k] || []).push(t)
    })
    Object.values(map).forEach(list =>
      list.sort(
        (a, b) =>
          Number(b.is_overdue) - Number(a.is_overdue) ||
          ['Critical', 'High', 'Medium', 'Low'].indexOf(a.priority) -
            ['Critical', 'High', 'Medium', 'Low'].indexOf(b.priority)
      )
    )

    return map
  }, [tasks])
  const msByDay = useMemo(() => {
    const map = {}
    milestones.forEach(m => (map[m.due_date] = map[m.due_date] || []).push(m))

    return map
  }, [milestones])

  const monthLabel =
    view === 'month'
      ? `${MONTHS[parse(anchor).getMonth()]} ${parse(anchor).getFullYear()}`
      : `${formatDate(days[0])} - ${formatDate(days[6])}`
  const move = step => {
    setSelected(null)
    if (view === 'week') return setAnchor(addDays(anchor, step * 7))
    const d = parse(`${monthKey}-01`)
    d.setMonth(d.getMonth() + step)
    setAnchor(iso(d))
  }

  const openTask = t => router.push(taskDetailsPath(t.id))
  const openMilestone = m => router.push(projectPath(m.project_id, 'milestones'))

  // Drag a pill to another day: the due date moves there and a start date moves by the same number of days.
  const onDragStart = (e, t) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(t.id))
    setDrag(t)
  }
  const onDrop = async day => {
    const t = drag
    setDrag(null)
    setHoverDay(null)
    if (!t) return
    const delta = daysBetween(dayOf(t), day)
    if (!delta) return
    const dueDate = t.due_date ? addDays(t.due_date, delta) : addDays(t.start_date, delta)
    const startDate = t.start_date ? addDays(t.start_date, delta) : null
    setSavingId(t.id)
    try {
      const resp = await reschedule({ id: t.id, startDate, dueDate }).unwrap()
      toast.success(resp?.detail || 'Rescheduled')
    } catch {
      // The API's reason (project dates, dependencies) is shown by the shared error toast.
    } finally {
      setSavingId(null)
    }
  }

  const maxPills = view === 'month' ? 3 : 50
  const overdue = tasks.filter(t => t.is_overdue).length
  const dueOnSelected = selected ? byDay[selected] || [] : []
  const msOnSelected = selected ? msByDay[selected] || [] : []
  const ongoingOnSelected = selected
    ? tasks.filter(t => t.start_date && t.due_date && t.start_date <= selected && t.due_date > selected)
    : []

  const toggle = (active, onClick, label, icon) => (
    <button
      type='button'
      onClick={onClick}
      className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition ${
        active
          ? 'border-transparent text-white'
          : 'tc-text border-[var(--tc-border)] bg-[var(--tc-pill)] hover:bg-[var(--tc-hover)]'
      }`}
      style={active ? { background: 'var(--theme-solid)' } : undefined}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <PmsPage screenId='tasks.calendar'>
      <style>{SKIN}</style>
      <TaskDrawer
        open={Boolean(drawerDay)}
        onClose={() => setDrawerDay(null)}
        projectId={projectId || undefined}
        meta={metaResp?.detail}
        mine={mine}
        dueDate={drawerDay}
      />

      <div className='tc-cal'>
        {/* Filters */}
        <div className='mb-3 flex flex-wrap items-center gap-2'>
          {picker}
          <div className='flex overflow-hidden rounded-lg border border-[var(--tc-border)]'>
            {['month', 'week'].map(v => (
              <button
                key={v}
                type='button'
                onClick={() => {
                  setView(v)
                  setSelected(null)
                }}
                className={`h-9 cursor-pointer px-3.5 text-[13px] font-semibold capitalize ${
                  view === v ? 'text-white' : 'tc-text bg-[var(--tc-pill)] hover:bg-[var(--tc-hover)]'
                }`}
                style={view === v ? { background: 'var(--theme-solid)' } : undefined}
              >
                {v}
              </button>
            ))}
          </div>
          {toggle(mine, () => setMine(!mine), 'My Tasks', <User size={15} />)}
          <label className='tc-text flex cursor-pointer items-center gap-2 text-[13px]'>
            <input
              type='checkbox'
              checked={includeDone}
              onChange={e => setIncludeDone(e.target.checked)}
              className='h-4 w-4 accent-[var(--theme-solid)]'
            />
            Show done
          </label>
        </div>

        {/* Header: navigation + legend */}
        <div className='mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
          <div className='flex flex-wrap items-center gap-2'>
            <button
              type='button'
              onClick={() => move(-1)}
              aria-label='Previous'
              className='tc-nav cursor-pointer transition'
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type='button'
              onClick={() => move(1)}
              aria-label='Next'
              className='tc-nav cursor-pointer transition'
            >
              <ChevronRight size={17} />
            </button>
            <div className='ms-1 flex items-center gap-2'>
              <CalendarDays size={18} className='text-[var(--theme-solid)]' />
              <span className='tc-text text-[17px] font-bold tracking-tight' data-cal-title>
                {monthLabel}
              </span>
            </div>
            <button
              type='button'
              onClick={() => {
                setAnchor(today)
                setSelected(null)
              }}
              className='tc-text ms-2 h-8 cursor-pointer rounded-lg border border-[var(--tc-border)] bg-[var(--tc-pill)] px-3 text-[12px] font-semibold hover:bg-[var(--tc-hover)]'
            >
              Today
            </button>
            <span className='tc-muted ms-2 text-[12px]'>
              {tasks.length} task{tasks.length === 1 ? '' : 's'}
              {overdue ? <span className='font-semibold text-red-500'> · {overdue} overdue</span> : ''}
              {cal?.undated > 0 && (
                <>
                  {' · '}
                  <Link
                    href={`${PMS_BASE}/tasks/allTasks/`}
                    className='font-semibold hover:underline'
                    style={{ color: 'var(--theme-solid)' }}
                    title='Open tasks without a start or due date are not on the calendar'
                  >
                    {cal.undated} open task{cal.undated === 1 ? ' has' : 's have'} no dates
                  </Link>
                </>
              )}
            </span>
          </div>
          <div className='flex flex-wrap items-center gap-x-4 gap-y-1'>
            {Object.entries(STATUS).map(([label, s]) => (
              <div key={label} className='flex items-center gap-1.5'>
                <span className='h-2 w-2 rounded-full' style={{ background: s.dot }} />
                <span className='tc-muted text-[11.5px] font-medium'>{label}</span>
              </div>
            ))}
            <div className='flex items-center gap-1.5 ps-1'>
              <span className='h-2 w-2 rounded-[2px]' style={{ background: MILESTONE_MARK }} />
              <span className='tc-muted text-[11.5px] font-medium'>Milestone</span>
            </div>
          </div>
        </div>

        <div className='flex flex-col gap-4 xl:flex-row'>
          {/* Grid (tablet and up) */}
          <div className={`hidden min-w-0 flex-1 transition-opacity md:block ${isFetching ? 'opacity-70' : ''}`}>
            <div className='tc-grid'>
              <div className='grid grid-cols-7'>
                {WEEKDAYS.map(w => (
                  <div key={w} className='tc-head'>
                    {w}
                  </div>
                ))}
              </div>
              <div className='grid grid-cols-7'>
                {days.map(day => {
                  const list = byDay[day] || []
                  const ms = msByDay[day] || []
                  const shown = list.slice(0, Math.max(0, maxPills - ms.length))
                  const more = list.length - shown.length
                  const weekday = parse(day).getDay()
                  const cls = [
                    'tc-day group',
                    view === 'month' && day.slice(0, 7) !== monthKey ? 'tc-outside' : '',
                    weekday % 6 === 0 ? 'tc-weekend' : '',
                    day === today ? 'tc-today' : '',
                    selected === day ? 'tc-selected' : '',
                    hoverDay === day ? 'tc-drop' : ''
                  ].join(' ')

                  return (
                    <div
                      key={day}
                      data-day={day}
                      className={cls}
                      style={{ minHeight: view === 'month' ? 118 : 420 }}
                      onClick={() => setSelected(selected === day ? null : day)}
                      onDragOver={e => {
                        if (!drag) return
                        e.preventDefault()
                        if (hoverDay !== day) setHoverDay(day)
                      }}
                      onDragLeave={() => hoverDay === day && setHoverDay(null)}
                      onDrop={e => {
                        e.preventDefault()
                        onDrop(day)
                      }}
                    >
                      <div className='flex items-center justify-between'>
                        <span className='tc-num'>
                          {view === 'week'
                            ? `${WEEKDAYS[(weekday + 6) % 7]} ${parse(day).getDate()}`
                            : parse(day).getDate()}
                        </span>
                        <button
                          type='button'
                          onClick={e => {
                            e.stopPropagation()
                            setDrawerDay(day)
                          }}
                          className='tc-add tc-muted cursor-pointer rounded-md p-0.5 hover:bg-[var(--tc-hover)] hover:text-[var(--theme-solid)]'
                          aria-label={`Add task due ${day}`}
                          title='Add a task due this day'
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                      {ms.map(m => (
                        <MilestoneChip key={`m${m.id}`} m={m} onOpen={openMilestone} />
                      ))}
                      {shown.map(t => (
                        <TaskPill
                          key={t.id}
                          t={t}
                          onOpen={openTask}
                          onDragStart={onDragStart}
                          saving={savingId === t.id}
                        />
                      ))}
                      {more > 0 && (
                        <button
                          type='button'
                          onClick={e => {
                            e.stopPropagation()
                            setSelected(day)
                          }}
                          className='tc-more cursor-pointer'
                        >
                          +{more} more
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            <p className='tc-muted mt-2 text-[11px]'>
              Click a day to see its tasks · drag a task to another day to move its due date · hover a day and press +
              to add a task.
            </p>
          </div>

          {/* Day agenda panel */}
          {selected && (
            <div className='tc-panel hidden shrink-0 md:block xl:w-[330px]' data-day-panel>
              <div className='tc-panel-head flex items-center justify-between px-3.5 py-3'>
                <div>
                  <div className='tc-text text-[13.5px] font-bold'>
                    {WEEKDAYS[(parse(selected).getDay() + 6) % 7]}, {formatDate(selected)}
                  </div>
                  <div className='tc-muted text-[11.5px]'>
                    {dueOnSelected.length} due
                    {ongoingOnSelected.length ? ` · ${ongoingOnSelected.length} in progress` : ''}
                    {msOnSelected.length
                      ? ` · ${msOnSelected.length} milestone${msOnSelected.length === 1 ? '' : 's'}`
                      : ''}
                  </div>
                </div>
                <div className='flex items-center gap-1'>
                  <button
                    type='button'
                    onClick={() => setDrawerDay(selected)}
                    className='tc-muted inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md hover:bg-[var(--tc-hover)] hover:text-[var(--theme-solid)]'
                    aria-label='Add task on this day'
                    title='Add a task due this day'
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    type='button'
                    onClick={() => setSelected(null)}
                    className='tc-muted inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md hover:bg-[var(--tc-hover)]'
                    aria-label='Close day panel'
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
              <div className='flex max-h-[520px] flex-col gap-2 overflow-y-auto p-2.5'>
                {msOnSelected.map(m => (
                  <button
                    key={m.id}
                    type='button'
                    onClick={() => openMilestone(m)}
                    className='cursor-pointer rounded-xl border border-dashed border-violet-300 bg-violet-50 p-2.5 text-left text-violet-700'
                  >
                    <div className='mb-0.5 flex items-center gap-1.5 text-[13px] font-semibold'>
                      <span className='h-2 w-2 shrink-0 rounded-[2px]' style={{ background: MILESTONE_MARK }} />
                      {m.name}
                    </div>
                    <div className='text-[11.5px] opacity-80'>
                      Milestone · {m.project_code} · {m.status}
                    </div>
                  </button>
                ))}
                {dueOnSelected.map(t => (
                  <TaskCard key={t.id} t={t} onOpen={openTask} />
                ))}
                {ongoingOnSelected.length > 0 && (
                  <div className='tc-muted mt-1 px-1 text-[11px] font-semibold uppercase tracking-wider'>
                    In progress this day
                  </div>
                )}
                {ongoingOnSelected.map(t => (
                  <TaskCard key={`o${t.id}`} t={t} onOpen={openTask} note={`due ${formatDate(t.due_date)}`} />
                ))}
                {!dueOnSelected.length && !ongoingOnSelected.length && !msOnSelected.length && (
                  <div className='flex flex-col items-center justify-center gap-2 py-9 text-center'>
                    <Inbox size={26} className='text-slate-300' />
                    <span className='tc-muted text-[12.5px]'>Nothing due on this day</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Phones: agenda list */}
        <div className='flex flex-col gap-3 md:hidden'>
          {days
            .filter(
              day =>
                (view === 'week' || day.slice(0, 7) === monthKey) &&
                ((byDay[day] || []).length || (msByDay[day] || []).length)
            )
            .map(day => (
              <div key={day} className='tc-panel p-2.5'>
                <div
                  className='mb-1.5 text-[12px] font-bold'
                  style={{ color: day === today ? 'var(--theme-solid)' : undefined }}
                >
                  <span className={day === today ? '' : 'tc-text'}>
                    {WEEKDAYS[(parse(day).getDay() + 6) % 7]}, {formatDate(day)}
                    {day === today ? ' · Today' : ''}
                  </span>
                </div>
                <div className='flex flex-col gap-2'>
                  {(msByDay[day] || []).map(m => (
                    <MilestoneChip key={m.id} m={m} onOpen={openMilestone} />
                  ))}
                  {(byDay[day] || []).map(t => (
                    <TaskCard key={t.id} t={t} onOpen={openTask} />
                  ))}
                </div>
              </div>
            ))}
          {!tasks.length && !milestones.length && (
            <div className='tc-muted py-8 text-center text-sm'>
              {isFetching ? 'Loading...' : 'Nothing scheduled in this period.'}
            </div>
          )}
        </div>

        {!isFetching && !tasks.length && !milestones.length && (
          <div className='tc-muted mt-3 hidden text-center text-[12.5px] md:block'>No tasks due in {monthLabel}.</div>
        )}
      </div>
    </PmsPage>
  )
}

export default TaskCalendar
