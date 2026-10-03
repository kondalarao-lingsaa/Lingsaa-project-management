import { buildQuery } from 'src/store/rtkQuery/baseQuery'
import { pmsApi, pmsAuthQuery, PMS_BASE_URL } from './pmsApiBase'

const url = (path, params = {}) => {
  const qs = buildQuery(params)

  return `${PMS_BASE_URL}${path}?${pmsAuthQuery()}${qs ? `&${qs}` : ''}`
}
const page = p => ({ offset: (p.itemsPerPage || 10) * ((p.currentPage || 1) - 1), page_size: p.itemsPerPage || 10 })

// Every task change (comment, status, assignment, timesheet review) already invalidates 'TaskActivity',
// so the feeds and the bell refresh after the user's own actions; other people's arrive by polling.
export const communicationApi = pmsApi.injectEndpoints({
  overrideExisting: true,
  endpoints: builder => ({
    getNotifications: builder.query({
      query: (p = {}) =>
        url('/notifications', { ...page(p), unread_only: p.unreadOnly ? 'true' : undefined, kind: p.kind }),
      providesTags: ['Notifications', 'TaskActivity']
    }),
    markNotificationsRead: builder.mutation({
      query: ({ ids, read = true, kind }) => ({
        url: url('/notifications/read'),
        method: 'POST',
        body: { ids: ids || null, read, kind: kind || null }
      }),
      invalidatesTags: ['Notifications']
    }),
    getCommentsFeed: builder.query({
      query: (p = {}) =>
        url('/communication/comments', {
          ...page(p),
          project_id: p.projectId,
          search: p.search,
          involving_me: p.involvingMe ? 'true' : undefined
        }),
      providesTags: ['TaskActivity']
    }),
    getMentions: builder.query({
      query: (p = {}) => url('/communication/mentions', { ...page(p), unread_only: p.unreadOnly ? 'true' : undefined }),
      providesTags: ['Notifications', 'TaskActivity']
    }),
    getActivityFeed: builder.query({
      query: (p = {}) =>
        url('/communication/activity', {
          ...page(p),
          project_id: p.projectId,
          action: p.action,
          actor: p.actor,
          search: p.search
        }),
      providesTags: ['TaskActivity']
    }),
    // Ctrl+K: one query across projects, tasks, milestones, documents, risks, expenses, invoices and people.
    globalSearch: builder.query({
      query: q => url('/search', { q }),
      keepUnusedDataFor: 30
    }),
    getCommunicationMeta: builder.query({
      query: () => url('/communication/meta'),
      providesTags: ['TaskActivity']
    })
  })
})

export const {
  useGetNotificationsQuery,
  useMarkNotificationsReadMutation,
  useGetCommentsFeedQuery,
  useGetMentionsQuery,
  useGetActivityFeedQuery,
  useGetCommunicationMetaQuery,
  useGlobalSearchQuery
} = communicationApi
