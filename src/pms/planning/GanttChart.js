import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { taskDetailsPath } from 'src/pms/tasks/paths'

// A timeline of tasks (bars), milestones (diamonds) and dependencies (arrows).
// Bars can be dragged (move) or stretched from either end (dates); every drop is checked by the server.

const DAY_MS = 86400000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ZOOM = { day: 34, week: 14, month: 5 }
const ROW = 40
const HEADER = 52
const MILESTONE_ROW = 30
const LEFT = 300

const STATUS_COLOR = { 'To Do': '#94a3b8', 'In Progress': '#3b82f6', Testing: '#f59e0b', Done: '#22c55e' }

// Dates are whole days (yyyy-mm-dd), counted in UTC so daylight saving never shifts a bar.
const toDay = iso => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY_MS)
const toIso = day => new Date(day * DAY_MS).toISOString().slice(0, 10)
const dateOf = day => new Date(day * DAY_MS)
const label = iso => {
  const d = dateOf(toDay(iso))

  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]}`
}

const GanttChart = ({ data, canEdit, onReschedule }) => {
  const [zoom, setZoom] = useState('week')
  const [showCritical, setShowCritical] = useState(true)
  const [drag, setDrag] = useState(null) // { id, mode, startX, origStart, origDue, start, due }
  // Dropped bars stay where they were dropped until the server answers (removed again if it refuses).
  const [pending, setPending] = useState({})
  useEffect(() => setPending({}), [data])
  const scrollRef = useRef(null)
  const px = ZOOM[zoom]

  const tasks = useMemo(() => data.tasks.filter(t => t.start && t.due), [data])
  const undated = useMemo(() => data.tasks.filter(t => !(t.start && t.due)), [data])
  const rowIndex = useMemo(() => Object.fromEntries(tasks.map((t, i) => [t.id, i])), [tasks])

  // Visible range: a little before the first date and after the last, starting on a Monday.
  const first = toDay(data.range.start) - 3
  const rangeStart = first - ((dateOf(first).getUTCDay() + 6) % 7)
  const rangeEnd = toDay(data.range.end) + 10
  const totalDays = rangeEnd - rangeStart + 1
  const width = totalDays * px
  const today = toDay(data.today)
  const bodyHeight = Math.max(tasks.length, 1) * ROW

  // Start scrolled so that today (or the start of the plan) is in view.
  useEffect(() => {
    if (!scrollRef.current) return
    const target = today >= rangeStart && today <= rangeEnd ? today : toDay(data.range.start)
    scrollRef.current.scrollLeft = Math.max(0, (target - rangeStart) * px - 120)
  }, [zoom, data.project.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const barOf = t => {
    const live = drag && drag.id === t.id ? drag : pending[t.id]
    const s = live ? live.start : toDay(t.start)
    const d = live ? live.due : toDay(t.due)

    return { x: (s - rangeStart) * px, w: (d - s + 1) * px, s, d }
  }

  // ---------- drag and drop ----------
  const startDrag = (e, t, mode) => {
    if (!canEdit || (t.status === 'Done' && mode !== 'move')) return
    e.preventDefault()
    e.stopPropagation()
    setDrag({ id: t.id, mode, startX: e.clientX, origStart: toDay(t.start), origDue: toDay(t.due), start: toDay(t.start), due: toDay(t.due) })
  }

  useEffect(() => {
    if (!drag) return undefined
    const move = e => {
      const delta = Math.round((e.clientX - drag.startX) / px)
      setDrag(prev => {
        if (!prev) return prev
        if (prev.mode === 'move') return { ...prev, start: prev.origStart + delta, due: prev.origDue + delta }
        if (prev.mode === 'end') return { ...prev, due: Math.max(prev.origStart, prev.origDue + delta) }

        return { ...prev, start: Math.min(prev.origDue, prev.origStart + delta) }
      })
    }
    const up = () => {
      setDrag(null)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)

    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [drag?.id, drag?.mode, px]) // eslint-disable-line react-hooks/exhaustive-deps

  // The drop is committed from here so the latest dragged dates are used.
  const lastDrag = useRef(null)
  useEffect(() => {
    if (drag) {
      lastDrag.current = drag

      return
    }
    const d = lastDrag.current
    lastDrag.current = null
    if (!d || (d.start === d.origStart && d.due === d.origDue)) return
    const task = data.tasks.find(t => t.id === d.id)
    setPending(prev => ({ ...prev, [d.id]: { start: d.start, due: d.due } }))
    onReschedule(task, toIso(d.start), toIso(d.due)).catch(() =>
      setPending(prev => {
        const next = { ...prev }
        delete next[d.id]

        return next
      })
    )
  }, [drag]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- header scale ----------
  const months = []
  for (let day = rangeStart; day <= rangeEnd; ) {
    const d = dateOf(day)
    const nextMonth = Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY_MS)
    const end = Math.min(nextMonth, rangeEnd + 1)
    months.push({ day, span: end - day, text: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` })
    day = end
  }
  const ticks = []
  for (let day = rangeStart; day <= rangeEnd; day += zoom === 'day' ? 1 : 7) ticks.push(day)

  // ---------- dependency arrows ----------
  const arrows = data.dependencies
    .filter(dep => dep.from in rowIndex && dep.to in rowIndex)
    .map(dep => {
      const from = tasks[rowIndex[dep.from]]
      const to = tasks[rowIndex[dep.to]]
      const a = barOf(from)
      const b = barOf(to)
      const x1 = a.x + a.w
      const y1 = MILESTONE_ROW + rowIndex[dep.from] * ROW + ROW / 2
      const x2 = b.x
      const y2 = MILESTONE_ROW + rowIndex[dep.to] * ROW + ROW / 2
      const conflict = to.status !== 'Done' && b.s <= a.d
      const bend = Math.max(x1 + 8, Math.min(x2 - 8, x1 + 16))

      return { id: dep.id, conflict, path: `M ${x1} ${y1} H ${bend} V ${y2} H ${x2 - 2}`, title: `${to.key} waits for ${from.key}` }
    })

  const critical = new Set(showCritical ? data.critical_path : [])

  return (
    <div>
      <div className='mb-2 flex flex-wrap items-center gap-2'>
        <div className='inline-flex gap-1 rounded-lg border border-gray-200 bg-white p-1'>
          {Object.keys(ZOOM).map(z => (
            <button
              key={z}
              type='button'
              onClick={() => setZoom(z)}
              className={`cursor-pointer rounded-md px-3 py-1 text-[13px] font-semibold capitalize ${zoom === z ? 'text-white' : 'text-slate-600 hover:bg-gray-100'}`}
              style={zoom === z ? { background: 'var(--theme-solid)' } : undefined}
            >
              {z}
            </button>
          ))}
        </div>
        <button type='button' onClick={() => setShowCritical(v => !v)} className={`filterCustBtn ${showCritical ? 'active' : ''}`} disabled={!data.critical_path.length}>
          <Icon icon='tabler:route' width={16} /> Critical path {data.critical_path.length ? `(${data.critical_path.length})` : ''}
        </button>
        <div className='flex flex-wrap items-center gap-3 text-xs text-gray-500 md:ms-auto'>
          {Object.entries(STATUS_COLOR).map(([s, c]) => (
            <span key={s} className='inline-flex items-center gap-1'>
              <span className='h-2.5 w-4 rounded-sm' style={{ background: c }} /> {s}
            </span>
          ))}
          <span className='inline-flex items-center gap-1'>
            <span className='h-2.5 w-2.5 rotate-45' style={{ background: '#7c3aed' }} /> Milestone
          </span>
          {canEdit && <span>Drag a bar to move it, or its ends to change dates</span>}
        </div>
      </div>

      <div className='flex overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm' style={{ userSelect: drag ? 'none' : undefined }}>
        {/* Task names */}
        <div className='shrink-0 border-r border-gray-200' style={{ width: LEFT }}>
          <div className='flex items-end border-b border-gray-200 px-3 pb-2 text-xs font-semibold text-gray-500' style={{ height: HEADER }}>
            Task
          </div>
          <div className='flex items-center border-b border-gray-100 px-3 text-xs font-semibold text-violet-600' style={{ height: MILESTONE_ROW }}>
            Milestones
          </div>
          {tasks.map(t => (
            <div key={t.id} className={`flex items-center gap-2 border-b border-gray-100 px-3 ${t.parent_id ? 'ps-7' : ''}`} style={{ height: ROW }}>
              <div className='min-w-0'>
                <Link href={taskDetailsPath(t.id)} className='block truncate text-[13px] font-semibold text-slate-800 hover:underline' title={t.title}>
                  {t.parent_id && <span className='text-gray-400'>↳ </span>}
                  {t.title}
                </Link>
                <div className='truncate text-[11px] text-gray-500'>
                  {t.key} · {t.assignee || 'Unassigned'}
                </div>
              </div>
            </div>
          ))}
          {tasks.length === 0 && <div className='p-4 text-sm text-gray-500'>No dated tasks yet.</div>}
        </div>

        {/* Timeline */}
        <div ref={scrollRef} className='min-w-0 flex-1 overflow-x-auto'>
          <div className='relative' style={{ width, height: HEADER + MILESTONE_ROW + bodyHeight }}>
            {/* scale */}
            <div className='absolute left-0 top-0 flex border-b border-gray-200' style={{ width, height: HEADER / 2 }}>
              {months.map(m => (
                <div key={m.day} className='truncate border-r border-gray-200 px-2 pt-1 text-xs font-semibold text-slate-700' style={{ width: m.span * px }}>
                  {m.span * px > 40 ? m.text : ''}
                </div>
              ))}
            </div>
            <div className='absolute left-0 border-b border-gray-200' style={{ top: HEADER / 2, width, height: HEADER / 2 }}>
              {zoom !== 'month' &&
                ticks.map(day => (
                  <div key={day} className='absolute top-1 text-[10px] text-gray-500' style={{ left: (day - rangeStart) * px + 2 }}>
                    {zoom === 'day' ? dateOf(day).getUTCDate() : label(toIso(day))}
                  </div>
                ))}
            </div>

            <div className='absolute left-0' style={{ top: HEADER, width, height: MILESTONE_ROW + bodyHeight }}>
              {/* grid lines + weekends */}
              {ticks.map(day => (
                <div key={day} className='absolute top-0 h-full border-l border-gray-100' style={{ left: (day - rangeStart) * px }} />
              ))}
              {zoom === 'day' &&
                Array.from({ length: totalDays }, (_, i) => rangeStart + i)
                  .filter(day => [0, 6].includes(dateOf(day).getUTCDay()))
                  .map(day => <div key={`w${day}`} className='absolute top-0 h-full bg-gray-50' style={{ left: (day - rangeStart) * px, width: px }} />)}

              {/* project window */}
              {data.project.start && <div className='absolute top-0 h-full border-l-2 border-dashed border-slate-300' style={{ left: (toDay(data.project.start) - rangeStart) * px }} title='Project start' />}
              {data.project.end && <div className='absolute top-0 h-full border-l-2 border-dashed border-slate-300' style={{ left: (toDay(data.project.end) - rangeStart + 1) * px }} title='Project end' />}

              {/* milestones */}
              {data.milestones
                .filter(m => m.due)
                .map(m => (
                  <div
                    key={m.id}
                    className='absolute flex items-center'
                    style={{ left: (toDay(m.due) - rangeStart) * px + px / 2 - 7, top: MILESTONE_ROW / 2 - 7 }}
                    title={`${m.name} · due ${label(m.due)} · ${m.status}`}
                  >
                    <span className='h-3.5 w-3.5 rotate-45 rounded-sm' style={{ background: m.status === 'Accepted' ? '#22c55e' : '#7c3aed' }} />
                    {px * 6 > 60 && <span className='ms-2 whitespace-nowrap text-[11px] font-semibold text-violet-700'>{m.name}</span>}
                  </div>
                ))}

              {/* row stripes */}
              {tasks.map((t, i) => (
                <div key={`r${t.id}`} className='absolute left-0 border-b border-gray-100' style={{ top: MILESTONE_ROW + i * ROW, width, height: ROW }} />
              ))}

              {/* dependency arrows */}
              <svg className='pointer-events-none absolute left-0 top-0' width={width} height={MILESTONE_ROW + bodyHeight}>
                <defs>
                  <marker id='gantt-arrow' markerWidth='8' markerHeight='8' refX='6' refY='4' orient='auto'>
                    <path d='M0,0 L8,4 L0,8 z' fill='#64748b' />
                  </marker>
                  <marker id='gantt-arrow-red' markerWidth='8' markerHeight='8' refX='6' refY='4' orient='auto'>
                    <path d='M0,0 L8,4 L0,8 z' fill='#dc2626' />
                  </marker>
                </defs>
                {arrows.map(a => (
                  <path key={a.id} d={a.path} fill='none' stroke={a.conflict ? '#dc2626' : '#64748b'} strokeWidth='1.5' strokeDasharray={a.conflict ? '4 3' : undefined} markerEnd={`url(#${a.conflict ? 'gantt-arrow-red' : 'gantt-arrow'})`}>
                    <title>{a.title}</title>
                  </path>
                ))}
              </svg>

              {/* bars */}
              {tasks.map((t, i) => {
                const { x, w } = barOf(t)
                const color = STATUS_COLOR[t.status] || '#94a3b8'
                const isCritical = critical.has(t.id)
                const moving = drag?.id === t.id

                return (
                  <div
                    key={t.id}
                    data-bar={t.key}
                    className={`group absolute flex items-center overflow-hidden rounded-md text-[11px] font-semibold shadow-sm ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    style={{
                      left: x,
                      top: MILESTONE_ROW + i * ROW + 8,
                      width: Math.max(w, 6),
                      height: ROW - 16,
                      background: `color-mix(in srgb, ${color} 45%, white)`,
                      color: t.progress >= 50 ? '#ffffff' : '#1e293b',
                      outline: isCritical ? '2px solid #dc2626' : t.is_overdue ? '2px solid #f97316' : undefined,
                      opacity: moving ? 0.85 : 1,
                      zIndex: moving ? 5 : 1
                    }}
                    title={`${t.key} ${t.title}\n${label(toIso(barOf(t).s))} - ${label(toIso(barOf(t).d))} · ${t.status}${isCritical ? ' · on the critical path' : ''}${t.is_overdue ? ' · overdue' : ''}`}
                    onMouseDown={e => startDrag(e, t, 'move')}
                  >
                    <div className='absolute inset-y-0 left-0' style={{ width: `${t.progress}%`, background: color }} />
                    {w > 50 && <span className='relative truncate px-2'>{t.key}</span>}
                    {canEdit && (
                      <>
                        <span className='absolute inset-y-0 left-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100' style={{ background: 'rgba(0,0,0,.15)' }} onMouseDown={e => startDrag(e, t, 'start')} />
                        <span className='absolute inset-y-0 right-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100' style={{ background: 'rgba(0,0,0,.15)' }} onMouseDown={e => startDrag(e, t, 'end')} />
                      </>
                    )}
                    {moving && (
                      <span className='absolute -top-0 right-1 rounded bg-slate-800 px-1 text-[10px]'>
                        {label(toIso(drag.start))} - {label(toIso(drag.due))}
                      </span>
                    )}
                  </div>
                )
              })}

              {/* today */}
              {today >= rangeStart && today <= rangeEnd && (
                <div className='pointer-events-none absolute top-0 h-full border-l-2 border-red-500' style={{ left: (today - rangeStart) * px + px / 2 }}>
                  <span className='absolute -top-0 -translate-x-1/2 rounded bg-red-500 px-1 text-[10px] font-semibold text-white'>Today</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {undated.length > 0 && (
        <div className='mt-3 rounded-xl border border-dashed border-gray-300 bg-white p-3'>
          <div className='mb-2 text-[13px] font-semibold text-slate-700'>Not on the timeline yet (no start or due date)</div>
          <div className='flex flex-wrap gap-2'>
            {undated.map(t => (
              <Link key={t.id} href={taskDetailsPath(t.id)} className='rounded-md border border-gray-200 px-2 py-1 text-xs text-slate-700 hover:border-[var(--theme-solid)]'>
                {t.key} · {t.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default GanttChart
