import React from 'react'
import Link from 'next/link'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import StatCard from 'src/pms/components/StatCard'
import { Chip, formatDate, GRADIENT, inr, NameAvatar } from 'src/pms/components/ui'
import { taskDetailsPath } from 'src/pms/tasks/paths'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useGetProjectBudgetQuery } from 'src/store/apps/pms/timesheetsApi'

export const HEALTH_TONE = { 'On track': 'green', 'At risk': 'amber', 'Over budget': 'red', 'No budget': 'slate' }
const HEALTH_TEXT = {
  'On track': 'Spending is in line with the work done.',
  'At risk': 'At this rate the project will cost more than its budget.',
  'Over budget': 'Approved cost is already above the budget.',
  'No budget': 'Set a budget on the project to track spending against it.'
}

const Card = ({ title, children, className = '' }) => (
  <section className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
    <div className='mb-3 border-b border-gray-100 pb-2 text-[15px] font-semibold text-slate-800'>{title}</div>
    {children}
  </section>
)

// Budget bar: approved cost (solid) + waiting for approval (light), against the budget.
const UsageBar = ({ budget, actual, pending }) => {
  const scale = Math.max(budget || 0, actual + pending, 1)
  const actualPct = (actual / scale) * 100
  const pendingPct = (pending / scale) * 100
  const budgetPct = budget ? (budget / scale) * 100 : null

  return (
    <div>
      <div className='relative h-4 w-full overflow-hidden rounded-full bg-gray-100'>
        <div
          className='absolute inset-y-0 left-0'
          style={{ width: `${actualPct}%`, background: actual > (budget ?? Infinity) ? '#dc2626' : GRADIENT }}
        />
        <div
          className='absolute inset-y-0'
          style={{
            left: `${actualPct}%`,
            width: `${pendingPct}%`,
            background: 'color-mix(in srgb, var(--theme-solid) 30%, transparent)'
          }}
        />
        {budgetPct !== null && budgetPct < 100 && (
          <div className='absolute inset-y-0 w-0.5 bg-slate-800' style={{ left: `${budgetPct}%` }} title='Budget' />
        )}
      </div>
      <div className='mt-2 flex flex-wrap gap-4 text-xs text-gray-500'>
        <span className='inline-flex items-center gap-1'>
          <span className='h-2.5 w-2.5 rounded-sm' style={{ background: GRADIENT }} /> Approved {inr(actual)}
        </span>
        <span className='inline-flex items-center gap-1'>
          <span
            className='h-2.5 w-2.5 rounded-sm'
            style={{ background: 'color-mix(in srgb, var(--theme-solid) 30%, transparent)' }}
          />{' '}
          Waiting {inr(pending)}
        </span>
        {budget !== null && <span>Budget {inr(budget)}</span>}
      </div>
    </div>
  )
}

