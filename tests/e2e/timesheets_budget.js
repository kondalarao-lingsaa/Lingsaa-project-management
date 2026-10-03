// End-to-end check of Timesheets -> Approval -> Budget against the running app (http://127.0.0.1:3000) and API (:8000).
// Needs Google Chrome. Run from frontend/:  node tests/e2e/timesheets_budget.js   (creates and then deletes its own test data)
// A second login (user 2, "qa.manager") is minted with the backend's own settings, because nobody may approve their own time.
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { launch } = require('./cdp')

const ROOT = `${process.env.PMS_APP || 'http://127.0.0.1:3000'}/appModules/projects`
const API = 'http://127.0.0.1:8000/api'
const TOKEN = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
const BACKEND = path.join(__dirname, '../../../backend/pms_api')
const MANAGER_TOKEN = execFileSync(
  path.join(BACKEND, 'venv/Scripts/python.exe'),
  ['-c', "import time; from jose import jwt; from app.core.config import settings as s; print(jwt.encode({'client_id': 900001, 'user_id': 2, 'username': 'qa.manager', 'role': 'admin', 'exp': int(time.time()) + 3600}, s.JWT_SECRET, algorithm=s.JWT_ALGORITHM))"],
  { cwd: BACKEND }
)
  .toString()
  .trim()
const SHOTS = require('os').tmpdir()

const api = async (method, url, body) => {
  const r = await fetch(API + url, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })

  return r.json()
}
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

