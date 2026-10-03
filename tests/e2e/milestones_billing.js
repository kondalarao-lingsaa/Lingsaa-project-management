// End-to-end check of Milestones -> Deliverables -> client acceptance -> Invoice -> Paid -> Budget margin,
// against the running app (http://127.0.0.1:3000) and API (:8000). Needs Google Chrome.
// Run from frontend/:  node tests/e2e/milestones_billing.js   (creates and then deletes its own test data)
const fs = require('fs')
const path = require('path')
const { launch } = require('./cdp')

const ROOT = `${process.env.PMS_APP || 'http://127.0.0.1:3000'}/appModules/projects`
const API = 'http://127.0.0.1:8000/api'
const TOKEN = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
const SHOTS = require('os').tmpdir()
const NAME = 'Milestone E2e Check'

const api = async (method, url, body) => {
  const r = await fetch(API + url, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })

  return r.json()
}
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const shift = days => {
  const d = new Date()
  d.setDate(d.getDate() + days)

  return iso(d)
}

;(async () => {
  const results = []
  const check = (name, ok, extra = '') => {
    results.push(ok)
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  [${extra}]`))
  }

  // Leftovers of a run that stopped half-way would block the unique project name.
  for (const p of (await api('GET', `/projects/list?search=${encodeURIComponent(NAME)}&page_size=20`)).detail || []) if (p.project_name === NAME) await api('DELETE', `/projects/${p.id}`)
  const project = (
    await api('POST', '/projects/create', {
      project_name: NAME, project_type: 'Fixed Price', customer_name: 'Acme Retail', customer_contact_name: 'Ravi Kumar', customer_mobile: '9876543210',
      start_date: shift(-30), end_date: shift(90), budget: 200000, project_manager_name: 'Qa Manager'
    })
  ).data
  for (const status of ['Pending Approval', 'Approved', 'Active']) await api('POST', `/projects/${project.id}/status`, { status })

  const br = await launch(path.join(SHOTS, 'chrome-milestones'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const all = (...e) => e.join(' && ')
  const setSelect = (selector, value) =>
    br.evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  const clickLast = text => br.evalJs(`(() => { const el = [...document.querySelectorAll('button')].filter(e => e.innerText.trim().startsWith(${JSON.stringify(text)})).pop(); if (!el) return false; el.click(); return true })()`)
  const inCard = text => br.evalJs(`(() => { const card = document.querySelector('section[data-milestone]'); const el = card && [...card.querySelectorAll('button')].find(b => b.innerText.trim().startsWith(${JSON.stringify(text)})); if (!el) return false; el.click(); return true })()`)
  const cardText = () => br.evalJs(`(document.querySelector('section[data-milestone]') || {}).innerText || ''`)

  try {
    // ---------- Milestones tab ----------
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}&tab=milestones`)
    await br.waitFor(has('No milestones yet'), 'milestones tab')
    await br.sleep(800)
    await clickLast('Add Milestone')
    await br.waitFor(has('Billing Amount'), 'milestone drawer')
    await br.sleep(700)
    await clickLast('Add Milestone')
    await br.waitFor(has('Please Enter Milestone Name'), 'name required')
    check('empty milestone form shows "Please Enter Milestone Name"', true)
    await br.setInput('#name', 'phase one delivery')
    await br.setInput('#due_date', shift(120))
    await clickLast('Add Milestone')
    await br.waitFor(has('Cannot be after the project ends'), 'due date rule')
    check('due date after the project end is stopped at the field', true)
    await br.setInput('#due_date', shift(20))
    await br.setInput('#amount', '50000')
    await clickLast('Add Milestone')
    await br.waitFor(`!!document.querySelector('section[data-milestone="Phase One Delivery"]')`, 'milestone card', 20000)
    check('milestone created (name capitalised, Planned, ₹50,000)', (await cardText()).includes('Planned') && (await cardText()).includes('50,000'))

    await br.evalJs(`(() => { const el = document.querySelector('section[data-milestone] input[type="text"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'design document'); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
    await br.sleep(200)
    await br.evalJs(`document.querySelector('section[data-milestone] input[type="text"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); true`)
    await br.waitFor(`(document.querySelector('section[data-milestone]') || {}).innerText.includes('Design document')`, 'deliverable')
    check('deliverable added from the card (Enter key)', true)

    // ---------- Task linked to the milestone ----------
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}&tab=tasks`)
    await br.waitFor(has('This project has no tasks yet'), 'tasks tab')
    await br.evalJs(`[...document.querySelectorAll('main button')].find(e => e.innerText.trim().startsWith('Add Task')).click()`)
    await br.waitFor(`[...document.querySelectorAll('#milestone_id option')].some(o => o.text.startsWith('Phase One Delivery'))`, 'milestone options')
    const mOpt = await br.evalJs(`[...document.querySelectorAll('#milestone_id option')].find(o => o.text.startsWith('Phase One Delivery')).value`)
    await setSelect('#milestone_id', mOpt)
    await br.setInput('#title', 'build the first release')
    await clickLast('Submit')
    await br.waitFor(all(has('Build the first release'), `!document.body.innerText.includes('Add work to a project')`), 'task created', 20000)
    const task = (await api('GET', `/tasks/list?project_id=${project.id}&page_size=5`)).detail[0]
    check('task created with the milestone picked in the task form', task.milestone_name === 'Phase One Delivery', task.milestone_name)

    // ---------- Workflow ----------
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}&tab=milestones`)
    await br.waitFor(`!!document.querySelector('section[data-milestone]')`, 'card again')
    await br.sleep(800)
    await inCard('Start Work')
    await br.waitFor(`(document.querySelector('section[data-milestone]') || {}).innerText.includes('In Progress')`, 'in progress')
    await inCard('Send for Review')
    await br.waitFor(has('Finish 1 task and 1 deliverable first'), 'review blocked')
    check('review is refused while a task and a deliverable are open', true)

    await api('POST', `/tasks/${task.id}/status`, { status: 'Done' })
    await br.evalJs(`document.querySelector('section[data-milestone] input[type="checkbox"]').click(); true`)
    await br.sleep(1200)
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}&tab=milestones`)
    await br.waitFor(`(document.querySelector('section[data-milestone]') || {}).innerText.includes('100%')`, '100 percent')
    await inCard('Send for Review')
    await br.waitFor(`(document.querySelector('section[data-milestone]') || {}).innerText.includes('Ready for Review')`, 'ready')
    check('with its task done and deliverable ticked: 100% and Ready for Review', true)

    await inCard('Request Changes')
    await br.waitFor(has('Request changes?'), 'feedback dialog')
    await clickLast('Send Feedback')
    await br.waitFor(has('Please Enter Feedback'), 'feedback required')
    check('Request Changes needs feedback', true)
    await br.setInput('#milestone_feedback', 'add the export button')
    await clickLast('Send Feedback')
    await br.waitFor(`(document.querySelector('section[data-milestone]') || {}).innerText.includes('Client feedback: Add the export button')`, 'changes requested')
    check('Changes Requested shows the client feedback on the card', true)
    await inCard('Resume Work')
    await br.waitFor(`(document.querySelector('section[data-milestone]') || {}).innerText.includes('Send for Review')`, 'resumed')
    await inCard('Send for Review')
    await br.waitFor(`(document.querySelector('section[data-milestone]') || {}).innerText.includes('Accept')`, 'accept button')
    await inCard('Accept')
    await br.waitFor(`(document.querySelector('section[data-milestone]') || {}).innerText.includes('Create Invoice')`, 'accepted')
    check('Accepted: card offers "Create Invoice"', (await cardText()).includes('Accepted'))

    // ---------- Invoice ----------
    await inCard('Create Invoice')
    await br.waitFor(all(has('What to Bill'), has('Acme Retail')), 'invoice drawer')
    await br.waitFor(`document.querySelector('#milestone_id') && document.querySelector('#milestone_id').value !== ''`, 'milestone prefilled')
    await br.waitFor(has('₹59,000'), 'preview total')
    check('Create Invoice: client, milestone and total ₹59,000 (18% GST) pre-filled', true)
    await clickLast('Create Draft')
    await br.waitFor(`(document.querySelector('section[data-milestone]') || {}).innerText.includes('INV-')`, 'invoice chip', 20000)
    const invoiceNo = (await cardText()).match(/INV-\d{4}-\d{4}/)[0]
    check('invoice created as Draft and shown on the milestone', (await cardText()).includes('Draft'))

    await br.goto(`${ROOT}/billing/`)
    await br.waitFor(has(invoiceNo), 'billing list')
    await br.evalJs(`[...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes(${JSON.stringify(invoiceNo)})).click()`)
    await br.waitFor(all(has('INVOICE'), has('Milestone: Phase One Delivery')), 'invoice dialog')
    await clickLast('Issue')
    await br.waitFor(has('Issue this invoice?'), 'issue confirm')
    await br.evalJs(`[...document.querySelectorAll('[role="dialog"] button')].filter(b => b.innerText.trim() === 'Issue').pop().click()`)
    await br.waitFor(has('Mark Paid'), 'issued')
    check('invoice issued (issue date set, "Mark Paid" offered)', true)
    await clickLast('Mark Paid')
    await br.waitFor(`!!document.querySelector('#paid_date')`, 'paid date')
    await clickLast('Confirm Payment')
    await br.waitFor(has('Paid on'), 'paid')
    check('invoice marked Paid', true)
    await br.shot(`${SHOTS}/pms_invoice.png`)
    await clickLast('Close')

    // ---------- Budget + overview ----------
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}&tab=budget`)
    await br.waitFor(all(has('Billed'), has('₹50,000')), 'budget billed')
    check('Budget tab: Billed ₹50,000, Collected, Margin', (await br.text()).includes('Collected') && (await br.text()).includes('Margin'))

    await br.goto(`${ROOT}/deliverables/`)
    await br.waitFor(has('Phase One Delivery'), 'overview')
    const row = await br.evalJs(`[...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes('Phase One Delivery')).innerText`)
    check('Milestones & Deliverables lists it as Accepted with its invoice', row.includes('Accepted') && row.includes(invoiceNo), row)
  } catch (e) {
    console.log('FAILED:', e.message)
    try {
      await br.shot(`${SHOTS}/pms_milestones_failure.png`)
    } catch (x) {}
    process.exitCode = 1
  } finally {
    await br.close()
    for (const t of (await api('GET', `/tasks/list?project_id=${project.id}&page_size=50`)).detail || []) await api('DELETE', `/tasks/${t.id}`)
    await api('DELETE', `/projects/${project.id}`)
    console.log(results.every(Boolean) && !process.exitCode ? `\nALL ${results.length} CHECKS PASSED` : `\n${results.filter(x => !x).length} FAILED or stopped early`)
  }
})()
