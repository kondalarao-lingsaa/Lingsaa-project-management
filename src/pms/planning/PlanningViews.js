import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import PmsPage from 'src/pms/components/PmsPage'
import StatCard from 'src/pms/components/StatCard'
import { Chip, formatDate, ProgressBar, TaskStatusPill } from 'src/pms/components/ui'
import { usePmsPermissions } from 'src/pms/adapters/permissions'
import { getScreen } from 'src/pms/config/pmsModules'
import { projectDetailsPath } from 'src/pms/projects/ProjectsListView'
import { taskDetailsPath } from 'src/pms/tasks/paths'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import useProjectPicker from 'src/pms/components/useProjectPicker'
import { useGetPlanningDependenciesQuery, useGetProjectTimelineQuery, useGetRoadmapQuery } from 'src/store/apps/pms/planningApi'
import ProjectTimeline from './ProjectTimeline'
import usePagedRows from 'src/pms/components/usePagedRows'

/* ------------------------------------------------------------------------------ Gantt */

export const GanttView = () => {
  const { projectId, picker } = useProjectPicker()
  const { userPermissions } = usePmsPermissions(getScreen('planning.gantt')?.permissionName)

  return (
    <PmsPage screenId='planning.gantt'>
      <div className='mb-3 flex flex-wrap items-center gap-2'>
        {picker}
        {projectId && (
          <Link href={`${projectDetailsPath(projectId)}&tab=planning`} className='text-[13px] font-semibold hover:underline' style={{ color: 'var(--theme-solid)' }}>
            Open project
          </Link>
        )}
      </div>
      {projectId ? <ProjectTimeline projectId={projectId} canEdit={Boolean(userPermissions?.edit)} /> : <div className='py-10 text-center text-sm text-gray-500'>Pick a project to see its timeline.</div>}
    </PmsPage>
  )
}

/* ---------------------------------------------------------------------------- Roadmap */

