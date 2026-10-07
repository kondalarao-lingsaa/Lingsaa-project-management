// End-to-end check of Settings > Automation, Tasks > Recurring Tasks and the task form's assignee suggestions.
// Against the running app and API (:8000). The automation settings it changes are put back afterwards; the only
// job it runs is the weekly status report (it only sends notifications).
// Needs Google Chrome. Run from frontend/:  node tests/e2e/automation.js   (cleans up after itself)
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
const NAME = 'Automation E2e Check'

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
  for (const p of (await api('GET', `/projects/list?search=${encodeURIComponent(NAME)}&page_size=20`)).detail || [])
    if (p.project_name === NAME) await api('DELETE', `/projects/${p.id}`)
  const project = (
    await api('POST', '/projects/create', {
      project_name: NAME,
      project_type: 'Internal',
      start_date: d(-30),
      end_date: d(90),
      budget: 10000,
      project_manager_name: 'Priya Shah'
    })
  ).data
  for (const s of ['Pending Approval', 'Approved', 'Active'])
    await api('POST', `/projects/${project.id}/status`, { status: s })
  await api('POST', `/projects/${project.id}/members`, { member_name: 'Dev User', user_id: 1, role: 'Developer', allocation_pct: 0 })
  await api('POST', `/projects/${project.id}/members`, { member_name: 'Kiran Rao', role: 'Developer', allocation_pct: 30 })

  // Settings this test changes, to put back at the end.
  const before = Object.fromEntries((await api('GET', '/automation')).detail.jobs.map(j => [j.key, j]))

  const br = await launch(path.join(SHOTS, 'chrome-automation'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const btn = t => `[...document.querySelectorAll('button')].find(b => b.innerText.trim() === ${JSON.stringify(t)})`
  const row = key => `document.querySelector('[data-automation="${key}"]')`
  const clickUntil = async (clickJs, readyJs) => {
    for (let i = 0; i < 10 && !(await br.evalJs(readyJs)); i++) {
      await br.evalJs(clickJs)
      await br.sleep(700)
    }
    await br.waitFor(readyJs, 'opened')
  }

  try {
    // ---------- Settings > Automation ----------
    await br.goto(`${ROOT}/settings/automation/`)
    await br.waitFor(`document.querySelectorAll('[data-automation]').length === 14`, 'automation rows')
    check('Settings > Automation lists the 14 automations', true)
    check(
      'it is a tab of Settings, next to Company Settings and Users & Access',
      await br.evalJs(`[...document.querySelectorAll('[data-screen-tab]')].map(t => t.innerText).join('|') === 'Company Settings|Users & Access|Automation'`)
    )
    check('the four groups are shown', await br.evalJs(`${has('Reminders')} && ${has('Reports & alerts')} && ${has('Billing')} && ${has('Work')}`))

    // Switch the weekly report off, then on again.
    await br.evalJs(`${row('weekly_status_report')}.querySelector('[role="switch"]').click()`)
    await br.waitFor(`${row('weekly_status_report')}.querySelector('[role="switch"]').getAttribute('aria-checked') === 'false'`, 'switched off')
    await br.waitFor(`${row('weekly_status_report')}.innerText.includes('switched off')`, 'off text')
    check('switching an automation off saves at once ("Next run: switched off")', (await api('GET', '/automation')).detail.jobs.find(j => j.key === 'weekly_status_report').enabled === false)
    await br.evalJs(`${row('weekly_status_report')}.querySelector('[role="switch"]').click()`)
    await br.waitFor(`${row('weekly_status_report')}.querySelector('[role="switch"]').getAttribute('aria-checked') === 'true'`, 'switched on')

    // Change the task reminder's time and days, with a bad value first.
    await br.setInput('#task_reminders_escalate_after_days', '0')
    await br.waitFor(`!!${row('task_reminders')}.querySelector('button') && [...${row('task_reminders')}.querySelectorAll('button')].some(b => b.innerText.includes('Save'))`, 'save button')
    await br.evalJs(`[...${row('task_reminders')}.querySelectorAll('button')].find(b => b.innerText.includes('Save')).click()`)
    await br.waitFor(`${row('task_reminders')}.innerText.includes('Enter 1 to 60')`, 'range error')
    check('0 days is refused at the field (Enter 1 to 60)', true)
    await br.setInput('#task_reminders_escalate_after_days', '5')
    await br.setInput('#task_reminders_run_time', '10:30')
    await br.evalJs(`[...${row('task_reminders')}.querySelectorAll('button')].find(b => b.innerText.includes('Save')).click()`)
    await br.waitFor(has('Task due and overdue reminders is on: Every working day at 10:30'), 'saved toast')
    const tr = (await api('GET', '/automation')).detail.jobs.find(j => j.key === 'task_reminders')
    check('time 10:30 and escalation after 5 days saved on the server', tr.run_time === '10:30' && tr.params.escalate_after_days === 5, JSON.stringify(tr))

    // Run the weekly report now.
    await br.evalJs(`[...${row('weekly_status_report')}.querySelectorAll('button')].find(b => b.innerText.includes('Run now')).click()`)
    await br.waitFor(has('It does now exactly what it does at its scheduled time'), 'confirm dialog')
    await br.evalJs(`[...document.querySelectorAll('[role="dialog"] button')].find(b => b.innerText.trim() === 'Run now').click()`)
    await br.waitFor(has('Weekly project status report: Status of'), 'run toast', 60000)
    check('Run now runs the weekly report and says what it did', true)
    await br.waitFor(`document.querySelector('[data-automation-runs] tbody').innerText.includes('Weekly project status report')`, 'run history')
    check('the run appears in Run History', true)
    await br.shot(path.join(SHOTS, 'pms-automation-settings.png'))

    // ---------- Tasks > Recurring Tasks ----------
    await br.goto(`${ROOT}/tasks/recurring/?projectId=${project.id}`)
    await br.waitFor(`document.querySelector('#planning_project') && document.querySelector('#planning_project').value === '${project.id}'`, 'recurring page')
    await br.waitFor(has('No recurring tasks yet'), 'empty list')
    check('Recurring Tasks opens with a clear empty state', true)
    await clickUntil(`${btn('New Recurring Task')}.click()`, `!!document.querySelector('#rt_title')`)
    await br.waitFor(`document.querySelector('#rt_project_id').value === '${project.id}'`, 'project preset')
    await br.evalJs(`${btn('Save')}.click()`)
    await br.waitFor(has('Please Enter the Task Name (at least 3 characters)'), 'title error')
    check('saving without a name is refused at the field', true)
    await br.setInput('#rt_title', 'weekly client call')
    await br.waitFor(`document.querySelector('#rt_title').value === 'Weekly client call'`, 'capitalised')
    await br.evalJs(`document.querySelector('[data-frequency="Weekly"]').click()`)
    await br.setInput('#rt_weekday', '2')
    await br.setInput('#rt_due_in_days', '1')
    await br.waitFor(`document.querySelector('[data-recurring-preview]').innerText.includes('every Wednesday') && document.querySelector('[data-recurring-preview]').innerText.includes('due 1 day later')`, 'preview')
    check('the sentence under the form explains the schedule (every Wednesday, due 1 day later)', true)
    await br.waitFor(`!!document.querySelector('#rt_assignee_name option') && [...document.querySelectorAll('#rt_assignee_name option')].some(o => o.innerText.startsWith('Kiran Rao'))`, 'team')
    const kiran = await br.evalJs(`[...document.querySelectorAll('#rt_assignee_name option')].find(o => o.innerText.startsWith('Kiran Rao')).value`)
    await br.setInput('#rt_assignee_name', kiran)
    await br.evalJs(`${btn('Save')}.click()`)
    await br.waitFor(`!!document.querySelector('[data-recurring="Weekly client call"]')`, 'row', 20000)
    const rowText = await br.evalJs(`document.querySelector('[data-recurring="Weekly client call"]').innerText`)
    check('saved: listed with "Every Wednesday", Kiran Rao, Active', rowText.includes('Every Wednesday') && rowText.includes('Kiran Rao') && rowText.includes('Active'), rowText)

    await br.evalJs(`document.querySelector('[data-recurring="Weekly client call"] button[aria-label^="Pause"]').click()`)
    await br.waitFor(`document.querySelector('[data-recurring="Weekly client call"]').innerText.includes('Paused')`, 'paused')
    check('Pause stops it (status Paused, no next task)', true)
    await br.evalJs(`document.querySelector('[data-recurring="Weekly client call"] button[aria-label^="Resume"]').click()`)
    await br.waitFor(`document.querySelector('[data-recurring="Weekly client call"]').innerText.includes('Active')`, 'resumed')
    await br.evalJs(`document.querySelector('[data-recurring="Weekly client call"] button[aria-label^="Delete"]').click()`)
    await br.waitFor(has('Stop repeating this task?'), 'delete dialog')
    await br.evalJs(`[...document.querySelectorAll('[role="dialog"] button')].find(b => b.innerText.trim() === 'Delete').click()`)
    await br.waitFor(`!document.querySelector('[data-recurring="Weekly client call"]')`, 'deleted')
    check('Delete removes the schedule', true)

    // ---------- Task form: assignee suggestions ----------
    await br.goto(`${ROOT}/tasks/allTasks/`)
    await br.waitFor(has('Add Task'), 'tasks page')
    await clickUntil(`${btn('Add Task')}.click()`, `!!document.querySelector('#project_id')`)
    await br.waitFor(`!!document.querySelector('#project_id option[value="${project.id}"]')`, 'project option')
    await br.setInput('#project_id', String(project.id))
    await br.setInput('#due_date', d(10))
    await br.waitFor(`!!document.querySelector('[data-assignee-suggestions]')`, 'suggestions', 20000)
    const chips = await br.evalJs(`document.querySelector('[data-assignee-suggestions]').innerText`)
    check('the task form suggests who has free time (Kiran Rao, 30% on this project)', chips.includes('Kiran Rao') && chips.includes('h free'), chips)
    await br.evalJs(`[...document.querySelectorAll('[data-assignee-suggestions] button')].find(b => b.innerText.startsWith('Kiran Rao')).click()`)
    await br.waitFor(`document.querySelector('#assignee_name').selectedOptions[0].innerText.startsWith('Kiran Rao')`, 'assignee picked')
    check('clicking a suggestion sets the assignee', true)
    await br.evalJs(`${btn('Close')}.click()`)

    const problems = br.problems().filter(p => !/favicon|Download the React DevTools/.test(p.text) && p.kind !== 'console.warning')
    check('no console errors or failed requests', problems.length === 0, JSON.stringify(problems.slice(0, 5)))
  } catch (e) {
    check('test ran to the end', false, e.message)
    await br.shot(path.join(SHOTS, 'pms-automation-error.png'))
  } finally {
    await br.close()
    for (const key of ['task_reminders', 'weekly_status_report']) {
      const j = before[key]
      await api('PUT', `/automation/${key}`, { enabled: j.enabled, run_time: j.run_time, params: j.params })
    }
    await api('DELETE', `/projects/${project.id}`)
  }
  const failed = results.filter(r => !r).length
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED')
  process.exit(failed ? 1 : 0)
})()
