// End-to-end check of Project Settings and expense receipts: settings form validation + save, the task form picking
// up the default priority / estimate / label suggestions, the invoice form picking up GST and terms, and an expense
// above the receipt limit needing a bill before it can be submitted. Against the running app and API (:8000).
// Needs Google Chrome. Run from frontend/:  node tests/e2e/project_settings.js   (cleans up after itself)
const fs = require('fs')
const path = require('path')
const { launch } = require('./cdp')

const ROOT = `${process.env.PMS_APP || 'http://127.0.0.1:3000'}/appModules/projects`
const API = 'http://127.0.0.1:8000/api'
const TOKEN = fs
  .readFileSync(path.join(__dirname, '../../.env.local'), 'utf8')
  .match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1]
  .trim()
const SHOTS = require('os').tmpdir()
const NAME = 'Project Settings E2e Check'
const CLIENT = 'Project Settings Client E2e'

const api = async (method, url, body) => {
  const r = await fetch(API + url, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })

  return r.json()
}
const iso = x =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
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
  for (const n of [NAME, CLIENT])
    for (const p of (await api('GET', `/projects/list?search=${encodeURIComponent(n)}&page_size=20`)).detail || [])
      if (p.project_name === n) await api('DELETE', `/projects/${p.id}`)
  const project = (
    await api('POST', '/projects/create', {
      project_name: NAME,
      project_type: 'Internal',
      start_date: d(-30),
      end_date: d(60),
      budget: 10000,
      project_manager_name: 'Priya Shah'
    })
  ).data
  for (const s of ['Pending Approval', 'Approved', 'Active'])
    await api('POST', `/projects/${project.id}/status`, { status: s })
  await api('POST', `/projects/${project.id}/members`, {
    member_name: 'Dev User',
    user_id: 1,
    role: 'Developer',
    allocation_pct: 10
  })
  const client = (
    await api('POST', '/projects/create', {
      project_name: CLIENT,
      project_type: 'Time & Material',
      customer_name: 'Acme Retail',
      customer_contact_name: 'Ravi Kumar',
      customer_mobile: '9876543210',
      start_date: d(-30),
      end_date: d(60),
      budget: 50000,
      project_manager_name: 'Priya Shah'
    })
  ).data
  for (const s of ['Pending Approval', 'Approved', 'Active'])
    await api('POST', `/projects/${client.id}/status`, { status: s })
  await api('PUT', `/projects/${client.id}/settings`, { default_tax_pct: 12, default_payment_terms: 15 })

  const br = await launch(path.join(SHOTS, 'chrome-psettings'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const btn = t => `[...document.querySelectorAll('button')].find(b => b.innerText.trim() === ${JSON.stringify(t)})`
  const blur = sel =>
    br.evalJs(
      `document.querySelector(${JSON.stringify(
        sel
      )}).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); true`
    )
  const clickUntil = async (clickJs, readyJs) => {
    for (let i = 0; i < 10 && !(await br.evalJs(readyJs)); i++) {
      await br.evalJs(clickJs)
      await br.sleep(700)
    }
    await br.waitFor(readyJs, 'opened')
  }

  try {
    // ---------- Project Settings ----------
    await br.goto(`${ROOT}/projects/projectSettings/?projectId=${project.id}`)
    await br.waitFor(
      `!!document.querySelector('[data-project-settings]') && document.querySelector('#budget_alert_pct').value === '80'`,
      'settings form'
    )
    check('Project Settings opens with the defaults (alert 80%)', await br.evalJs(has('Using the default settings')))
    await br.setInput('#budget_alert_pct', '40')
    await blur('#budget_alert_pct')
    await br.waitFor(has('A whole percentage from 50 to 100'), 'alert error')
    check('budget alert 40% is refused at the field', true)
    await br.setInput('#budget_alert_pct', '60')
    await br.setInput('#default_task_priority', 'High')
    await br.setInput('#default_estimate_hours', '6')
    await br.setInput('#timesheet_lock_days', '7')
    await br.setInput('#receipt_required_above', '2000')
    await br.setInput('#new_label', 'Backend')
    await br.evalJs(`${btn('Add')}.click()`)
    await br.waitFor(`document.querySelector('[data-labels]').innerText.includes('backend')`, 'label chip')
    check('a suggested label is added as a chip (lower case)', true)
    await br.waitFor(`${has('dated more than 7 days ago')} && ${has('need a bill attached')}`, 'live hints')
    check('live hints explain the lock (7 days) and the receipt rule', true)
    await br.evalJs(`${btn('Save Settings')}.click()`)
    await br.waitFor(has('Settings saved'), 'saved')
    const saved = (await api('GET', `/projects/${project.id}/settings`)).detail
    check(
      'settings saved on the server',
      saved.default_task_priority === 'High' &&
        saved.default_estimate_hours === 6 &&
        saved.timesheet_lock_days === 7 &&
        saved.budget_alert_pct === 60 &&
        saved.receipt_required_above === 2000 &&
        saved.task_labels.join() === 'backend',
      JSON.stringify(saved)
    )

    // ---------- Task form picks up the defaults ----------
    await br.goto(`${ROOT}/tasks/allTasks/`)
    await br.waitFor(has('Add Task'), 'tasks page')
    await clickUntil(`${btn('Add Task')}.click()`, `!!document.querySelector('#project_id')`)
    await br.waitFor(`!!document.querySelector('#project_id option[value="${project.id}"]')`, 'project option')
    await br.setInput('#project_id', String(project.id))
    await br.waitFor(
      `document.querySelector('#priority').value === 'High' && document.querySelector('#estimated_hours').value === '6'`,
      'task defaults'
    )
    check('new task starts with priority High and estimate 6 h', true)
    await br.waitFor(`!!document.querySelector('[data-label-suggestions]')`, 'label suggestions')
    await br.evalJs(
      `[...document.querySelectorAll('[data-label-suggestions] button')].find(b => b.innerText.includes('backend')).click()`
    )
    await br.waitFor(`document.querySelector('#labels').value === 'backend'`, 'label added')
    check('clicking the suggested label fills the Labels field', true)
    await br.evalJs(`${btn('Close')}.click()`)
    await br.sleep(400)

    // ---------- Invoice form picks up GST and terms ----------
    await br.goto(`${ROOT}/billing/`)
    await br.waitFor(has('Outstanding'), 'billing')
    await clickUntil(
      `[...document.querySelectorAll('main button')].find(b => b.innerText.includes('Create Invoice')).click()`,
      `!!document.querySelector('#project_id')`
    )
    await br.waitFor(`!!document.querySelector('#project_id option[value="${client.id}"]')`, 'client option')
    await br.setInput('#project_id', String(client.id))
    await br.waitFor(
      `document.querySelector('#tax_pct').value === '12' && document.querySelector('#payment_terms_days').value === '15'`,
      'invoice defaults'
    )
    check('Create Invoice uses the project defaults (GST 12%, 15 days)', true)
    await br.evalJs(`${btn('Close')}.click()`)
    await br.sleep(400)

    // ---------- Receipt required ----------
    await br.goto(`${ROOT}/budget/expenses/?projectId=${project.id}`)
    await br.waitFor(
      `document.querySelector('#planning_project') && document.querySelector('#planning_project').value === '${project.id}'`,
      'expenses page picker'
    )
    await clickUntil(`${btn('Add Expense')}.click()`, `!!document.querySelector('#category')`)
    await br.waitFor(`document.querySelector('#project_id').value === '${project.id}'`, 'project picked')
    await br.setInput('#category', 'Hardware')
    await br.setInput('#description', 'laptop for tester')
    await br.setInput('#amount', '4500')
    await br.waitFor(has('needs a receipt for expenses above ₹2,000'), 'receipt hint')
    await br.evalJs(`${btn('Submit for Approval')}.click()`)
    await br.waitFor(
      `document.querySelector('[data-receipt]').innerText.includes('This project needs a receipt for expenses above ₹2,000') && document.querySelector('#receipt').className.includes('border-red-500')`,
      'receipt error'
    )
    check('₹4,500 cannot be submitted without a receipt (field marked red)', true)
    await br.evalJs(
      `(() => { const dt = new DataTransfer(); dt.items.add(new File(['MZ fake'], 'virus.exe', { type: 'application/octet-stream' })); const i = document.querySelector('#receipt'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); return true })()`
    )
    await br.waitFor(has('Attach a PDF, JPG or PNG file'), 'type error')
    check('a .exe receipt is refused in the form', true)
    await br.evalJs(
      `(() => { const dt = new DataTransfer(); dt.items.add(new File(['%PDF-1.4\\n1 0 obj<<>>endobj\\ntrailer<<>>\\n%%EOF'], 'laptop bill.pdf', { type: 'application/pdf' })); const i = document.querySelector('#receipt'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); return true })()`
    )
    await br.evalJs(`${btn('Submit for Approval')}.click()`)
    await br.waitFor(has('sent for approval'), 'submitted')
    const exp = ((await api('GET', `/expenses?project_id=${project.id}`)).detail || [])[0]
    check(
      'with the PDF attached it is saved, the receipt uploaded and sent for approval',
      exp && exp.status === 'Submitted' && exp.receipt_file_name === 'laptop bill.pdf',
      JSON.stringify(exp)
    )
    await br.waitFor(`!!document.querySelector('[aria-label="Receipt of ${exp.expense_key}"]')`, 'receipt link')
    check(
      'the Expenses list shows the receipt link',
      await br.evalJs(
        `document.querySelector('[aria-label="Receipt of ${exp.expense_key}"]').innerText.includes('laptop bill.pdf')`
      )
    )
    await br.shot(`${SHOTS}/pms_receipt.png`)

    // ---------- Project Details link ----------
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}`)
    await br.waitFor(
      `[...document.querySelectorAll('main a')].some(a => a.innerText.trim() === 'Settings')`,
      'settings link'
    )
    check(
      'Project Details has a Settings button to this page',
      await br.evalJs(
        `[...document.querySelectorAll('main a')].find(a => a.innerText.trim() === 'Settings').href.includes('projectSettings/?projectId=${project.id}')`
      )
    )
    await br.goto(`${ROOT}/projects/projectSettings/?projectId=${project.id}`)
    await br.waitFor(`!!document.querySelector('[data-project-settings]')`, 'settings again')
    await br.shot(`${SHOTS}/pms_project_settings.png`)
  } catch (e) {
    console.log('FAILED:', e.message)
    try {
      await br.shot(`${SHOTS}/pms_psettings_failure.png`)
    } catch (x) {}
    process.exitCode = 1
  } finally {
    await br.close()
    for (const p of [project, client]) {
      for (const t of (await api('GET', `/tasks/list?project_id=${p.id}&page_size=50`)).detail || [])
        await api('DELETE', `/tasks/${t.id}`)
      await api('DELETE', `/projects/${p.id}`)
    }
    console.log(
      results.every(Boolean) && !process.exitCode
        ? `\nALL ${results.length} CHECKS PASSED`
        : `\n${results.filter(x => !x).length} FAILED or stopped early`
    )
  }
})()
