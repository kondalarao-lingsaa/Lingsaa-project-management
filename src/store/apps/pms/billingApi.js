import { buildQuery } from 'src/store/rtkQuery/baseQuery'
import { pmsApi, pmsAuthQuery, PMS_BASE_URL } from './pmsApiBase'

const url = (path, params = {}) => {
  const qs = buildQuery(params)

  return `${PMS_BASE_URL}${path}?${pmsAuthQuery()}${qs ? `&${qs}` : ''}`
}

// A milestone change moves its tasks' labels, what can be billed and the portfolio list.
const afterMilestone = [
  'ApprovalInbox',
  'Portal',
  'Milestones',
  'Billable',
  'TaskList',
  'TaskDetail',
  'TaskBoard',
  'Dashboard',
  'Timeline',
  'Roadmap',
  // Project Details setup checklist counts the milestones.
  'ProjectDetail'
]
// An invoice change moves what can be billed, the milestone's invoice badge and the budget's income side.
const afterInvoice = [
  'Expenses',
  'Invoices',
  'Billable',
  'Milestones',
  'ProjectBudget',
  'BudgetOverview',
  'TimeEntries',
  'Dashboard'
]

export const billingApi = pmsApi.injectEndpoints({
  overrideExisting: true,
  endpoints: builder => ({
    /* ------------------------------ milestones ------------------------------ */
    getMilestoneMeta: builder.query({ query: () => url('/milestones/meta') }),

    getProjectMilestones: builder.query({
      query: projectId => url(`/projects/${projectId}/milestones`),
      providesTags: ['Milestones']
    }),

    getAllMilestones: builder.query({
      query: (p = {}) => url('/milestones/list', { project_id: p.projectId, status: p.status, search: p.search }),
      providesTags: ['Milestones']
    }),

    saveMilestone: builder.mutation({
      query: ({ projectId, milestoneId, body }) => ({
        url: url(`/projects/${projectId}/milestones${milestoneId ? `/${milestoneId}` : ''}`),
        method: milestoneId ? 'PUT' : 'POST',
        body
      }),
      invalidatesTags: afterMilestone
    }),

    deleteMilestone: builder.mutation({
      query: ({ projectId, milestoneId }) => ({
        url: url(`/projects/${projectId}/milestones/${milestoneId}`),
        method: 'DELETE'
      }),
      invalidatesTags: afterMilestone
    }),

    changeMilestoneStatus: builder.mutation({
      query: ({ projectId, milestoneId, status, feedback }) => ({
        url: url(`/projects/${projectId}/milestones/${milestoneId}/status`),
        method: 'POST',
        body: { status, feedback: feedback || null }
      }),
      invalidatesTags: afterMilestone
    }),

    addDeliverable: builder.mutation({
      query: ({ projectId, milestoneId, name }) => ({
        url: url(`/projects/${projectId}/milestones/${milestoneId}/deliverables`),
        method: 'POST',
        body: { name }
      }),
      invalidatesTags: ['Milestones', 'Dashboard']
    }),

    setDeliverableDone: builder.mutation({
      query: ({ projectId, milestoneId, deliverableId, isDone }) => ({
        url: url(`/projects/${projectId}/milestones/${milestoneId}/deliverables/${deliverableId}/done`),
        method: 'POST',
        body: { is_done: isDone }
      }),
      invalidatesTags: ['Milestones', 'Dashboard']
    }),

    renameDeliverable: builder.mutation({
      query: ({ projectId, milestoneId, deliverableId, name }) => ({
        url: url(`/projects/${projectId}/milestones/${milestoneId}/deliverables/${deliverableId}`),
        method: 'PUT',
        body: { name }
      }),
      invalidatesTags: ['Milestones', 'Dashboard']
    }),

    deleteDeliverable: builder.mutation({
      query: ({ projectId, milestoneId, deliverableId }) => ({
        url: url(`/projects/${projectId}/milestones/${milestoneId}/deliverables/${deliverableId}`),
        method: 'DELETE'
      }),
      invalidatesTags: ['Milestones', 'Dashboard']
    }),

    /* -------------------------------- billing -------------------------------- */
    getBillingMeta: builder.query({ query: () => url('/billing/meta') }),

    getBillable: builder.query({
      query: projectId => url('/billing/billable', { project_id: projectId }),
      providesTags: ['Billable']
    }),

    getInvoices: builder.query({
      query: (p = {}) =>
        url('/billing/invoices', {
          offset: p.itemsPerPage * ((p.currentPage || 1) - 1),
          page_size: p.itemsPerPage,
          project_id: p.projectId,
          status: p.status,
          invoice_type: p.invoiceType,
          search: p.search
        }),
      providesTags: ['Invoices']
    }),

    getInvoice: builder.query({
      query: id => url(`/billing/invoices/${id}`),
      providesTags: ['Invoices']
    }),

    createInvoice: builder.mutation({
      query: body => ({ url: url('/billing/invoices'), method: 'POST', body }),
      invalidatesTags: afterInvoice
    }),

    changeInvoiceStatus: builder.mutation({
      query: ({ id, action, paidDate }) => ({
        url: url(`/billing/invoices/${id}/status`),
        method: 'POST',
        body: { action, paid_date: paidDate || null }
      }),
      invalidatesTags: afterInvoice
    })
  })
})

export const {
  useGetMilestoneMetaQuery,
  useGetProjectMilestonesQuery,
  useGetAllMilestonesQuery,
  useSaveMilestoneMutation,
  useDeleteMilestoneMutation,
  useChangeMilestoneStatusMutation,
  useAddDeliverableMutation,
  useSetDeliverableDoneMutation,
  useDeleteDeliverableMutation,
  useRenameDeliverableMutation,
  useGetBillingMetaQuery,
  useGetBillableQuery,
  useGetInvoicesQuery,
  useGetInvoiceQuery,
  useCreateInvoiceMutation,
  useChangeInvoiceStatusMutation
} = billingApi
