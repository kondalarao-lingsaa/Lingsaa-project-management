import { buildQuery } from 'src/store/rtkQuery/baseQuery'
import { pmsApi, pmsAuthQuery, PMS_BASE_URL } from './pmsApiBase'

const url = (path, params = {}) => {
  const qs = buildQuery(params)

  return `${PMS_BASE_URL}${path}?${pmsAuthQuery()}${qs ? `&${qs}` : ''}`
}

const params = p => ({ project_id: p.projectId, date_from: p.dateFrom, date_to: p.dateTo, person: p.person, status: p.status })

export const reportsApi = pmsApi.injectEndpoints({
  overrideExisting: true,
  endpoints: builder => ({
    getReportCatalog: builder.query({ query: () => url('/reports/catalog') }),

    // Reports read everything, so they are simply re-run when opened again (no cache tags to keep in sync).
    runReport: builder.query({
      query: ({ report, ...p }) => url(`/reports/${report}`, params(p)),
      keepUnusedDataFor: 0
    }),

    // The same report as a CSV file (opens in Excel), downloaded with the normal login header.
    downloadReport: builder.mutation({
      query: ({ report, ...p }) => ({
        url: url(`/reports/${report}`, { ...params(p), format: 'csv' }),
        responseHandler: response => (response.ok ? response.blob() : response.json()),
        cache: 'no-store'
      })
    })
  })
})

export const { useGetReportCatalogQuery, useRunReportQuery, useDownloadReportMutation } = reportsApi
