import React, { Fragment, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import PmsPage from 'src/pms/components/PmsPage'
import StatCard from 'src/pms/components/StatCard'
import useProjectPicker from 'src/pms/components/useProjectPicker'
import { Chip, formatDate, GhostButton, PRIORITY_TONE } from 'src/pms/components/ui'
import { taskDetailsPath } from 'src/pms/tasks/paths'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useGetCapacityQuery, useGetUtilizationQuery } from 'src/store/apps/pms/workloadApi'

const iso = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (s, n) => {
  const d = new Date(`${s}T00:00:00`)
  d.setDate(d.getDate() + n)

  return iso(d)
}
const mondayOf = s => addDays(s, -((new Date(`${s}T00:00:00`).getDay() + 6) % 7))
const shortDate = s => formatDate(s).slice(0, 6)
const hours = v => `${Math.round((v || 0) * 10) / 10} h`

// Heat colours: same meaning on both screens (red = more than the person has, amber = nearly full).
const STATE_STYLE = {
  Over: { bg: 'color-mix(in srgb, #dc2626 16%, transparent)', fg: '#b91c1c' },
  Busy: { bg: 'color-mix(in srgb, #d97706 16%, transparent)', fg: '#b45309' },
  OK: { bg: 'color-mix(in srgb, #16a34a 14%, transparent)', fg: '#15803d' },
  Free: { bg: 'color-mix(in srgb, #64748b 8%, transparent)', fg: '#475569' },
  None: { bg: 'transparent', fg: '#94a3b8' }
}

const Legend2 = ({ items }) => (
  <div className='mt-2 flex flex-wrap items-center gap-3 text-[11px] text-gray-500'>
    {items.map(([state, label]) => (
      <span key={state} className='flex items-center gap-1'>
        <span className='h-3 w-3 rounded-sm border border-gray-200' style={{ background: STATE_STYLE[state].bg }} />{' '}
        {label}
      </span>
    ))}
  </div>
)

const PersonCell = ({ p }) => (
  <td className='sticky left-0 z-[1] bg-white px-3 py-2'>
    <div className='pms-td-text font-semibold'>{p.member_name}</div>
    <div
      className='max-w-[220px] truncate text-[11px] text-gray-500'
      title={p.projects.map(x => `${x.project_code} ${x.allocation_pct}%`).join(', ')}
    >
      {p.roles.join(', ')} · {p.allocation}% on {p.projects.length} project{p.projects.length === 1 ? '' : 's'}
    </div>
  </td>
)

const Th = ({ children, className = '' }) => (
  <th className={`${ThemeStyles.tableHeadCellsHeight} !px-3 ${className}`}>
    <div className='pms-th-text whitespace-nowrap'>{children}</div>
  </th>
)

/* ------------------------------------------------------------------------------ Capacity */

