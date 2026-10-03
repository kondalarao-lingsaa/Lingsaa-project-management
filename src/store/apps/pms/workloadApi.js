import { buildQuery } from 'src/store/rtkQuery/baseQuery'
import { pmsApi, pmsAuthQuery, PMS_BASE_URL } from './pmsApiBase'

const url = (path, params = {}) => {
  const qs = buildQuery(params)

  return `${PMS_BASE_URL}${path}?${pmsAuthQuery()}${qs ? `&${qs}` : ''}`
}

// Read-only views over tasks, teams and timesheets, so they refresh on the tags those screens already invalidate.
export const workloadApi = pmsApi.injectEndpoints({
  overrideExisting: true,
  endpoints: builder => ({
    getTaskCalendar: builder.query({
      query: p =>
        url('/calendar', {
          date_from: p.from,
          date_to: p.to,
          project_id: p.projectId,
          mine: p.mine ? 'true' : undefined,
          include_done: p.includeDone ? undefined : 'false'
        }),
      providesTags: ['TaskList', 'Timeline', 'Milestones']
    }),
    getCapacity: builder.query({
      query: p => url('/resources/capacity', { start: p.start, weeks: p.weeks, project_id: p.projectId }),
      providesTags: ['TaskList', 'ProjectMembers', 'ResourceAllocation', 'Timeline']
    }),
    getUtilization: builder.query({
      query: p =>
        url('/resources/utilization', { date_from: p.from, date_to: p.to, project_id: p.projectId, person: p.person }),
      providesTags: ['TimeEntries', 'Approvals', 'MyWeek', 'ProjectMembers', 'ResourceAllocation']
    })
  })
})

export const { useGetTaskCalendarQuery, useGetCapacityQuery, useGetUtilizationQuery } = workloadApi
