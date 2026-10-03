import { buildQuery } from 'src/store/rtkQuery/baseQuery'
import { pmsApi, pmsAuthQuery, PMS_BASE_URL } from './pmsApiBase'

// The dashboard reads from every section, so it is refreshed whenever any of them changes
// (see the tags it provides) and also re-fetched when the user comes back to the page.
export const dashboardApi = pmsApi.injectEndpoints({
  overrideExisting: true,
  endpoints: builder => ({
    getDashboardOverview: builder.query({
      query: (p = {}) => {
        const qs = buildQuery({ project_id: p.projectId })

        return `${PMS_BASE_URL}/dashboard/overview?${pmsAuthQuery()}${qs ? `&${qs}` : ''}`
      },
      providesTags: ['Dashboard']
    })
  })
})

export const { useGetDashboardOverviewQuery } = dashboardApi
