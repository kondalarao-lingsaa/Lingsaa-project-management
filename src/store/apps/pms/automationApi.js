import { buildQuery } from 'src/store/rtkQuery/baseQuery'
import { pmsApi, pmsAuthQuery, PMS_BASE_URL } from './pmsApiBase'

const url = (path, params = {}) => {
  const qs = buildQuery(params)

  return `${PMS_BASE_URL}${path}?${pmsAuthQuery()}${qs ? `&${qs}` : ''}`
}

// "Run now" can create tasks, invoices, sprint changes and notifications, so everything those show refreshes.
const afterRun = [
  'Automation',
  'Notifications',
  'TaskList',
  'TaskBoard',
  'TaskDetail',
  'Invoices',
  'Billable',
  'Milestones',
  'Sprints',
  'Backlog',
  'RecurringTasks',
  'Dashboard',
  'ApprovalInbox'
]

export const automationApi = pmsApi.injectEndpoints({
  overrideExisting: true,
  endpoints: builder => ({
    // Settings > Automation
    getAutomation: builder.query({
      query: () => url('/automation'),
      providesTags: ['Automation']
    }),
    getAutomationRuns: builder.query({
      query: (p = {}) => url('/automation/runs', { job_key: p.jobKey, limit: p.limit || 50 }),
      providesTags: ['Automation']
    }),
    saveAutomation: builder.mutation({
      query: ({ key, body }) => ({ url: url(`/automation/${key}`), method: 'PUT', body }),
      invalidatesTags: ['Automation']
    }),
    runAutomation: builder.mutation({
      query: key => ({ url: url(`/automation/${key}/run`), method: 'POST' }),
      invalidatesTags: afterRun
    }),

    // Tasks > Recurring Tasks
    getRecurringTasks: builder.query({
      query: (p = {}) => url('/recurring-tasks', { project_id: p.projectId, search: p.search }),
      providesTags: ['RecurringTasks']
    }),
    saveRecurringTask: builder.mutation({
      query: ({ id, body }) => ({ url: url(id ? `/recurring-tasks/${id}` : '/recurring-tasks'), method: id ? 'PUT' : 'POST', body }),
      invalidatesTags: ['RecurringTasks']
    }),
    deleteRecurringTask: builder.mutation({
      query: id => ({ url: url(`/recurring-tasks/${id}`), method: 'DELETE' }),
      invalidatesTags: ['RecurringTasks']
    }),

    // Task form: who on the team has the most free time for the task's dates.
    getAssigneeSuggestions: builder.query({
      query: ({ projectId, startDate, dueDate, hours }) =>
        url(`/projects/${projectId}/assignee-suggestions`, { start_date: startDate, due_date: dueDate, hours }),
      providesTags: ['AssigneeSuggestions']
    })
  })
})

export const {
  useGetAutomationQuery,
  useGetAutomationRunsQuery,
  useSaveAutomationMutation,
  useRunAutomationMutation,
  useGetRecurringTasksQuery,
  useSaveRecurringTaskMutation,
  useDeleteRecurringTaskMutation,
  useGetAssigneeSuggestionsQuery
} = automationApi
