// End-to-end check of Project Team + Resources against the running app (http://127.0.0.1:3000) and API (:8000).
// Needs Google Chrome. Run from frontend/:  node tests/e2e/team_resources.js   (creates and then deletes its own test data)
const fs = require('fs')
const path = require('path')
const { launch } = require('./cdp')

const ROOT = `${process.env.PMS_APP || 'http://127.0.0.1:3000'}/appModules/projects`
const API = 'http://127.0.0.1:8000/api'
const TOKEN = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
const SHOTS = require('os').tmpdir()

const api = async (method, url, body) => {
  const r = await fetch(API + url, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })

  return r.json()
}

;(async () => {
  const results = []
  const check = (name, ok, extra = '') => {
    results.push(ok)
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  [${extra}]`))
  }

  const mk = async name => (await api('POST', '/projects/create', { project_name: name, project_type: 'Internal', start_date: '2026-10-01', project_manager_name: 'Qa Manager' })).data
  const p1 = await mk('Team E2e Alpha')
  const p2 = await mk('Team E2e Beta')
  await api('POST', `/projects/${p2.id}/members`, { member_name: 'Anita Rao', role: 'Tester / QA', allocation_pct: 30 })

  const br = await launch(path.join(SHOTS, 'chrome-team'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const all = (...e) => e.join(' && ')
  const no = e => `!(${e})`
  const setSelect = (selector, value) =>
    br.evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  const clickBtn = text => br.evalJs(`(() => { const el = [...document.querySelectorAll('button')].filter(e => e.innerText.trim().startsWith(${JSON.stringify(text)})).pop(); if (!el) return false; el.click(); return true })()`)
  const rowText = name => br.evalJs(`(() => { const tr = [...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes(${JSON.stringify(name)})); return tr ? tr.innerText : '' })()`)

  try {
    // ---------- Project Details > Team ----------
    await br.goto(`${ROOT}/projects/projectDetails/?id=${p1.id}&tab=team`)
    await br.waitFor(all(has('Qa Manager'), has('Planned Effort')), 'team tab')
    check('Team tab lists the project manager automatically ("Not planned")', (await rowText('Qa Manager')).includes('Not planned'))

    await clickBtn('Add Member')
    await br.waitFor(has('Add Team Member'), 'member drawer')
    await br.sleep(800)
    await clickBtn('Add Member')
    await br.waitFor(all(has('Please Enter Member Name'), has('Please Select Role'), has('Please Enter Allocation')), 'required errors')
    check('empty member form flags Member Name, Role and Allocation', true)

    await br.setInput('#member_name', 'anita rao')
    await setSelect('#role', 'Developer')
    await br.setInput('#allocation_pct', '80')
    await br.waitFor(has('30% used on'), 'other allocation hint')
    check('typing the name shows her time on other projects ("30% used ... 70% free")', (await br.text()).includes('70% free'))
    await clickBtn('Add Member')
    await br.waitFor(has('Only 70% of Anita Rao'), 'over allocation')
    check('allocating more than her free time is stopped at the field', true)
    await br.setInput('#allocation_pct', '60')
    await br.setInput('#hourly_rate', '800')
    await clickBtn('Add Member')
    await br.waitFor(all(no(has('Add Team Member')), has('Anita Rao')), 'member added', 20000)
    await br.sleep(800)
    check('member added: name capitalised, 60% and rate shown', (await rowText('Anita Rao')).includes('60%') && (await rowText('Anita Rao')).includes('800'))

    // ---------- Task form uses the team ----------
    await br.goto(`${ROOT}/projects/projectDetails/?id=${p1.id}&tab=tasks`)
    await br.waitFor(has('This project has no tasks yet'), 'tasks tab')
    await br.evalJs(`[...document.querySelectorAll('main button')].find(e => e.innerText.trim().startsWith('Add Task')).click()`)
    await br.waitFor(has('Add work to a project'), 'task drawer')
    await br.waitFor(`[...document.querySelectorAll('#assignee_name option')].some(o => o.text.startsWith('Anita Rao'))`, 'member options')
    const options = await br.evalJs(`[...document.querySelectorAll('#assignee_name option')].map(o => o.text)`)
    check('"Assign to" is a dropdown of the team (Qa Manager, Anita Rao)', options.some(o => o.startsWith('Qa Manager')) && options.some(o => o.startsWith('Anita Rao - Developer')), options)
    const anitaId = await br.evalJs(`[...document.querySelectorAll('#assignee_name option')].find(o => o.text.startsWith('Anita Rao')).value`)
    await setSelect('#assignee_name', anitaId)
    await br.setInput('#title', 'build the login screen')
    await clickBtn('Submit')
    await br.waitFor(all(has('Build the login screen'), no(has('Add work to a project'))), 'task created', 20000)
    check('task assigned to a team member', (await rowText('Build the login screen')).includes('Anita Rao'))

    await br.goto(`${ROOT}/projects/projectDetails/?id=${p1.id}&tab=team`)
    await br.waitFor(has('1 open'), 'member stats')
    check('Team tab shows her open task', (await rowText('Anita Rao')).includes('1 open'))

    await br.evalJs(`(() => { const tr = [...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes('Anita Rao')); tr.querySelector('td:last-child svg').dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })()`)
    await br.waitFor(has('Remove'), 'row menu')
    await br.clickText('li', 'Remove')
    await br.waitFor(has('Remove from team?'), 'confirm')
    await br.evalJs(`[...document.querySelectorAll('[role="dialog"] button')].find(b => b.innerText.trim() === 'Remove').click()`)
    await br.waitFor(has('still has 1 open task'), 'remove blocked')
    check('a member with open tasks cannot be removed ("Reassign it first")', true)
    await br.shot(`${SHOTS}/pms_team_tab.png`)

    // ---------- Resources ----------
    await br.goto(`${ROOT}/resources/team/`)
    await br.waitFor(has('Anita Rao'), 'resources team')
    await br.setInput('input[placeholder^="Search with Person"]', 'anita')
    await br.waitFor(all(has('90%'), no(has('Qa Manager'))), 'resources search')
    const r = await rowText('Anita Rao')
    check('Resources > Team: one person across 2 projects, 90% total, 10% free, "High"', r.includes('90%') && r.includes('10%') && r.includes('High') && r.includes(p1.project_code) && r.includes(p2.project_code), r)

    await br.goto(`${ROOT}/resources/allocation/`)
    await br.waitFor(has('Anita Rao'), 'allocation matrix')
    const m = await rowText('Anita Rao')
    check('Resources > Allocation grid: 60% + 30% = 90%', m.includes('60%') && m.includes('30%') && m.includes('90%'), m)
    await br.shot(`${SHOTS}/pms_allocation.png`)

    // ---------- My Tasks when I am not on the team ----------
    await br.goto(`${ROOT}/tasks/myTasks/`)
    await br.waitFor(has('Tasks assigned to you'), 'my tasks')
    await br.sleep(1500)
    await br.evalJs(`[...document.querySelectorAll('main button')].find(e => e.innerText.trim().startsWith('Add Task')).click()`)
    await br.waitFor(has('Add work to a project'), 'my drawer')
    await br.sleep(800)
    await setSelect('#project_id', p1.id)
    await br.waitFor(has("You are not in this project's team"), 'not a member notice')
    check('My Tasks: choosing a project where I am not a member clears "me" and explains why', (await br.evalJs(`document.querySelector('#assignee_name').value`)) === '')
  } catch (e) {
    console.log('FAILED:', e.message)
    try {
      await br.shot(`${SHOTS}/pms_team_failure.png`)
    } catch (x) {}
    process.exitCode = 1
  } finally {
    await br.close()
    const tasks = await api('GET', `/tasks/list?project_id=${p1.id}&page_size=50`)
    for (const t of tasks.detail || []) await api('DELETE', `/tasks/${t.id}`)
    await api('DELETE', `/projects/${p1.id}`)
    await api('DELETE', `/projects/${p2.id}`)
    console.log(results.every(Boolean) && !process.exitCode ? `\nALL ${results.length} CHECKS PASSED` : `\n${results.filter(x => !x).length} FAILED or stopped early`)
  }
})()