export const CapacityView = () => {
  const { projectId, picker, ready } = useProjectPicker({ allowAll: true })
  const thisMonday = mondayOf(iso(new Date()))
  const [start, setStart] = useState(thisMonday)
  const [weeks, setWeeks] = useState(8)
  const [open, setOpen] = useState(null)
  const { data, isFetching } = useGetCapacityQuery(
    { start, weeks, projectId: projectId || undefined },
    { refetchOnMountOrArgChange: true, skip: !ready }
  )
  const cap = data?.detail
  const people = cap?.people || []
  const s = cap?.summary || {}

  return (
    <PmsPage screenId='resources.capacity'>
      <div className='mb-3 flex flex-wrap items-center gap-2'>
        {picker}
        <select
          id='capacity_weeks'
          value={weeks}
          onChange={e => setWeeks(Number(e.target.value))}
          className={`${ThemeStyles.formsInputsDropdown} md:max-w-[140px]`}
          aria-label='Weeks'
        >
          {[4, 8, 12].map(w => (
            <option key={w} value={w}>
              {w} weeks
            </option>
          ))}
        </select>
        <GhostButton onClick={() => setStart(thisMonday)} className='!px-3 !py-1.5'>
          This week
        </GhostButton>
        <button
          type='button'
          onClick={() => setStart(addDays(start, -7 * weeks))}
          className='cursor-pointer rounded-lg p-1.5 text-slate-600 hover:bg-gray-100'
          aria-label='Earlier'
        >
          <Icon icon='tabler:chevron-left' width={20} />
        </button>
        <button
          type='button'
          onClick={() => setStart(addDays(start, 7 * weeks))}
          className='cursor-pointer rounded-lg p-1.5 text-slate-600 hover:bg-gray-100'
          aria-label='Later'
        >
          <Icon icon='tabler:chevron-right' width={20} />
        </button>
        {cap && (
          <span className='text-sm font-semibold text-slate-700'>
            {formatDate(cap.range.from)} - {formatDate(cap.range.to)}
          </span>
        )}
      </div>

      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-5'>
        <StatCard
          icon='tabler:users'
          tone='indigo'
          label='People'
          value={s.people ?? '-'}
          hint='on active project teams'
        />
        <StatCard
          icon='tabler:calendar-time'
          tone='blue'
          label='Available'
          value={hours(s.available)}
          hint='from allocations'
        />
        <StatCard
          icon='tabler:list-check'
          tone='violet'
          label='Planned Work'
          value={hours(s.planned)}
          hint='remaining estimates'
        />
        <StatCard
          icon='tabler:alert-triangle'
          tone='red'
          label='Overloaded'
          value={s.overloaded ?? '-'}
          hint='people with an over-full week'
        />
        <StatCard
          icon='tabler:user-question'
          tone='amber'
          label='Unassigned Work'
          value={cap ? `${cap.unassigned.count} task${cap.unassigned.count === 1 ? '' : 's'}` : '-'}
          hint={cap ? `${hours(cap.unassigned.hours)} nobody owns yet` : ''}
        />
      </div>

      <div
        className={`${ThemeStyles.tableColor} overflow-x-auto rounded-md transition-opacity ${
          isFetching ? 'opacity-60' : ''
        }`}
      >
        <table className='w-full min-w-[900px] text-left text-sm'>
          <thead className={ThemeStyles.tableHeaderBg}>
            <tr>
              <Th className='sticky left-0 z-[2] bg-inherit'>Person</Th>
              {(cap?.weeks || []).map(w => (
                <Th
                  key={w.index}
                  className={`text-center ${w.is_current ? 'underline decoration-2 underline-offset-4' : ''}`}
                >
                  {shortDate(w.start)}
                </Th>
              ))}
              <Th className='text-center'>Total</Th>
            </tr>
          </thead>
          <tbody>
            {people.length === 0 && (
              <tr>
                <td colSpan={(cap?.weeks?.length || 8) + 2} className='py-10 text-center text-slate-600'>
                  {isFetching ? 'Loading...' : 'No one is allocated yet. Add people in Project Details > Team.'}
                </td>
              </tr>
            )}
            {people.map(p => (
              <Fragment key={p.key}>
                <tr
                  className='cursor-pointer border-t border-gray-200 hover:bg-gray-50/70'
                  onClick={() => setOpen(open === p.key ? null : p.key)}
                  data-person={p.member_name}
                >
                  <PersonCell p={p} />
                  {p.weeks.map((w, i) => (
                    <td key={i} className='px-1 py-1.5 text-center'>
                      <div
                        className='rounded-md px-1 py-1.5 text-[12px] font-semibold tabular-nums'
                        style={{ background: STATE_STYLE[w.state].bg, color: STATE_STYLE[w.state].fg }}
                        title={`${hours(w.planned)} planned of ${hours(w.available)} available${
                          w.load_pct !== null ? ` (${w.load_pct === 999 ? 'no allocation' : `${w.load_pct}%`})` : ''
                        }`}
                        data-cell={`${p.member_name}|${i}`}
                      >
                        {w.state === 'None' && !w.planned
                          ? '-'
                          : `${Math.round(w.planned)} / ${Math.round(w.available)}`}
                      </div>
                    </td>
                  ))}
                  <td className='px-3 py-2 text-center'>
                    <div className='text-[12px] font-semibold' style={{ color: p.over_weeks ? '#b91c1c' : undefined }}>
                      {p.load_pct === null ? '-' : `${p.load_pct}%`}
                    </div>
                    <div className='text-[11px] text-gray-500'>
                      {Math.round(p.planned)} / {Math.round(p.available)} h
                    </div>
                  </td>
                </tr>
                {open === p.key && (
                  <tr className='bg-gray-50/60'>
                    <td colSpan={p.weeks.length + 2} className='px-4 py-3'>
                      <div className='mb-2 flex flex-wrap gap-3 text-xs text-gray-600'>
                        {p.over_weeks > 0 && (
                          <span className='font-semibold text-red-600'>
                            Over-full in {p.over_weeks} week{p.over_weeks === 1 ? '' : 's'} - move a due date, split a
                            task or reassign.
                          </span>
                        )}
                        {p.unscheduled_hours > 0 && (
                          <span>{hours(p.unscheduled_hours)} of work has no due date (not in the weeks above).</span>
                        )}
                        {p.unestimated > 0 && (
                          <span className='text-amber-600'>{p.unestimated} open task(s) without an estimate.</span>
                        )}
                      </div>
                      {p.tasks.length === 0 ? (
                        <div className='text-xs text-gray-500'>No dated, estimated open work in these weeks.</div>
                      ) : (
                        <table className='w-full text-xs'>
                          <tbody>
                            {p.tasks.map(t => (
                              <tr key={t.id} className='border-t border-gray-200'>
                                <td className='py-1.5 pe-2'>
                                  <Link
                                    href={taskDetailsPath(t.id)}
                                    className='font-semibold text-slate-800 hover:underline'
                                  >
                                    {t.task_key} · {t.title}
                                  </Link>
                                </td>
                                <td className='pe-2'>
                                  <Chip tone={PRIORITY_TONE[t.priority]}>{t.priority}</Chip>
                                </td>
                                <td
                                  className={`pe-2 whitespace-nowrap ${
                                    t.is_overdue ? 'font-semibold text-red-600' : 'text-gray-600'
                                  }`}
                                >
                                  {t.is_overdue
                                    ? `Overdue (${formatDate(t.due_date)})`
                                    : `Due ${formatDate(t.due_date)}`}
                                </td>
                                <td className='pe-2 whitespace-nowrap text-gray-600'>{hours(t.remaining)} left</td>
                                <td className='whitespace-nowrap text-gray-500'>
                                  {Object.entries(t.weeks)
                                    .map(([i, h]) => `${shortDate(cap.weeks[i].start)}: ${hours(h)}`)
                                    .join(' · ')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <Legend2
        items={[
          ['Over', 'Over 100% - more work than time'],
          ['Busy', '85-100%'],
          ['OK', '40-85%'],
          ['Free', 'Under 40% - can take more']
        ]}
      />
      <p className='mt-1 text-[11px] text-gray-500'>
        Cells show planned / available hours. Available = working days x{' '}
        {cap?.range?.hours_per_day ? `${cap.range.hours_per_day} h` : 'hours per day'} x allocation %. Planned = remaining
        estimate of each open task, spread over its working days up to the due date; overdue work counts in this week.
        Click a person to see the tasks.
      </p>
    </PmsPage>
  )
}

/* --------------------------------------------------------------------------- Utilization */

const utilState = pct =>
  pct === null || pct === undefined ? 'None' : pct > 100 ? 'Over' : pct >= 60 ? 'OK' : pct >= 30 ? 'Busy' : 'Free'
const UTIL_COLOR = { Over: '#dc2626', OK: '#16a34a', Busy: '#d97706', Free: '#64748b', None: '#94a3b8' }

const PRESETS = [
  ['Last 4 weeks', () => [addDays(mondayOf(iso(new Date())), -21), iso(new Date())]],
  ['This month', () => [`${iso(new Date()).slice(0, 7)}-01`, iso(new Date())]],
  [
    'Last month',
    () => {
      const d = new Date()
      const first = new Date(d.getFullYear(), d.getMonth() - 1, 1)
      const last = new Date(d.getFullYear(), d.getMonth(), 0)

      return [iso(first), iso(last)]
    }
  ]
]

export const UtilizationView = () => {
  const { projectId, picker, ready } = useProjectPicker({ allowAll: true })
  const [range, setRange] = useState(PRESETS[0][1]())
  const [draft, setDraft] = useState(range)
  const [person, setPerson] = useState('')
  const days = Math.round((Date.parse(draft[1]) - Date.parse(draft[0])) / 86400000) + 1
  const rangeError =
    !draft[0] || !draft[1]
      ? 'Please Select both dates'
      : draft[1] < draft[0]
      ? 'To date cannot be before From date'
      : days > 92
      ? 'Pick at most 92 days (Reports covers longer periods)'
      : null
  const { data, isFetching } = useGetUtilizationQuery(
    { from: range[0], to: range[1], projectId: projectId || undefined, person: person.trim() || undefined },
    { refetchOnMountOrArgChange: true, skip: !ready }
  )
  const ut = data?.detail
  const people = ut?.people || []
  const s = ut?.summary || {}

  const setDate = (i, v) => {
    const next = [...draft]
    next[i] = v
    setDraft(next)
    const d = Math.round((Date.parse(next[1]) - Date.parse(next[0])) / 86400000) + 1
    if (next[0] && next[1] && next[1] >= next[0] && d <= 92) setRange(next)
  }

  return (
    <PmsPage screenId='resources.utilization'>
      <div className='mb-3 flex flex-wrap items-start gap-2'>
        {picker}
        <div>
          <div className='flex items-center gap-1'>
            <input
              id='util_from'
              type='date'
              value={draft[0]}
              max={draft[1] || undefined}
              onChange={e => setDate(0, e.target.value)}
              className={`${ThemeStyles.formsInputs} !w-[150px]${rangeError ? ' !border !border-red-500' : ''}`}
              aria-label='From'
            />
            <span className='text-gray-400'>-</span>
            <input
              id='util_to'
              type='date'
              value={draft[1]}
              min={draft[0] || undefined}
              onChange={e => setDate(1, e.target.value)}
              className={`${ThemeStyles.formsInputs} !w-[150px]${rangeError ? ' !border !border-red-500' : ''}`}
              aria-label='To'
            />
          </div>
          {rangeError && <span className='!mt-1 block text-xs font-semibold text-red-500'>{rangeError}</span>}
        </div>
        {PRESETS.map(([label, fn]) => (
          <GhostButton
            key={label}
            className='!px-3 !py-1.5'
            onClick={() => {
              const r = fn()
              setDraft(r)
              setRange(r)
            }}
          >
            {label}
          </GhostButton>
        ))}
        <input
          value={person}
          onChange={e => setPerson(e.target.value)}
          placeholder='Search person'
          className={`${ThemeStyles.formsInputs} md:max-w-[200px]`}
          aria-label='Person'
        />
      </div>

      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-5'>
        <StatCard
          icon='tabler:gauge'
          tone='indigo'
          label='Average Utilization'
          value={s.average === null || s.average === undefined ? '-' : `${s.average}%`}
          hint='approved hours / available'
        />
        <StatCard
          icon='tabler:clock-check'
          tone='emerald'
          label='Approved Hours'
          value={hours(s.approved)}
          hint={ut ? `${ut.range.working_days} working days` : ''}
        />
        <StatCard
          icon='tabler:clock-pause'
          tone='amber'
          label='Waiting Approval'
          value={hours(s.pending)}
          hint='submitted, not approved yet'
        />
        <StatCard
          icon='tabler:receipt'
          tone='blue'
          label='Billable'
          value={s.billable_pct === null || s.billable_pct === undefined ? '-' : `${s.billable_pct}%`}
          hint='of approved hours (non-Internal projects)'
        />
        <StatCard
          icon='tabler:arrows-diff'
          tone='red'
          label='Under / Over'
          value={ut ? `${s.under} / ${s.over}` : '-'}
          hint='below 60% / above 100%'
        />
      </div>

      {people.some(p => p.available || p.approved) && (
        <div className='mb-3 h-[220px] rounded-xl border border-gray-200 bg-white p-3 shadow-sm'>
          <ResponsiveContainer initialDimension={{ width: 320, height: 200 }} width='100%' height='100%'>
            <BarChart
              data={people
                .slice(0, 15)
                .map(p => ({ name: p.member_name, Available: p.available, Approved: p.approved, Waiting: p.pending }))}
            >
              <CartesianGrid strokeDasharray='3 3' vertical={false} />
              <XAxis dataKey='name' tick={{ fontSize: 11 }} interval={0} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => hours(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey='Available' fill='#cbd5e1' maxBarSize={36} isAnimationActive={false} />
              <Bar
                dataKey='Approved'
                stackId='logged'
                fill='var(--theme-solid)'
                maxBarSize={36}
                isAnimationActive={false}
              />
              <Bar dataKey='Waiting' stackId='logged' fill='#f59e0b' maxBarSize={36} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div
        className={`${ThemeStyles.tableColor} overflow-x-auto rounded-md transition-opacity ${
          isFetching ? 'opacity-60' : ''
        }`}
      >
        <table className='w-full min-w-[1000px] text-left text-sm'>
          <thead className={ThemeStyles.tableHeaderBg}>
            <tr>
              <Th className='sticky left-0 z-[2] bg-inherit'>Person</Th>
              <Th>Available</Th>
              <Th>Approved</Th>
              <Th>Waiting</Th>
              <Th>Utilization</Th>
              <Th>Billable</Th>
              {(ut?.weeks || []).map(w => (
                <Th key={w.index} className='text-center'>
                  {shortDate(w.start)}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.length === 0 && (
              <tr>
                <td colSpan={6 + (ut?.weeks?.length || 0)} className='py-10 text-center text-slate-600'>
                  {isFetching ? 'Loading...' : 'No one found for this filter.'}
                </td>
              </tr>
            )}
            {people.map(p => {
              const state = utilState(p.utilization)

              return (
                <tr key={p.key} className='border-t border-gray-200 hover:bg-gray-50/70' data-person={p.member_name}>
                  <PersonCell p={p} />
                  <td className='pms-td-text px-3 py-2 whitespace-nowrap'>{hours(p.available)}</td>
                  <td className='pms-td-text px-3 py-2 whitespace-nowrap'>{hours(p.approved)}</td>
                  <td className='px-3 py-2 whitespace-nowrap text-amber-600'>{p.pending ? hours(p.pending) : '-'}</td>
                  <td className='px-3 py-2'>
                    <div className='flex min-w-[130px] items-center gap-2'>
                      <div className='h-2 flex-1 overflow-hidden rounded-full bg-gray-100'>
                        <div
                          className='h-full rounded-full'
                          style={{ width: `${Math.min(100, p.utilization || 0)}%`, background: UTIL_COLOR[state] }}
                        />
                      </div>
                      <span className='text-xs font-semibold' style={{ color: UTIL_COLOR[state] }} data-util>
                        {p.utilization === null ? 'no plan' : `${p.utilization}%`}
                      </span>
                    </div>
                  </td>
                  <td className='pms-td-text px-3 py-2'>{p.billable_pct === null ? '-' : `${p.billable_pct}%`}</td>
                  {p.weeks.map((w, i) => {
                    const st = utilState(w.pct)

                    return (
                      <td key={i} className='px-1 py-1.5 text-center'>
                        <div
                          className='rounded-md px-1 py-1.5 text-[12px] font-semibold tabular-nums'
                          style={{
                            background:
                              st === 'None' ? 'transparent' : `color-mix(in srgb, ${UTIL_COLOR[st]} 14%, transparent)`,
                            color: UTIL_COLOR[st]
                          }}
                          title={`${hours(w.approved)} approved${
                            w.pending ? ` + ${hours(w.pending)} waiting` : ''
                          } of ${hours(w.available)} available`}
                        >
                          {w.available || w.approved ? `${Math.round(w.approved * 10) / 10}` : '-'}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className='mt-2 text-[11px] text-gray-500'>
        Utilization = approved timesheet hours / available hours (working days x{' '}
        {ut?.range?.hours_per_day ? `${ut.range.hours_per_day} h` : 'hours per day'} x allocation %). Week cells show
        approved hours; hover for details. Green 60-100% · amber 30-60% · grey under 30% · red over 100%.
      </p>
    </PmsPage>
  )
}
