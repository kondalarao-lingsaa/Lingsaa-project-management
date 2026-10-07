import { buildQuery } from 'src/store/rtkQuery/baseQuery'
import { pmsApi, pmsAuthQuery, PMS_BASE_URL } from './pmsApiBase'

const url = (path, params = {}) => {
  const qs = buildQuery(params)

  return `${PMS_BASE_URL}${path}?${pmsAuthQuery()}${qs ? `&${qs}` : ''}`
}

// Approving anything changes the item itself and the inbox.
const afterDecision = ['ApprovalInbox', 'ProjectList', 'ProjectDetail', 'Dashboard', 'Notifications']

export const accessApi = pmsApi.injectEndpoints({
  overrideExisting: true,
  endpoints: builder => ({
    // The signed-in person's PMS role and what it allows.
    getMe: builder.query({
      query: () => url('/me'),
      providesTags: ['Me'],
      keepUnusedDataFor: 600
    }),

    // Settings > Users & Roles
    getUsers: builder.query({
      query: () => url('/settings/users'),
      providesTags: ['Users']
    }),
    saveUser: builder.mutation({
      query: ({ id, body }) => ({ url: url(id ? `/settings/users/${id}` : '/settings/users'), method: id ? 'PUT' : 'POST', body }),
      invalidatesTags: ['Users', 'Me', 'ApprovalInbox']
    }),
    removeUser: builder.mutation({
      query: id => ({ url: url(`/settings/users/${id}`), method: 'DELETE' }),
      invalidatesTags: ['Users', 'Me']
    }),

    // Settings > Users & Access > Permission Matrix
    getPermissions: builder.query({
      query: () => url('/settings/permissions'),
      providesTags: ['Permissions']
    }),
    savePermissions: builder.mutation({
      query: body => ({ url: url('/settings/permissions'), method: 'PUT', body }),
      invalidatesTags: ['Permissions', 'Me', 'ApprovalInbox']
    }),

    // Settings > Approval Rules
    saveApprovalLimits: builder.mutation({
      query: body => ({ url: url('/settings/approvals'), method: 'PUT', body }),
      invalidatesTags: ['Settings', 'ProjectDetail', 'ApprovalInbox']
    }),

    // Everything waiting for my decision.
    getApprovalInbox: builder.query({
      query: () => url('/approvals'),
      providesTags: ['ApprovalInbox']
    }),

    changePassword: builder.mutation({
      query: body => ({ url: url('/auth/change-password'), method: 'POST', body })
    }),

    // Development only: an Admin signs in as another user of the company to test their role.
    loginAs: builder.mutation({
      query: userId => ({ url: url('/dev/login-as'), method: 'POST', body: { user_id: userId } })
    }),

    // Client portal
    getPortalProjects: builder.query({
      query: () => url('/portal/projects'),
      providesTags: ['Portal']
    }),
    getPortalProject: builder.query({
      query: id => url(`/portal/projects/${id}`),
      providesTags: ['Portal']
    }),
    decideMilestoneAsClient: builder.mutation({
      query: ({ projectId, milestoneId, decision, feedback }) => ({
        url: url(`/portal/projects/${projectId}/milestones/${milestoneId}/decision`),
        method: 'POST',
        body: { decision, feedback }
      }),
      invalidatesTags: ['Portal', 'Milestones', 'Invoices', 'Billable', ...afterDecision]
    }),
    sendPortalMessage: builder.mutation({
      query: ({ projectId, body }) => ({ url: url(`/portal/projects/${projectId}/messages`), method: 'POST', body: { body } }),
      invalidatesTags: ['Portal', 'ClientMessages']
    }),
    downloadPortalDocument: builder.mutation({
      query: id => ({ url: url(`/portal/documents/${id}/download`), responseHandler: response => (response.ok ? response.blob() : response.json()), cache: 'no-store' })
    }),
    getPortalInvoice: builder.query({
      query: id => url(`/portal/invoices/${id}`)
    }),

    // The team's side of the client conversation (Project Details > Client tab).
    getClientMessages: builder.query({
      query: projectId => url(`/projects/${projectId}/client-messages`),
      providesTags: ['ClientMessages']
    }),
    replyToClient: builder.mutation({
      query: ({ projectId, body }) => ({ url: url(`/projects/${projectId}/client-messages`), method: 'POST', body: { body } }),
      invalidatesTags: ['ClientMessages', 'Portal']
    })
  })
})

export const {
  useGetMeQuery,
  useGetUsersQuery,
  useSaveUserMutation,
  useRemoveUserMutation,
  useSaveApprovalLimitsMutation,
  useGetPermissionsQuery,
  useSavePermissionsMutation,
  useGetApprovalInboxQuery,
  useLoginAsMutation,
  useChangePasswordMutation,
  useGetPortalProjectsQuery,
  useGetPortalProjectQuery,
  useDecideMilestoneAsClientMutation,
  useSendPortalMessageMutation,
  useDownloadPortalDocumentMutation,
  useLazyGetPortalInvoiceQuery,
  useGetClientMessagesQuery,
  useReplyToClientMutation
} = accessApi
