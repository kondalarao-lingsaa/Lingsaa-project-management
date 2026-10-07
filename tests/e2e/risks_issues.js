// End-to-end check of Risks -> Issues -> fix Task -> Change Requests (+ dashboard) against the running app
// (http://127.0.0.1:3000) and API (:8000). Needs Google Chrome. Approving a change needs a second person, so a
// user-2 manager token is minted with the backend's own settings.
// Run from frontend/:  node tests/e2e/risks_issues.js   (creates and then deletes its own test data)
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
const NAME = 'Risk E2e Check'

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
  const project = (
    await api('POST', '/projects/create', {
      project_name: NAME, project_type: 'Fixed Price', customer_name: 'Acme Retail', customer_contact_name: 'Ravi Kumar', customer_mobile: '9876543210',
      start_date: shift(-5), end_date: shift(120), budget: 100000, project_manager_name: 'Qa Manager'
    })
  ).data
  for (const status of ['Pending Approval', 'Approved', 'Active']) await api('POST', `/projects/${project.id}/status`, { status })
  await api('POST', `/projects/${project.id}/members`, { member_name: 'Anita Rao', role: 'Developer', allocation_pct: 0 }) // 0%: demo projects may already book all of Anita's time

  const br = await launch(path.join(SHOTS, 'chrome-risks'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const all = (...e) => e.join(' && ')
  const setSelect = (selector, value) =>
    br.evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  const clickLast = text => br.evalJs(`(() => { const el = [...document.querySelectorAll('button')].filter(e => e.innerText.trim().startsWith(${JSON.stringify(text)})).pop(); if (!el) return false; el.click(); return true })()`)
  const rowMenu = (text, item) =>
    br.evalJs(`(async () => {
      const tr = [...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes(${JSON.stringify(text)}))
      tr.querySelector('td:last-child svg').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise(r => setTimeout(r, 400))
      const li = [...document.querySelectorAll('[role="menuitem"]')].find(m => m.innerText.trim() === ${JSON.stringify(item)})
      if (!li) return false
      li.click()
      return true
    })()`)
  const rowText = text => br.evalJs(`(() => { const tr = [...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes(${JSON.stringify(text)})); return tr ? tr.innerText : '' })()`)
  const openTab = async view => {
    await br.evalJs(`[...document.querySelectorAll('main button')].find(b => b.innerText.trim() === ${JSON.stringify(view)}).click()`)
    await br.sleep(800)
  }

  try {
    // ---------- Risks ----------
    // Start as the dev login even if an earlier run stopped while acting as the manager.
    await br.goto(`${ROOT}/dashboard/`)
    await br.waitFor(has('Dashboard'), 'app')
    await br.evalJs(`localStorage.removeItem('access_token'); localStorage.removeItem('user_id'); localStorage.removeItem('username'); true`)
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}&tab=risks`)
    await br.waitFor(has('No risks yet'), 'risks tab')
    await br.sleep(700)
    await clickLast('Add Risk')
    await br.waitFor(has('Response Plan'), 'risk drawer')
    await br.sleep(700)
    await br.setInput('#title', 'vendor api may be late')
    await setSelect('#category', 'External')
    await setSelect('#probability', 4)
    await setSelect('#impact', 5)
    await br.waitFor(has('High · score 20'), 'live score')
    check('risk form shows the live level and score (High · score 20)', true)
    await clickLast('Add Risk')
    await br.waitFor(has('required for High risks'), 'mitigation required')
    check('a High risk cannot be saved without a mitigation plan', true)
    await br.setInput('#mitigation', 'weekly check-in with the vendor')
    const anita = await br.evalJs(`[...document.querySelectorAll('#owner_member_id option')].find(o => o.text.startsWith('Anita Rao')).value`)
    await setSelect('#owner_member_id', anita)
    await clickLast('Add Risk')
    await br.waitFor(all(has('Vendor api may be late'), `!document.body.innerText.includes('Response Plan')`), 'risk saved', 20000)
    await br.sleep(800)
    const riskRow = await rowText('Vendor api may be late')
    check('risk in the register: High 20, owner Anita Rao, key -R1', riskRow.includes('High 20') && riskRow.includes('Anita Rao') && riskRow.includes(`${project.project_code}-R1`), riskRow)
    check('heat map counts it (probability 4 x impact 5)', (await br.evalJs(`[...document.querySelectorAll('[title="Probability 4 x impact 5 = 20"]')][0].innerText.trim()`)) === '1')

    await rowMenu('Vendor api may be late', 'It Happened')
    await br.waitFor(has('Did this risk happen?'), 'occurred confirm')
    await clickLast('Yes, raise an issue')
    await br.waitFor(`(${JSON.stringify('')} , document.body.innerText.includes('Occurred'))`, 'occurred')
    check('"It Happened" marks the risk Occurred', (await rowText('Vendor api may be late')).includes('Occurred'))

    // ---------- Issues ----------
    await openTab('Issues')
    await br.waitFor(has(`${project.project_code}-I1`), 'issue raised')
    const issueRow = await rowText(`${project.project_code}-I1`)
    check('issue -I1 raised from the risk (High, owner Anita Rao)', issueRow.includes('High') && issueRow.includes('Anita Rao') && issueRow.includes('From risk'), issueRow)
    await br.evalJs(`[...document.querySelectorAll('tbody button')].find(b => b.innerText.includes('Create Fix Task')).click()`)
    await br.waitFor(`(document.querySelector('tbody tr') || {}).innerText.includes('To Do')`, 'fix task', 20000)
    const fix = (await api('GET', `/tasks/list?project_id=${project.id}&page_size=5`)).detail[0]
    check('"Create Fix Task" puts a Bug on the board for Anita (issue now In Progress)', fix.title.startsWith('Fix: ') && fix.assignee_name === 'Anita Rao' && (await rowText('-I1')).includes('In Progress'), fix.title)
    await rowMenu('-I1', 'Resolve')
    await br.waitFor(has('Resolve issue?'), 'resolve dialog')
    await clickLast('Resolve')
    await br.waitFor(has('Please Enter Resolution'), 'resolution required')
    check('resolving asks for a resolution', true)
    await br.setInput('#dialog_text', 'switched to the vendor sandbox api')
    await clickLast('Resolve')
    await br.waitFor(has('Finish the task first'), 'fix open')
    check('cannot resolve while the fix task is still open', true)
    await clickLast('Cancel')
    await api('POST', `/tasks/${fix.id}/status`, { status: 'Done' })
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}&tab=risks`)
    await br.waitFor(has('Vendor api may be late'), 'reload')
    await openTab('Issues')
    await br.waitFor(has('-I1'), 'issues again')
    await rowMenu('-I1', 'Resolve')
    await br.waitFor(has('Resolve issue?'), 'resolve dialog 2')
    await br.setInput('#dialog_text', 'switched to the vendor sandbox api')
    await clickLast('Resolve')
    await br.waitFor(`(document.querySelector('tbody tr') || {}).innerText.includes('Resolved')`, 'resolved')
    check('resolved once the fix task is Done (resolution shown)', (await rowText('-I1')).includes('Fixed: Switched to the vendor sandbox api'))

    // ---------- Change requests ----------
    await openTab('Change Requests')
    await br.waitFor(has('No change requests'), 'changes tab')
    await clickLast('New Change Request')
    await br.waitFor(has('Add the cost to'), 'change drawer')
    await br.sleep(700)
    await br.setInput('#title', 'add excel export')
    await setSelect('#change_type', 'Cost')
    await clickLast('Submit Change')
    await br.waitFor(all(has('Please Enter the Reason'), has('A Cost change needs a cost impact')), 'change errors')
    check('change form: reason and cost impact required for a Cost change', true)
    await br.setInput('#reason', 'client asked for excel export of every report')
    await br.setInput('#cost_impact', '15000')
    await br.setInput('#days_impact', '10')
    await br.waitFor(all(has('increases by ₹15,000'), has('End date moves later by 10 days')), 'impact preview')
    check('impact preview: budget +₹15,000 (₹1,00,000 → ₹1,15,000), end date +10 days', (await br.text()).includes('₹1,15,000'))
    await clickLast('Submit Change')
    await br.waitFor(all(has(`${project.project_code}-CR1`), `!document.body.innerText.includes('Add the cost to')`), 'change submitted', 20000)
    await br.sleep(700)
    // The requester's row menu has no Approve at all (only Withdraw); the backend refuses it too.
    const ownApprove = await rowMenu('-CR1', 'Approve')
    const ownWithdraw = await br.evalJs(`[...document.querySelectorAll('[role="menuitem"]')].some(m => m.innerText.trim() === 'Withdraw')`)
    check('the requester cannot approve their own change (menu offers only Withdraw)', ownApprove === false && ownWithdraw)
    await br.evalJs(`document.querySelector('.MuiBackdrop-root') && document.querySelector('.MuiBackdrop-root').click(); true`)
    await br.sleep(300)

    await br.evalJs(`localStorage.setItem('access_token', ${JSON.stringify(MANAGER_TOKEN)}); localStorage.setItem('user_id', '2'); localStorage.setItem('username', 'qa.manager'); true`)
    await br.goto(`${ROOT}/risks/changeRequests/`)
    await br.waitFor(has(`${project.project_code}-CR1`), 'portfolio changes')
    await rowMenu('-CR1', 'Approve')
    await br.waitFor(has('Approve change?'), 'approve dialog 2')
    await br.setInput('#dialog_text', 'agreed on the call')
    await clickLast('Approve')
    await br.waitFor(`(${JSON.stringify('')}, [...document.querySelectorAll('tbody tr')].some(r => r.innerText.includes('-CR1') && r.innerText.includes('Approved')))`, 'approved')
    await br.evalJs(`localStorage.removeItem('access_token'); localStorage.removeItem('user_id'); localStorage.removeItem('username'); true`)
    const p = (await api('GET', `/projects/${project.id}`)).detail
    check('another manager approves: budget 1,15,000 and end date +10 days applied', p.budget === 115000 && p.end_date === shift(130), `${p.budget} ${p.end_date}`)

    // ---------- Dashboard ----------
    await api('POST', `/projects/${project.id}/risks`, { title: 'Key developer may leave', category: 'Resource', probability: 3, impact: 5, mitigation: 'pair programming and documentation' })
    await br.goto(`${ROOT}/dashboard/`)
    await br.waitFor(`[...document.querySelectorAll('#dashboard_project option')].some(o => o.value === '${project.id}')`, 'dashboard')
    await setSelect('#dashboard_project', project.id)
    await br.waitFor(has('Key developer may leave'), 'dashboard risk', 20000)
    const text = await br.text()
    check('dashboard: Risks card lists the open High risk and the project shows "At Risk – 1 high risk open"', text.includes('1 high risk open') && text.includes('Risks and Issues'))
    await br.shot(`${SHOTS}/pms_risks_dashboard.png`)
  } catch (e) {
    console.log('FAILED:', e.message)
    try {
      await br.shot(`${SHOTS}/pms_risks_failure.png`)
    } catch (x) {}
    process.exitCode = 1
  } finally {
    try {
      await br.evalJs(`localStorage.removeItem('access_token'); localStorage.removeItem('user_id'); localStorage.removeItem('username'); true`)
    } catch (x) {}
    await br.close()
    for (const t of (await api('GET', `/tasks/list?project_id=${project.id}&page_size=50`)).detail || []) await api('DELETE', `/tasks/${t.id}`)
    await api('DELETE', `/projects/${project.id}`)
    console.log(results.every(Boolean) && !process.exitCode ? `\nALL ${results.length} CHECKS PASSED` : `\n${results.filter(x => !x).length} FAILED or stopped early`)
  }
})()
