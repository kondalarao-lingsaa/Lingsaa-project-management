// Planning > Milestones (and Milestones & Deliverables) has an Add Milestone button: choose project -> form -> saved.
// Also: My Tasks > Add Task on a project where I am not in the team shows an inline note (no pop-up).
// Run from frontend/:  node tests/e2e/milestone_add_overview.js  (cleans up)
const fs = require('fs')
const path = require('path')
const { launch } = require('./cdp')

const ROOT = `${process.env.PMS_APP || 'http://127.0.0.1:3000'}/appModules/projects`
const API = 'http://127.0.0.1:8000/api'
const TOKEN = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
const NAME = 'Milestone Overview Check'
const api = async (method, url, body) => (await fetch(API + url, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json()
const d = n => {
  const x = new Date()
  x.setDate(x.getDate() + n)

  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

;(async () => {
  const results = []
  const check = (name, ok, extra = '') => {
    results.push(ok)
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  [${extra}]`))
  }
  for (const p of (await api('GET', `/projects/list?search=${encodeURIComponent(NAME)}&page_size=20`)).detail || []) if (p.project_name === NAME) await api('DELETE', `/projects/${p.id}`)
  const project = (await api('POST', '/projects/create', { project_name: NAME, project_type: 'Time & Material', customer_name: 'Acme Retail', customer_contact_name: 'Ravi Kumar', customer_mobile: '9876543210', start_date: d(-5), end_date: d(40), budget: 50000, project_manager_name: 'Qa Manager' })).data
  for (const s of ['Pending Approval', 'Approved', 'Active']) await api('POST', `/projects/${project.id}/status`, { status: s })
  // Make sure Dev User is NOT in the team (only Qa Manager).
  for (const m of (await api('GET', `/projects/${project.id}/members`)).detail || []) if (m.user_id === 1 || m.member_name === 'Dev User') await api('DELETE', `/projects/${project.id}/members/${m.id}`)

  const br = await launch(path.join(require('os').tmpdir(), 'chrome-msov'), 1440, 1000)
  const btn = t => `[...document.querySelectorAll('button')].find(b => b.innerText.trim() === ${JSON.stringify(t)})`
  const clickUntil = async (clickJs, readyJs, label) => {
    for (let i = 0; i < 12 && !(await br.evalJs(readyJs)); i++) {
      await br.evalJs(clickJs).catch(() => {})
      await br.sleep(600)
    }
    await br.waitFor(readyJs, label)
  }
  try {
    await br.goto(`${ROOT}/dashboard/`)
    await br.sleep(1000)
    await br.evalJs(`['access_token','username','user_id','client_id'].forEach(k => localStorage.removeItem(k)); true`)

    for (const page of ['planning/milestones', 'deliverables']) {
      await br.goto(`${ROOT}/${page}/`)
      await clickUntil(`${btn('Add Milestone')}.click()`, `!!document.querySelector('#choose_project')`, 'chooser')
      check(`${page}: Add Milestone button opens the project chooser`, true)
      await br.waitFor(`[...document.querySelectorAll('#choose_project option')].some(o => o.value === '${project.id}')`, 'project in list')
      await br.setInput('#choose_project', String(project.id))
      await br.evalJs(`${btn('Continue')}.click()`)
      await br.waitFor(`!!document.querySelector('#name') && !!document.querySelector('#due_date')`, 'milestone form')
      await br.setInput('#name', `go live ${page.length}`)
      await br.setInput('#due_date', d(10))
      await br.setInput('#amount', '20000')
      await br.evalJs(`[...document.querySelectorAll('button')].filter(b => b.innerText.trim() === 'Add Milestone').pop().click()`)
      await br.waitFor(`!document.querySelector('#due_date')`, 'drawer closed')
      await br.waitFor(`document.body.innerText.includes('Go Live ${page.length}')`, 'row in table')
      check(`${page}: milestone saved and shown in the list`, true)
    }
    const ms = (await api('GET', `/projects/${project.id}/milestones`)).detail || []
    check('both milestones saved on the chosen project', ms.length === 2, JSON.stringify(ms.map(m => m.name)))

    await br.goto(`${ROOT}/tasks/myTasks/`)
    await clickUntil(`${btn('Add Task')}.click()`, `!!document.querySelector('#project_id')`, 'task drawer')
    await br.waitFor(`[...document.querySelectorAll('#project_id option')].some(o => o.value === '${project.id}')`, 'project option')
    await br.setInput('#project_id', String(project.id))
    await br.waitFor(`!!document.querySelector('[data-not-in-team]')`, 'inline note')
    await br.sleep(800)
    check('My Tasks > Add Task: "not in team" is an inline note under Assignee, no pop-up', !(await br.evalJs(`[...document.querySelectorAll('[role=status]')].some(e => e.innerText.includes('not in this project'))`)))
    check('the note links to the project Team tab', await br.evalJs(`document.querySelector('[data-not-in-team] a').href.includes('tab=team')`))
  } catch (e) {
    console.log('FAILED:', e.message)
    try { await br.shot(path.join(require('os').tmpdir(), 'msov_failure.png')) } catch (x) {}
    process.exitCode = 1
  } finally {
    await br.close()
    await api('DELETE', `/projects/${project.id}`)
    console.log(results.every(Boolean) && !process.exitCode ? `\nALL ${results.length} CHECKS PASSED` : `\n${results.filter(x => !x).length} FAILED or stopped early`)
  }
})()
