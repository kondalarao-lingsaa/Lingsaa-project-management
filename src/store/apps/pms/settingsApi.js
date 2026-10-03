import { buildQuery } from 'src/store/rtkQuery/baseQuery'
import { pmsApi, pmsAuthQuery, PMS_BASE_URL } from './pmsApiBase'

const url = (path, params = {}) => {
  const qs = buildQuery(params)

  return `${PMS_BASE_URL}${path}?${pmsAuthQuery()}${qs ? `&${qs}` : ''}`
}

// The working calendar changes every hours figure: capacity, utilization, sprint capacity, reports.
const afterCalendar = [
  'Settings',
  'Sprints',
  'TaskList',
  'ProjectMembers',
  'ResourceAllocation',
  'TimeEntries',
  'Dashboard'
]

export const settingsApi = pmsApi.injectEndpoints({
  overrideExisting: true,
  endpoints: builder => ({
    getSettings: builder.query({
      query: year => url('/settings', { year }),
      providesTags: ['Settings']
    }),
    saveCalendar: builder.mutation({
      query: body => ({ url: url('/settings/calendar'), method: 'PUT', body }),
      invalidatesTags: afterCalendar
    }),
    // Industry + team roles: the team role list (team meta) and member forms read it.
    saveIndustry: builder.mutation({
      query: body => ({ url: url('/settings/industry'), method: 'PUT', body }),
      invalidatesTags: ['Settings', 'TeamMeta']
    }),
    loadStarterTemplate: builder.mutation({
      query: industry => ({ url: url('/templates/starter', { industry }), method: 'POST' }),
      invalidatesTags: ['Templates']
    }),
    addHoliday: builder.mutation({
      query: body => ({ url: url('/settings/holidays'), method: 'POST', body }),
      invalidatesTags: afterCalendar
    }),
    deleteHoliday: builder.mutation({
      query: id => ({ url: url(`/settings/holidays/${id}`), method: 'DELETE' }),
      invalidatesTags: afterCalendar
    }),

    getTemplates: builder.query({
      query: (p = {}) => url('/templates', { search: p.search }),
      providesTags: ['Templates']
    }),
    getTemplate: builder.query({
      query: id => url(`/templates/${id}`),
      providesTags: ['Templates']
    }),
    saveTemplate: builder.mutation({
      query: ({ id, body }) => ({
        url: url(id ? `/templates/${id}` : '/templates'),
        method: id ? 'PUT' : 'POST',
        body
      }),
      invalidatesTags: ['Templates']
    }),
    deleteTemplate: builder.mutation({
      query: id => ({ url: url(`/templates/${id}`), method: 'DELETE' }),
      invalidatesTags: ['Templates']
    }),
    saveProjectAsTemplate: builder.mutation({
      query: ({ projectId, body }) => ({ url: url(`/projects/${projectId}/save-as-template`), method: 'POST', body }),
      invalidatesTags: ['Templates']
    }),
    // Per-project rules (Projects > Project Settings); they change budget health, so budget views refresh too.
    getProjectSettings: builder.query({
      query: projectId => url(`/projects/${projectId}/settings`),
      providesTags: ['ProjectSettings']
    }),
    saveProjectSettings: builder.mutation({
      query: ({ projectId, body }) => ({ url: url(`/projects/${projectId}/settings`), method: 'PUT', body }),
      invalidatesTags: ['ProjectSettings', 'ProjectBudget', 'BudgetOverview', 'Dashboard', 'Expenses']
    }),
    createProjectFromTemplate: builder.mutation({
      query: ({ id, body }) => ({ url: url(`/templates/${id}/create-project`), method: 'POST', body }),
      invalidatesTags: ['Templates', 'ProjectList', 'Dashboard', 'Roadmap', 'Milestones', 'TaskList']
    })
  })
})

export const {
  useGetSettingsQuery,
  useSaveCalendarMutation,
  useSaveIndustryMutation,
  useLoadStarterTemplateMutation,
  useAddHolidayMutation,
  useDeleteHolidayMutation,
  useGetTemplatesQuery,
  useGetTemplateQuery,
  useLazyGetTemplateQuery,
  useSaveTemplateMutation,
  useDeleteTemplateMutation,
  useSaveProjectAsTemplateMutation,
  useCreateProjectFromTemplateMutation,
  useGetProjectSettingsQuery,
  useSaveProjectSettingsMutation
} = settingsApi
