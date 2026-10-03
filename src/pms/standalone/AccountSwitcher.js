import React, { useEffect, useState } from 'react'
import { Dialog, DialogActions, DialogContent, DialogTitle, Popover, Tooltip } from '@mui/material'
import { Icon } from '@iconify/react'
import toast from 'react-hot-toast'
import { GhostButton, PrimaryButton } from 'src/pms/components/ui'
import { getInitials } from 'src/helpers/textFormatters'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useMe } from 'src/pms/access/useAccess'
import { backToOriginal, getToken, loginPath, originalLogin, signOut, switchTo } from 'src/pms/auth/session'
import { useChangePasswordMutation, useGetUsersQuery, useLoginAsMutation } from 'src/store/apps/pms/accessApi'

// STANDALONE ONLY (Lingsaa_Accounts has its own account menu). The signed-in person's menu: who they are, change
// password, sign out; and for testing, an Admin can sign in as another role and come back, or paste a login token
// (for example a MASTER token once the real login is connected).

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

const passwordProblem = value => {
  if ((value || '').length < 8) return 'At least 8 characters'
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Use at least one letter and one number'

  return null
}

const ChangePasswordDialog = ({ open, onClose }) => {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [changePassword, { isLoading }] = useChangePasswordMutation()

  useEffect(() => {
    if (open) {
      setForm({ current: '', next: '', confirm: '' })
      setErrors({})
    }
  }, [open])

  const submit = async () => {
    const e = {}
    if (!form.current) e.current = 'Please Enter your Current Password'
    const problem = passwordProblem(form.next)
    if (problem) e.next = problem
    else if (form.next === form.current) e.next = 'Choose a password different from the current one'
    if (form.confirm !== form.next) e.confirm = 'The two passwords do not match'
    setErrors(e)
    if (Object.keys(e).length) return
    try {
      const resp = await changePassword({ current_password: form.current, new_password: form.next }).unwrap()
      toast.success(resp.detail)
      onClose()
    } catch {
      // The shared error toast explains why (for example a wrong current password).
    }
  }

  const field = (id, label, autoComplete) => (
    <div className='mb-3'>
      <label htmlFor={`pw_${id}`} className={ThemeStyles.formLabels}>
        {label} <span className='text-red-500'>*</span>
      </label>
      <input
        id={`pw_${id}`}
        type='password'
        autoComplete={autoComplete}
        value={form[id]}
        onChange={ev => {
          setForm(prev => ({ ...prev, [id]: ev.target.value }))
          setErrors(prev => ({ ...prev, [id]: null }))
        }}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${errors[id] ? 'border-red-500' : 'border-gray-300'}`}
      />
      {errors[id] && <span className='block text-xs font-semibold text-red-500'>{errors[id]}</span>}
    </div>
  )

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='xs'>
      <DialogTitle className='!text-[17px] !font-semibold'>Change password</DialogTitle>
      <DialogContent>
        {field('current', 'Current Password', 'current-password')}
        {field('next', 'New Password', 'new-password')}
        {field('confirm', 'Confirm New Password', 'new-password')}
        <p className='text-xs text-gray-500'>At least 8 characters, with a letter and a number.</p>
      </DialogContent>
      <DialogActions className='!px-6 !pb-4'>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton onClick={submit} disabled={isLoading}>
          Change Password
        </PrimaryButton>
      </DialogActions>
    </Dialog>
  )
}

const AccountSwitcher = () => {
  const [anchor, setAnchor] = useState(null)
  const [username, setUsername] = useState('')
  const [original, setOriginal] = useState(null)
  const [hasToken, setHasToken] = useState(false)
  const [tokenDialog, setTokenDialog] = useState(false)
  const [passwordDialog, setPasswordDialog] = useState(false)
  const [token, setToken] = useState('')
  const [error, setError] = useState(null)
  const { me } = useMe()
  // Testing each role: an Admin can sign in as any user that has a role (development servers only).
  const isAdmin = me?.role === 'admin'
  const { data: usersResp } = useGetUsersQuery(undefined, { skip: !isAdmin || !anchor })
  const [loginAs] = useLoginAsMutation()

  // Read after mount: the server cannot see localStorage.
  useEffect(() => {
    try {
      setUsername(window.localStorage.getItem('username') || '')
    } catch {
      setUsername('')
    }
    setOriginal(originalLogin())
    setHasToken(Boolean(getToken()))
  }, [])

  const reload = () => window.location.reload()
  const name = me?.user_name || username || 'Signed in'

  const signInAs = async user => {
    try {
      const { detail } = await loginAs(user.user_id).unwrap()
      switchTo(detail)
      reload()
    } catch {
      // The shared error toast explains why (for example: switched off on this server).
    }
  }

  const useToken = () => {
    const claims = decodeToken(token)
    if (!claims) return setError('This is not a login token. Copy the whole token.')
    if (claims.exp && claims.exp * 1000 < Date.now()) return setError('This token has expired. Ask for a new one.')
    if (!claims.client_id || !claims.user_id) return setError('This token has no company or user in it.')
    switchTo({ token: token.trim(), user_id: claims.user_id, username: claims.username || claims.user_name || `user${claims.user_id}`, client_id: claims.client_id })
    reload()
  }

  const item = 'flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-gray-100'

  return (
    <>
      <Tooltip title={name} arrow>
        <button
          type='button'
          onClick={e => setAnchor(e.currentTarget)}
          aria-label='Account'
          data-account
          className='ms-1 flex h-9 w-9 shrink-0 cursor-pointer select-none items-center justify-center rounded-full text-sm font-bold text-white'
          style={{ background: 'linear-gradient(135deg, var(--theme-grad-start), var(--theme-grad-end))' }}
        >
          {getInitials(name)}
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
          <div className='text-[14px] font-semibold text-slate-800'>{name}</div>
          <div className='text-xs text-gray-500'>
            {me?.role_title && (
              <span className='font-semibold text-slate-600' data-my-role>
                {me.role_title}
              </span>
            )}
            {me?.customer_name ? ` · ${me.customer_name}` : ''}
          </div>
        </div>

        <div className='pt-1'>
          {hasToken && (
            <button
              type='button'
              className={item}
              onClick={() => {
                setAnchor(null)
                setPasswordDialog(true)
              }}
              data-change-password
            >
              <Icon icon='tabler:lock' width={17} /> Change password
            </button>
          )}
          {original && (
            <button
              type='button'
              className={item}
              onClick={() => backToOriginal() && reload()}
              data-switch='mine'
            >
              <Icon icon='tabler:arrow-back-up' width={17} /> Back to my login ({original.username})
            </button>
          )}
          {isAdmin && usersResp?.detail?.users?.length > 1 && (
            <>
              <div className='px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-gray-400'>Sign in as (test a role)</div>
              <div className='max-h-[240px] overflow-y-auto'>
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
          {process.env.NODE_ENV !== 'production' && (
            <button
              type='button'
              className={item}
              onClick={() => {
                setAnchor(null)
                setToken('')
                setError(null)
                setTokenDialog(true)
              }}
              data-switch='token'
            >
              <Icon icon='tabler:key' width={17} /> Sign in with a token…
            </button>
          )}
          <div className='mt-1 border-t border-gray-100 pt-1'>
            <button
              type='button'
              className={`${item} !text-red-600`}
              onClick={() => {
                signOut()
                window.location.assign(loginPath())
              }}
              data-sign-out
            >
              <Icon icon='tabler:logout' width={17} /> Sign out
            </button>
          </div>
        </div>
      </Popover>

      <ChangePasswordDialog open={passwordDialog} onClose={() => setPasswordDialog(false)} />

      <Dialog open={tokenDialog} onClose={() => setTokenDialog(false)} fullWidth maxWidth='sm'>
        <DialogTitle className='!text-[17px] !font-semibold'>Sign in with a token</DialogTitle>
        <DialogContent>
          <p className='mb-2 text-sm text-gray-600'>
            Paste a login token (for example from the MASTER login). Your own login is kept so you can come back to it.
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
          <GhostButton onClick={() => setTokenDialog(false)}>Cancel</GhostButton>
          <PrimaryButton onClick={useToken} disabled={!token.trim()}>
            Sign in
          </PrimaryButton>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default AccountSwitcher
