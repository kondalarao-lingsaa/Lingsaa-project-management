import { buildQuery } from 'src/store/rtkQuery/baseQuery'
import { pmsApi, pmsAuthQuery, PMS_BASE_URL } from './pmsApiBase'

// Saving a project (or changing its status) also changes what the Project Details tabs show: the new
// manager joins the team, budget/dates drive the Budget tab and milestone/task date checks, and the status
// decides what may still be edited. So every tab's data is refreshed, not only the project itself.
const PROJECT_WIDE_TAGS = [
  'ProjectList', 'Dashboard', 'Timeline', 'Roadmap', 'ProjectMembers', 'ResourceAllocation', 'ProjectBudget', 'BudgetOverview',
  'TaskList', 'TaskBoard', 'Backlog', 'Milestones', 'Billable', 'Invoices', 'Sprints', 'Risks', 'Issues', 'ChangeRequests',
  'Documents', 'Expenses', 'ProjectSettings', 'TaskActivity'
]

// overrideExisting: Fast Refresh re-runs this module against the same base api in dev.
export const projectsApi = pmsApi.injectEndpoints({
  overrideExisting: true,
  endpoints: builder => ({
    getProjectMeta: builder.query({
      query: () => `${PMS_BASE_URL}/projects/meta?${pmsAuthQuery()}`
    }),

    getProjectList: builder.query({
      query: (p = {}) => {
        const qs = buildQuery({
          offset: p.itemsPerPage * ((p.currentPage || 1) - 1),
          page_size: p.itemsPerPage,
          search: p.search,
          status: p.status,
          priority: p.priority,
          sort_by: p.sortBy,
          sort_order: p.sortOrder,
          mine: p.mine ? 'true' : undefined
        })

        return `${PMS_BASE_URL}/projects/list?${pmsAuthQuery()}${qs ? `&${qs}` : ''}`
      },
      providesTags: ['ProjectList']
    }),

    // Every project of the company (no page limit) for project dropdowns.
    getProjectOptions: builder.query({
      query: () => `${PMS_BASE_URL}/projects/options?${pmsAuthQuery()}`,
      providesTags: ['ProjectList']
    }),

    getProjectDetail: builder.query({
      query: id => `${PMS_BASE_URL}/projects/${id}?${pmsAuthQuery()}`,
      providesTags: (r, e, id) => [{ type: 'ProjectDetail', id: Number(id) }]
    }),

    createProject: builder.mutation({
      query: body => ({ url: `${PMS_BASE_URL}/projects/create?${pmsAuthQuery()}`, method: 'POST', body }),
      invalidatesTags: ['ProjectList', 'Dashboard']
    }),

    updateProject: builder.mutation({
      query: ({ id, body }) => ({ url: `${PMS_BASE_URL}/projects/${id}?${pmsAuthQuery()}`, method: 'PUT', body }),
      invalidatesTags: (r, e, { id }) => [...PROJECT_WIDE_TAGS, { type: 'ProjectDetail', id: Number(id) }]
    }),

    changeProjectStatus: builder.mutation({
      // remarks: optional note when approving; the reason when an approver sends a project back to Draft.
      query: ({ id, status, remarks }) => ({
        url: `${PMS_BASE_URL}/projects/${id}/status?${pmsAuthQuery()}`,
        method: 'POST',
        body: { status, remarks }
      }),
      invalidatesTags: (r, e, { id }) => [...PROJECT_WIDE_TAGS, 'ApprovalInbox', 'Notifications', { type: 'ProjectDetail', id: Number(id) }]
    }),

    deleteProject: builder.mutation({
      query: id => ({ url: `${PMS_BASE_URL}/projects/${id}?${pmsAuthQuery()}`, method: 'DELETE' }),
      // A deleted project takes its tasks out of every task list too.
      invalidatesTags: ['ProjectList', 'TaskList', 'Dashboard']
    })
  })
})

export const {
  useGetProjectMetaQuery,
  useGetProjectListQuery,
  useGetProjectOptionsQuery,
  useGetProjectDetailQuery,
  useLazyGetProjectDetailQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useChangeProjectStatusMutation,
  useDeleteProjectMutation
} = projectsApi
