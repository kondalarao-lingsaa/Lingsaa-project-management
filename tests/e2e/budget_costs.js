// End-to-end check of Budget & Costs: Expenses (form validation, draft -> submit, approve, reject with reason,
// bulk approve with over-budget warning), Actual Cost and Variance against the running app (:3000) and API (:8000).
// Needs Google Chrome. Run from frontend/:  node tests/e2e/budget_costs.js   (creates and then deletes its own test data)
// A second login (user 2, "qa.manager") records expenses through the API so the browser user (dev.user) can review them.
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
const NAME = 'Budget Costs E2e Check'

const api = async (method, url, body, token = TOKEN) => {
  const r = await fetch(API + url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })

  return r.json()
}
const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
const d = n => {
  const x = new Date()
  x.setDate(x.getDate() + n)

  return iso(x)
}

;(async () => {
  const results = []
  const check = (name, ok, extra = '') => {
    results.push(ok)
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  [${extra}]`))
  }

  for (const p of (await api('GET', `/projects/list?search=${encodeURIComponent(NAME)}&page_size=20`)).detail || []) if (p.project_name === NAME) await api('DELETE', `/projects/${p.id}`)
  const project = (await api('POST', '/projects/create', { project_name: NAME, project_type: 'Internal', start_date: d(-30), end_date: d(60), budget: 10000, project_manager_name: 'Priya Shah' })).data
  for (const s of ['Pending Approval', 'Approved', 'Active']) await api('POST', `/projects/${project.id}/status`, { status: s })
  await api('POST', `/projects/${project.id}/members`, { member_name: 'Dev User', user_id: 1, role: 'Developer', allocation_pct: 20, hourly_rate: 500 })
  await api('POST', `/projects/${project.id}/members`, { member_name: 'Qa Manager', user_id: 2, role: 'Team Lead', allocation_pct: 10 })
  // 4 approved hours of dev = 2000 labour; one of two tasks done = 50% progress.
  const t1 = (await api('POST', '/tasks/create', { project_id: project.id, title: 'Build the api', assignee_name: 'Dev User', estimated_hours: 8 })).data
  await api('POST', '/tasks/create', { project_id: project.id, title: 'Test the api', estimated_hours: 8 })
  const now = new Date()
  const logDay = now.getDay() === 0 ? d(-2) : now.getDay() === 6 ? d(-1) : d(0)
  const ld = new Date(`${logDay}T00:00:00`)
  const week = iso(new Date(ld.getFullYear(), ld.getMonth(), ld.getDate() - ((ld.getDay() + 6) % 7)))
  const te = (await api('POST', '/timesheets/entries', { task_id: t1.id, work_date: logDay, hours: 4 })).data
  await api('POST', '/timesheets/submit', { week_start: week })
  await api('POST', '/timesheets/approve', { entry_ids: [te.id] }, MANAGER_TOKEN)
  await api('POST', `/tasks/${t1.id}/status`, { status: 'In Progress' })
  await api('POST', `/tasks/${t1.id}/status`, { status: 'Done' })
  const mk = body => api('POST', '/expenses', { project_id: project.id, expense_date: d(0), submit: true, ...body }, MANAGER_TOKEN).then(r => r.data)
  const phone = await mk({ category: 'Hardware', description: 'Test phone', amount: 3000, billable: true })

  const br = await launch(path.join(SHOTS, 'chrome-costs'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const row = key => `document.querySelector('[data-expense="${key}"]')`
  const btn = t => `[...document.querySelectorAll('button')].find(b => b.innerText.trim() === ${JSON.stringify(t)})`

  try {
    await br.goto(`${ROOT}/dashboard/`)
    await br.evalJs(`localStorage.removeItem('access_token'); localStorage.removeItem('user_id'); localStorage.removeItem('username'); true`)
    await br.goto(`${ROOT}/budget/expenses/?projectId=${project.id}`)
    await br.waitFor(`!!${row(phone.expense_key)}`, 'expenses list')
    check('Expenses lists the manager’s waiting expense', await br.evalJs(`${row(phone.expense_key)}.innerText.includes('Waiting')`))

    // ---------- add: validation, draft, submit ----------
    await br.evalJs(`${btn('Add Expense')}.click()`)
    await br.waitFor(`!!document.querySelector('#category') && document.querySelector('#project_id').value === '${project.id}'`, 'drawer')
    check('Add Expense opens with the picked project and today’s date', await br.evalJs(`document.querySelector('#expense_date').value === '${d(0)}'`))
    await br.evalJs(`${btn('Submit for Approval')}.click()`)
    await br.waitFor(`${has('Please Select Category')} && ${has('Please Enter Description')} && ${has('Please Enter Amount')}`, 'errors')
    check('submitting an empty form marks category, description and amount', true)
    await br.setInput('#category', 'Travel')
    await br.setInput('#description', 'taxi to client office')
    await br.setInput('#amount', '1200.555')
    await br.evalJs(`${btn('Save Draft')}.click()`)
    await br.waitFor(has('Use at most 2 decimals'), 'decimals')
    check('an amount with 3 decimals is refused', true)
    await br.setInput('#amount', '1200')
    await br.evalJs(`${btn('Save Draft')}.click()`)
    await br.waitFor(has('saved as draft'), 'draft saved')
    const mine = ((await api('GET', `/expenses?project_id=${project.id}&status=Draft`)).detail || [])[0]
    check('draft saved (description capitalised, spent by Dev User)', mine && mine.description === 'Taxi to client office' && mine.spent_by_name === 'Dev User', JSON.stringify(mine))
    await br.waitFor(`!!${row(mine.expense_key)}`, 'draft row')
    await br.evalJs(`document.querySelector('[aria-label="Submit ${mine.expense_key}"]').click()`)
    await br.waitFor(`${row(mine.expense_key)}.innerText.includes('Waiting for a manager')`, 'submitted')
    check('own draft sent for approval; no approve box on my own expense', !(await br.evalJs(`!!document.querySelector('[aria-label="Select ${mine.expense_key}"]')`)))

    // ---------- approve / reject ----------
    await br.evalJs(`document.querySelector('[aria-label="Approve ${phone.expense_key}"]').click()`)
    await br.waitFor(`${row(phone.expense_key)}.innerText.includes('Approved')`, 'approved')
    check('Approve moves the manager’s expense to Approved', true)
    const snack = await mk({ category: 'Food & Stay', description: 'Team lunch', amount: 500 })
    await br.goto(`${ROOT}/budget/expenses/?projectId=${project.id}`)
    await br.waitFor(`!!document.querySelector('[aria-label="Reject ${snack.expense_key}"]')`, 'reject button')
    await br.evalJs(`document.querySelector('[aria-label="Reject ${snack.expense_key}"]').click()`)
    await br.waitFor(`!!document.querySelector('#reject_reason')`, 'reject dialog')
    await br.evalJs(`[...document.querySelectorAll('.MuiDialog-root button')].find(b => b.innerText.trim() === 'Reject').click()`)
    await br.waitFor(has('reason of at least 5 characters'), 'reason error')
    check('reject needs a reason', true)
    await br.setInput('#reject_reason', 'not a project cost')
    await br.evalJs(`[...document.querySelectorAll('.MuiDialog-root button')].find(b => b.innerText.trim() === 'Reject').click()`)
    await br.waitFor(`${row(snack.expense_key)}.innerText.includes('Not a project cost')`, 'rejected')
    const note = (await api('GET', '/notifications?kind=expense&unread_only=true', null, MANAGER_TOKEN)).detail
    check('rejected expense shows the reason; the manager is notified', note.some(n => n.title.includes(snack.expense_key) && (n.body || '').includes('Not a project cost')), JSON.stringify(note.slice(0, 2)))

    // ---------- bulk approve past the budget ----------
    const audit = await mk({ category: 'Subcontractor', description: 'Security audit', amount: 4000 })
    const lic = await mk({ category: 'Software & Licences', description: 'Design tool licence', amount: 2000 })
    await br.goto(`${ROOT}/budget/expenses/?projectId=${project.id}&x=1`)
    await br.waitFor(`!!document.querySelector('[aria-label="Select ${audit.expense_key}"]') && !!document.querySelector('[aria-label="Select ${lic.expense_key}"]')`, 'bulk rows')
    await br.evalJs(`document.querySelector('[aria-label="Select all waiting"]').click()`)
    await br.waitFor(`!!document.querySelector('[data-bulk]') && document.querySelector('[data-bulk]').innerText.includes('2 selected')`, 'bulk bar')
    check('"select all" picks the 2 waiting expenses of others (₹6,000)', await br.evalJs(`document.querySelector('[data-bulk]').innerText.includes('6,000')`))
    await br.evalJs(`[...document.querySelector('[data-bulk]').querySelectorAll('button')].find(b => b.innerText.includes('Approve')).click()`)
    await br.waitFor(has('now over budget'), 'over budget toast')
    check('bulk approve warns that the project is now over budget', true)
    await br.shot(`${SHOTS}/pms_expenses.png`)

    // ---------- Actual Cost ----------
    await br.goto(`${ROOT}/budget/actualCost/?projectId=${project.id}`)
    await br.waitFor(`!!document.querySelector('[data-cost-row="${project.project_code}"]')`, 'cost row')
    const costRow = await br.evalJs(`document.querySelector('[data-cost-row="${project.project_code}"]').innerText`)
    check('Actual Cost: labour ₹2,000 + expenses ₹9,000 = ₹11,000 (110%), ₹1,200 waiting', costRow.includes('₹2,000') && costRow.includes('₹9,000') && costRow.includes('₹11,000') && costRow.includes('110%') && costRow.includes('₹1,200 waiting'), costRow)
    check('expenses by category listed (Subcontractor, Hardware, Software)', await br.evalJs(`(() => { const t = document.querySelector('[data-categories]').innerText; return t.includes('Subcontractor') && t.includes('Hardware') && t.includes('Software & Licences') })()`))

    // ---------- Variance ----------
    await br.goto(`${ROOT}/budget/variance/?projectId=${project.id}`)
    await br.waitFor(`!!document.querySelector('[data-variance-row="${project.project_code}"]')`, 'variance row')
    const vRow = await br.evalJs(`document.querySelector('[data-variance-row="${project.project_code}"]').innerText`)
    check('Variance: 50% done, EV ₹5,000 vs actual ₹11,000 -> Over budget, CPI 0.45', vRow.includes('50%') && vRow.includes('₹5,000') && vRow.includes('Over budget') && vRow.includes('CPI 0.45'), vRow)
    await br.evalJs(`${btn('How to read this')}.click()`)
    await br.waitFor(`!!document.querySelector('[data-help]')`, 'help')
    check('"How to read this" explains EV, PV, CPI, SPI, EAC, VAC', await br.evalJs(`document.querySelector('[data-help]').innerText.includes('CPI') && document.querySelector('[data-help]').innerText.includes('Variance at completion')`))
    await br.shot(`${SHOTS}/pms_variance.png`)

    // ---------- Budget tab ----------
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}&tab=budget`)
    await br.waitFor(has('hours ₹2,000 + expenses ₹9,000'), 'budget tab split')
    check('project Budget tab shows the labour / expense split', true)
  } catch (e) {
    console.log('FAILED:', e.message)
    try {
      await br.shot(`${SHOTS}/pms_costs_failure.png`)
    } catch (x) {}
    process.exitCode = 1
  } finally {
    await br.close()
    for (const t of (await api('GET', `/tasks/list?project_id=${project.id}&page_size=50`)).detail || []) await api('DELETE', `/tasks/${t.id}`)
    await api('DELETE', `/projects/${project.id}`)
    console.log(results.every(Boolean) && !process.exitCode ? `\nALL ${results.length} CHECKS PASSED` : `\n${results.filter(x => !x).length} FAILED or stopped early`)
  }
})()
