// Every role, every screen: signs in as each demo role, opens every page in that role's sidebar and each tab of
// a Project Details page, and records refused requests (403), server errors (5xx) and page errors.
// A role should never meet a 403 just by opening the screens it is given. Writes a JSON report next to this file
// when REPORT is set. Run: node tests/e2e/roles_screens.js
const fs = require('fs')
const path = require('path')
const { launch } = require('./cdp')

const FE = path.join(__dirname, '..', '..')
const DEV = fs.readFileSync(path.join(FE, '.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
const API = (process.env.PMS_API || 'http://127.0.0.1:8000') + '/api'
const ORIGIN = process.env.PMS_APP || 'http://127.0.0.1:3000'
const APP = `${ORIGIN}/appModules/projects`
const ROLES = [[1, 'Admin'], [9, 'Director'], [3, 'Project Manager'], [4, 'Team Lead'], [5, 'Member'], [6, 'Finance'], [7, 'Resource Manager'], [8, 'Client']]
const TABS = ['overview', 'team', 'milestones', 'tasks', 'board', 'planning', 'budget', 'risks', 'files', 'activity', 'client']
const api = async (tok, m, u, b) =>
  (await fetch(API + u, { method: m, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })).json()

;(async () => {
  // One Active project every internal role can open: Priya manages it, Arjun and Anita are on the team.
  const today = new Date().toISOString().slice(0, 10)
  const later = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10)
  const p = (await api(DEV, 'POST', '/projects/create', {
    project_name: `Zz Role Screens ${String(Date.now()).slice(-6)}`, project_type: 'Fixed Price', customer_name: 'Acme Retail',
    customer_contact_name: 'Ravi Kumar', customer_mobile: '9876543210', start_date: today, end_date: later, budget: 50000,
    project_manager_name: 'Priya Sharma', project_manager_id: 3
  })).data
  await api(DEV, 'POST', `/projects/${p.id}/status`, { status: 'Pending Approval' })
  await api(DEV, 'POST', `/projects/${p.id}/status`, { status: 'Active' })
  for (const [uid, name, role] of [[4, 'Arjun Mehta', 'Team Lead'], [5, 'Anita Rao', 'Designer']])
    await api(DEV, 'POST', `/projects/${p.id}/members`, { member_name: name, user_id: uid, role, allocation_pct: 0 }) // 0%: demo projects may already book them fully
  const task = (await api(DEV, 'POST', '/tasks/create', { project_id: p.id, title: 'Role screens task', assignee_id: 5, assignee_name: 'Anita Rao' })).data

  const br = await launch(path.join(require('os').tmpdir(), 'chrome-roles-screens'), 1440, 1000)
  const report = []
  try {
    for (const [uid, roleName] of ROLES) {
      const who = (await api(DEV, 'POST', '/dev/login-as', { user_id: uid })).detail
      await br.goto(`${ORIGIN}/login`)
      await br.sleep(300)
      await br.evalJs(`localStorage.setItem('access_token', ${JSON.stringify(who.token)}); localStorage.setItem('user_id', '${uid}'); localStorage.setItem('username', ${JSON.stringify(who.username)}); localStorage.setItem('client_id', '${who.client_id}'); true`)
      await br.goto(`${APP}/${uid === 8 ? 'portal' : 'dashboard'}/`)
      await br.waitFor(`(document.querySelector('aside nav')?.querySelectorAll('a').length || 0) > 0`, `${roleName} sidebar`)
      await br.sleep(1500)
      const pages = await br.evalJs(`[...new Set([...document.querySelectorAll('aside nav a')].map(a => a.getAttribute('href')))]`)
      const extra = uid === 8 ? [`${APP}/portal/project/?id=${p.id}`] : [...TABS.map(t => `${APP}/projects/projectDetails/?id=${p.id}&tab=${t}`), `${APP}/tasks/taskDetails/?id=${task.id}`]
      br.problems()
      for (const url of [...pages.map(h => ORIGIN + h), ...extra]) {
        await br.goto(url)
        await br.sleep(2500)
        const toasts = await br.evalJs(`[...document.querySelectorAll('[role=status]')].map(t => t.innerText).filter(Boolean)`)
        const found = br.problems().filter(x => x.kind === 'exception' || /^http\.(403|5\d\d)$/.test(x.kind))
        const page = url.replace(ORIGIN, '')
        if (found.length || toasts.length) report.push({ role: roleName, page, problems: found.map(x => `${x.kind} ${x.text.replace(API, '').split('?')[0]}`), toasts })
      }
      console.log(`${roleName}: ${pages.length} sidebar pages + ${extra.length} detail views checked`)
    }
  } finally {
    await br.close()
    await api(DEV, 'DELETE', `/projects/${p.id}`)
  }
  for (const r of report) console.log(`ISSUE [${r.role}] ${r.page}\n   ${[...new Set(r.problems)].join('\n   ')}${r.toasts.length ? `\n   toast: ${r.toasts.join(' | ')}` : ''}`)
  if (process.env.REPORT) fs.writeFileSync(process.env.REPORT, JSON.stringify(report, null, 2))
  console.log(report.length ? `${report.length} screens with problems` : 'ALL SCREENS CLEAN FOR EVERY ROLE')
  process.exit(report.length ? 1 : 0)
})()
