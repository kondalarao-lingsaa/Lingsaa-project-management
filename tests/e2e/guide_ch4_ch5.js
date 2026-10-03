// Walks chapters 4 (project rules) and 5 (milestone) of the Beginner Test Guide exactly as written, on a fresh
// project, and checks every "Now check" line. Run from frontend/:  node tests/e2e/guide_ch4_ch5.js  (cleans up)
const fs = require('fs')
const path = require('path')
const { launch } = require('./cdp')

const ROOT = `${process.env.PMS_APP || 'http://127.0.0.1:3000'}/appModules/projects`
const API = 'http://127.0.0.1:8000/api'
const TOKEN = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
const SHOTS = require('os').tmpdir()
const NAME = 'Store Front Guide Check'

const api = async (method, url, body) => (await fetch(API + url, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json()
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
  // Chapters 1-3 done quickly: Active client project, Dev User 50% at 1000, Qa Manager 10% at 1500.
  const project = (
    await api('POST', '/projects/create', {
      project_name: NAME, project_type: 'Time & Material', customer_name: 'Acme Retail', customer_contact_name: 'Ravi Kumar', customer_mobile: '9876543210',
      start_date: d(-14), end_date: d(42), budget: 100000, project_manager_name: 'Dev User', project_manager_id: 1
    })
  ).data
  for (const s of ['Pending Approval', 'Approved', 'Active']) await api('POST', `/projects/${project.id}/status`, { status: s })
  const pm = ((await api('GET', `/projects/${project.id}/members`)).detail || []).find(m => m.member_name === 'Dev User')
  if (pm) await api('PUT', `/projects/${project.id}/members/${pm.id}`, { member_name: 'Dev User', user_id: 1, role: pm.role, allocation_pct: 50, hourly_rate: 1000 })
  await api('POST', `/projects/${project.id}/members`, { member_name: 'Qa Manager', role: 'Team Lead', allocation_pct: 10, hourly_rate: 1500 })

  const br = await launch(path.join(SHOTS, 'chrome-guide45'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
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
    await br.sleep(1200)
    await br.evalJs(`['access_token','username','user_id','client_id'].forEach(k => localStorage.removeItem(k)); true`)

    // ---------------- Chapter 4: Set the project rules
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}`)
    await clickUntil(`[...document.querySelectorAll('main a')].find(a => a.innerText.trim() === 'Settings').click()`, `location.pathname.includes('projectSettings')`, 'Settings button')
    check('Ch4 step 1: "Settings" (top right of the project) opens Project Settings for this project', await br.evalJs(`location.search.includes('projectId=${project.id}')`))
    await br.waitFor(`!!document.querySelector('[data-project-settings]') && !!document.querySelector('#budget_alert_pct')`, 'settings form')
    await br.setInput('#default_task_priority', 'High')
    await br.setInput('#default_estimate_hours', '4')
    await br.setInput('#new_label', 'backend')
    await br.evalJs(`${btn('Add')}.click()`)
    await br.waitFor(`document.querySelector('[data-labels]').innerText.includes('backend')`, 'label chip')
    check('Ch4 step 2: priority High, estimate 4, label "backend" added as a chip', true)
    await br.setInput('#timesheet_lock_days', '7')
    await br.setInput('#budget_alert_pct', '60')
    await br.setInput('#receipt_required_above', '5000')
    check('Ch4 step 3: lock 7 days, alert 60%, receipt above 5000 entered', true)
    await br.evalJs(`${btn('Save Settings')}.click()`)
    await br.waitFor(has('Settings saved'), 'saved toast')
    const notes = await br.evalJs(`document.querySelector('[data-project-settings]').innerText`)
    check('Ch4 check 1: "Settings saved" and a note under each field explaining its effect',
      notes.includes('dated more than 7 days ago') && notes.includes('"At risk" at 60%') && notes.includes('above ₹5,000 need a bill attached'), notes.slice(0, 400))
    await br.shot(`${SHOTS}/guide_ch4.png`)
    const saved = (await api('GET', `/projects/${project.id}/settings`)).detail
    check('Ch4: the server stored the rules', saved.default_task_priority === 'High' && saved.default_estimate_hours === 4 && saved.task_labels.join() === 'backend' && saved.timesheet_lock_days === 7 && saved.budget_alert_pct === 60 && saved.receipt_required_above === 5000, JSON.stringify(saved))

    // Ch4 check 2 (later, in chapter 6): the New Task form uses the rules.
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}&tab=tasks`)
    await clickUntil(`${btn('Add Task')}.click()`, `!!document.querySelector('#priority')`, 'task drawer')
    await br.waitFor(`document.querySelector('#priority').value === 'High' && document.querySelector('#estimated_hours').value === '4' && !!document.querySelector('[data-label-suggestions]')`, 'task defaults')
    check('Ch4 check 2: New Task starts with priority High, estimate 4 and offers "+ backend"', await br.evalJs(`document.querySelector('[data-label-suggestions]').innerText.includes('backend')`))
    await br.evalJs(`${btn('Close')}.click()`)
    await br.sleep(500)

    // ---------------- Chapter 5: Add a milestone
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}&tab=milestones`)
    await clickUntil(`${btn('Add Milestone')}.click()`, `!!document.querySelector('#name') && !!document.querySelector('#due_date')`, 'milestone drawer')
    await br.setInput('#name', 'store front live')
    await br.setInput('#due_date', d(10))
    await br.setInput('#amount', '40000')
    await br.evalJs(`[...document.querySelectorAll('button')].filter(b => b.innerText.trim() === 'Add Milestone').pop().click()`)
    await br.waitFor(`!document.querySelector('#due_date')`, 'drawer closed')
    const ms = ((await api('GET', `/projects/${project.id}/milestones`)).detail || [])[0]
    check('Ch5 step 2: milestone saved (name capitalised "Store Front Live", due in 10 days, ₹40,000, Planned)', ms && ms.name === 'Store Front Live' && ms.due_date === d(10) && ms.amount === 40000 && ms.status === 'Planned', JSON.stringify(ms))

    await br.goto(`${ROOT}/deliverables/`)
    await br.waitFor(has('Store Front Live'), 'milestones page')
    check('Ch5 check 1: Milestones & Deliverables lists it as Planned', await br.evalJs(`[...document.querySelectorAll('tr, section, li, div')].some(e => e.children.length < 40 && e.innerText.includes('Store Front Live') && e.innerText.includes('Planned'))`))

    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}&tab=planning`)
    await br.waitFor(`!![...document.querySelectorAll('[title]')].find(e => e.title.startsWith('Store Front Live'))`, 'gantt diamond')
    check('Ch5 check 2: Planning tab shows a diamond for Store Front Live', true)
    await br.shot(`${SHOTS}/guide_ch5_planning.png`)

    await br.goto(`${ROOT}/tasks/calendar/?projectId=${project.id}`)
    await br.waitFor(`!!document.querySelector('[data-day]')`, 'calendar')
    for (let i = 0; i < 2 && !(await br.evalJs(`!!document.querySelector('[data-day="${d(10)}"]')`)); i++) {
      await br.evalJs(`document.querySelector('[aria-label="Next"]').click()`)
      await br.sleep(1200)
    }
    await br.waitFor(`(document.querySelector('[data-day="${d(10)}"]') || {}).innerText?.includes('Store Front Live')`, 'calendar chip')
    check('Ch5 check 3: Task Calendar shows a violet "Store Front Live" chip on its due day', await br.evalJs(`!!document.querySelector('[data-day="${d(10)}"] .tc-ms')`))
    await br.shot(`${SHOTS}/guide_ch5_calendar.png`)

    await br.goto(`${ROOT}/dashboard/`)
    await br.waitFor(`[...document.querySelectorAll('main section')].some(s => s.innerText.includes('Milestones and Billing'))`, 'dashboard')
    await br.waitFor(`[...document.querySelectorAll('main section')].find(s => s.innerText.includes('Milestones and Billing')).innerText.includes('Store Front Live')`, 'dashboard milestone', 20000)
    check('Ch5 check 4: Dashboard lists it under Milestones and Billing', true)
  } catch (e) {
    console.log('FAILED:', e.message)
    try {
      await br.shot(`${SHOTS}/guide45_failure.png`)
    } catch (x) {}
    process.exitCode = 1
  } finally {
    await br.close()
    for (const t of (await api('GET', `/tasks/list?project_id=${project.id}&page_size=50`)).detail || []) await api('DELETE', `/tasks/${t.id}`)
    await api('DELETE', `/projects/${project.id}`)
    console.log(results.every(Boolean) && !process.exitCode ? `\nALL ${results.length} CHECKS PASSED` : `\n${results.filter(x => !x).length} FAILED or stopped early`)
  }
})()
