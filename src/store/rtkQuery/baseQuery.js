// STANDALONE SHIM - Lingsaa_Accounts has its own, much fuller file at this same path
// (session lock, API limit, 401 auto-logout...). It is NOT copied at merge time. This one exports
// only what the PMS code imports, under the same names, so the PMS endpoint files (src/store/apps/pms/*)
// can be copied to the root project unchanged.
import { fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import toast from 'react-hot-toast'

// The dev token minted for the standalone app carries this company id.
const DEV_CLIENT_ID = 900001

export const getAuthParams = () => {
  if (typeof window === 'undefined') return { username: 'dev.user', clientId: DEV_CLIENT_ID, userId: 1, permissionId: 0 }

  return {
    username: localStorage.getItem('username') || 'dev.user',
    clientId: localStorage.getItem('client_id') || DEV_CLIENT_ID,
    userId: localStorage.getItem('user_id') || 1,
    permissionId: 0
  }
}

export const buildQuery = params =>
  Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${key === 'search' ? encodeURIComponent(value) : value}`)
    .join('&')

const handleQueryError = error => {
  if (error.status === 'FETCH_ERROR') return toast.error('Cannot reach the PMS server. Is the backend running?')
  if (typeof error.status !== 'number') return toast.error('An unexpected error occurred.')

  const detail = error.data?.detail

  if (error.status === 404) return
  if (error.status === 401) return toast.error('Session expired. Add a fresh NEXT_PUBLIC_PMS_DEV_TOKEN.')

  toast.error(typeof detail === 'string' ? detail : error.data?.message || `Unexpected error (${error.status}).`)
}

const withErrorHandling = rawBaseQuery => async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions)
  if (result.error) {
    handleQueryError(result.error)
    // "Not found" on a list means "no records" in this codebase, not a failure.
    if (result.error.status === 404) return { data: null }
  }

  return result
}

export const authedBaseQueryWithErrorHandling = withErrorHandling(
  fetchBaseQuery({
    baseUrl: '',
    prepareHeaders: headers => {
      const token =
        (typeof window !== 'undefined' && localStorage.getItem('access_token')) ||
        // The dev token is for local testing only and never goes into a production build.
        (process.env.NODE_ENV !== 'production' ? process.env.NEXT_PUBLIC_PMS_DEV_TOKEN : undefined)
      if (token) headers.set('Authorization', `Bearer ${token}`)

      return headers
    }
  })
)
