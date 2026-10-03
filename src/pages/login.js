import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Icon } from '@iconify/react'
import { isSignedIn, saveLogin } from 'src/pms/auth/session'
import { PMS_BASE } from 'src/pms/config/pmsModules'

// STANDALONE ONLY - the PMS's own sign-in page (email + password from Settings > Users & Roles), used until the PMS
// moves into Lingsaa_Accounts / the MASTER login. Not copied at merge time.

const API = process.env.NEXT_PUBLIC_PMS_API_URL
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// The demo company's people (development builds only), so a tester can sign in as any role with one click.
const DEMO = [
  ['dev.user@lingsaa.com', 'Admin'],
  ['rohan.verma@lingsaa.com', 'Director'],
  ['priya.sharma@lingsaa.com', 'Project Manager'],
  ['arjun.mehta@lingsaa.com', 'Team Lead'],
  ['anita.rao@lingsaa.com', 'Member'],
  ['kiran.iyer@lingsaa.com', 'Finance'],
  ['meena.das@lingsaa.com', 'Resource Manager'],
  ['ravi.kumar@acmeretail.in', 'Client']
]
const DEMO_PASSWORD = 'Demo@123'

const LoginPage = () => {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  // Only a page inside the PMS is a valid place to return to after signing in.
  const next = typeof router.query.next === 'string' && router.query.next.startsWith(`${PMS_BASE}/`) ? router.query.next : null

  useEffect(() => {
    if (router.isReady && isSignedIn()) router.replace(next || `${PMS_BASE}/dashboard/`)
  }, [router.isReady]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async e => {
    e.preventDefault()
    const errs = {}
    if (!EMAIL.test(email.trim())) errs.email = 'Please Enter your Email'
    if (!password) errs.password = 'Please Enter your Password'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const resp = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setErrors({ form: typeof data.detail === 'string' ? data.detail : 'Could not sign in. Please try again' })
      } else {
        saveLogin(data.detail)
        // A full load, so every screen starts with the new person's role.
        window.location.assign(next && data.detail.home !== 'portal/' ? next : `${PMS_BASE}/${data.detail.home}`)

        return
      }
    } catch {
      setErrors({ form: 'Cannot reach the PMS server. Is the backend running?' })
    }
    setBusy(false)
  }

  const input = id =>
    `w-full rounded-lg border bg-white px-3 py-2.5 text-[15px] outline-none focus:border-[var(--theme-solid)] ${
      errors[id] ? 'border-red-500' : 'border-gray-300'
    }`

  return (
    <div className='flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10'>
      <div className='w-full max-w-[420px]'>
        <div className='mb-6 flex items-center justify-center gap-2'>
          <span
            className='flex h-10 w-10 items-center justify-center rounded-xl text-white'
            style={{ background: 'linear-gradient(to right, var(--theme-grad-start), var(--theme-grad-end))' }}
          >
            <Icon icon='tabler:briefcase' width={22} />
          </span>
          <span className='text-[22px] font-bold text-[var(--theme-solid)]'>LINGSAA PMS</span>
        </div>

        <form onSubmit={submit} noValidate className='rounded-2xl border border-gray-200 bg-white p-6 shadow-sm' data-login-form>
          <h1 className='text-xl font-semibold text-slate-900'>Sign in</h1>
          <p className='mb-5 text-sm text-gray-500'>Use the email and password your PMS Admin gave you.</p>

          {errors.form && (
            <div className='mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700' role='alert' data-login-error>
              <Icon icon='tabler:alert-circle' width={18} className='mt-0.5 shrink-0' /> {errors.form}
            </div>
          )}

          <div className='mb-4'>
            <label htmlFor='email' className='mb-1 block text-sm font-semibold text-slate-700'>
              Email
            </label>
            <input
              id='email'
              type='email'
              autoComplete='username'
              value={email}
              onChange={e => {
                setEmail(e.target.value.replace(/\s/g, ''))
                setErrors({})
              }}
              className={input('email')}
            />
            {errors.email && <span className='mt-1 block text-xs font-semibold text-red-500'>{errors.email}</span>}
          </div>

          <div className='mb-5'>
            <label htmlFor='password' className='mb-1 block text-sm font-semibold text-slate-700'>
              Password
            </label>
            <div className='relative'>
              <input
                id='password'
                type={show ? 'text' : 'password'}
                autoComplete='current-password'
                value={password}
                onChange={e => {
                  setPassword(e.target.value)
                  setErrors({})
                }}
                className={`${input('password')} pr-11`}
              />
              <button
                type='button'
                onClick={() => setShow(v => !v)}
                aria-label={show ? 'Hide password' : 'Show password'}
                className='absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-gray-500 hover:text-slate-800'
              >
                <Icon icon={show ? 'tabler:eye-off' : 'tabler:eye'} width={20} />
              </button>
            </div>
            {errors.password && <span className='mt-1 block text-xs font-semibold text-red-500'>{errors.password}</span>}
          </div>

          <button
            type='submit'
            disabled={busy}
            className='w-full cursor-pointer rounded-lg py-2.5 text-[15px] font-semibold text-white transition disabled:opacity-60'
            style={{ background: 'linear-gradient(to right, var(--theme-grad-start), var(--theme-grad-end))' }}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {process.env.NODE_ENV !== 'production' && (
          <div className='mt-4 rounded-2xl border border-dashed border-gray-300 bg-white p-4' data-demo-logins>
            <div className='mb-2 text-xs text-gray-500'>
              <span className='font-semibold uppercase tracking-wide'>Demo logins (testing only)</span> · click one, password{' '}
              <code className='rounded bg-gray-100 px-1 font-semibold text-slate-700'>{DEMO_PASSWORD}</code>
            </div>
            <div className='grid grid-cols-1 gap-1 sm:grid-cols-2'>
              {DEMO.map(([address, role]) => (
                <button
                  key={address}
                  type='button'
                  onClick={() => {
                    setEmail(address)
                    setPassword(DEMO_PASSWORD)
                    setErrors({})
                  }}
                  className='cursor-pointer rounded-md px-2 py-1 text-left text-[13px] hover:bg-gray-100'
                  data-demo-login={role}
                >
                  <span className='font-semibold text-slate-800'>{role}</span>
                  <span className='block truncate text-xs text-gray-500'>{address}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Shown without the PMS sidebar and header.
LoginPage.noShell = true

export default LoginPage
