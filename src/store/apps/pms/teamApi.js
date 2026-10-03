import { buildQuery } from 'src/store/rtkQuery/baseQuery'
import { pmsApi, pmsAuthQuery, PMS_BASE_URL } from './pmsApiBase'

// A team change moves people's allocation, "My Projects" (members see their projects there) and,
// for a renamed member, the names on their tasks.
const refreshTeam = projectId => [
  'Dashboard',
  { type: 'ProjectMembers', id: Number(projectId) },
  'ResourceAllocation',
  'ProjectList',
  'TaskList',
  'TaskBoard',
  'TaskDetail',
  'MyWeek',
  'ProjectBudget',
  'BudgetOverview',
  // Project Details setup checklist counts the team.
  'ProjectDetail'
]

export const teamApi = pmsApi.injectEndpoints({
  overrideExisting: true,
  endpoints: builder => ({
    getTeamMeta: builder.query({
      query: () => `${PMS_BASE_URL}/team/meta?${pmsAuthQuery()}`,
      providesTags: ['TeamMeta']
    }),

    getProjectMembers: builder.query({
      query: projectId => `${PMS_BASE_URL}/projects/${projectId}/members?${pmsAuthQuery()}`,
      providesTags: (r, e, projectId) => [{ type: 'ProjectMembers', id: Number(projectId) }]
    }),

    addProjectMember: builder.mutation({
      query: ({ projectId, body }) => ({ url: `${PMS_BASE_URL}/projects/${projectId}/members?${pmsAuthQuery()}`, method: 'POST', body }),
      invalidatesTags: (r, e, { projectId }) => refreshTeam(projectId)
    }),

    updateProjectMember: builder.mutation({
      query: ({ projectId, memberId, body }) => ({
        url: `${PMS_BASE_URL}/projects/${projectId}/members/${memberId}?${pmsAuthQuery()}`,
        method: 'PUT',
        body
      }),
      invalidatesTags: (r, e, { projectId }) => refreshTeam(projectId)
    }),

    removeProjectMember: builder.mutation({
      query: ({ projectId, memberId }) => ({ url: `${PMS_BASE_URL}/projects/${projectId}/members/${memberId}?${pmsAuthQuery()}`, method: 'DELETE' }),
      invalidatesTags: (r, e, { projectId }) => refreshTeam(projectId)
    }),

    getResourceAllocation: builder.query({
      query: (p = {}) => {
        const qs = buildQuery({ search: p.search, over_only: p.overOnly ? 'true' : undefined })

        return `${PMS_BASE_URL}/resources/allocation?${pmsAuthQuery()}${qs ? `&${qs}` : ''}`
      },
      providesTags: ['ResourceAllocation']
    })
  })
})

export const {
  useGetTeamMetaQuery,
  useGetProjectMembersQuery,
  useAddProjectMemberMutation,
  useUpdateProjectMemberMutation,
  useRemoveProjectMemberMutation,
  useGetResourceAllocationQuery
} = teamApi
