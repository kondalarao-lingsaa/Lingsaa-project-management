// Roles, approvals and the client portal in the browser:
// - a Member's sidebar has no Settings / Billing / Reports / My Approvals; a Client lands in the client portal only
// - a Director approves a project from My Approvals (with a note), and it is Approved
// - the Client accepts a milestone and writes to the team; the PM sees the message in Project Details > Client
// - the Admin's Settings shows Users & Roles and Approval Rules
// Needs the demo role users (backend: scripts/seed_demo_roles.py). Run: node tests/e2e/roles_portal.js
const fs = require('fs')
const path = require('path')
const { launch } = require('./cdp')

const FE = path.join(__dirname, '..', '..')
const DEV = fs.readFileSync(path.join(FE, '.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
const API = (process.env.PMS_API || 'http://127.0.0.1:8000') + '/api'
const APP = (process.env.PMS_APP || 'http://127.0.0.1:3000') + '/appModules/projects'
const api = async (tok, m, u, b) =>
  (await fetch(API + u, { method: m, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })).json()
const loginAs = async uid => (await api(DEV, 'POST', '/dev/login-as', { user_id: uid })).detail
const plus = d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10)

;(async () => {
  const results = []
  const check = (name, ok, extra = '') => {
    results.push(ok)
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  [${extra}]`))
  }
  const [pm, director, member, client] = await Promise.all([3, 9, 5, 8].map(loginAs))
  const stamp = String(Date.now()).slice(-6)
  const base = { project_type: 'Fixed Price', customer_name: 'Acme Retail', customer_contact_name: 'Ravi Kumar', customer_mobile: '9876543210',
    start_date: plus(0), end_date: plus(60), project_manager_name: 'Priya Sharma', project_manager_id: 3 }
  const created = []
  const mk = async (name, budget) => {
    const r = await api(pm.token, 'POST', '/projects/create', { ...base, project_name: `Zz Roles E2e ${name} ${stamp}`, budget })
    created.push(r.data.id)

    return r.data
  }

  // A ₹5,00,000 project waiting for the Director; a live project with a milestone waiting for the client.
  const waiting = await mk('Approval', 500000)
  await api(pm.token, 'POST', `/projects/${waiting.id}/status`, { status: 'Pending Approval' })
  const live = await mk('Portal', 60000)
  await api(pm.token, 'POST', `/projects/${live.id}/status`, { status: 'Pending Approval' })
  await api(pm.token, 'POST', `/projects/${live.id}/status`, { status: 'Active' })
  await api(pm.token, 'POST', `/projects/${live.id}/members`, { member_name: 'Anita Rao', user_id: 5, role: 'Designer', allocation_pct: 5 })
  const ms = (await api(pm.token, 'POST', `/projects/${live.id}/milestones`, { name: 'Design Sign-off', amount: 30000, due_date: plus(10) })).data
  await api(pm.token, 'POST', `/projects/${live.id}/milestones/${ms.id}/deliverables`, { name: 'Home page design' })
  const did = (await api(pm.token, 'GET', `/projects/${live.id}/milestones`)).detail[0].deliverables[0].id
  await api(pm.token, 'POST', `/projects/${live.id}/milestones/${ms.id}/deliverables/${did}/done`, { is_done: true })
  await api(pm.token, 'POST', `/projects/${live.id}/milestones/${ms.id}/status`, { status: 'In Progress' })
  await api(pm.token, 'POST', `/projects/${live.id}/milestones/${ms.id}/status`, { status: 'Ready for Review' })

  const br = await launch(path.join(require('os').tmpdir(), 'chrome-roles'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const sidebar = () => br.evalJs(`document.querySelector('aside nav')?.innerText || ''`)
  const as = async who => {
    await br.goto(`${APP}/dashboard/`)
    await br.sleep(400)
    await br.evalJs(
      who
        ? `localStorage.setItem('access_token', ${JSON.stringify(who.token)}); localStorage.setItem('user_id', '${who.user_id}'); localStorage.setItem('username', ${JSON.stringify(who.username)}); localStorage.setItem('client_id', '${who.client_id}'); true`
        : `['access_token','username','user_id','client_id'].forEach(k => localStorage.removeItem(k)); true`
    )
  }

  try {
    // ---------- Member: a short sidebar
    await as(member)
    await br.goto(`${APP}/dashboard/`)
    await br.waitFor(`${has('Dashboard')} && document.querySelector('aside nav')?.innerText.includes('Timesheets')`, 'member sidebar')
    const memberNav = await sidebar()
    check('Member sidebar has Tasks and Timesheets', memberNav.includes('Tasks') && memberNav.includes('Timesheets'), memberNav)
    check('Member sidebar has no Settings, Billing, Reports or My Approvals',
      !['Settings', 'Billing', 'Reports', 'My Approvals'].some(t => memberNav.includes(t)), memberNav)

    // ---------- Director: approve from My Approvals
    await as(director)
    await br.goto(`${APP}/approvals/`)
    await br.waitFor(`!!document.querySelector('[data-approval-item="project-${waiting.id}"]')`, 'approval item')
    check('Director sees the ₹5,00,000 project in My Approvals', await br.evalJs(`document.querySelector('[data-approval-item="project-${waiting.id}"]').innerText.includes('₹5,00,000')`))
    await br.evalJs(`[...document.querySelector('[data-approval-item="project-${waiting.id}"]').querySelectorAll('button')].find(b => b.innerText.trim() === 'Approve').click(); true`)
    await br.waitFor(`!!document.querySelector('#reason_text')`, 'note dialog')
    await br.setInput('#reason_text', 'Fits this quarter')
    await br.evalJs(`[...document.querySelectorAll('.MuiDialog-root button')].find(b => b.innerText.trim() === 'Approve').click(); true`)
    await br.waitFor(`!document.querySelector('[data-approval-item="project-${waiting.id}"]')`, 'item gone')
    const after = (await api(pm.token, 'GET', `/projects/${waiting.id}`)).detail
    check('The project is Approved, with the note in its history', after.status === 'Approved' && after.approval.history.some(h => h.remarks === 'Fits this quarter'), after.status)

    // ---------- Client: portal only, accept the milestone, write to the team
    await as(client)
    await br.goto(`${APP}/dashboard/`)
    await br.waitFor(`location.pathname.includes('/portal')`, 'redirect to portal')
    check('A Client opening the dashboard lands in the client portal', true)
    await br.waitFor(`!!document.querySelector('[data-portal-project="${live.id}"]')`, 'portal project')
    const clientNav = await sidebar()
    check('Client sidebar has only the client portal', clientNav.includes('Client Portal') && !clientNav.includes('Projects') && !clientNav.includes('Tasks'), clientNav)
    
    await br.goto(`${APP}/portal/project/?id=${live.id}`)
    await br.waitFor(`!!document.querySelector('[data-portal-waiting]')`, 'review banner')
    await br.evalJs(`[...document.querySelector('[data-portal-milestone="${ms.id}"]').querySelectorAll('button')].find(b => b.innerText.trim() === 'Accept').click(); true`)
    await br.waitFor(`!!document.querySelector('#reason_text')`, 'accept dialog')
    await br.evalJs(`[...document.querySelectorAll('.MuiDialog-root button')].find(b => b.innerText.trim() === 'Accept').click(); true`)
    await br.waitFor(`document.querySelector('[data-portal-milestone="${ms.id}"]')?.innerText.includes('Accepted')`, 'accepted')
    check('Client accepts the milestone in the portal', true)
    await br.setInput('#message_text', 'Thanks, the design looks good')
    await br.clickText('button', 'Send')
    await br.waitFor(`document.querySelector('[data-message-thread]')?.innerText.includes('Thanks, the design looks good')`, 'message shown')
    check('Client message appears in the thread', true)

    // ---------- PM sees it in Project Details > Client
    await as(pm)
    await br.goto(`${APP}/projects/projectDetails/?id=${live.id}&tab=client`)
    await br.waitFor(`document.querySelector('[data-message-thread]')?.innerText.includes('Thanks, the design looks good')`, 'pm sees message')
    check('PM sees the client message in Project Details > Client', true)

    // ---------- Admin: Settings cards
    await as(null)
    await br.goto(`${APP}/settings/access/`)
    await br.waitFor(`!!document.querySelector('[data-users-roles]') && !!document.querySelector('[data-approval-rules]')`, 'settings cards')
    check('Admin Settings shows Users & Roles and Approval Rules', await br.evalJs(`document.querySelector('[data-users-roles]').innerText.includes('Rohan Verma')`))

    // ---------- Permission Matrix: give Members Billing (view), the Member's sidebar shows it, then reset
    await br.waitFor(`!!document.querySelector('[data-permission-matrix]')`, 'matrix')
    await br.evalJs(`document.querySelector('[data-matrix-role="member"]').click(); true`)
    await br.sleep(400)
    check('Settings is locked for the Member in the matrix', await br.evalJs(`document.querySelector('[data-cell="settings.view"]').disabled`))
    await br.evalJs(`document.querySelector('[data-cell="billing.view"]').click(); true`)
    await br.evalJs(`document.querySelector('[data-save-matrix]').click(); true`)
    await br.waitFor(has('Permissions of Member saved'), 'saved')
    await as(member)
    await br.goto(`${APP}/dashboard/`)
    await br.waitFor(`(document.querySelector('aside nav')?.innerText || '').includes('Timesheets')`, 'member nav again')
    check('After the change, the Member sees Billing in the sidebar', (await sidebar()).includes('Billing'))
    await api(DEV, 'PUT', '/settings/permissions', { role: 'member', permissions: null })

    const problems = br.problems().filter(p => p.kind === 'exception')
    check('no page errors', !problems.length, JSON.stringify(problems).slice(0, 300))
  } catch (e) {
    console.log('FAILED: ' + e.message)
    results.push(false)
  } finally {
    await br.close()
    for (const id of created) await api(DEV, 'DELETE', `/projects/${id}`)
  }
  const failed = results.filter(r => !r).length
  console.log(failed ? `${failed} FAILED or stopped early` : `ALL ${results.length} CHECKS PASSED`)
  process.exit(failed ? 1 : 0)
})()