const ProjectBudgetTab = ({ project }) => {
  const { data, isFetching } = useGetProjectBudgetQuery(project.id)
  const b = data?.detail

  if (!b)
    return (
      <div className='py-12 text-center text-sm text-gray-500'>
        {isFetching ? 'Loading budget...' : 'Budget is not available.'}
      </div>
    )

  const weeks = b.by_week.map(w => ({ ...w, label: formatDate(w.week_start).slice(0, 6) }))

  return (
    <div className={`transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
      <div className='mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm'>
        <Chip tone={HEALTH_TONE[b.health]}>{b.health}</Chip>
        <span className='text-sm text-slate-700'>{b.health_reason || HEALTH_TEXT[b.health]}</span>
        {b.unrated_hours > 0 && (
          <span className='text-xs font-medium text-amber-600 md:ms-auto'>
            {b.unrated_hours} approved h have no hourly rate - set rates in Team
          </span>
        )}
      </div>

      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
        <StatCard
          icon='tabler:wallet'
          tone='indigo'
          label='Budget'
          value={b.budget === null ? '-' : inr(b.budget)}
          hint='planned for the project'
        />
        <StatCard
          icon='tabler:receipt'
          tone='violet'
          label='Actual Cost'
          value={inr(b.actual_cost)}
          hint={`hours ${inr(b.labour_cost || 0)} + expenses ${inr(b.expense_cost || 0)}${
            b.used_pct === null ? '' : ` · ${b.used_pct}% used`
          }`}
        />
        <StatCard
          icon='tabler:pig-money'
          tone={b.remaining !== null && b.remaining < 0 ? 'red' : 'emerald'}
          label='Remaining'
          value={b.remaining === null ? '-' : inr(b.remaining)}
          hint={`${inr(b.pending_cost)} waiting for approval`}
        />
        <StatCard
          icon='tabler:trending-up'
          tone={b.variance !== null && b.variance < 0 ? 'red' : 'blue'}
          label='Forecast at Completion'
          value={b.forecast === null ? '-' : inr(b.forecast)}
          hint={
            b.forecast === null
              ? 'needs progress and approved cost'
              : b.variance === null
              ? `at ${b.progress}% done`
              : `${b.variance >= 0 ? 'under' : 'over'} budget by ${inr(Math.abs(b.variance))}`
          }
        />
      </div>

      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
        <StatCard
          icon='tabler:file-invoice'
          tone='blue'
          label='Billed'
          value={inr(b.billed || 0)}
          hint='issued + paid invoices, before GST'
        />
        <StatCard
          icon='tabler:cash'
          tone='emerald'
          label='Collected'
          value={inr(b.collected || 0)}
          hint='paid invoices'
        />
        <StatCard
          icon='tabler:chart-arrows-vertical'
          tone={b.margin < 0 ? 'red' : 'violet'}
          label='Margin'
          value={inr(b.margin || 0)}
          hint={
            b.margin_pct === null || b.margin_pct === undefined
              ? 'billed minus cost - nothing billed yet'
              : `${b.margin_pct}% of billed`
          }
        />
        <StatCard
          icon='tabler:hourglass'
          tone='amber'
          label='Not Billed Yet'
          value={inr(Math.max(0, b.actual_cost - (b.billed || 0)))}
          hint='cost not yet covered by invoices'
        />
      </div>

      <div className='mb-3 grid grid-cols-1 gap-4 xl:grid-cols-3'>
        <Card title='Budget Usage' className='xl:col-span-2'>
          <UsageBar budget={b.budget} actual={b.actual_cost} pending={b.pending_cost} />
          <div className='mt-4 h-[220px]'>
            <ResponsiveContainer initialDimension={{ width: 320, height: 200 }} width='100%' height='100%'>
              <BarChart data={weeks} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray='3 3' vertical={false} />
                <XAxis dataKey='label' tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                <Tooltip
                  formatter={(v, name) => (name === 'cost' ? [inr(v), 'Cost'] : [v, 'Hours'])}
                  labelFormatter={l => `Week of ${l}`}
                />
                <Bar dataKey='cost' fill='var(--theme-solid)' radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className='text-center text-xs text-gray-500'>Approved cost per week (last 8 weeks)</div>
        </Card>

        <Card title='Hours'>
          <div className='flex flex-col gap-3 text-[14px]'>
            {[
              ['Estimated (all tasks)', b.estimated_hours],
              ['Approved', b.approved_hours],
              ['Waiting for approval', b.pending_hours],
              ['Work done', `${b.progress}%`]
            ].map(([label, value]) => (
              <div key={label} className='flex items-center justify-between'>
                <span className='text-gray-500'>{label}</span>
                <span className='font-semibold tabular-nums text-slate-800'>{value}</span>
              </div>
            ))}
            {b.estimated_hours > 0 && (
              <div className='text-xs text-gray-500'>
                {Math.round((b.approved_hours / b.estimated_hours) * 100)}% of the estimate used for {b.progress}% of
                the work.
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
        <Card title='Cost by Member'>
          {b.by_member.length === 0 ? (
            <div className='text-sm text-gray-500'>
              No hours logged yet. Team members log time in Timesheets &gt; My Timesheets.
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full min-w-[480px] text-left text-sm'>
                <thead className={ThemeStyles.tableHeaderBg}>
                  <tr>
                    {['Member', 'Rate', 'Approved h', 'Waiting h', 'Cost'].map(h => (
                      <th key={h} className='px-3 py-2'>
                        <div className={`pms-th-text ${h === 'Member' ? '' : 'text-right'}`}>{h}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.by_member.map(m => (
                    <tr key={m.member_id} className='border-t border-gray-200'>
                      <td className='pms-td-text px-3 py-2'>
                        <div className='flex items-center gap-2'>
                          <NameAvatar name={m.member_name} />
                          {m.member_name}
                        </div>
                      </td>
                      <td className='pms-td-text px-3 py-2 text-right'>
                        {m.hourly_rate === null ? <span className='text-amber-600'>Not set</span> : inr(m.hourly_rate)}
                      </td>
                      <td className='pms-td-text px-3 py-2 text-right tabular-nums'>{m.approved_hours}</td>
                      <td className='pms-td-text px-3 py-2 text-right tabular-nums'>{m.pending_hours}</td>
                      <td className='pms-td-text px-3 py-2 text-right font-semibold tabular-nums'>{inr(m.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title='Tasks Over Their Estimate'>
          {b.over_estimate.length === 0 ? (
            <div className='text-sm text-gray-500'>No task has used more hours than estimated.</div>
          ) : (
            <ul className='flex flex-col gap-2'>
              {b.over_estimate.map(t => (
                <li
                  key={t.task_id}
                  className='flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2'
                >
                  <Link href={taskDetailsPath(t.task_id)} className='min-w-0 hover:underline'>
                    <span className={`${ThemeStyles.listNoColor} text-[13px]`}>{t.task_key}</span>
                    <span className='ms-2 truncate text-[14px] font-medium text-slate-800'>{t.title}</span>
                  </Link>
                  <span className='shrink-0 text-xs font-semibold text-red-600'>
                    {t.actual_hours} / {t.estimated_hours} h (+
                    {Math.round(((t.actual_hours - t.estimated_hours) / t.estimated_hours) * 100)}%)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

export default ProjectBudgetTab