const DAY_MS = 86400000
const toDay = iso => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY_MS)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const RoadmapView = () => {
  const { data, isFetching } = useGetRoadmapQuery()
  const r = data?.detail
  const [pxPerDay, setPxPerDay] = useState(4)

  const layout = useMemo(() => {
    if (!r) return null
    const start = toDay(r.range.start) - 7
    const end = toDay(r.range.end) + 14
    const months = []
    for (let day = start; day <= end; ) {
      const d = new Date(day * DAY_MS)
      const next = Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY_MS)
      months.push({ day, span: Math.min(next, end + 1) - day, text: `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}` })
      day = Math.min(next, end + 1)
    }

    return { start, end, months }
  }, [r])

  if (!r || !layout) return <PmsPage screenId='planning.roadmap'><div className='py-10 text-center text-sm text-gray-500'>{isFetching ? 'Loading...' : 'No roadmap.'}</div></PmsPage>

  const width = (layout.end - layout.start + 1) * pxPerDay
  const x = iso => (toDay(iso) - layout.start) * pxPerDay
  const today = toDay(r.today)
  const active = r.projects.filter(p => p.status === 'Active').length

  return (
    <PmsPage screenId='planning.roadmap'>
      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
        <StatCard icon='tabler:briefcase' tone='indigo' label='Projects' value={r.projects.length} hint={`${active} active`} />
        <StatCard icon='tabler:flag' tone='violet' label='Milestones' value={r.projects.reduce((n, p) => n + p.milestones.length, 0)} hint='on the roadmap' />
        <StatCard icon='tabler:alarm' tone='red' label='Past End Date' value={r.projects.filter(p => p.is_late).length} hint='still open after their end date' />
        <StatCard icon='tabler:calendar-question' tone='amber' label='Not Scheduled' value={r.undated} hint='projects without start / end' />
      </div>

      <div className='mb-2 flex items-center gap-2'>
        <div className='inline-flex gap-1 rounded-lg border border-gray-200 bg-white p-1'>
          {[
            ['Quarter', 4],
            ['Year', 1.5]
          ].map(([name, value]) => (
            <button
              key={name}
              type='button'
              onClick={() => setPxPerDay(value)}
              className={`cursor-pointer rounded-md px-3 py-1 text-[13px] font-semibold ${pxPerDay === value ? 'text-white' : 'text-slate-600 hover:bg-gray-100'}`}
              style={pxPerDay === value ? { background: 'var(--theme-solid)' } : undefined}
            >
              {name}
            </button>
          ))}
        </div>
        <span className='text-xs text-gray-500'>Click a project to open its timeline.</span>
      </div>

      <div className='flex overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm'>
        <div className='w-[260px] shrink-0 border-r border-gray-200'>
          <div className='flex h-8 items-end border-b border-gray-200 px-3 pb-1 text-xs font-semibold text-gray-500'>Project</div>
          {r.projects.map(p => (
            <Link key={p.id} href={`${projectDetailsPath(p.id)}&tab=planning`} className='flex h-12 flex-col justify-center border-b border-gray-100 px-3 hover:bg-gray-50'>
              <span className='truncate text-[13px] font-semibold text-slate-800'>{p.name}</span>
              <span className='truncate text-[11px] text-gray-500'>
                {p.code} · {p.status}
              </span>
            </Link>
          ))}
        </div>
        <div className='min-w-0 flex-1 overflow-x-auto'>
          <div className='relative' style={{ width, height: 32 + r.projects.length * 48 }}>
            <div className='absolute left-0 top-0 flex h-8 border-b border-gray-200' style={{ width }}>
              {layout.months.map(m => (
                <div key={m.day} className='truncate border-r border-gray-100 px-1 pt-2 text-[11px] font-semibold text-slate-600' style={{ width: m.span * pxPerDay }}>
                  {m.span * pxPerDay > 30 ? m.text : ''}
                </div>
              ))}
            </div>
            {r.projects.map((p, i) => (
              <div key={p.id} className='absolute left-0 border-b border-gray-100' style={{ top: 32 + i * 48, width, height: 48 }}>
                {p.start && p.end ? (
                  <Link
                    href={`${projectDetailsPath(p.id)}&tab=planning`}
                    className='absolute top-3 flex h-6 items-center overflow-hidden rounded-md text-[11px] font-semibold text-white'
                    style={{
                      left: x(p.start),
                      width: Math.max(8, x(p.end) - x(p.start) + pxPerDay),
                      background: p.status === 'Closed' ? '#cbd5e1' : 'color-mix(in srgb, var(--theme-solid) 35%, white)',
                      outline: p.is_late ? '2px solid #dc2626' : undefined
                    }}
                    title={`${p.name}: ${formatDate(p.start)} - ${formatDate(p.end)} · ${p.progress}% done${p.is_late ? ' · past its end date' : ''}`}
                  >
                    <span className='absolute inset-y-0 left-0' style={{ width: `${p.progress}%`, background: p.status === 'Closed' ? '#94a3b8' : 'var(--theme-solid)' }} />
                    <span className='relative truncate px-2'>{p.progress}%</span>
                  </Link>
                ) : (
                  <span className='absolute left-2 top-4 text-[11px] text-gray-400'>No start / end date</span>
                )}
                {p.milestones
                  .filter(m => m.due)
                  .map(m => (
                    <span
                      key={m.id}
                      className='absolute top-[18px] h-3 w-3 rotate-45 rounded-sm'
                      style={{ left: x(m.due) + pxPerDay / 2 - 6, background: m.status === 'Accepted' ? '#22c55e' : '#7c3aed', border: '1px solid white' }}
                      title={`${m.name} · due ${formatDate(m.due)} · ${m.status}`}
                    />
                  ))}
              </div>
            ))}
            {today >= layout.start && today <= layout.end && (
              <div className='pointer-events-none absolute top-0 h-full border-l-2 border-red-500' style={{ left: (today - layout.start) * pxPerDay }} title='Today' />
            )}
          </div>
        </div>
      </div>
    </PmsPage>
  )
}

/* -------------------------------------------------------------------------------- WBS */

const Hours = ({ est, act }) => (
  <span className={act > est && est ? 'font-semibold text-red-600' : ''}>
    {act ? act : 0} / {est ? est : 0} h
  </span>
)

