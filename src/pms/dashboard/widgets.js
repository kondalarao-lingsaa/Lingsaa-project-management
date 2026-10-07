import React from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import StatCard from 'src/pms/components/StatCard'
import { timeAgo } from 'src/pms/components/ui'
import { projectDetailsPath } from 'src/pms/projects/ProjectsListView'
import { taskDetailsPath } from 'src/pms/tasks/paths'
import { ACTION, IconBubble } from 'src/pms/communication/commUi'
import { CardShell, Chip, Empty, formatDate, HEALTH_TONE, inr, PRIORITY_TONE, RISK_TONE, SECTION_LINKS } from './parts'

// Every card reads the object returned by GET /api/dashboard/overview (see backend repositories/dashboard.py).

const TASK_COLORS = { 'To Do': '#94a3b8', 'In Progress': '#3b82f6', Testing: '#f59e0b', Done: '#22c55e' }
const AXIS = { fontSize: 12, fill: '#64748b' }
const lakh = v => (v >= 100000 ? `${Math.round(v / 10000) / 10}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : v)

/* ---------------------------------- KPI cards ---------------------------------- */

export const KpiCards = ({ s }) => (
  <div className='grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
    <StatCard
      icon='tabler:briefcase'
      tone='indigo'
      label='Active Projects'
      value={s.activeProjects}
      hint={`of ${s.projectCount} total`}
    />
    <StatCard
      icon='tabler:progress-check'
      tone='emerald'
      label='Overall Progress'
      value={`${s.avgProgress}%`}
      hint='average across projects'
    />
    <StatCard
      icon='tabler:heartbeat'
      tone='red'
      label='Projects at Risk'
      value={s.healthCounts['At Risk'] + s.healthCounts.Delayed}
      hint={`${s.healthCounts.Delayed} delayed, ${s.healthCounts['At Risk']} at risk`}
    />
    {s.delayedTasks && (
      <StatCard
        icon='tabler:alarm'
        tone='red'
        label='Delayed Tasks'
        value={s.delayedTasks.length}
        hint='past due date, not done'
      />
    )}
    {s.budgetPlanned !== null ? (
      <StatCard
        icon='tabler:coin'
        tone='violet'
        label='Budget Used'
        value={`${s.budgetUsedPct}%`}
        hint={`${inr(s.budgetActual)} of ${inr(s.budgetPlanned)}`}
      />
    ) : (
      s.milestones && (
        <StatCard
          icon='tabler:flag'
          tone='violet'
          label='Milestones Open'
          value={s.milestones.filter(m => m.status !== 'Accepted').length}
          hint={`${s.milestones.filter(m => m.isOverdue).length} overdue`}
        />
      )
    )}
    {s.riskCounts && (
      <StatCard
        icon='tabler:shield-exclamation'
        tone='orange'
        label='High Risks'
        value={s.riskCounts.High}
        hint={`${s.openIssues} open issues`}
      />
    )}
    {s.billing ? (
      <StatCard
        icon='tabler:file-invoice'
        tone='cyan'
        label='Outstanding'
        value={inr(s.billing.outstanding)}
        hint={s.billing.overdue ? `${s.billing.overdue} invoices overdue` : 'issued, not paid yet'}
      />
    ) : (
      s.deliverables && (
        <StatCard
          icon='tabler:package'
          tone='cyan'
          label='Deliverables Open'
          value={s.deliverables.length}
          hint='still to be delivered'
        />
      )
    )}
    {s.teamSize !== null && (
      <StatCard
        icon='tabler:users-group'
        tone='amber'
        label='Team Members'
        value={s.teamSize}
        hint={s.timesheets ? `${s.timesheets.pending} timesheets to approve` : 'on these projects'}
      />
    )}
  </div>
)

/* ------------------------------- Project progress ------------------------------- */

export const ProjectProgress = ({ s }) => (
  <CardShell
    icon='tabler:briefcase'
    iconClass='bg-indigo-100 text-indigo-600'
    title='Project Progress'
    subtitle='Completion and health of each project'
    link={SECTION_LINKS.projects}
  >
    {s.projects.length === 0 ? (
      <Empty>No projects yet</Empty>
    ) : (
      <div className='flex max-h-[330px] flex-col gap-4 overflow-y-auto pr-1'>
        {s.projects.map(p => (
          <div key={p.id}>
            <div className='mb-1 flex items-center justify-between gap-3'>
              <Link href={projectDetailsPath(p.id)} className='min-w-0 hover:underline'>
                <div className='truncate text-[14px] font-semibold text-slate-800'>{p.name}</div>
                <div className='truncate text-xs text-gray-500'>
                  {p.code} · {p.client} · PM {p.manager}
                </div>
              </Link>
              <div className='flex shrink-0 items-center gap-2'>
                {p.status !== 'Active' && <Chip tone='slate'>{p.status}</Chip>}
                <span title={p.health_reason}>
                  <Chip tone={HEALTH_TONE[p.health]}>{p.health}</Chip>
                </span>
                <span className='w-10 text-right text-[14px] font-semibold tabular-nums text-slate-800'>
                  {p.progress}%
                </span>
              </div>
            </div>
            <div className='h-2 overflow-hidden rounded-full bg-gray-100'>
              <div
                className='h-full rounded-full'
                style={{
                  width: `${p.progress}%`,
                  background: 'linear-gradient(to right, var(--theme-grad-start), var(--theme-grad-end))'
                }}
              />
            </div>
            <div className='mt-1 flex justify-between text-[11px] text-gray-500'>
              <span>Due {formatDate(p.end)}</span>
              {p.health !== 'On Track' && <span className='text-amber-600'>{p.health_reason}</span>}
            </div>
          </div>
        ))}
      </div>
    )}
  </CardShell>
)

/* -------------------------------- Task status donut ------------------------------- */

export const TaskStatus = ({ s }) => {
  const rows = [
    { name: 'To Do', value: s.taskTotals.todo },
    { name: 'In Progress', value: s.taskTotals.inProgress },
    { name: 'Testing', value: s.taskTotals.testing },
    { name: 'Done', value: s.taskTotals.done }
  ]
  const total = s.taskCount
  // Empty statuses are left out, so a single status draws as one full ring without a gap.
  const slices = total ? rows.filter(r => r.value > 0) : [{ name: 'None', value: 1 }]
  const pct = v => (total ? Math.round((v / total) * 100) : 0)
  const overdue = s.delayedTasks.length

  return (
    <CardShell
      icon='tabler:chart-donut-3'
      iconClass='bg-blue-100 text-blue-600'
      title='Tasks by Status'
      subtitle='Where all open and finished work stands'
      link={SECTION_LINKS.kanban}
    >
      <div className='flex h-full flex-col gap-4' data-task-status>
        <div className='flex flex-1 flex-col items-center justify-center gap-6 sm:flex-row'>
          <div className='relative h-[150px] w-[150px] shrink-0'>
            <PieChart width={150} height={150}>
              <Pie
                isAnimationActive={false}
                data={slices}
                dataKey='value'
                nameKey='name'
                innerRadius={50}
                outerRadius={72}
                paddingAngle={slices.length > 1 ? 2 : 0}
                stroke='none'
              >
                {slices.map(r => (
                  <Cell key={r.name} fill={TASK_COLORS[r.name] || '#e5e7eb'} />
                ))}
              </Pie>
              {total > 0 && <Tooltip />}
            </PieChart>
            <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center'>
              <span className='text-[26px] font-bold leading-none tabular-nums text-slate-800'>{total}</span>
              <span className='mt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500'>Total</span>
            </div>
          </div>
          <ul className='w-full min-w-0 flex-1 space-y-3' data-status-legend>
            {rows.map(r => (
              <li key={r.name}>
                <div className='mb-1 flex items-center gap-2 text-[13px]'>
                  <span className='h-2.5 w-2.5 shrink-0 rounded-full' style={{ background: TASK_COLORS[r.name] }} />
                  <span className='text-slate-700'>{r.name}</span>
                  <span className='ms-auto font-semibold tabular-nums text-slate-900'>{r.value}</span>
                  <span className='w-9 text-right text-[11px] tabular-nums text-gray-400'>{pct(r.value)}%</span>
                </div>
                <div className='h-1.5 overflow-hidden rounded-full bg-gray-100'>
                  <div
                    className='h-full rounded-full'
                    style={{ width: `${pct(r.value)}%`, background: TASK_COLORS[r.name] }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className='mt-auto grid grid-cols-3 divide-x divide-gray-100 rounded-lg border border-gray-100 py-2.5 text-center'>
          {[
            ['Total tasks', total, 'text-slate-800'],
            ['Completed', `${pct(s.taskTotals.done)}%`, 'text-emerald-600'],
            ['Overdue', overdue, overdue ? 'text-red-600' : 'text-slate-800']
          ].map(([label, value, cls]) => (
            <div key={label}>
              <div className={`text-[17px] font-bold tabular-nums ${cls}`}>{value}</div>
              <div className='text-[11px] text-gray-500'>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </CardShell>
  )
}

/* ----------------------------------- Task trend ----------------------------------- */

export const TaskTrend = ({ s }) => (
  <CardShell
    icon='tabler:chart-line'
    iconClass='bg-emerald-100 text-emerald-600'
    title='Task Throughput'
    subtitle='Tasks created vs completed per week, last 8 weeks'
    link={SECTION_LINKS.tasks}
  >
    <ResponsiveContainer initialDimension={{ width: 320, height: 200 }} width='100%' height={300}>
      <AreaChart data={s.trend} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray='3 3' stroke='#e5e7eb' />
        <XAxis dataKey='week' tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip labelFormatter={l => `Week of ${l}`} />
        <Legend iconType='circle' wrapperStyle={{ fontSize: 12 }} />
        <Area
          isAnimationActive={false}
          type='monotone'
          dataKey='created'
          name='Created'
          stroke='#3b82f6'
          fill='#3b82f6'
          fillOpacity={0.12}
          strokeWidth={2}
        />
        <Area
          isAnimationActive={false}
          type='monotone'
          dataKey='completed'
          name='Completed'
          stroke='#22c55e'
          fill='#22c55e'
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  </CardShell>
)

/* --------------------------------------- Risks -------------------------------------- */

// Soft tinted tile from one colour: transparent tint, so it sits well on both light and dark cards.
const tile = color => ({
  background: `color-mix(in srgb, ${color} 12%, transparent)`,
  borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
  color
})

export const RiskSummary = ({ s }) => (
  <CardShell
    icon='tabler:shield-exclamation'
    iconClass='bg-orange-100 text-orange-600'
    title='Risks and Issues'
    subtitle='Open risks by level (probability x impact)'
    link={SECTION_LINKS.risks}
  >
    <div className='grid grid-cols-3 gap-3'>
      {[
        ['High', '#dc2626'],
        ['Medium', '#d97706'],
        ['Low', '#059669']
      ].map(([level, color]) => (
        <div key={level} className='rounded-lg border p-3 text-center' style={tile(color)}>
          <div className='text-2xl font-semibold tabular-nums'>{s.riskCounts[level]}</div>
          <div className='text-xs font-medium'>{level}</div>
        </div>
      ))}
    </div>
    <Link
      href={SECTION_LINKS.issues.href}
      className='mt-3 flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-[13px] hover:bg-gray-50'
    >
      <span className='text-slate-700'>Open issues</span>
      <span className='font-semibold tabular-nums text-slate-800'>
        {s.openIssues}
        {s.criticalIssues ? (
          <span className='ms-2 text-xs text-red-600'>({s.criticalIssues} high / critical)</span>
        ) : null}
      </span>
    </Link>
    <div className='mt-2 flex flex-col'>
      {s.risks.map(r => (
        <Link
          key={r.id}
          href={`${projectDetailsPath(r.projectId)}&tab=risks`}
          className='flex items-center justify-between gap-3 border-b border-gray-100 py-2 last:border-b-0 hover:opacity-80'
        >
          <div className='min-w-0'>
            <div className='truncate text-[13px] font-medium text-slate-800'>{r.title}</div>
            <div className='truncate text-xs text-gray-500'>
              {r.key} · {r.projectName} · owner {r.owner}
            </div>
          </div>
          <Chip tone={RISK_TONE[r.level]}>
            {r.level} {r.score}
          </Chip>
        </Link>
      ))}
      {s.risks.length === 0 && <Empty>No open risks</Empty>}
    </div>
  </CardShell>
)

/* ------------------------------------- Billing ------------------------------------- */

const INVOICE_STATUS_TONE = { Draft: 'slate', Issued: 'blue', Paid: 'green' }

export const BillingSummary = ({ s }) => {
  const b = s.billing

  return (
    <CardShell
      icon='tabler:receipt'
      iconClass='bg-cyan-100 text-cyan-600'
      title='Billing'
      subtitle='Invoices from accepted milestones and approved hours'
      link={SECTION_LINKS.billing}
    >
      <div className='grid grid-cols-2 gap-3'>
        {[
          ['Ready to Invoice', inr(b.readyToInvoice), '#7c3aed'],
          ['Outstanding', inr(b.outstanding), '#2563eb'],
          ['Overdue', b.overdue ? `${inr(b.overdueAmount)} (${b.overdue})` : inr(0), '#dc2626'],
          ['Paid', inr(b.paid), '#059669']
        ].map(([label, value, color]) => (
          <div key={label} className='rounded-lg border p-3' style={tile(color)}>
            <div className='text-[15px] font-semibold tabular-nums'>{value}</div>
            <div className='text-xs font-medium'>{label}</div>
          </div>
        ))}
      </div>
      <div className='mt-3 flex flex-col'>
        {b.recent.map(i => (
          <div
            key={i.id}
            className='flex items-center justify-between gap-3 border-b border-gray-100 py-2 last:border-b-0'
          >
            <div className='min-w-0'>
              <div className='truncate text-[13px] font-medium text-slate-800'>{i.no}</div>
              <div className='truncate text-xs text-gray-500'>{i.projectName}</div>
            </div>
            <div className='flex shrink-0 items-center gap-2'>
              <span className='text-[13px] font-semibold tabular-nums text-slate-800'>{inr(i.total)}</span>
              <Chip tone={i.isOverdue ? 'red' : INVOICE_STATUS_TONE[i.status]}>
                {i.isOverdue ? 'Overdue' : i.status}
              </Chip>
            </div>
          </div>
        ))}
        {b.recent.length === 0 && <Empty>No invoices yet</Empty>}
      </div>
    </CardShell>
  )
}

/* -------------------------------------- Budget -------------------------------------- */

export const BudgetOverview = ({ s }) => {
  const remaining = s.budgetPlanned - s.budgetActual
  const barColor = s.budgetUsedPct > 100 ? '#ef4444' : s.budgetUsedPct >= 80 ? '#f59e0b' : '#22c55e'
  const chartData = s.projects
    .filter(p => p.budgetPlanned || p.budgetActual)
    .slice(0, 8)
    .map(p => ({ name: p.short, Planned: p.budgetPlanned, Actual: p.budgetActual, Billed: p.billed }))

  return (
    <CardShell
      icon='tabler:coin'
      iconClass='bg-violet-100 text-violet-600'
      title='Budget: Planned vs Actual'
      subtitle='Actual cost = approved hours x rate + approved expenses'
      link={SECTION_LINKS.budget}
    >
      <div className='grid grid-cols-3 gap-3'>
        {[
          ['Planned', inr(s.budgetPlanned), 'text-slate-800'],
          ['Actual', inr(s.budgetActual), 'text-violet-700'],
          [
            remaining >= 0 ? 'Remaining' : 'Over budget',
            inr(Math.abs(remaining)),
            remaining >= 0 ? 'text-emerald-600' : 'text-red-600'
          ]
        ].map(([label, value, cls]) => (
          <div key={label}>
            <div className='text-xs text-gray-500'>{label}</div>
            <div className={`text-[17px] font-semibold tabular-nums ${cls}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className='relative mt-3 h-2.5 rounded-full bg-gray-100'>
        <div
          className='h-full rounded-full'
          style={{ width: `${Math.min(100, s.budgetUsedPct)}%`, background: barColor }}
        />
        <div className='absolute -top-1 h-4.5 w-px bg-slate-400' style={{ left: '80%' }} title='80% alert level' />
      </div>
      <div className='mt-1 flex justify-between text-[11px] text-gray-500'>
        <span>{s.budgetUsedPct}% used</span>
        <span>Alert at 80%</span>
      </div>

      <div className='mt-3'>
        {chartData.length === 0 ? (
          <Empty>No budgets set yet</Empty>
        ) : (
          <ResponsiveContainer initialDimension={{ width: 320, height: 200 }} width='100%' height={220}>
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
              barGap={3}
              barCategoryGap='30%'
            >
              <CartesianGrid strokeDasharray='3 3' stroke='#e5e7eb' vertical={false} />
              <XAxis dataKey='name' tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={lakh} />
              <Tooltip formatter={value => inr(value)} />
              <Legend iconType='circle' wrapperStyle={{ fontSize: 12 }} />
              <Bar isAnimationActive={false} dataKey='Planned' fill='#c7d2fe' radius={[3, 3, 0, 0]} maxBarSize={16} />
              <Bar isAnimationActive={false} dataKey='Actual' fill='#6366f1' radius={[3, 3, 0, 0]} maxBarSize={16} />
              <Bar isAnimationActive={false} dataKey='Billed' fill='#22c55e' radius={[3, 3, 0, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </CardShell>
  )
}

/* ---------------------------------- Team workload ---------------------------------- */

export const TeamWorkload = ({ s }) => (
  <CardShell
    icon='tabler:users-group'
    iconClass='bg-amber-100 text-amber-600'
    title='Team Workload'
    subtitle="Share of each person's time on active projects"
    link={SECTION_LINKS.resources}
  >
    {s.team && (
      <div className='flex flex-col gap-3'>
        {s.team.map(m => {
          const color = m.allocated >= 100 ? '#ef4444' : m.allocated >= 80 ? '#f59e0b' : '#22c55e'

          return (
            <div key={m.id}>
              <div className='mb-1 flex items-center justify-between'>
                <div className='min-w-0'>
                  <span className='text-[13px] font-semibold text-slate-800'>{m.name}</span>
                  <span className='ml-2 text-xs text-gray-500'>{m.role}</span>
                </div>
                <div className='flex items-center gap-2'>
                  {m.allocated >= 100 && <Chip tone='red'>Full</Chip>}
                  <span className='text-xs text-gray-500'>{m.openTasks} open</span>
                  <span className='w-10 text-right text-[13px] font-semibold tabular-nums text-slate-800'>
                    {m.allocated ? `${m.allocated}%` : '-'}
                  </span>
                </div>
              </div>
              <div className='h-2 overflow-hidden rounded-full bg-gray-100'>
                <div
                  className='h-full rounded-full'
                  style={{ width: `${Math.min(100, m.allocated)}%`, background: color }}
                />
              </div>
            </div>
          )
        })}
        {s.team.length === 0 && <Empty>No team members yet. Add them in Project Details &gt; Team.</Empty>}
      </div>
    )}

    {s.timesheets && (
      <Link
        href={SECTION_LINKS.approval.href}
        className='mt-4 grid grid-cols-3 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-center hover:opacity-90'
      >
        <div>
          <div className='text-[17px] font-semibold tabular-nums text-slate-800'>{s.timesheets.hours}</div>
          <div className='text-[11px] text-gray-500'>hrs logged this week</div>
        </div>
        <div>
          <div className='text-[17px] font-semibold tabular-nums text-slate-800'>{s.timesheets.approvedPct}%</div>
          <div className='text-[11px] text-gray-500'>of them approved</div>
        </div>
        <div>
          <div className='text-[17px] font-semibold tabular-nums text-amber-600'>{s.timesheets.pending}</div>
          <div className='text-[11px] text-gray-500'>timesheets to approve</div>
        </div>
      </Link>
    )}
  </CardShell>
)

/* --------------------------------- Delayed tasks table --------------------------------- */

export const DelayedTasks = ({ s }) => (
  <CardShell
    icon='tabler:alarm'
    iconClass='bg-red-100 text-red-600'
    title='Delayed Tasks'
    subtitle='Most overdue first'
    link={SECTION_LINKS.tasks}
  >
    {s.delayedTasks.length === 0 ? (
      <Empty>Nothing is delayed. Nice work.</Empty>
    ) : (
      <>
        <div className='overflow-x-auto'>
          <table className='w-full min-w-[520px] text-left text-[13px]'>
            <thead>
              <tr className='border-b border-gray-200 text-xs text-gray-500'>
                <th className='py-2 pr-3 font-medium'>Task</th>
                <th className='py-2 pr-3 font-medium'>Project</th>
                <th className='py-2 pr-3 font-medium'>Assignee</th>
                <th className='py-2 pr-3 font-medium'>Late by</th>
                <th className='py-2 font-medium'>Priority</th>
              </tr>
            </thead>
            <tbody>
              {s.delayedTasks.slice(0, 6).map(t => (
                <tr key={t.id} className='border-b border-gray-100 last:border-b-0'>
                  <td className='py-2 pr-3'>
                    <Link href={taskDetailsPath(t.id)} className='font-medium text-slate-800 hover:underline'>
                      {t.title}
                    </Link>
                    <div className='text-xs text-gray-500'>
                      {t.key} · due {formatDate(t.due)}
                    </div>
                  </td>
                  <td className='py-2 pr-3 text-slate-700'>{t.projectName}</td>
                  <td className='py-2 pr-3 text-slate-700'>{t.assignee}</td>
                  <td className='py-2 pr-3 font-semibold tabular-nums text-red-600'>
                    {t.daysLate} day{t.daysLate === 1 ? '' : 's'}
                  </td>
                  <td className='py-2'>
                    <Chip tone={PRIORITY_TONE[t.priority]}>{t.priority}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className='mt-2 text-xs text-gray-500'>
          Showing {Math.min(6, s.delayedTasks.length)} of {s.delayedTasks.length} delayed tasks
        </div>
      </>
    )}
  </CardShell>
)

/* ------------------------------------ Deliverables ------------------------------------ */

export const Deliverables = ({ s }) => (
  <CardShell
    icon='tabler:package'
    iconClass='bg-cyan-100 text-cyan-600'
    title='Deliverables'
    subtitle='What open milestones still have to hand over'
    link={SECTION_LINKS.deliverables}
  >
    <div className='flex flex-col'>
      {s.deliverables.map(d => (
        <div
          key={d.id}
          className='flex items-center justify-between gap-3 border-b border-gray-100 py-2.5 last:border-b-0'
        >
          <div className='flex min-w-0 items-center gap-2'>
            <Icon
              icon={d.status === 'Done' ? 'tabler:circle-check' : 'tabler:hourglass'}
              width={18}
              className={d.status === 'Done' ? 'text-emerald-500' : 'text-amber-500'}
            />
            <div className='min-w-0'>
              <div className='truncate text-[13px] font-medium text-slate-800'>{d.name}</div>
              <div className='truncate text-xs text-gray-500'>
                {d.milestone} · {d.projectName}
                {d.due ? ` · due ${formatDate(d.due)}` : ''}
              </div>
            </div>
          </div>
          <Chip tone={d.status === 'Done' ? 'green' : 'amber'}>{d.status}</Chip>
        </div>
      ))}
      {s.deliverables.length === 0 && <Empty>No open deliverables</Empty>}
    </div>
  </CardShell>
)

/* --------------------------------- Milestones and billing --------------------------------- */

const MILESTONE_TONE = {
  Planned: 'slate',
  'In Progress': 'blue',
  'Ready for Review': 'amber',
  Accepted: 'green',
  'Changes Requested': 'red'
}
const INVOICE_TONE = {
  Paid: 'green',
  Invoiced: 'blue',
  'Ready to invoice': 'violet',
  'Not due': 'slate',
  'Not billable': 'slate'
}

export const Milestones = ({ s }) => (
  <CardShell
    icon='tabler:flag'
    iconClass='bg-violet-100 text-violet-600'
    title='Milestones and Billing'
    subtitle='An accepted milestone becomes an invoice'
    link={SECTION_LINKS.milestones}
  >
    <div className='flex flex-col'>
      {s.milestones.slice(0, 6).map(m => (
        <Link
          key={m.id}
          href={`${projectDetailsPath(m.projectId)}&tab=milestones`}
          className='flex items-center justify-between gap-3 border-b border-gray-100 py-2.5 last:border-b-0 hover:opacity-80'
        >
          <div className='min-w-0'>
            <div className='truncate text-[13px] font-medium text-slate-800'>{m.title}</div>
            <div className={`truncate text-xs ${m.isOverdue ? 'text-red-600' : 'text-gray-500'}`}>
              {m.projectName} · {m.due ? formatDate(m.due) : 'no due date'}
              {m.isOverdue ? ' · overdue' : ''}
            </div>
          </div>
          <div className='flex shrink-0 items-center gap-2'>
            <Chip tone={MILESTONE_TONE[m.status]}>{m.status}</Chip>
            <Chip tone={INVOICE_TONE[m.invoice]}>{m.invoice}</Chip>
          </div>
        </Link>
      ))}
      {s.milestones.length === 0 && <Empty>No milestones yet</Empty>}
    </div>
  </CardShell>
)

/* ------------------------------------ Activity feed ------------------------------------ */

// "dev.user" -> "Dev User": login names as people read them.
const personName = name =>
  (name || 'Someone')
    .split(/[._\s]+/)
    .filter(Boolean)
    .map(p => p[0].toUpperCase() + p.slice(1))
    .join(' ')

export const ActivityFeed = ({ s }) => (
  <CardShell
    icon='tabler:activity'
    iconClass='bg-blue-100 text-blue-600'
    title='Recent Activity'
    subtitle='Latest changes on tasks across projects'
    link={SECTION_LINKS.activity}
  >
    {s.activity.length === 0 ? (
      <Empty>No recent activity</Empty>
    ) : (
      <ul className='grid grid-cols-1 gap-x-8 lg:grid-cols-2' data-activity-feed>
        {s.activity.map(a => {
          const meta = ACTION[a.action] || ACTION.updated

          return (
            <li key={a.id} className='flex items-start gap-3 border-b border-gray-100 py-2.5'>
              <IconBubble meta={meta} size={30}>
                <Icon icon={meta.icon} width={15} />
              </IconBubble>
              <div className='min-w-0 flex-1'>
                <div className='flex items-baseline gap-2'>
                  <p className='min-w-0 truncate text-[13px] text-slate-700'>
                    <span className='font-semibold text-slate-800'>{personName(a.who)}</span> {meta.verb || a.action}{' '}
                    <Link
                      href={taskDetailsPath(a.taskId)}
                      className='font-medium hover:underline'
                      style={{ color: 'var(--theme-solid)' }}
                      title={a.target}
                    >
                      {a.target}
                    </Link>
                  </p>
                  <span className='ms-auto shrink-0 text-[11px] text-gray-400'>{timeAgo(a.when)}</span>
                </div>
                {a.detail && (
                  <div className='truncate text-xs text-gray-500' title={a.detail}>
                    {a.detail}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    )}
  </CardShell>
)
