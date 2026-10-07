import { buildQuery } from 'src/store/rtkQuery/baseQuery'
import { pmsApi, pmsAuthQuery, PMS_BASE_URL } from './pmsApiBase'

const url = (path, params = {}) => {
  const qs = buildQuery(params)

  return `${PMS_BASE_URL}${path}?${pmsAuthQuery()}${qs ? `&${qs}` : ''}`
}

// Receipts of expenses live here too, and shared files show in the client portal.
const afterChange = ['Documents', 'DocumentVersions', 'Dashboard', 'Expenses', 'Portal']

export const documentsApi = pmsApi.injectEndpoints({
  overrideExisting: true,
  endpoints: builder => ({
    getDocumentMeta: builder.query({ query: () => url('/documents/meta') }),

    getDocuments: builder.query({
      query: (p = {}) => url('/documents/list', { project_id: p.projectId, task_id: p.taskId, milestone_id: p.milestoneId, category: p.category, search: p.search }),
      providesTags: ['Documents']
    }),

    getDocumentVersions: builder.query({
      query: id => url(`/documents/${id}/versions`),
      providesTags: ['DocumentVersions']
    }),

    // body is a FormData (file + fields); the browser sets the multipart boundary itself.
    uploadDocument: builder.mutation({
      query: ({ projectId, formData }) => ({ url: url(`/projects/${projectId}/documents`), method: 'POST', body: formData }),
      invalidatesTags: afterChange
    }),

    updateDocument: builder.mutation({
      query: ({ id, body }) => ({ url: url(`/documents/${id}`), method: 'PUT', body }),
      invalidatesTags: afterChange
    }),

    deleteDocument: builder.mutation({
      query: id => ({ url: url(`/documents/${id}`), method: 'DELETE' }),
      invalidatesTags: afterChange
    }),

    // Downloads go through the same authenticated request as every other call (the token is a header, not
    // in the link), and come back as a Blob that the page saves under the original file name.
    downloadDocument: builder.mutation({
      query: id => ({ url: url(`/documents/${id}/download`), responseHandler: response => (response.ok ? response.blob() : response.json()), cache: 'no-store' })
    })
  })
})

export const {
  useGetDocumentMetaQuery,
  useGetDocumentsQuery,
  useGetDocumentVersionsQuery,
  useUploadDocumentMutation,
  useUpdateDocumentMutation,
  useDeleteDocumentMutation,
  useDownloadDocumentMutation
} = documentsApi
