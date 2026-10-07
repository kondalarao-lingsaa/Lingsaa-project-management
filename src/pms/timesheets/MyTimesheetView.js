import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Send } from 'lucide-react'
import toast from 'react-hot-toast'
import PmsPage from 'src/pms/components/PmsPage'
import ConfirmDialog from 'src/pms/components/ConfirmDialog'
import { Chip, GhostButton, PrimaryButton } from 'src/pms/components/ui'
import { taskDetailsPath } from 'src/pms/tasks/paths'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useCan } from 'src/pms/access/useAccess'
import { useGetMyWeekQuery, useSaveTimeEntryMutation, useSubmitWeekMutation } from 'src/store/apps/pms/timesheetsApi'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEK_TONE = { Empty: 'slate', Draft: 'blue', Submitted: 'amber', Approved: 'green', Rejected: 'red' }
const WEEK_HINT = {
  Empty: 'Nothing logged yet this week.',
  Draft: 'Saved as draft. Submit the week when it is complete.',
  Submitted: 'Waiting for your manager to approve. You can still add hours for other days or tasks, then submit them.',
  Approved: 'Approved. These hours are locked. You can still add hours for other days or tasks, then submit them.',
  Rejected: 'Some hours were sent back. Fix them and submit again.'
}

// Dates are handled as local yyyy-mm-dd strings so a timezone never moves a day.
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = s => {
  const [y, m, d] = s.split('-').map(Number)

  return new Date(y, m - 1, d)
}
const mondayOf = d => {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7))

  return iso(copy)
}
const addDays = (s, n) => {
  const d = parse(s)
  d.setDate(d.getDate() + n)

  return iso(d)
}
const shortDate = s => {
  const d = parse(s)

  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`
}
const fmt = n => (n ? Number(n.toFixed(2)).toString() : '')

// Same rule as the server: 0-24 in 0.25 steps.
const hoursError = raw => {
  if (raw === '') return null
  const n = Number(raw)
  if (Number.isNaN(n) || n < 0) return 'Enter hours as a number, e.g. 1.5'
  if (n > 24) return 'A day has at most 24 hours'
  if (Math.round(n * 4) !== n * 4) return 'Use steps of 0.25 (15 minutes), e.g. 1.25 or 2.5'

  return null
}

const MyTimesheetView = () => {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const { data, isFetching } = useGetMyWeekQuery(weekStart)
  const [saveEntry] = useSaveTimeEntryMutation()
  const [submitWeek, { isLoading: isSubmitting }] = useSubmitWeekMutation()

  const week = data?.detail
  const [drafts, setDrafts] = useState({}) // "taskId|date" -> text being typed
  const [cellErrors, setCellErrors] = useState({})
  const [saving, setSaving] = useState({})
  const [extraTasks, setExtraTasks] = useState([]) // rows added this session that have no hours yet
  const [picked, setPicked] = useState('')
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [removeRow, setRemoveRow] = useState(null) // row waiting for "Remove this row?" confirmation
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    setDrafts({})
    setCellErrors({})
    setExtraTasks([])
  }, [weekStart])

  const rows = useMemo(() => {
    if (!week) return []
    const logged = week.rows
    const ids = new Set(logged.map(r => r.task_id))
    const added = extraTasks.filter(id => !ids.has(id)).map(id => ({ ...week.tasks.find(t => t.task_id === id), cells: {}, total: 0 }))

    return [...logged, ...added.filter(r => r.task_id)]
  }, [week, extraTasks])

  const available = (week?.tasks || []).filter(t => t.can_log && !rows.some(r => r.task_id === t.task_id))
  const can = useCan()
  const mayLog = can('timesheets', 'add')
  const editable = week && mayLog && ['Empty', 'Draft', 'Rejected'].includes(week.status)
  const rejected = rows.flatMap(r => Object.entries(r.cells).filter(([, c]) => c.status === 'Rejected').map(([day, c]) => ({ row: r, day, cell: c })))
  const canSubmit = week && ['Draft', 'Rejected'].includes(week.status) && week.week_total > 0

  // locked_before: the project's lock-days setting closes older days, except for hours sent back to fix.
  const cellLocked = (row, day, cell) =>
    !mayLog ||
    !row.can_log ||
    day > week.today ||
    (cell && ['Submitted', 'Approved'].includes(cell.status)) ||
    (Boolean(row.locked_before) && day < row.locked_before && !cell?.sent_back)

  const commit = async (row, day) => {
    const key = `${row.task_id}|${day}`
    if (!(key in drafts)) return
    const raw = drafts[key].trim()
    const current = row.cells[day]?.hours || 0
    const error = hoursError(raw)
    if (error) {
      setCellErrors(prev => ({ ...prev, [key]: error }))
      toast.error(error)

      return
    }
    const hours = raw === '' ? 0 : Number(raw)
    if (hours === current) {
      setDrafts(({ [key]: _, ...rest }) => rest)

      return
    }
    const otherHours = rows.reduce((sum, r) => sum + (r.task_id === row.task_id ? 0 : r.cells[day]?.hours || 0), 0)
    if (otherHours + hours > 24) {
      const message = `${shortDate(day)} would have ${otherHours + hours} hours. A day has at most 24`
      setCellErrors(prev => ({ ...prev, [key]: message }))
      toast.error(message)

      return
    }
    setSaving(prev => ({ ...prev, [key]: true }))
    try {
      await saveEntry({ task_id: row.task_id, work_date: day, hours }).unwrap()
      setDrafts(({ [key]: _, ...rest }) => rest)
      setCellErrors(({ [key]: _, ...rest }) => rest)
    } catch (e) {
      setCellErrors(prev => ({ ...prev, [key]: e?.data?.detail || 'Could not save' }))
    } finally {
      setSaving(({ [key]: _, ...rest }) => rest)
    }
  }

  // A row can go while none of its hours are submitted or approved (those are locked until reviewed).
  const canRemove = row => !Object.values(row.cells).some(c => ['Submitted', 'Approved'].includes(c.status))
  const dropRow = taskId => {
    setExtraTasks(prev => prev.filter(id => id !== taskId))
    setDrafts(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${taskId}|`))))
    setCellErrors(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${taskId}|`))))
  }
  const askRemove = row => (Object.keys(row.cells).length ? setRemoveRow(row) : dropRow(row.task_id))
  const doRemove = async () => {
    const row = removeRow
    setRemoving(true)
    try {
      // Saving 0 hours deletes a draft entry.
      for (const day of Object.keys(row.cells)) await saveEntry({ task_id: row.task_id, work_date: day, hours: 0 }).unwrap()
      dropRow(row.task_id)
      toast.success(`Removed ${row.task_key} from this week`)
    } catch (e) {
      toast.error(e?.data?.detail || 'Could not remove the row')
    } finally {
      setRemoving(false)
      setRemoveRow(null)
    }
  }

  const doSubmit = async () => {
    try {
      const resp = await submitWeek(weekStart).unwrap()
      toast.success(resp?.detail || 'Week submitted')
    } catch {
      // The shared base query already showed why.
    } finally {
      setConfirmSubmit(false)
    }
  }

  const days = week?.days || Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const thisWeek = mondayOf(new Date())

  return (
    <PmsPage
      screenId='timesheets.myTimesheets'
      actions={
        mayLog &&
        editable !== undefined && (
          <PrimaryButton onClick={() => setConfirmSubmit(true)} disabled={!canSubmit || isSubmitting}>
            <Send size={15} /> Submit Week
          </PrimaryButton>
        )
      }
    >
      <ConfirmDialog
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        onConfirm={doSubmit}
        title='Submit this week?'
        message={week ? `${fmt(week.week_total)} hours for ${shortDate(week.week_start)} - ${shortDate(week.week_end)} go to your manager for approval. You cannot change them until they are reviewed.` : ''}
        confirmText='Submit'
        cancelText='Cancel'
        busy={isSubmitting}
      />
      <ConfirmDialog
        open={Boolean(removeRow)}
        onClose={() => setRemoveRow(null)}
        onConfirm={doRemove}
        title='Remove this row?'
        message={removeRow ? `The ${removeRow.total} draft hours of ${removeRow.task_key} in this week will be deleted.` : ''}
        confirmText='Remove'
        cancelText='Cancel'
        busy={removing}
      />

      <div className={`${ThemeStyles.tableColor} mb-3 rounded-md p-3`}>
        <div className='flex flex-wrap items-center gap-2'>
          <GhostButton onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label='Previous week' className='!px-2'>
            <Icon icon='tabler:chevron-left' width={18} />
          </GhostButton>
          <div className='min-w-[190px] text-center text-[15px] font-semibold text-slate-800'>
            {shortDate(weekStart)} - {shortDate(addDays(weekStart, 6))} {parse(addDays(weekStart, 6)).getFullYear()}
          </div>
          <GhostButton onClick={() => setWeekStart(addDays(weekStart, 7))} disabled={weekStart >= thisWeek} aria-label='Next week' className='!px-2'>
            <Icon icon='tabler:chevron-right' width={18} />
          </GhostButton>
          {weekStart !== thisWeek && (
            <button type='button' onClick={() => setWeekStart(thisWeek)} className='cursor-pointer text-[13px] font-semibold hover:underline' style={{ color: 'var(--theme-solid)' }}>
              This week
            </button>
          )}
          <div className='flex items-center gap-2 md:ms-auto'>
            {week && <Chip tone={WEEK_TONE[week.status]}>{week.status === 'Empty' ? 'Not started' : week.status}</Chip>}
            <span className='text-sm text-gray-500'>{week ? WEEK_HINT[week.status] : ''}</span>
          </div>
        </div>
      </div>

      {rejected.length > 0 && (
        <div className='mb-3 rounded-lg border border-red-300 bg-red-100 px-3 py-2 text-[13px] text-red-700'>
          <div className='mb-1 font-semibold'>Sent back by your manager:</div>
          <ul className='list-inside list-disc'>
            {rejected.map(({ row, day, cell }) => (
              <li key={`${row.task_id}${day}`}>
                {row.task_key} on {shortDate(day)} ({fmt(cell.hours)} h): {cell.reject_reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {week && !week.is_member ? (
        <div className={`${ThemeStyles.tableColor} rounded-md p-10 text-center`}>
          <Icon icon='tabler:users-plus' width={36} className='mx-auto mb-2 text-slate-400' />
          <div className='mb-1 text-[15px] font-semibold text-slate-800'>You are not on any project team yet</div>
          <div className='text-sm text-gray-500'>Time is logged on tasks of projects you belong to. Ask your project manager to add you in Project Details &gt; Team.</div>
        </div>
      ) : (
        <div className={`${ThemeStyles.tableColor} rounded-md`}>
          <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
            <table className='w-full min-w-[980px] text-left text-sm'>
              <thead className={ThemeStyles.tableHeaderBg}>
                <tr>
                  <th className={`${ThemeStyles.tableHeadCellsHeight} pms-sticky-head sticky left-0 z-[1] !px-3`}>
                    <div className='pms-th-text'>Task</div>
                  </th>
                  {days.map((day, i) => (
                    <th key={day} className={`${ThemeStyles.tableHeadCellsHeight} !px-1`}>
                      <div className={`text-center ${day === week?.today ? 'text-[var(--theme-solid)]' : ''}`}>
                        <div className='pms-th-text' style={day === week?.today ? { color: 'var(--theme-solid)' } : undefined}>
                          {DAY_NAMES[i]}
                        </div>
                        <div className='text-[11px] font-medium text-gray-500'>{shortDate(day)}</div>
                      </div>
                    </th>
                  ))}
                  <th className={`${ThemeStyles.tableHeadCellsHeight} !px-3`}>
                    <div className='pms-th-text text-center'>Total</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className='py-10 text-center text-slate-600'>
                      {isFetching ? 'Loading week...' : editable ? 'No hours this week. Add a task below and type your hours.' : 'No hours logged in this week.'}
                    </td>
                  </tr>
                )}
                {rows.map(row => (
                  <tr key={row.task_id} className='border-t border-gray-200'>
                    <td className='pms-sticky-cell sticky left-0 z-[1] max-w-[280px] px-3 py-2'>
                      <div className='flex items-center justify-between gap-2'>
                        <Link href={taskDetailsPath(row.task_id)} className={`${ThemeStyles.listNoColor} text-[13px]`}>
                          {row.task_key}
                        </Link>
                        {canRemove(row) && (
                          <button
                            type='button'
                            onClick={() => askRemove(row)}
                            title='Remove this row'
                            aria-label={`Remove ${row.task_key} from this week`}
                            data-remove-row={row.task_id}
                            className='cursor-pointer rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600'
                          >
                            <Icon icon='tabler:x' width={16} />
                          </button>
                        )}
                      </div>
                      <div className='truncate text-[14px] font-semibold text-slate-800' title={row.title}>
                        {row.title}
                      </div>
                      <div className='truncate text-xs text-gray-500'>
                        {row.project_code} · {row.project_name}
                      </div>
                    </td>
                    {days.map(day => {
                      const key = `${row.task_id}|${day}`
                      const cell = row.cells[day]
                      const locked = cellLocked(row, day, cell)
                      const value = key in drafts ? drafts[key] : fmt(cell?.hours)
                      const statusRing =
                        cell?.status === 'Rejected' ? ' !border-red-500' : cell?.status === 'Approved' ? ' !border-emerald-400' : cell?.status === 'Submitted' ? ' !border-amber-400' : ''

                      return (
                        <td key={day} className='px-1 py-2 text-center'>
                          <input
                            id={`cell-${key}`}
                            aria-label={`${row.task_key} ${day}`}
                            type='text'
                            inputMode='decimal'
                            maxLength={5}
                            value={value}
                            disabled={locked}
                            title={
                              cell?.status === 'Rejected'
                                ? `Rejected: ${cell.reject_reason}`
                                : cellErrors[key] ||
                                  cell?.status ||
                                  (day > (week?.today || '') ? 'Future date' : row.locked_before && day < row.locked_before ? 'Locked (Project Settings)' : '')
                            }
                            onChange={e => {
                              const v = e.target.value.replace(/[^\d.]/g, '')
                              setDrafts(prev => ({ ...prev, [key]: v }))
                              setCellErrors(({ [key]: _, ...rest }) => rest)
                            }}
                            onBlur={() => commit(row, day)}
                            onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                            className={`${ThemeStyles.formsInputs} !w-16 !px-1 text-center${cellErrors[key] ? ' !border-red-500' : statusRing}${saving[key] ? ' opacity-60' : ''}`}
                          />
                        </td>
                      )
                    })}
                    <td className='px-3 py-2 text-center text-[14px] font-bold tabular-nums text-slate-800'>{fmt(row.total) || '0'}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className='border-t-2 border-gray-200'>
                    <td className='pms-sticky-cell sticky left-0 z-[1] px-3 py-2 text-[14px] font-semibold text-slate-800'>Day total</td>
                    {days.map(day => {
                      const total = week.day_totals[day] || 0

                      return (
                        <td key={day} className={`px-1 py-2 text-center text-[14px] font-semibold tabular-nums ${total > 10 ? 'text-amber-600' : 'text-slate-800'}`} title={total > 10 ? 'Long day' : ''}>
                          {fmt(total) || '-'}
                        </td>
                      )
                    })}
                    <td className='px-3 py-2 text-center text-[15px] font-bold tabular-nums' style={{ color: 'var(--theme-solid)' }}>
                      {fmt(week.week_total) || '0'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* New rows are always allowed: already submitted/approved hours stay locked cell by cell, new hours start as Draft. */}
          {week && mayLog && (
            <div className='flex flex-col gap-2 border-t border-gray-200 p-3 sm:flex-row sm:items-center'>
              <select id='add_task_row' value={picked} onChange={e => setPicked(e.target.value)} className={`${ThemeStyles.formsInputsDropdown} sm:max-w-md`}>
                <option value=''>{available.length ? 'Add a task to this week...' : 'No more tasks to add (only open tasks of your Active projects)'}</option>
                {available.map(t => (
                  <option key={t.task_id} value={t.task_id}>
                    {t.assigned_to_me ? '★ ' : ''}
                    {t.task_key} - {t.title} ({t.project_code})
                  </option>
                ))}
              </select>
              <GhostButton
                onClick={() => {
                  if (!picked) return toast.error('Please Select a Task')
                  setExtraTasks(prev => [...prev, Number(picked)])
                  setPicked('')
                }}
              >
                <Icon icon='tabler:plus' width={16} /> Add Row
              </GhostButton>
              <span className='text-xs text-gray-500 sm:ms-auto'>★ = assigned to you · hours save when you leave a cell · steps of 0.25 h</span>
            </div>
          )}
        </div>
      )}
    </PmsPage>
  )
}

export default MyTimesheetView
