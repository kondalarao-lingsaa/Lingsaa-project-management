import { buildQuery } from 'src/store/rtkQuery/baseQuery'
import { pmsApi, pmsAuthQuery, PMS_BASE_URL } from './pmsApiBase'

const url = (path, params = {}) => {
  const qs = buildQuery(params)

  return `${PMS_BASE_URL}${path}?${pmsAuthQuery()}${qs ? `&${qs}` : ''}`
}

// An expense changes the project's actual cost everywhere: Budget tab, overview, dashboard, reports.
const afterExpense = ['Expenses', 'Billable', 'ProjectBudget', 'BudgetOverview', 'Dashboard', 'Notifications', 'ApprovalInbox']

export const expensesApi = pmsApi.injectEndpoints({
  overrideExisting: true,
  endpoints: builder => ({
    getExpenseMeta: builder.query({
      query: () => url('/expenses/meta')
    }),
    getExpenses: builder.query({
      query: (p = {}) =>
        url('/expenses', {
          offset: (p.itemsPerPage || 5) * ((p.currentPage || 1) - 1),
          page_size: p.itemsPerPage || 5,
          project_id: p.projectId,
          status: p.status,
          category: p.category,
          search: p.search,
          mine: p.mine ? 'true' : undefined
        }),
      providesTags: ['Expenses']
    }),
    saveExpense: builder.mutation({
      query: ({ id, body }) => ({ url: url(id ? `/expenses/${id}` : '/expenses'), method: id ? 'PUT' : 'POST', body }),
      invalidatesTags: afterExpense
    }),
    deleteExpense: builder.mutation({
      query: id => ({ url: url(`/expenses/${id}`), method: 'DELETE' }),
      invalidatesTags: afterExpense
    }),
    submitExpense: builder.mutation({
      query: id => ({ url: url(`/expenses/${id}/submit`), method: 'POST' }),
      invalidatesTags: afterExpense
    }),
    approveExpenses: builder.mutation({
      query: ids => ({ url: url('/expenses/approve'), method: 'POST', body: { ids } }),
      invalidatesTags: afterExpense
    }),
    rejectExpenses: builder.mutation({
      query: ({ ids, reason }) => ({ url: url('/expenses/reject'), method: 'POST', body: { ids, reason } }),
      invalidatesTags: afterExpense
    }),
    // The receipt file goes as FormData; the browser sets the multipart boundary itself.
    attachReceipt: builder.mutation({
      query: ({ id, file }) => {
        const body = new FormData()
        body.append('file', file)

        return { url: url(`/expenses/${id}/receipt`), method: 'POST', body }
      },
      invalidatesTags: [...afterExpense, 'Documents']
    }),
    removeReceipt: builder.mutation({
      query: id => ({ url: url(`/expenses/${id}/receipt`), method: 'DELETE' }),
      invalidatesTags: [...afterExpense, 'Documents']
    }),
    // Approved hours change these too, so they also listen to the timesheet tags.
    getActualCost: builder.query({
      query: (p = {}) => url('/budget/actual-cost', { project_id: p.projectId, months: p.months }),
      providesTags: ['Expenses', 'ProjectBudget', 'BudgetOverview']
    }),
    getVariance: builder.query({
      query: (p = {}) => url('/budget/variance', { project_id: p.projectId }),
      providesTags: ['Expenses', 'ProjectBudget', 'BudgetOverview', 'TaskList']
    })
  })
})

export const {
  useGetExpenseMetaQuery,
  useGetExpensesQuery,
  useSaveExpenseMutation,
  useDeleteExpenseMutation,
  useSubmitExpenseMutation,
  useApproveExpensesMutation,
  useRejectExpensesMutation,
  useGetActualCostQuery,
  useGetVarianceQuery,
  useAttachReceiptMutation,
  useRemoveReceiptMutation
} = expensesApi
