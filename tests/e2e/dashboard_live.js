// End-to-end check of the live Dashboard against the running app (http://127.0.0.1:3000) and API (:8000).
// Needs Google Chrome. Run from frontend/:  node tests/e2e/dashboard_live.js   (creates and then deletes its own test data)
const fs = require('fs')
const path = require('path')
const { launch } = require('./cdp')

const ROOT = `${process.env.PMS_APP || 'http://127.0.0.1:3000'}/appModules/projects`
const API = 'http://127.0.0.1:8000/api'
const TOKEN = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
const SHOTS = require('os').tmpdir()
const NAME = 'Dashboard E2e Check'

const api = async (method, url, body) => {
  const r = await fetch(API + url, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })

  return r.json()
}
const shift = days => {
  const d = new Date()
  d.setDate(d.getDate() + days)

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

;(async () => {
  const results = []
  const check = (name, ok, extra = '') => {
    results.push(ok)
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  [${extra}]`))
  }

  for (const p of (await api('GET', `/projects/list?search=${encodeURIComponent(NAME)}&page_size=20`)).detail || []) if (p.project_name === NAME) await api('DELETE', `/projects/${p.id}`)
  // 10% of the time used, nothing done yet, one task already overdue -> the dashboard must flag it.
  const project = (
    await api('POST', '/projects/create', {
      project_name: NAME, project_type: 'Fixed Price', customer_name: 'Acme Retail', customer_contact_name: 'Ravi Kumar', customer_mobile: '9876543210',
      start_date: shift(-10), end_date: shift(90), budget: 100000, project_manager_name: 'Qa Manager'
    })
  ).data
  for (const status of ['Pending Approval', 'Approved', 'Active']) await api('POST', `/projects/${project.id}/status`, { status })
  const late = (await api('POST', '/tasks/create', { project_id: project.id, title: 'Overdue dashboard task', due_date: shift(-3), start_date: shift(-8), priority: 'High' })).data
  await api('POST', '/tasks/create', { project_id: project.id, title: 'Open dashboard task' })
  await api('POST', `/projects/${project.id}/milestones`, { name: 'Dashboard Milestone', due_date: shift(30), amount: 20000 })

  const br = await launch(path.join(SHOTS, 'chrome-dashboard'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const all = (...e) => e.join(' && ')
  const card = label => br.evalJs(`(() => { const el = [...document.querySelectorAll('main span')].find(s => s.innerText.trim() === ${JSON.stringify(label)}); return el ? el.parentElement.innerText : '' })()`)
  const pick = value => br.evalJs(`(() => { const el = document.querySelector('#dashboard_project'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)

  try {
    await br.goto(`${ROOT}/dashboard/`)
    await br.waitFor(all(has('Live'), has('Active Projects')), 'dashboard')
    check('dashboard loads live data (Live badge, no "Sample data")', !(await br.text()).includes('Sample data'))
    const options = await br.evalJs(`document.querySelectorAll('#dashboard_project option').length - 1`)
    check('project filter lists every project', (await br.text()).includes(`All projects (${options})`), options)

    await br.waitFor(`[...document.querySelectorAll('#dashboard_project option')].some(o => o.value === '${project.id}')`, 'test project option')
    await pick(project.id)
    await br.waitFor(all(has('Overdue dashboard task'), has('Dashboard Milestone')), 'filtered to project', 20000)
    await br.sleep(800)
    check('filtered: Active Projects = 1 of 1', (await card('Active Projects')).includes('of 1 total'))
    check('filtered: Delayed Tasks = 1 and the overdue task is listed', (await card('Delayed Tasks')).includes('1') && (await br.text()).includes('3 days'))
    const progressCard = await br.evalJs(`[...document.querySelectorAll('main section')].find(s => s.innerText.includes('Project Progress')).innerText`)
    check('project health is flagged (behind schedule), with the reason', progressCard.includes('At Risk') && progressCard.includes('0% done with 10% of the time used'), progressCard.slice(0, 300))
    check('milestone shown with its billing state ("Not due")', (await br.evalJs(`[...document.querySelectorAll('main section')].find(s => s.innerText.includes('Milestones and Billing')).innerText`)).includes('Not due'))
    check('budget card shows the project budget (₹1,00,000)', (await br.text()).includes('₹1,00,000'))

    // A change elsewhere shows up after a refresh: finish the overdue task.
    await api('POST', `/tasks/${late.id}/status`, { status: 'Done' })
    await br.evalJs(`document.querySelector('[aria-label="Refresh dashboard"]').click(); true`)
    // (The task still appears in Recent Activity - "moved ... to Done" - so only the Delayed Tasks card is checked.)
    await br.waitFor(`[...document.querySelectorAll('main section')].find(s => s.innerText.startsWith('Delayed Tasks')).innerText.includes('Nothing is delayed')`, 'delayed task gone', 20000)
    await br.sleep(600)
    check('after finishing the task + Refresh: no delayed tasks, progress 50%', (await br.text()).includes('Nothing is delayed') && (await card('Overall Progress')).includes('50%'))
    await br.shot(`${SHOTS}/pms_dashboard_live.png`)

    await pick('')
    await br.waitFor(has(`of ${options} total`), 'all projects again', 20000)
    check('back to All projects', true)
  } catch (e) {
    console.log('FAILED:', e.message)
    try {
      await br.shot(`${SHOTS}/pms_dashboard_failure.png`)
    } catch (x) {}
    process.exitCode = 1
  } finally {
    await br.close()
    for (const t of (await api('GET', `/tasks/list?project_id=${project.id}&page_size=50`)).detail || []) await api('DELETE', `/tasks/${t.id}`)
    await api('DELETE', `/projects/${project.id}`)
    console.log(results.every(Boolean) && !process.exitCode ? `\nALL ${results.length} CHECKS PASSED` : `\n${results.filter(x => !x).length} FAILED or stopped early`)
  }
})()
