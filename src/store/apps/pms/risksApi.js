import { buildQuery } from 'src/store/rtkQuery/baseQuery'
import { pmsApi, pmsAuthQuery, PMS_BASE_URL } from './pmsApiBase'

const url = (path, params = {}) => {
  const qs = buildQuery(params)

  return `${PMS_BASE_URL}${path}?${pmsAuthQuery()}${qs ? `&${qs}` : ''}`
}

// Risks feed project health on the dashboard; a fix task lands on the board; an approved change moves
// the budget, a milestone's amount or the end date.
const afterRisk = ['Risks', 'Issues', 'Dashboard']
const afterIssue = ['Issues', 'Risks', 'Dashboard', 'TaskList', 'TaskBoard', 'TaskDetail']
const afterChange = ['ChangeRequests', 'Milestones', 'Billable', 'ProjectList', 'ProjectDetail', 'ProjectBudget', 'BudgetOverview', 'Dashboard', 'ApprovalInbox']

const listParams = p => ({ project_id: p.projectId, status: p.status, level: p.level, severity: p.severity, search: p.search })

export const risksApi = pmsApi.injectEndpoints({
  overrideExisting: true,
  endpoints: builder => ({
    getRiskMeta: builder.query({ query: () => url('/risks/meta') }),

    getRisks: builder.query({
      query: (p = {}) => (p.scoped ? url(`/projects/${p.projectId}/risks`) : url('/risks/list', listParams(p))),
      providesTags: ['Risks']
    }),
    saveRisk: builder.mutation({
      query: ({ projectId, id, body }) => ({ url: url(`/projects/${projectId}/risks${id ? `/${id}` : ''}`), method: id ? 'PUT' : 'POST', body }),
      invalidatesTags: afterRisk
    }),
    changeRiskStatus: builder.mutation({
      query: ({ projectId, id, status }) => ({ url: url(`/projects/${projectId}/risks/${id}/status`), method: 'POST', body: { status } }),
      invalidatesTags: afterRisk
    }),
    riskOccurred: builder.mutation({
      query: ({ projectId, id }) => ({ url: url(`/projects/${projectId}/risks/${id}/occurred`), method: 'POST' }),
      invalidatesTags: afterRisk
    }),
    deleteRisk: builder.mutation({
      query: ({ projectId, id }) => ({ url: url(`/projects/${projectId}/risks/${id}`), method: 'DELETE' }),
      invalidatesTags: afterRisk
    }),

    getIssues: builder.query({
      query: (p = {}) => (p.scoped ? url(`/projects/${p.projectId}/issues`) : url('/issues/list', listParams(p))),
      providesTags: ['Issues']
    }),
    saveIssue: builder.mutation({
      query: ({ projectId, id, body }) => ({ url: url(`/projects/${projectId}/issues${id ? `/${id}` : ''}`), method: id ? 'PUT' : 'POST', body }),
      invalidatesTags: afterIssue
    }),
    changeIssueStatus: builder.mutation({
      query: ({ projectId, id, status, resolution }) => ({
        url: url(`/projects/${projectId}/issues/${id}/status`),
        method: 'POST',
        body: { status, resolution: resolution || null }
      }),
      invalidatesTags: afterIssue
    }),
    createFixTask: builder.mutation({
      query: ({ projectId, id }) => ({ url: url(`/projects/${projectId}/issues/${id}/task`), method: 'POST' }),
      invalidatesTags: afterIssue
    }),
    deleteIssue: builder.mutation({
      query: ({ projectId, id }) => ({ url: url(`/projects/${projectId}/issues/${id}`), method: 'DELETE' }),
      invalidatesTags: afterIssue
    }),

    getChangeRequests: builder.query({
      query: (p = {}) => (p.scoped ? url(`/projects/${p.projectId}/change-requests`) : url('/change-requests/list', listParams(p))),
      providesTags: ['ChangeRequests']
    }),
    saveChangeRequest: builder.mutation({
      query: ({ projectId, id, body }) => ({
        url: url(`/projects/${projectId}/change-requests${id ? `/${id}` : ''}`),
        method: id ? 'PUT' : 'POST',
        body
      }),
      invalidatesTags: afterChange
    }),
    decideChangeRequest: builder.mutation({
      query: ({ projectId, id, approve, note }) => ({
        url: url(`/projects/${projectId}/change-requests/${id}/${approve ? 'approve' : 'reject'}`),
        method: 'POST',
        body: { note: note || null }
      }),
      invalidatesTags: afterChange
    }),
    withdrawChangeRequest: builder.mutation({
      query: ({ projectId, id }) => ({ url: url(`/projects/${projectId}/change-requests/${id}`), method: 'DELETE' }),
      invalidatesTags: afterChange
    })
  })
})

export const {
  useGetRiskMetaQuery,
  useGetRisksQuery,
  useSaveRiskMutation,
  useChangeRiskStatusMutation,
  useRiskOccurredMutation,
  useDeleteRiskMutation,
  useGetIssuesQuery,
  useSaveIssueMutation,
  useChangeIssueStatusMutation,
  useCreateFixTaskMutation,
  useDeleteIssueMutation,
  useGetChangeRequestsQuery,
  useSaveChangeRequestMutation,
  useDecideChangeRequestMutation,
  useWithdrawChangeRequestMutation
} = risksApi