;(async () => {
  const results = []
  const check = (name, ok, extra = '') => {
    results.push(ok)
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  [${extra}]`))
  }

  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - 30)
  const end = new Date(today)
  end.setDate(end.getDate() + 60)
  const project = (await api('POST', '/projects/create', { project_name: 'Timesheet E2e Check', project_type: 'Internal', start_date: iso(start), end_date: iso(end), budget: 100000, project_manager_name: 'Qa Manager' })).data
  for (const status of ['Pending Approval', 'Approved', 'Active']) await api('POST', `/projects/${project.id}/status`, { status })
  await api('POST', `/projects/${project.id}/members`, { member_name: 'Dev User', user_id: 1, role: 'Developer', allocation_pct: 10, hourly_rate: 1000 })
  const task = (await api('POST', '/tasks/create', { project_id: project.id, title: 'Timesheet e2e task', assignee_name: 'Dev User', estimated_hours: 2 })).data
  const todayIso = iso(today)

  const br = await launch(path.join(SHOTS, 'chrome-timesheets'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const all = (...e) => e.join(' && ')
  const setSelect = (selector, value) =>
    br.evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  const clickLast = text => br.evalJs(`(() => { const el = [...document.querySelectorAll('button')].filter(e => e.innerText.trim().startsWith(${JSON.stringify(text)})).pop(); if (!el) return false; el.click(); return true })()`)
  const cell = `[id="cell-${task.id}|${todayIso}"]`
  const typeCell = async value => {
    await br.setInput(cell, value)
    await br.evalJs(`document.querySelector(${JSON.stringify(cell)}).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); true`)
  }

  try {
    // ---------- My Timesheets (as me) ----------
    // Start as the dev login even if an earlier run stopped while acting as the manager.
    await br.goto(`${ROOT}/timesheets/myTimesheets/`)
    await br.waitFor(has('My Timesheets'), 'page')
    await br.evalJs(`localStorage.removeItem('access_token'); localStorage.removeItem('user_id'); localStorage.removeItem('username'); true`)
    await br.goto(`${ROOT}/timesheets/myTimesheets/`)
    await br.waitFor(`!!document.querySelector('#add_task_row') && [...document.querySelectorAll('#add_task_row option')].some(o => o.value === '${task.id}')`, 'week grid')
    await br.sleep(600)
    await setSelect('#add_task_row', task.id)
    await clickLast('Add Row')
    await br.waitFor(`!!document.querySelector(${JSON.stringify(cell)})`, 'task row')
    check('My Timesheets: my task can be added as a row (★ = assigned to me)', true)

    await typeCell('1.3')
    await br.waitFor(has('Use steps of 0.25'), 'step error')
    check('1.3 hours refused ("Use steps of 0.25")', true)
    await typeCell('4')
    await br.waitFor(`document.querySelector('tfoot') && document.querySelector('tfoot').innerText.includes('4')`, 'saved')
    await br.sleep(800)
    check('4 hours saved on today; week status becomes Draft', (await br.text()).includes('Saved as draft'))

    await clickLast('Submit Week')
    await br.waitFor(has('Submit this week?'), 'confirm')
    await br.evalJs(`[...document.querySelectorAll('[role="dialog"] button')].find(b => b.innerText.trim() === 'Submit').click()`)
    await br.waitFor(all(has('Waiting for your manager to approve'), `document.querySelector(${JSON.stringify(cell)}).disabled`), 'submitted')
    check('week submitted: status "Submitted" and the cell is locked', true)

    await br.goto(`${ROOT}/timesheets/approval/`)
    await br.waitFor(has(project.project_code), 'approval as me')
    await br.waitFor(has('Your own time - another manager must review it'), 'own time notice')
    check('Approval: my own hours show "another manager must review it" (no Approve button)', true)

    // ---------- Approval (as the second manager) ----------
    await br.evalJs(`localStorage.setItem('access_token', ${JSON.stringify(MANAGER_TOKEN)}); localStorage.setItem('user_id', '2'); localStorage.setItem('username', 'qa.manager'); true`)
    await br.goto(`${ROOT}/timesheets/approval/`)
    await br.waitFor(all(has('Dev User'), `[...document.querySelectorAll('main button')].some(b => b.innerText.trim() === 'Approve')`), 'approve button')
    await br.evalJs(`(() => { const sec = [...document.querySelectorAll('main section')].find(s => s.innerText.includes(${JSON.stringify(project.project_code)})); [...sec.querySelectorAll('button')].find(b => b.innerText.trim() === 'Reject').click(); return true })()`)
    await br.waitFor(has('Send hours back?'), 'reject dialog')
    await clickLast('Send Back')
    await br.waitFor(has('Please Enter a Reason'), 'reason required')
    check('Reject without a reason shows "Please Enter a Reason"', true)
    await clickLast('Cancel')
    await br.sleep(500)
    await br.evalJs(`(() => { const sec = [...document.querySelectorAll('main section')].find(s => s.innerText.includes(${JSON.stringify(project.project_code)})); [...sec.querySelectorAll('button')].find(b => b.innerText.trim() === 'Approve').click(); return true })()`)
    await br.waitFor(has('approved'), 'approved toast')
    await br.sleep(1000)
    check('manager approves the week (its card leaves the queue)', !(await br.evalJs(`[...document.querySelectorAll('main section')].some(s => s.innerText.includes(${JSON.stringify(project.project_code)}))`)))
    await br.evalJs(`localStorage.removeItem('access_token'); localStorage.removeItem('user_id'); localStorage.removeItem('username'); true`)

    // ---------- Results flow back ----------
    const t = await api('GET', `/tasks/${task.id}`)
    check('task actual hours = 4 (approved)', t.detail.actual_hours === 4, t.detail.actual_hours)

    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}&tab=budget`)
    await br.waitFor(all(has('Actual Cost'), has('₹4,000')), 'budget tab')
    const text = await br.text()
    check('Budget tab: actual ₹4,000, remaining ₹96,000', text.includes('₹96,000'))
    check('Budget tab: task over its estimate listed (4 / 2 h)', text.includes('4 / 2 h'))
    check('Budget tab: cost by member shows Dev User', text.includes('Dev User'))
    check('Budget tab: health is "At risk" - 4 h used against a 2 h estimate with the work not done', text.includes('At risk') && text.includes('against an estimate of 2 h'))
    await br.shot(`${SHOTS}/pms_budget_tab.png`)

    await br.goto(`${ROOT}/budget/budget/`)
    // The list is paged: find the project with the search box.
    await br.waitFor(`!!document.querySelector('[aria-label="Search projects"]')`, 'budget search')
    await br.setInput('[aria-label="Search projects"]', project.project_code)
    await br.waitFor(has(project.project_code), 'budget overview')
    check('Budget overview lists the project with its cost', (await br.evalJs(`[...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes(${JSON.stringify(project.project_code)})).innerText`)).includes('₹4,000'))

    await br.goto(`${ROOT}/timesheets/teamTimesheets/`)
    await br.waitFor(has('Total Hours'), 'team timesheets')
    await br.sleep(800)
    await br.waitFor(`[...document.querySelectorAll('main select option')].some(o => o.value === '${project.id}')`, 'project filter options')
    await br.evalJs(`(() => { const sel = [...document.querySelectorAll('main select')].find(s => [...s.options].some(o => o.value === '${project.id}')); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, '${project.id}'); sel.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
    await br.waitFor(all(has('qa.manager'), `document.querySelectorAll('tbody tr').length === 1`), 'filtered entries')
    check('Team Timesheets: project filter shows the Approved entry and who approved it', (await br.text()).includes('Approved'))

    await br.goto(`${ROOT}/timesheets/myTimesheets/`)
    await br.waitFor(has('Approved. These hours are locked.'), 'my week approved')
    check('My Timesheets now shows the week as Approved', true)
  } catch (e) {
    console.log('FAILED:', e.message)
    try {
      await br.shot(`${SHOTS}/pms_timesheets_failure.png`)
    } catch (x) {}
    process.exitCode = 1
  } finally {
    try {
      await br.evalJs(`localStorage.removeItem('access_token'); localStorage.removeItem('user_id'); localStorage.removeItem('username'); true`)
    } catch (x) {}
    await br.close()
    await api('DELETE', `/tasks/${task.id}`)
    await api('DELETE', `/projects/${project.id}`)
    console.log(results.every(Boolean) && !process.exitCode ? `\nALL ${results.length} CHECKS PASSED` : `\n${results.filter(x => !x).length} FAILED or stopped early`)
  }
})()
