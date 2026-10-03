// The PMS's own sign-in (email + password) and the account menu, with the built-in test login switched off:
// - a signed-out visitor is sent to the login page, and back to the page they asked for after signing in
// - a wrong password is refused with a clear message
// - a Member signs in and sees their role's sidebar; a Client lands in the client portal
// - an Admin uses "Sign in as" to test another role and comes back to their own login
// - change password works (and is changed back), sign out returns to the login page
// Needs the demo users (backend: scripts/seed_demo_roles.py). Run: node tests/e2e/login_account.js
const path = require('path')
const { launch } = require('./cdp')

const API = (process.env.PMS_API || 'http://127.0.0.1:8000') + '/api'
const ORIGIN = process.env.PMS_APP || 'http://127.0.0.1:3000'
const APP = `${ORIGIN}/appModules/projects`
const PASSWORD = 'Demo@123'

;(async () => {
  const results = []
  const check = (name, ok, extra = '') => {
    results.push(ok)
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  [${extra}]`))
  }
  const br = await launch(path.join(require('os').tmpdir(), 'chrome-login'), 1440, 1000, { devLogin: false })
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const clearLogin = () => br.evalJs(`['access_token','username','user_id','client_id','pms_original_login'].forEach(k => localStorage.removeItem(k)); true`)
  const signIn = async (email, password = PASSWORD) => {
    await br.waitFor(`!!document.querySelector('[data-login-form]')`, 'login form')
    await br.setInput('#email', email)
    await br.setInput('#password', password)
    await br.evalJs(`document.querySelector('[data-login-form] button[type=submit]').click(); true`)
  }
  const menu = async () => {
    await br.waitFor(`!!document.querySelector('[data-account]')`, 'avatar')
    await br.evalJs(`document.querySelector('[data-account]').click(); true`)
    await br.sleep(400)
  }

  try {
    await br.goto(`${ORIGIN}/login`)
    await br.sleep(500)
    await clearLogin()

    // ---------- signed out -> login page, then back to the asked page
    await br.goto(`${APP}/tasks/myTasks/`)
    await br.waitFor(`location.pathname.startsWith('/login')`, 'redirect to login')
    check('A signed-out visitor is sent to the login page', await br.evalJs(`location.search.includes('myTasks')`))

    await signIn('anita.rao@lingsaa.com', 'wrong-pass1')
    await br.waitFor(`!!document.querySelector('[data-login-error]')`, 'error')
    check('A wrong password is refused', await br.evalJs(`document.querySelector('[data-login-error]').innerText.includes('Email or password is wrong')`))

    await br.evalJs(`document.querySelector('[data-demo-login="Member"]').click(); true`)
    await br.evalJs(`document.querySelector('[data-login-form] button[type=submit]').click(); true`)
    await br.waitFor(`location.pathname.includes('/tasks/myTasks')`, 'back to my tasks')
    check('After signing in, the Member returns to the page they asked for', true)
    await br.waitFor(`(document.querySelector('aside nav')?.innerText || '').includes('Timesheets')`, 'member nav')
    const nav = await br.evalJs(`document.querySelector('aside nav').innerText`)
    check('The Member sees their sidebar without Settings or Billing', !nav.includes('Settings') && !nav.includes('Billing'), nav)
    await menu()
    check('The account menu shows the name and role', await br.evalJs(`document.querySelector('[data-my-role]')?.innerText === 'Member'`))

    // ---------- sign out
    await br.evalJs(`document.querySelector('[data-sign-out]').click(); true`)
    await br.waitFor(`location.pathname.startsWith('/login')`, 'signed out')
    await br.goto(`${APP}/dashboard/`)
    await br.waitFor(`location.pathname.startsWith('/login')`, 'still signed out')
    check('After signing out, PMS pages need a login again', true)

    // ---------- client
    await signIn('ravi.kumar@acmeretail.in')
    await br.waitFor(`location.pathname.includes('/portal')`, 'portal')
    check('A Client signs in straight into the client portal', true)
    await menu()
    await br.evalJs(`document.querySelector('[data-sign-out]').click(); true`)
    await br.waitFor(`location.pathname.startsWith('/login')`, 'client signed out')

    // ---------- admin: sign in as another role and back
    await signIn('dev.user@lingsaa.com')
    await br.waitFor(`location.pathname.includes('/dashboard')`, 'admin dashboard')
    await menu()
    await br.waitFor(`!!document.querySelector('[data-login-as="project_manager"]')`, 'sign in as list')
    await br.evalJs(`document.querySelector('[data-login-as="project_manager"]').click(); true`)
    await br.waitFor(`localStorage.getItem('user_id') === '3'`, 'switched')
    await br.sleep(1500)
    await menu()
    check('Admin can sign in as the Project Manager', await br.evalJs(`document.querySelector('[data-my-role]')?.innerText === 'Project Manager'`))
    await br.evalJs(`document.querySelector('[data-switch="mine"]').click(); true`)
    await br.waitFor(`localStorage.getItem('user_id') === '1'`, 'back to admin')
    check('…and come back to their own login', true)

    // ---------- change password (and back)
    await br.sleep(1500)
    await menu()
    await br.evalJs(`document.querySelector('[data-change-password]').click(); true`)
    await br.waitFor(`!!document.querySelector('#pw_current')`, 'password dialog')
    await br.setInput('#pw_current', PASSWORD)
    await br.setInput('#pw_next', 'Changed@456')
    await br.setInput('#pw_confirm', 'Changed@456')
    await br.clickText('button', 'Change Password')
    await br.waitFor(has('Password changed'), 'changed')
    const relogin = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dev.user@lingsaa.com', password: 'Changed@456' }) })).json()
    check('The new password works', Boolean(relogin.detail?.token))
    const back = await fetch(`${API}/auth/change-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${relogin.detail.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: 'Changed@456', new_password: PASSWORD })
    })
    check('Password changed back to the demo one', back.ok)

    const problems = br.problems().filter(p => p.kind === 'exception')
    check('no page errors', !problems.length, JSON.stringify(problems).slice(0, 300))
  } catch (e) {
    console.log('FAILED: ' + e.message)
    results.push(false)
  } finally {
    await clearLogin().catch(() => {})
    await br.close()
  }
  const failed = results.filter(r => !r).length
  console.log(failed ? `${failed} FAILED or stopped early` : `ALL ${results.length} CHECKS PASSED`)
  process.exit(failed ? 1 : 0)
})()
