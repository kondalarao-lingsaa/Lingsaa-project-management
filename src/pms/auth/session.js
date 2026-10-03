// STANDALONE ONLY - the PMS's own sign-in session (Lingsaa_Accounts has its own login and is not given this file).
// The login token and the person's ids live in localStorage under the same keys the root app uses, so the
// PMS API calls read them the same way in both apps.

export const AUTH_KEYS = ['access_token', 'username', 'user_id', 'client_id']
const ORIGINAL_KEY = 'pms_original_login' // the Admin's own login while they test another role ("Sign in as")
const DEV_LOGIN_KEY = 'pms_dev_login' // automated tests only: use the built-in development token

const read = key => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key, value) => {
  try {
    if (value === null || value === undefined) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // storage blocked: the person stays signed out
  }
}

export const getToken = () => (typeof window === 'undefined' ? null : read('access_token'))

// The built-in development token is used only by the automated browser tests (they set the flag) and never in a
// production build. Everyone else signs in on the login page.
export const devLoginAllowed = () =>
  typeof window !== 'undefined' && process.env.NODE_ENV !== 'production' && Boolean(process.env.NEXT_PUBLIC_PMS_DEV_TOKEN) && read(DEV_LOGIN_KEY) === '1'

export const isSignedIn = () => Boolean(getToken()) || devLoginAllowed()

export const saveLogin = detail => {
  write('access_token', detail.token)
  write('user_id', String(detail.user_id))
  write('username', detail.username)
  write('client_id', String(detail.client_id))
}

export const signOut = () => {
  AUTH_KEYS.forEach(k => write(k, null))
  write(ORIGINAL_KEY, null)
}

// "Sign in as" (an Admin testing another role): keep the Admin's own login to come back to.
export const switchTo = detail => {
  if (!read(ORIGINAL_KEY) && getToken()) {
    write(ORIGINAL_KEY, JSON.stringify(Object.fromEntries(AUTH_KEYS.map(k => [k, read(k)]))))
  }
  saveLogin(detail)
}

export const originalLogin = () => {
  try {
    return JSON.parse(read(ORIGINAL_KEY) || 'null')
  } catch {
    return null
  }
}

export const backToOriginal = () => {
  const login = originalLogin()
  if (!login) return false
  AUTH_KEYS.forEach(k => write(k, login[k]))
  write(ORIGINAL_KEY, null)

  return true
}

export const loginPath = next => `/login${next ? `?next=${encodeURIComponent(next)}` : ''}`
