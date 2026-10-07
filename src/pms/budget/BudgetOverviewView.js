import React, { useState } from 'react'
import Link from 'next/link'
import PmsPage from 'src/pms/components/PmsPage'
import StatCard from 'src/pms/components/StatCard'
import { AllocationBar, Chip, inr, StatusPill } from 'src/pms/components/ui'
import { projectDetailsPath } from 'src/pms/projects/ProjectsListView'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useGetBudgetOverviewQuery } from 'src/store/apps/pms/timesheetsApi'
import { HEALTH_TONE } from './ProjectBudgetTab'
import usePagedRows from 'src/pms/components/usePagedRows'

// Budget & Costs > Budget: every project's budget against the cost of its approved hours and expenses.
const BudgetOverviewView = () => {
  const { data, isFetching } = useGetBudgetOverviewQuery()
  // Search narrows the (paged) list, so a project is found without paging through every project.
  const [search, setSearch] = useState('')
  const term = search.trim().toLowerCase()
  const rows = (data?.detail || []).filter(r => !term || `${r.project_code} ${r.project_name}`.toLowerCase().includes(term))
  const { pageRows, pager } = usePagedRows(rows, { resetKey: term })
  const sv = data?.stack_values || {}

  return (
    <PmsPage screenId='budget.budget'>
      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
        <StatCard
          icon='tabler:wallet'
          tone='indigo'
          label='Total Budget'
          value={inr(sv.total_budget || 0)}
          hint={`${sv.count_pg || 0} projects`}
        />
        <StatCard
          icon='tabler:receipt'
          tone='violet'
          label='Actual Cost'
          value={inr(sv.total_actual || 0)}
          hint='approved hours + approved expenses'
        />
        <StatCard
          icon='tabler:hourglass'
          tone='amber'
          label='Waiting'
          value={inr(sv.total_pending || 0)}
          hint='submitted hours + expenses, not approved yet'
        />
        <StatCard
          icon='tabler:alert-triangle'
          tone='red'
          label='At Risk'
          value={sv.at_risk || 0}
          hint='at risk or over budget'
        />
      </div>

      <div className={`${ThemeStyles.tableColor} rounded-md`}>
        <div className='flex flex-col gap-2 p-3 md:flex-row md:items-center'>
          <input
            type='text'
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder='Search with Project Code, Name...'
            aria-label='Search projects'
            className={`${ThemeStyles.formsInputs} search-input text-gray-900 md:max-w-sm`}
          />
        </div>
        <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <table className='w-full min-w-[1080px] text-left text-sm'>
            <thead className={ThemeStyles.tableHeaderBg}>
              <tr>
                {['Project', 'Status', 'Budget', 'Actual', 'Waiting', 'Used', 'Forecast', 'Health'].map(h => (
                  <th key={h} className={`${ThemeStyles.tableHeadCellsHeight} !px-3`}>
                    <div
                      className={`pms-th-text ${
                        ['Budget', 'Actual', 'Waiting', 'Forecast'].includes(h)
                          ? 'text-right'
                          : ['Status', 'Health'].includes(h)
                          ? 'text-center'
                          : ''
                      }`}
                    >
                      {h}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className='py-10 text-center text-slate-600'>
                    {isFetching ? 'Loading...' : term ? 'No project matches your search.' : 'No projects yet.'}
                  </td>
                </tr>
              ) : (
                pageRows.map(r => (
                  <tr key={r.project_id} className='border-t border-gray-200 hover:bg-gray-50/70'>
                    <td className='px-3 py-2'>
                      <Link href={`${projectDetailsPath(r.project_id)}&tab=budget`} className='hover:underline'>
                        <span className={`${ThemeStyles.listNoColor} text-[13px]`}>{r.project_code}</span>
                        <div className='pms-td-text font-semibold'>{r.project_name}</div>
                      </Link>
                    </td>
                    <td className='px-3 py-2 text-center'>
                      <StatusPill status={r.status} />
                    </td>
                    <td className='pms-td-text px-3 py-2 text-right tabular-nums'>
                      {r.budget === null ? '-' : inr(r.budget)}
                    </td>
                    <td className='pms-td-text px-3 py-2 text-right font-semibold tabular-nums'>
                      {inr(r.actual_cost)}
                    </td>
                    <td className='pms-td-text px-3 py-2 text-right tabular-nums'>{inr(r.pending_cost)}</td>
                    <td className='px-3 py-2'>
                      {r.used_pct === null ? (
                        <span className='text-gray-400'>-</span>
                      ) : (
                        <AllocationBar value={Math.round(r.used_pct)} />
                      )}
                    </td>
                    <td className='pms-td-text px-3 py-2 text-right tabular-nums'>
                      {r.forecast === null ? '-' : inr(r.forecast)}
                    </td>
                    <td className='px-3 py-2 text-center'>
                      <Chip tone={HEALTH_TONE[r.health]}>{r.health}</Chip>
                    </td>
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

export default BudgetOverviewView
