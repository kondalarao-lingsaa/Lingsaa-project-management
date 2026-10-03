import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import PmsPage from 'src/pms/components/PmsPage'
import StatCard from 'src/pms/components/StatCard'
import PmsPagination from 'src/pms/components/PmsPagination'
import { Chip, formatDate, inr, NameAvatar } from 'src/pms/components/ui'
import { taskDetailsPath } from 'src/pms/tasks/paths'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useGetProjectOptionsQuery } from 'src/store/apps/pms/projectsApi'
import { useGetTimeEntriesQuery } from 'src/store/apps/pms/timesheetsApi'

const STATUS_TONE = { Draft: 'slate', Submitted: 'amber', Approved: 'green', Rejected: 'red' }

const useDebouncedValue = (value, delay = 500) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

// Everyone's logged hours, filterable by project, person, status and dates.
const TeamTimesheetsView = () => {
  const [pagination, setPagination] = useState({ currentPage: 1, itemsPerPage: 5 })
  const [filters, setFilters] = useState({ projectId: '', status: '', dateFrom: '', dateTo: '' })
  const [memberInput, setMemberInput] = useState('')
  const member = useDebouncedValue(memberInput)

  const { data, isFetching } = useGetTimeEntriesQuery({ ...pagination, ...filters, member })
  const { data: projectsResp } = useGetProjectOptionsQuery(undefined)

  const rows = Array.isArray(data?.detail) ? data.detail : []
  const sv = data?.stack_values || {}
  const projects = Array.isArray(projectsResp?.detail) ? projectsResp.detail : []
  const dateError = filters.dateFrom && filters.dateTo && filters.dateTo < filters.dateFrom ? 'To date cannot be before From date' : ''

  useEffect(() => setPagination(prev => ({ ...prev, currentPage: 1 })), [member, filters])

  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }))

  return (
    <PmsPage screenId='timesheets.teamTimesheets'>
      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
        <StatCard icon='tabler:clock' tone='indigo' label='Total Hours' value={sv.hours || 0} hint={`${sv.count_pg || 0} entries`} />
        <StatCard icon='tabler:circle-check' tone='emerald' label='Approved' value={sv.by_status?.Approved || 0} hint='hours' />
        <StatCard icon='tabler:hourglass' tone='amber' label='Waiting' value={sv.by_status?.Submitted || 0} hint='hours submitted' />
        <StatCard icon='tabler:coin-rupee' tone='violet' label='Cost' value={inr(sv.cost || 0)} hint='approved at locked rate, others at current rate' />
      </div>

      <div className={`${ThemeStyles.tableColor} rounded-md`}>
        <div className='grid grid-cols-1 gap-2 p-3 md:grid-cols-2 xl:grid-cols-5'>
          <input
            type='text'
            value={memberInput}
            onChange={e => setMemberInput(e.target.value)}
            placeholder='Search with Person...'
            className={`${ThemeStyles.formsInputs} search-input text-gray-900`}
          />
          <select value={filters.projectId} onChange={e => setFilter('projectId', e.target.value)} className={ThemeStyles.formsInputsDropdown} aria-label='Project'>
            <option value=''>All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.project_code} - {p.project_name}
              </option>
            ))}
          </select>
          <select value={filters.status} onChange={e => setFilter('status', e.target.value)} className={ThemeStyles.formsInputsDropdown} aria-label='Status'>
            <option value=''>All Statuses</option>
            {Object.keys(STATUS_TONE).map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input type='date' value={filters.dateFrom} onChange={e => setFilter('dateFrom', e.target.value)} className={ThemeStyles.formsInputs} aria-label='From date' title='From date' />
          <div>
            <input
              type='date'
              value={filters.dateTo}
              min={filters.dateFrom || undefined}
              onChange={e => setFilter('dateTo', e.target.value)}
              className={`${ThemeStyles.formsInputs}${dateError ? ' !border !border-red-500' : ''}`}
              aria-label='To date'
              title='To date'
            />
            {dateError && <span className='!mt-1 block text-xs font-semibold text-red-500'>{dateError}</span>}
          </div>
        </div>

        <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <table className='w-full min-w-[1000px] text-left text-sm'>
            <thead className={ThemeStyles.tableHeaderBg}>
              <tr>
                {['Date', 'Person', 'Task', 'Hours', 'Status', 'Cost', 'Reviewed By'].map(h => (
                  <th key={h} className={`${ThemeStyles.tableHeadCellsHeight} !px-3`}>
                    <div className={`pms-th-text ${['Hours', 'Cost'].includes(h) ? 'text-right' : h === 'Status' ? 'text-center' : ''}`}>{h}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className='py-10 text-center text-slate-600'>
                    {isFetching ? 'Loading...' : 'No hours match these filters.'}
                  </td>
                </tr>
              ) : (
                rows.map(e => (
                  <tr key={e.id} className='border-t border-gray-200 hover:bg-gray-50/70'>
                    <td className='pms-td-text px-3 py-2'>{formatDate(e.work_date)}</td>
                    <td className='pms-td-text px-3 py-2'>
                      <div className='flex items-center gap-2'>
                        <NameAvatar name={e.member_name} />
                        {e.member_name}
                      </div>
                    </td>
                    <td className='px-3 py-2'>
                      <Link href={taskDetailsPath(e.task_id)} className={`${ThemeStyles.listNoColor} text-[13px]`}>
                        {e.task_key}
                      </Link>
                      <div className='pms-td-text max-w-[320px] truncate'>{e.task_title}</div>
                      <div className='text-xs text-gray-500'>{e.project_code}</div>
                    </td>
                    <td className='pms-td-text px-3 py-2 text-right font-semibold tabular-nums'>{e.hours}</td>
                    <td className='px-3 py-2 text-center' title={e.reject_reason || ''}>
                      <Chip tone={STATUS_TONE[e.status]}>{e.status}</Chip>
                    </td>
                    <td className='pms-td-text px-3 py-2 text-right tabular-nums'>{e.cost === null ? '-' : inr(e.cost)}</td>
                    <td className='pms-td-text px-3 py-2'>
                      {e.reviewed_by_name ? (
                        <>
                          {e.reviewed_by_name}
                          <div className='text-xs text-gray-500'>{formatDate(e.reviewed_at)}</div>
                        </>
                      ) : (
                        <span className='text-gray-400'>-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PmsPagination
          pagination={pagination}
          handleChange={page => setPagination(prev => ({ ...prev, currentPage: page }))}
          handleipp={value => setPagination({ currentPage: 1, itemsPerPage: value })}
          total={sv.count_pg || 0}
        />
      </div>
    </PmsPage>
  )
}

export default TeamTimesheetsView
