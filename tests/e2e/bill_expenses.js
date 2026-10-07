// End-to-end check of billing billable expenses: Create Invoice (Time & Material) lists the billable expenses of the
// period, includes them in the total, and the expense then shows "Billed on INV-…". Against the running app (:3000)
// and API (:8000). Needs Google Chrome. Run from frontend/:  node tests/e2e/bill_expenses.js  (cleans up after itself)
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
const NAME = 'Bill Expenses E2e Check'

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
  const project = (
    await api('POST', '/projects/create', {
      project_name: NAME, project_type: 'Time & Material', customer_name: 'Acme Retail', customer_contact_name: 'Ravi Kumar', customer_mobile: '9876543210',
      start_date: d(-20), end_date: d(60), budget: 100000, project_manager_name: 'Priya Shah'
    })
  ).data
  for (const s of ['Pending Approval', 'Approved', 'Active']) await api('POST', `/projects/${project.id}/status`, { status: s })
  // The manager spends; dev (the browser user) approves, so the expense is approved and billable.
  await api('POST', `/projects/${project.id}/members`, { member_name: 'Qa Manager', user_id: 2, role: 'Team Lead', allocation_pct: 10 })
  const hotel = (await api('POST', '/expenses', { project_id: project.id, category: 'Food & Stay', description: 'Hotel at client city', amount: 3000, billable: true, expense_date: d(-2), submit: true }, MANAGER_TOKEN)).data
  const lunch = (await api('POST', '/expenses', { project_id: project.id, category: 'Food & Stay', description: 'Team lunch', amount: 800, expense_date: d(-2), submit: true }, MANAGER_TOKEN)).data
  await api('POST', '/expenses/approve', { ids: [hotel.id, lunch.id] })

  const br = await launch(path.join(SHOTS, 'chrome-billexp'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const btn = t => `[...document.querySelectorAll('button')].find(b => b.innerText.trim() === ${JSON.stringify(t)})`
  let invoiceId = null

  try {
    await br.goto(`${ROOT}/billing/`)
    await br.waitFor(has('Outstanding'), 'billing page')
    // The button exists before the page is interactive, so click until the drawer opens.
    for (let i = 0; i < 10 && !(await br.evalJs(`!!document.querySelector('#project_id')`)); i++) {
      await br.evalJs(`[...document.querySelectorAll('main button')].find(b => b.innerText.includes('Create Invoice')).click()`)
      await br.sleep(700)
    }
    await br.waitFor(`!!document.querySelector('#project_id')`, 'invoice drawer')
    await br.waitFor(`!!document.querySelector('#project_id option[value="${project.id}"]')`, 'project option')
    await br.setInput('#project_id', String(project.id))
    await br.waitFor(has('1 billable expense'), 'billable summary')
    check('Time & Material option mentions 1 billable expense (₹3,000)', await br.evalJs(has('1 billable expense (₹3,000)')))
    await br.waitFor(`!!document.querySelector('[data-invoice-expenses]')`, 'expenses box')
    const box = await br.evalJs(`document.querySelector('[data-invoice-expenses]').innerText`)
    check('the period list shows the hotel and not the non-billable lunch', box.includes('Hotel at client city') && !box.includes('Team lunch'), box)
    check('preview total = ₹3,000 + 18% GST = ₹3,540', await br.evalJs(has('₹3,540')))
    await br.evalJs(`document.querySelector('#include_expenses').click()`)
    await br.sleep(300)
    check('unticking "Include billable expenses" removes it from the total', !(await br.evalJs(has('₹3,540'))))
    await br.evalJs(`document.querySelector('#include_expenses').click()`)
    await br.shot(`${SHOTS}/pms_invoice_expenses.png`)
    await br.evalJs(`${btn('Create Draft')}.click()`)
    await br.waitFor(has('INV-'), 'invoice created')
    // Other invoices already show "INV-" on the page, so wait for this project's invoice in the API.
    let inv
    for (let i = 0; i < 20 && !inv; i++) {
      inv = ((await api('GET', `/billing/invoices?project_id=${project.id}&page_size=5`)).detail || [])[0]
      if (!inv) await br.sleep(500)
    }
    invoiceId = inv && inv.id
    const detail = inv ? (await api('GET', `/billing/invoices/${inv.id}`)).detail : {}
    check('Draft invoice created with the expense line (subtotal ₹3,000)', detail.subtotal === 3000 && (detail.lines || []).some(l => l.description.startsWith(`Expense ${hotel.expense_key}`)), JSON.stringify(detail.lines))

    await br.goto(`${ROOT}/budget/expenses/?projectId=${project.id}`)
    await br.waitFor(`!!document.querySelector('[data-expense="${hotel.expense_key}"]')`, 'expense row')
    check('the expense now shows "Billed on INV-…"', await br.evalJs(`document.querySelector('[data-expense="${hotel.expense_key}"]').innerText.includes('Billed on ${inv.invoice_no}')`))
  } catch (e) {
    console.log('FAILED:', e.message)
    try {
      await br.shot(`${SHOTS}/pms_billexp_failure.png`)
    } catch (x) {}
    process.exitCode = 1
  } finally {
    await br.close()
    if (invoiceId) await api('POST', `/billing/invoices/${invoiceId}/status`, { action: 'cancel' })
    await api('DELETE', `/projects/${project.id}`)
    console.log(results.every(Boolean) && !process.exitCode ? `\nALL ${results.length} CHECKS PASSED` : `\n${results.filter(x => !x).length} FAILED or stopped early`)
  }
})()
