import React, { useEffect, useState } from 'react'
import { Dialog, DialogActions, DialogContent, DialogTitle, Popover, Tooltip } from '@mui/material'
import { Icon } from '@iconify/react'
import { GhostButton, PrimaryButton } from 'src/pms/components/ui'
import { getInitials } from 'src/helpers/textFormatters'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useMe } from 'src/pms/access/useAccess'
import { useGetUsersQuery, useLoginAsMutation } from 'src/store/apps/pms/accessApi'

// STANDALONE ONLY (staging testing). Lingsaa_Accounts has its own login, so this is never merged.
// Lets a tester switch between the demo company (built-in dev login), a pasted login token (for example the
// staging Manager) and their own saved login - without the browser console.

const AUTH_KEYS = ['access_token', 'username', 'user_id', 'client_id']
const SAVED_KEY = 'pms_saved_login'
const DEMO_COMPANY = '900001' // company of the built-in dev login

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
    // storage blocked: nothing to switch
  }
}

// Reads the claims inside a JWT (no checking - the server does that).
const decodeToken = token => {
  const parts = (token || '').trim().split('.')
  if (parts.length !== 3) return null
  try {
    const json = atob(
      parts[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')
    )

    return JSON.parse(json)
  } catch {
    return null
  }
}

const currentLogin = () => ({
  token: read('access_token'),
  username: read('username'),
  userId: read('user_id'),
  clientId: read('client_id')
})

const AccountSwitcher = () => {
  const [anchor, setAnchor] = useState(null)
  const [who, setWho] = useState({ username: '', demo: true })
  const [saved, setSaved] = useState(null)
  const [dialog, setDialog] = useState(false)
  const [token, setToken] = useState('')
  const [error, setError] = useState(null)
  const { me } = useMe()
  // Test each role: an Admin of the demo company can sign in as any user that has a role (development only).
  const isAdmin = me?.role === 'admin'
  const { data: usersResp } = useGetUsersQuery(undefined, { skip: !isAdmin || !anchor })
  const [loginAs] = useLoginAsMutation()

  const signInAs = async user => {
    try {
      const { detail } = await loginAs(user.user_id).unwrap()
      rememberOwnLogin()
      write('access_token', detail.token)
      write('user_id', String(detail.user_id))
      write('username', detail.username)
      write('client_id', String(detail.client_id))
      reload()
    } catch {
      // The shared error toast explains why (for example: switched off on this server).
    }
  }

  // Read after mount: the server cannot see localStorage.
  useEffect(() => {
    const login = currentLogin()
    setWho({ username: login.username || 'dev.user', demo: !login.token })
    try {
      setSaved(JSON.parse(read(SAVED_KEY) || 'null'))
    } catch {
      setSaved(null)
    }
  }, [])

  // Keep the person's own login aside before switching away from it. Test logins of the demo company are not
  // saved, so switching Manager -> demo never replaces the real login.
  const rememberOwnLogin = () => {
    const login = currentLogin()
    const claims = decodeToken(login.token)
    if (login.token && claims && String(claims.client_id) !== DEMO_COMPANY) write(SAVED_KEY, JSON.stringify(login))
  }

  const reload = () => window.location.reload()

  const useDemo = () => {
    rememberOwnLogin()
    AUTH_KEYS.forEach(k => write(k, null))
    reload()
  }

  const useToken = () => {
    const claims = decodeToken(token)
    if (!claims) return setError('This is not a login token. Copy the whole token from the test checklist.')
    if (claims.exp && claims.exp * 1000 < Date.now()) return setError('This token has expired. Ask for a new one.')
    if (!claims.client_id || !claims.user_id) return setError('This token has no company or user in it.')
    rememberOwnLogin()
    write('access_token', token.trim())
    write('user_id', String(claims.user_id))
    write('username', claims.username || claims.user_name || `user${claims.user_id}`)
    write('client_id', String(claims.client_id))
    reload()
  }

  const backToMine = () => {
    if (!saved?.token) return
    write('access_token', saved.token)
    write('username', saved.username)
    write('user_id', saved.userId)
    write('client_id', saved.clientId)
    reload()
  }

  const item =
    'flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-gray-100'

  return (
    <>
      <Tooltip title={who.username || ''} arrow>
        <button
          type='button'
          onClick={e => setAnchor(e.currentTarget)}
          aria-label='Account'
          data-account
          className='ms-1 flex h-9 w-9 shrink-0 cursor-pointer select-none items-center justify-center rounded-full text-sm font-bold text-white'
          style={{ background: 'linear-gradient(135deg, var(--theme-grad-start), var(--theme-grad-end))' }}
        >
          {who.username ? getInitials(who.username) : ''}
        </button>
      </Tooltip>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { className: 'mt-2 w-[290px] !rounded-xl p-2' } }}
      >
        <div className='border-b border-gray-100 px-3 pb-2 pt-1'>
          <div className='text-[14px] font-semibold text-slate-800'>{who.username}</div>
          <div className='text-xs text-gray-500'>
            {me?.role_title && <span className='font-semibold text-slate-600' data-my-role>{me.role_title} · </span>}
            {who.demo ? 'Demo company (test data)' : 'Signed in with a login token'}
          </div>
        </div>
        <div className='pt-1'>
          <div className='px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-gray-400'>
            Switch account (testing)
          </div>
          {!who.demo && (
            <button type='button' className={item} onClick={useDemo} data-switch='demo'>
              <Icon icon='tabler:flask' width={17} /> Use demo company (Dev User)
            </button>
          )}
          <button
            type='button'
            className={item}
            onClick={() => {
              setAnchor(null)
              setToken('')
              setError(null)
              setDialog(true)
            }}
            data-switch='token'
          >
            <Icon icon='tabler:key' width={17} /> Sign in with a token…
          </button>
          {isAdmin && usersResp?.detail?.users?.length > 1 && (
            <>
              <div className='px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-gray-400'>Sign in as (test a role)</div>
              <div className='max-h-[260px] overflow-y-auto'>
                {usersResp.detail.users
                  .filter(u => u.is_active && u.user_id !== me.user_id)
                  .map(u => (
                    <button key={u.id} type='button' className={item} onClick={() => signInAs(u)} data-login-as={u.role}>
                      <Icon icon='tabler:user' width={17} />
                      <span className='flex-1 truncate'>{u.user_name}</span>
                      <span className='text-xs text-gray-500'>{u.role_title}</span>
                    </button>
                  ))}
              </div>
            </>
          )}
          {saved?.token && saved.token !== read('access_token') && (
            <button type='button' className={item} onClick={backToMine} data-switch='mine'>
              <Icon icon='tabler:arrow-back-up' width={17} /> Back to my login ({saved.username})
            </button>
          )}
        </div>
      </Popover>

      <Dialog open={dialog} onClose={() => setDialog(false)} fullWidth maxWidth='sm'>
        <DialogTitle className='!text-[17px] !font-semibold'>Sign in with a token</DialogTitle>
        <DialogContent>
          <p className='mb-2 text-sm text-gray-600'>
            Paste a login token, for example the staging Manager token from the test checklist. Your own login is kept
            so you can come back to it.
          </p>
          <textarea
            id='login_token'
            rows={4}
            value={token}
            onChange={e => {
              setToken(e.target.value)
              setError(null)
            }}
            placeholder='eyJhbGciOi...'
            className={`${ThemeStyles.formsInputs} font-mono !text-xs${error ? ' !border !border-red-500' : ''}`}
          />
          {error && <span className='!mt-1 block text-xs font-semibold text-red-500'>{error}</span>}
        </DialogContent>
        <DialogActions className='!px-6 !pb-4'>
          <GhostButton onClick={() => setDialog(false)}>Cancel</GhostButton>
          <PrimaryButton onClick={useToken} disabled={!token.trim()}>
            Sign in
          </PrimaryButton>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default AccountSwitcher
