import React, { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useGetDashboardOverviewQuery } from 'src/store/apps/pms/dashboardApi'
import {
  ActivityFeed,
  BillingSummary,
  BudgetOverview,
  DelayedTasks,
  Deliverables,
  KpiCards,
  Milestones,
  ProjectProgress,
  RiskSummary,
  TaskStatus,
  TaskTrend,
  TeamWorkload
} from './widgets'

const clock = date => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// Two cards side by side (7 + 5 columns); a card the role may not see is left out (its data comes back as null)
// and the other one takes the full width.
const cardRow = (left, right) => {
  const cards = [left, right].filter(Boolean)

  return cards.map((card, i) => (
    <div key={i} className={cards.length === 1 ? 'xl:col-span-12' : i === 0 ? 'xl:col-span-7' : 'xl:col-span-5'}>
      {card}
    </div>
  ))
}

// Live dashboard: every card comes from GET /api/dashboard/overview, for all projects or the chosen one.
// It refreshes when anything it shows changes elsewhere, and when the user comes back to the tab.
const DashboardView = () => {
  const [projectId, setProjectId] = useState('')
  const { data, isFetching, isError, refetch, fulfilledTimeStamp } = useGetDashboardOverviewQuery(
    { projectId },
    { refetchOnMountOrArgChange: 60 }
  )
  const s = data?.detail

  // Coming back to the tab refreshes the numbers (at most once a minute). Done here rather than with RTK's
  // refetchOnFocus, which needs setupListeners in the host store - Lingsaa_Accounts does not call it.
  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState === 'visible' && (!fulfilledTimeStamp || Date.now() - fulfilledTimeStamp > 60000))
        refetch()
    }
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)

    return () => {
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('focus', onReturn)
    }
  }, [refetch, fulfilledTimeStamp])

  // The chosen project may have been deleted meanwhile.
  useEffect(() => {
    if (s && projectId && !s.projectOptions.some(p => String(p.id) === projectId)) setProjectId('')
  }, [s, projectId])

  if (!s) {
    return (
      <div className={`${ThemeStyles.tableColor} rounded-md p-10 text-center`}>
        {isError ? (
          <>
            <Icon icon='tabler:plug-connected-x' width={36} className='mx-auto mb-2 text-red-500' />
            <div className='mb-2 text-[15px] font-semibold text-slate-800'>The dashboard could not be loaded</div>
            <button
              type='button'
              onClick={refetch}
              className='cursor-pointer text-sm font-semibold hover:underline'
              style={{ color: 'var(--theme-solid)' }}
            >
              Try again
            </button>
          </>
        ) : (
          <div className='text-sm text-gray-500'>Loading dashboard...</div>
        )}
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-4 transition-opacity ${isFetching ? 'opacity-70' : ''}`}>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <Icon icon='tabler:filter' width={18} className='text-gray-500' />
          <select
            id='dashboard_project'
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className={`${ThemeStyles.formsInputsDropdown} min-w-[260px]`}
            aria-label='Project'
          >
            <option value=''>All projects ({s.projectOptions.length})</option>
            {s.projectOptions.map(p => (
              <option key={p.id} value={p.id}>
                {p.code} - {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className='flex items-center gap-2 text-xs text-gray-500'>
          <span className='inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-700'>
            <span className='h-2 w-2 rounded-full bg-emerald-500' /> Live
          </span>
          {fulfilledTimeStamp && <span>Updated {clock(new Date(fulfilledTimeStamp))}</span>}
          <button
            type='button'
            onClick={refetch}
            disabled={isFetching}
            className='cursor-pointer rounded-md p-1 hover:bg-gray-100 disabled:opacity-50'
            aria-label='Refresh dashboard'
            title='Refresh'
          >
            <Icon icon='tabler:refresh' width={18} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <KpiCards s={s} />

      <div className='grid grid-cols-1 gap-4 xl:grid-cols-12'>
        {cardRow(<ProjectProgress s={s} />, s.taskTotals && <TaskStatus s={s} />)}
        {cardRow(s.trend && <TaskTrend s={s} />, s.riskCounts && <RiskSummary s={s} />)}
        {cardRow(
          s.budgetPlanned !== null && <BudgetOverview s={s} />,
          (s.team || s.timesheets) && <TeamWorkload s={s} />
        )}
        {cardRow(s.delayedTasks && <DelayedTasks s={s} />, s.billing && <BillingSummary s={s} />)}
        {cardRow(s.milestones && <Milestones s={s} />, s.deliverables && <Deliverables s={s} />)}
        {cardRow(s.activity && <ActivityFeed s={s} />)}
      </div>
    </div>
  )
}

export default DashboardView
