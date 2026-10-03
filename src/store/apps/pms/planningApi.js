import { buildQuery } from 'src/store/rtkQuery/baseQuery'
import { pmsApi, pmsAuthQuery, PMS_BASE_URL } from './pmsApiBase'

const url = (path, params = {}) => {
  const qs = buildQuery(params)

  return `${PMS_BASE_URL}${path}?${pmsAuthQuery()}${qs ? `&${qs}` : ''}`
}

export const planningApi = pmsApi.injectEndpoints({
  overrideExisting: true,
  endpoints: builder => ({
    getProjectTimeline: builder.query({
      query: projectId => url(`/projects/${projectId}/timeline`),
      providesTags: ['Timeline']
    }),

    // Dragging a bar: new dates, checked against the project and its dependencies.
    rescheduleTask: builder.mutation({
      query: ({ id, startDate, dueDate }) => ({ url: url(`/tasks/${id}/schedule`), method: 'POST', body: { start_date: startDate, due_date: dueDate } }),
      invalidatesTags: ['Timeline', 'Roadmap', 'PlanningDependencies', 'TaskList', 'TaskBoard', 'TaskDetail', 'TaskActivity', 'Dashboard']
    }),

    getRoadmap: builder.query({
      query: () => url('/planning/roadmap'),
      providesTags: ['Roadmap']
    }),

    getPlanningDependencies: builder.query({
      query: (p = {}) => url('/planning/dependencies', { project_id: p.projectId }),
      providesTags: ['PlanningDependencies']
    })
  })
})

export const { useGetProjectTimelineQuery, useRescheduleTaskMutation, useGetRoadmapQuery, useGetPlanningDependenciesQuery } = planningApi
