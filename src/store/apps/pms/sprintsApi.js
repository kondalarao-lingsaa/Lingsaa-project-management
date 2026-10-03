import { pmsApi, pmsAuthQuery, PMS_BASE_URL } from './pmsApiBase'

const url = path => `${PMS_BASE_URL}${path}?${pmsAuthQuery()}`

// A sprint change moves the backlog, the sprint board, task rows (their sprint) and the dashboard.
const afterSprint = ['Sprints', 'Backlog', 'TaskBoard', 'TaskList', 'TaskDetail', 'TaskActivity', 'Dashboard']

export const sprintsApi = pmsApi.injectEndpoints({
  overrideExisting: true,
  endpoints: builder => ({
    getProjectSprints: builder.query({
      query: projectId => url(`/projects/${projectId}/sprints`),
      providesTags: ['Sprints']
    }),
    getBacklog: builder.query({
      query: projectId => url(`/projects/${projectId}/backlog`),
      providesTags: ['Backlog']
    }),
    getBurndown: builder.query({
      query: sprintId => url(`/sprints/${sprintId}/burndown`),
      providesTags: ['Sprints']
    }),
    saveSprint: builder.mutation({
      query: ({ projectId, id, body }) => ({ url: url(id ? `/sprints/${id}` : `/projects/${projectId}/sprints`), method: id ? 'PUT' : 'POST', body }),
      invalidatesTags: afterSprint
    }),
    deleteSprint: builder.mutation({
      query: id => ({ url: url(`/sprints/${id}`), method: 'DELETE' }),
      invalidatesTags: afterSprint
    }),
    addSprintTasks: builder.mutation({
      query: ({ id, taskIds }) => ({ url: url(`/sprints/${id}/tasks`), method: 'POST', body: { task_ids: taskIds } }),
      invalidatesTags: afterSprint
    }),
    removeSprintTask: builder.mutation({
      query: ({ id, taskId }) => ({ url: url(`/sprints/${id}/tasks/${taskId}`), method: 'DELETE' }),
      invalidatesTags: afterSprint
    }),
    startSprint: builder.mutation({
      query: id => ({ url: url(`/sprints/${id}/start`), method: 'POST' }),
      invalidatesTags: afterSprint
    }),
    completeSprint: builder.mutation({
      query: ({ id, moveToSprintId }) => ({ url: url(`/sprints/${id}/complete`), method: 'POST', body: { move_to_sprint_id: moveToSprintId || null } }),
      invalidatesTags: afterSprint
    })
  })
})

export const {
  useGetProjectSprintsQuery,
  useGetBacklogQuery,
  useGetBurndownQuery,
  useSaveSprintMutation,
  useDeleteSprintMutation,
  useAddSprintTasksMutation,
  useRemoveSprintTaskMutation,
  useStartSprintMutation,
  useCompleteSprintMutation
} = sprintsApi
