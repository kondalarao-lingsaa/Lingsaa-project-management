import { buildQuery } from 'src/store/rtkQuery/baseQuery'
import { pmsApi, pmsAuthQuery, PMS_BASE_URL } from './pmsApiBase'

// A task belongs to a project, so every task change also refreshes that project's list row and
// detail page (its task count, progress and overdue numbers come from its tasks).
// The board, open Task Details pages (a parent lists its subtasks' status) and task history change
// with every task change too.
const refreshProject = projectId => [
  'Dashboard',
  'Sprints',
  'Backlog',
  'Timeline',
  'Roadmap',
  'PlanningDependencies',
  'TaskList',
  'TaskBoard',
  'TaskDetail',
  'TaskActivity',
  'ProjectList',
  'ResourceAllocation',
  'Milestones',
  { type: 'ProjectDetail', id: Number(projectId) },
  { type: 'ProjectMembers', id: Number(projectId) }
]
const taskUrl = (id, path = '') => `${PMS_BASE_URL}/tasks/${id}${path}?${pmsAuthQuery()}`

export const tasksApi = pmsApi.injectEndpoints({
  overrideExisting: true,
  endpoints: builder => ({
    getTaskMeta: builder.query({
      query: () => `${PMS_BASE_URL}/tasks/meta?${pmsAuthQuery()}`
    }),

    getTaskList: builder.query({
      query: (p = {}) => {
        const qs = buildQuery({
          offset: p.itemsPerPage * ((p.currentPage || 1) - 1),
          page_size: p.itemsPerPage,
          search: p.search,
          status: p.status,
          priority: p.priority,
          project_id: p.projectId,
          sort_by: p.sortBy,
          sort_order: p.sortOrder,
          mine: p.mine ? 'true' : undefined,
          top_level: p.topLevel ? 'true' : undefined,
          sprint_id: p.sprintId
        })

        return `${PMS_BASE_URL}/tasks/list?${pmsAuthQuery()}${qs ? `&${qs}` : ''}`
      },
      providesTags: ['TaskList']
    }),

    getTaskDetail: builder.query({
      query: id => `${PMS_BASE_URL}/tasks/${id}?${pmsAuthQuery()}`,
      providesTags: (r, e, id) => [{ type: 'TaskDetail', id: Number(id) }]
    }),

    createTask: builder.mutation({
      query: body => ({ url: `${PMS_BASE_URL}/tasks/create?${pmsAuthQuery()}`, method: 'POST', body }),
      invalidatesTags: (r, e, body) => refreshProject(body.project_id)
    }),

    updateTask: builder.mutation({
      query: ({ id, body }) => ({ url: `${PMS_BASE_URL}/tasks/${id}?${pmsAuthQuery()}`, method: 'PUT', body }),
      invalidatesTags: (r, e, { id, body }) => [...refreshProject(body.project_id), { type: 'TaskDetail', id: Number(id) }]
    }),

    changeTaskStatus: builder.mutation({
      query: ({ id, status }) => ({ url: `${PMS_BASE_URL}/tasks/${id}/status?${pmsAuthQuery()}`, method: 'POST', body: { status } }),
      invalidatesTags: (r, e, { id, projectId }) => [...refreshProject(projectId), { type: 'TaskDetail', id: Number(id) }]
    }),

    deleteTask: builder.mutation({
      query: ({ id }) => ({ url: `${PMS_BASE_URL}/tasks/${id}?${pmsAuthQuery()}`, method: 'DELETE' }),
      invalidatesTags: (r, e, { projectId }) => refreshProject(projectId)
    }),

    /* ------------------------------ Kanban board ------------------------------ */

    getTaskBoard: builder.query({
      query: (p = {}) => {
        const qs = buildQuery({
          project_id: p.projectId,
          search: p.search,
          priority: p.priority,
          assignee: p.assignee,
          mine: p.mine ? 'true' : undefined,
          sprint_id: p.sprintId
        })

        return `${PMS_BASE_URL}/tasks/board?${pmsAuthQuery()}${qs ? `&${qs}` : ''}`
      },
      providesTags: ['TaskBoard']
    }),

    // Drag and drop: new column plus the cards directly above/below the drop point.
    moveTask: builder.mutation({
      query: ({ id, status, prevId, nextId }) => ({
        url: taskUrl(id, '/move'),
        method: 'POST',
        body: { status, prev_id: prevId || null, next_id: nextId || null }
      }),
      invalidatesTags: (r, e, { id, projectId }) => [...refreshProject(projectId), { type: 'TaskDetail', id: Number(id) }]
    }),

    /* ------------------------------ Task Details ------------------------------ */

    getTaskComments: builder.query({
      query: id => taskUrl(id, '/comments'),
      providesTags: (r, e, id) => [{ type: 'TaskComments', id: Number(id) }]
    }),

    addTaskComment: builder.mutation({
      query: ({ id, body }) => ({ url: taskUrl(id, '/comments'), method: 'POST', body: { body } }),
      invalidatesTags: (r, e, { id }) => [{ type: 'TaskComments', id: Number(id) }, { type: 'TaskWatchers', id: Number(id) }, 'TaskActivity']
    }),

    deleteTaskComment: builder.mutation({
      query: ({ id, commentId }) => ({ url: taskUrl(id, `/comments/${commentId}`), method: 'DELETE' }),
      invalidatesTags: (r, e, { id }) => [{ type: 'TaskComments', id: Number(id) }, 'TaskActivity']
    }),

    getTaskDependencies: builder.query({
      query: id => taskUrl(id, '/dependencies'),
      providesTags: ['TaskDependencies']
    }),

    // A link changes both tasks, so every dependency list is refreshed.
    addTaskDependency: builder.mutation({
      query: ({ id, dependsOnId }) => ({ url: taskUrl(id, '/dependencies'), method: 'POST', body: { depends_on_id: Number(dependsOnId) } }),
      invalidatesTags: ['TaskDependencies', 'TaskActivity', 'Dashboard', 'Timeline', 'PlanningDependencies']
    }),

    removeTaskDependency: builder.mutation({
      query: ({ id, dependencyId }) => ({ url: taskUrl(id, `/dependencies/${dependencyId}`), method: 'DELETE' }),
      invalidatesTags: ['TaskDependencies', 'TaskActivity', 'Dashboard', 'Timeline', 'PlanningDependencies']
    }),

    getTaskWatchers: builder.query({
      query: id => taskUrl(id, '/watchers'),
      providesTags: (r, e, id) => [{ type: 'TaskWatchers', id: Number(id) }]
    }),

    setTaskWatching: builder.mutation({
      query: ({ id, watching }) => ({ url: taskUrl(id, '/watch'), method: 'POST', body: { watching } }),
      invalidatesTags: (r, e, { id }) => [{ type: 'TaskWatchers', id: Number(id) }]
    }),

    getTaskActivity: builder.query({
      query: id => taskUrl(id, '/activity'),
      providesTags: ['TaskActivity']
    })
  })
})

export const {
  useGetTaskMetaQuery,
  useGetTaskListQuery,
  useGetTaskDetailQuery,
  useLazyGetTaskDetailQuery,
  useCreateTaskMutation,
  useUpdateTaskMutation,
  useChangeTaskStatusMutation,
  useDeleteTaskMutation,
  useGetTaskBoardQuery,
  useMoveTaskMutation,
  useGetTaskCommentsQuery,
  useAddTaskCommentMutation,
  useDeleteTaskCommentMutation,
  useGetTaskDependenciesQuery,
  useAddTaskDependencyMutation,
  useRemoveTaskDependencyMutation,
  useGetTaskWatchersQuery,
  useSetTaskWatchingMutation,
  useGetTaskActivityQuery
} = tasksApi
