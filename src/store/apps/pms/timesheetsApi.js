import { buildQuery } from 'src/store/rtkQuery/baseQuery'
import { pmsApi, pmsAuthQuery, PMS_BASE_URL } from './pmsApiBase'

const url = (path, params = {}) => {
  const qs = buildQuery(params)

  return `${PMS_BASE_URL}${path}?${pmsAuthQuery()}${qs ? `&${qs}` : ''}`
}

// Approving hours changes the task's actual hours, its history and the project's cost.
const afterReview = ['MyWeek', 'TimeEntries', 'Approvals', 'ProjectBudget', 'BudgetOverview', 'TaskDetail', 'TaskList', 'TaskActivity', 'Billable', 'Dashboard', 'ApprovalInbox']

export const timesheetsApi = pmsApi.injectEndpoints({
  overrideExisting: true,
  endpoints: builder => ({
    getMyWeek: builder.query({
      query: weekStart => url('/timesheets/my-week', { week_start: weekStart }),
      providesTags: ['MyWeek']
    }),

    // One grid cell; hours 0 clears it.
    saveTimeEntry: builder.mutation({
      query: body => ({ url: url('/timesheets/entries'), method: 'POST', body }),
      invalidatesTags: ['MyWeek', 'TimeEntries', 'Dashboard']
    }),

    submitWeek: builder.mutation({
      query: weekStart => ({ url: url('/timesheets/submit'), method: 'POST', body: { week_start: weekStart } }),
      invalidatesTags: ['MyWeek', 'TimeEntries', 'Approvals', 'ProjectBudget', 'BudgetOverview', 'Dashboard']
    }),

    getTimeEntries: builder.query({
      query: (p = {}) =>
        url('/timesheets/list', {
          offset: p.itemsPerPage * ((p.currentPage || 1) - 1),
          page_size: p.itemsPerPage,
          project_id: p.projectId,
          member: p.member,
          status: p.status,
          date_from: p.dateFrom,
          date_to: p.dateTo
        }),
      providesTags: ['TimeEntries']
    }),

    getApprovals: builder.query({
      query: (p = {}) => url('/timesheets/approvals', { project_id: p.projectId }),
      providesTags: ['Approvals']
    }),

    approveEntries: builder.mutation({
      query: entryIds => ({ url: url('/timesheets/approve'), method: 'POST', body: { entry_ids: entryIds } }),
      invalidatesTags: afterReview
    }),

    rejectEntries: builder.mutation({
      query: ({ entryIds, reason }) => ({ url: url('/timesheets/reject'), method: 'POST', body: { entry_ids: entryIds, reason } }),
      invalidatesTags: afterReview
    }),

    getProjectBudget: builder.query({
      query: projectId => url(`/projects/${projectId}/budget`),
      providesTags: (r, e, projectId) => [{ type: 'ProjectBudget', id: Number(projectId) }, 'ProjectBudget']
    }),

    getBudgetOverview: builder.query({
      query: () => url('/budget/overview'),
      providesTags: ['BudgetOverview']
    })
  })
})

export const {
  useGetMyWeekQuery,
  useSaveTimeEntryMutation,
  useSubmitWeekMutation,
  useGetTimeEntriesQuery,
  useGetApprovalsQuery,
  useApproveEntriesMutation,
  useRejectEntriesMutation,
  useGetProjectBudgetQuery,
  useGetBudgetOverviewQuery
} = timesheetsApi