export const WbsView = () => {
  const { projectId, picker } = useProjectPicker()
  const { data, isFetching } = useGetProjectTimelineQuery(projectId, { skip: !projectId })
  const t = data?.detail

  const groups = useMemo(() => {
    if (!t) return []
    const byMilestone = [...t.milestones.map(m => ({ ...m, tasks: [] })), { id: null, name: 'Not in a milestone', tasks: [] }]
    const index = Object.fromEntries(byMilestone.map((g, i) => [g.id, i]))
    const mains = t.tasks.filter(x => !x.parent_id)
    mains.forEach(task => {
      const subtasks = t.tasks.filter(x => x.parent_id === task.id)
      byMilestone[index[task.milestone_id] ?? index.null].tasks.push({ ...task, subtasks })
    })

    return byMilestone
      .map(g => {
        const all = g.tasks.flatMap(x => [x, ...x.subtasks])
        const est = all.reduce((n, x) => n + (x.estimated_hours || 0), 0)
        const act = all.reduce((n, x) => n + (x.actual_hours || 0), 0)
        const progress = all.length ? Math.round(all.reduce((n, x) => n + x.progress, 0) / all.length) : 0

        return { ...g, est, act, progress, count: all.length }
      })
      .filter(g => g.id !== null || g.tasks.length)
  }, [t])

  const totals = groups.reduce((acc, g) => ({ est: acc.est + g.est, act: acc.act + g.act, count: acc.count + g.count }), { est: 0, act: 0, count: 0 })

  return (
    <PmsPage screenId='planning.wbs'>
      <div className='mb-3 flex flex-wrap items-center gap-2'>{picker}</div>
      {!projectId ? (
        <div className='py-10 text-center text-sm text-gray-500'>Pick a project to see its work breakdown.</div>
      ) : !t ? (
        <div className='py-10 text-center text-sm text-gray-500'>{isFetching ? 'Loading...' : 'Nothing to show.'}</div>
      ) : (
        <>
          <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
            <StatCard icon='tabler:hierarchy-3' tone='indigo' label='Work Items' value={totals.count} hint='tasks and subtasks' />
            <StatCard icon='tabler:flag' tone='violet' label='Milestones' value={t.milestones.length} hint='top level of the breakdown' />
            <StatCard icon='tabler:clock-hour-4' tone='blue' label='Estimated' value={`${totals.est} h`} hint='sum of task estimates' />
            <StatCard icon='tabler:clock-check' tone={totals.act > totals.est && totals.est ? 'red' : 'emerald'} label='Actual' value={`${totals.act} h`} hint='approved timesheet hours' />
          </div>
          <div className={`${ThemeStyles.tableColor} overflow-x-auto rounded-md`}>
            <table className='w-full min-w-[900px] text-left text-sm'>
              <thead className={ThemeStyles.tableHeaderBg}>
                <tr>
                  {['Work Item', 'Assignee', 'Dates', 'Hours (actual / est.)', 'Progress', 'Status'].map(h => (
                    <th key={h} className={`${ThemeStyles.tableHeadCellsHeight} !px-3`}>
                      <div className='pms-th-text'>{h}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g, gi) => (
                  <React.Fragment key={g.id ?? 'none'}>
                    <tr className='border-t border-gray-200 bg-gray-50'>
                      <td className='px-3 py-2 text-[14px] font-bold text-slate-800' colSpan={2}>
                        <Icon icon='tabler:flag' width={15} className='me-1 inline text-violet-500' />
                        {gi + 1}. {g.name}
                      </td>
                      <td className='px-3 py-2 text-xs text-gray-600'>{g.due ? `Due ${formatDate(g.due)}` : ''}</td>
                      <td className='pms-td-text px-3 py-2'>
                        <Hours est={g.est} act={g.act} />
                      </td>
                      <td className='px-3 py-2'>
                        <div className='flex min-w-[120px] items-center gap-2'>
                          <div className='flex-1'>
                            <ProgressBar value={g.progress} />
                          </div>
                          <span className='text-xs font-semibold'>{g.progress}%</span>
                        </div>
                      </td>
                      <td className='px-3 py-2'>{g.status && <Chip tone={g.status === 'Accepted' ? 'green' : 'violet'}>{g.status}</Chip>}</td>
                    </tr>
                    {g.tasks.map((task, ti) =>
                      [task, ...task.subtasks].map((x, si) => (
                        <tr key={x.id} className='border-t border-gray-100 hover:bg-gray-50/70'>
                          <td className='px-3 py-2' style={{ paddingLeft: si ? 56 : 32 }}>
                            <Link href={taskDetailsPath(x.id)} className='hover:underline'>
                              <span className='me-2 text-xs text-gray-400'>
                                {gi + 1}.{ti + 1}
                                {si ? `.${si}` : ''}
                              </span>
                              <span className={ThemeStyles.listNoColor}>{x.key}</span> <span className='pms-td-text'>{x.title}</span>
                            </Link>
                          </td>
                          <td className='pms-td-text px-3 py-2'>{x.assignee || <span className='text-gray-400'>Unassigned</span>}</td>
                          <td className={`px-3 py-2 text-xs ${x.is_overdue ? 'font-semibold text-red-600' : 'text-gray-600'}`}>
                            {x.start || x.due ? `${x.start ? formatDate(x.start) : '?'} - ${x.due ? formatDate(x.due) : '?'}` : 'No dates'}
                          </td>
                          <td className='pms-td-text px-3 py-2'>
                            <Hours est={x.estimated_hours} act={x.actual_hours} />
                          </td>
                          <td className='px-3 py-2 text-xs font-semibold'>{x.progress}%</td>
                          <td className='px-3 py-2'>
                            <TaskStatusPill status={x.status} />
                          </td>
                        </tr>
                      ))
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PmsPage>
  )
}

/* ----------------------------------------------------------------------- Dependencies */

export const DependenciesView = () => {
  const [onlyProblems, setOnlyProblems] = useState(false)
  const { data, isFetching } = useGetPlanningDependenciesQuery({})
  const rows = (data?.detail || []).filter(r => !onlyProblems || r.problem)
  const { pageRows, pager } = usePagedRows(rows, { resetKey: String(onlyProblems) })
  const sv = data?.stack_values || {}

  return (
    <PmsPage screenId='planning.dependencies'>
      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
        <StatCard icon='tabler:link' tone='indigo' label='Dependencies' value={sv.count_pg || 0} hint='task waits for another task' />
        <StatCard icon='tabler:hourglass' tone='amber' label='Still Waiting' value={sv.waiting || 0} hint='blocker not done yet' />
        <StatCard icon='tabler:link-off' tone='red' label='Problems' value={sv.problems || 0} hint='plan and links disagree' />
        <StatCard icon='tabler:circle-check' tone='emerald' label='Clear' value={(sv.count_pg || 0) - (sv.waiting || 0)} hint='blocker done' />
      </div>
      <div className={`${ThemeStyles.tableColor} rounded-md`}>
        <div className='flex items-center gap-2 p-3'>
          <button type='button' onClick={() => setOnlyProblems(v => !v)} className={`filterCustBtn ${onlyProblems ? 'active' : ''}`}>
            <Icon icon='tabler:alert-triangle' width={16} /> Only problems
          </button>
          <span className='text-xs text-gray-500 md:ms-auto'>Add or remove links on a task&apos;s Dependencies tab.</span>
        </div>
        <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <table className='w-full min-w-[980px] text-left text-sm'>
            <thead className={ThemeStyles.tableHeaderBg}>
              <tr>
                {['Project', 'Task', 'Waits For', 'Problem'].map(h => (
                  <th key={h} className={`${ThemeStyles.tableHeadCellsHeight} !px-3`}>
                    <div className='pms-th-text'>{h}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className='py-10 text-center text-slate-600'>
                    {isFetching ? 'Loading...' : onlyProblems ? 'No problems - the plan and the links agree.' : 'No dependencies yet.'}
                  </td>
                </tr>
              ) : (
                pageRows.map(r => (
                  <tr key={r.id} className='border-t border-gray-200 hover:bg-gray-50/70'>
                    <td className='px-3 py-2'>
                      <Link href={`${projectDetailsPath(r.project_id)}&tab=planning`} className={`${ThemeStyles.listNoColor} text-[13px]`}>
                        {r.project_code}
                      </Link>
                    </td>
                    <td className='px-3 py-2'>
                      <Link href={taskDetailsPath(r.task.id)} className='hover:underline'>
                        <span className={`${ThemeStyles.listNoColor} text-[13px]`}>{r.task.key}</span> <span className='pms-td-text'>{r.task.title}</span>
                      </Link>
                      <div className='mt-0.5 flex items-center gap-2 text-xs text-gray-500'>
                        <TaskStatusPill status={r.task.status} /> {r.task.start ? `starts ${formatDate(r.task.start)}` : 'no start date'}
                      </div>
                    </td>
                    <td className='px-3 py-2'>
                      <Link href={taskDetailsPath(r.blocker.id)} className='hover:underline'>
                        <span className={`${ThemeStyles.listNoColor} text-[13px]`}>{r.blocker.key}</span> <span className='pms-td-text'>{r.blocker.title}</span>
                      </Link>
                      <div className='mt-0.5 flex items-center gap-2 text-xs text-gray-500'>
                        <TaskStatusPill status={r.blocker.status} /> {r.blocker.due ? `due ${formatDate(r.blocker.due)}` : 'no due date'}
                      </div>
                    </td>
                    <td className='px-3 py-2'>{r.problem ? <Chip tone='red'>{r.problem}</Chip> : r.is_waiting ? <Chip tone='amber'>Waiting</Chip> : <Chip tone='green'>Clear</Chip>}</td>
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

