// End-to-end check of Settings (working calendar + holidays, with field validation) and Project Templates
// (save a project as a template, start a new project from it, template editor validation) against the running
// app (:3000) and API (:8000). Needs Google Chrome. Run from frontend/:  node tests/e2e/settings_templates.js
// Creates and deletes its own test data and puts the company calendar back exactly as it was.
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
const SOURCE = 'Template Source E2e'
const NEWP = 'Started From Template E2e'
const TPL = 'Template Source E2e Template'
const MANUAL = 'Manual Plan E2e'

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
const nextMonday = (() => {
  const x = new Date()
  x.setDate(x.getDate() + ((8 - x.getDay()) % 7) || 7)

  return iso(x)
})()

;(async () => {
  const results = []
  const check = (name, ok, extra = '') => {
    results.push(ok)
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  [${extra}]`))
  }
  const cleanProjects = async () => {
    for (const n of [SOURCE, NEWP])
      for (const p of (await api('GET', `/projects/list?search=${encodeURIComponent(n)}&page_size=20`)).detail || [])
        if (p.project_name === n) {
          for (const t of (await api('GET', `/tasks/list?project_id=${p.id}&page_size=50`)).detail || [])
            await api('DELETE', `/tasks/${t.id}`)
          await api('DELETE', `/projects/${p.id}`)
        }
    for (const t of (await api('GET', '/templates?search=E2e')).detail || []) await api('DELETE', `/templates/${t.id}`)
  }
  await cleanProjects()

  const orig = (await api('GET', `/settings?year=${nextMonday.slice(0, 4)}`)).detail
  const clash = orig.holidays.find(h => h.holiday_date === nextMonday)
  if (clash) await api('DELETE', `/settings/holidays/${clash.id}`)
  await api('PUT', '/settings/calendar', { hours_per_day: 8, working_days: [0, 1, 2, 3, 4] })

  // A small finished-looking project to save as a template.
  const src = (
    await api('POST', '/projects/create', {
      project_name: SOURCE,
      project_type: 'Internal',
      start_date: d(0),
      end_date: d(29),
      budget: 1000,
      project_manager_name: 'Priya Shah'
    })
  ).data
  const m1 = (await api('POST', `/projects/${src.id}/milestones`, { name: 'Design Done', due_date: d(9) })).data
  await api('POST', `/projects/${src.id}/milestones`, { name: 'Launch', due_date: d(20) })
  const t1 = (
    await api('POST', '/tasks/create', {
      project_id: src.id,
      title: 'Design screens',
      start_date: d(0),
      due_date: d(4),
      estimated_hours: 10,
      milestone_id: m1.id
    })
  ).data
  await api('POST', '/tasks/create', {
    project_id: src.id,
    title: 'Login screen',
    parent_task_id: t1.id,
    due_date: d(2),
    estimated_hours: 3
  })
  await api('POST', '/tasks/create', {
    project_id: src.id,
    title: 'Release build',
    start_date: d(15),
    due_date: d(20),
    estimated_hours: 12
  })
  await api('POST', '/tasks/create', { project_id: src.id, title: 'Write user guide' })

  const br = await launch(path.join(SHOTS, 'chrome-settings'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const btn = t => `[...document.querySelectorAll('button')].find(b => b.innerText.trim() === ${JSON.stringify(t)})`

  try {
    // ---------- Settings: working calendar ----------
    await br.goto(`${ROOT}/settings/`)
    await br.waitFor(
      `document.querySelector('#hours_per_day') && document.querySelector('#hours_per_day').value === '8'`,
      'settings loaded'
    )
    await br.setInput('#hours_per_day', '7.3')
    await br.evalJs(
      `document.querySelector('#hours_per_day').dispatchEvent(new FocusEvent('focusout', { bubbles: true })); true`
    )
    await br.waitFor(has('Use steps of 0.5'), 'hours error')
    check('hours per day 7.3 is refused at the field ("steps of 0.5")', true)
    await br.setInput('#hours_per_day', '7.5')
    await br.evalJs(`document.querySelector('[data-weekday="5"]').click()`)
    await br.waitFor(has('45 h a week (6 days x 7.5 h)'), 'weekly preview')
    check('choosing 7.5 h + Saturday previews 45 h a week', true)
    await br.evalJs(`${btn('Save Calendar')}.click()`)
    await br.waitFor(has('Working calendar saved'), 'saved')
    const saved = (await api('GET', '/settings')).detail
    check(
      'calendar saved to the server (7.5 h, Mon-Sat)',
      saved.hours_per_day === 7.5 && saved.working_days.join() === '0,1,2,3,4,5',
      JSON.stringify(saved)
    )

    // ---------- Settings: holidays ----------
    await br.evalJs(`${btn('Add')}.click()`)
    await br.waitFor(`${has('Please Select Date')} && ${has('Please Enter Holiday Name')}`, 'holiday errors')
    check('adding an empty holiday shows both field errors', true)
    await br.setInput('#holiday_date', nextMonday)
    await br.setInput('#holiday_name', 'test festival')
    await br.evalJs(`${btn('Add')}.click()`)
    await br.waitFor(`!!document.querySelector('[data-holiday="Test Festival"]')`, 'holiday listed')
    check(
      'holiday added and listed (name capitalised, weekday shown)',
      await br.evalJs(`document.querySelector('[data-holiday="Test Festival"]').innerText.includes('Monday')`)
    )
    await br.setInput('#holiday_date', nextMonday)
    await br.setInput('#holiday_name', 'Again')
    await br.evalJs(`${btn('Add')}.click()`)
    await br.waitFor(has('is already a holiday'), 'duplicate')
    check('a second holiday on the same date is refused', true)
    await br.shot(`${SHOTS}/pms_settings.png`)
    await br.evalJs(`document.querySelector('[aria-label="Remove Test Festival"]').click()`)
    await br.waitFor(btn('Remove') + ' !== undefined', 'confirm')
    await br.evalJs(`${btn('Remove')}.click()`)
    await br.waitFor(`!document.querySelector('[data-holiday="Test Festival"]')`, 'holiday removed')
    check('holiday removed after confirming', true)

    // ---------- Save a project as a template ----------
    await br.goto(`${ROOT}/projects/projectDetails/?id=${src.id}`)
    await br.waitFor(btn('Save as Template') + ' !== undefined', 'details')
    await br.evalJs(`${btn('Save as Template')}.click()`)
    await br.waitFor(
      `document.querySelector('#template_name') && document.querySelector('#template_name').value === ${JSON.stringify(
        TPL
      )}`,
      'dialog'
    )
    check('Save as Template suggests "<project name> Template"', true)
    await br.evalJs(`${btn('Save Template')}.click()`)
    await br.waitFor(`!!document.querySelector('[data-template-saved]')`, 'saved template')
    check(
      'template saved with 2 milestones and 4 tasks',
      await br.evalJs(`document.querySelector('[data-template-saved]').innerText.includes('2 milestones and 4 tasks')`)
    )

    // ---------- Start a project from it ----------
    await br.goto(`${ROOT}/projects/projectTemplates/`)
    await br.waitFor(`!!document.querySelector('[data-template="${TPL}"]')`, 'templates list')
    check(
      'Project Templates lists it (30 days, 2 milestones, 3 tasks + 1 subtask)',
      await br.evalJs(
        `(() => { const t = document.querySelector('[data-template="${TPL}"]').innerText; return t.includes('30 days') && t.includes('2 milestones') && t.includes('1 subtask') })()`
      )
    )
    await br.evalJs(
      `[...document.querySelector('[data-template="${TPL}"]').querySelectorAll('button')].find(b => b.innerText.includes('Use')).click()`
    )
    await br.waitFor(
      `${has('Create Project from Template')} && !!document.querySelector('[data-template-hint]')`,
      'use drawer'
    )
    check('Use opens Create Project from Template with the date hint', true)
    await br.setInput('#project_name', NEWP)
    await br.setInput('#start_date', d(14))
    await br.evalJs(`${btn('Create Draft')}.click()`)
    await br.waitFor(`location.pathname.includes('projectDetails') && ${has(NEWP)}`, 'new project opened')
    check('the new project opens after it is created', true)
    const np = ((await api('GET', `/projects/list?search=${encodeURIComponent(NEWP)}&page_size=5`)).detail || [])[0]
    const nt = (await api('GET', `/tasks/list?project_id=${np.id}&page_size=50`)).detail || []
    const nm = (await api('GET', `/projects/${np.id}/milestones`)).detail || []
    const design = nt.find(t => t.title === 'Design screens')
    check(
      'it got the 4 tasks and 2 milestones, dates shifted to the new start',
      nt.length === 4 &&
        nm.length === 2 &&
        design.start_date === d(14) &&
        design.due_date === d(18) &&
        np.end_date === d(43),
      JSON.stringify({ n: nt.length, m: nm.length, design, end: np.end_date })
    )

    // ---------- Template editor ----------
    await br.goto(`${ROOT}/projects/projectTemplates/`)
    await br.waitFor(`!!document.querySelector('[data-template="${TPL}"]')`, 'templates page')
    await br.evalJs(`${btn('New Template')}.click()`)
    await br.waitFor(`!!document.querySelector('[aria-label="Task 1 name"]')`, 'editor')
    await br.setInput('#name', MANUAL.toLowerCase())
    await br.setInput('#duration_days', '20')
    await br.setInput('[aria-label="Milestone 1 name"]', 'handover')
    await br.setInput('[aria-label="Milestone 1 due day"]', '19')
    await br.setInput('[aria-label="Task 1 name"]', 'kick off meeting')
    await br.setInput('[aria-label="Task 1 start day"]', '15')
    await br.setInput('[aria-label="Task 1 days"]', '10')
    await br.evalJs(`${btn('Save Template')}.click()`)
    await br.waitFor(has('Ends after the project length (20 days)'), 'row error')
    check('a task running past the template length is flagged on its row', true)
    await br.setInput('[aria-label="Task 1 days"]', '2')
    await br.evalJs(`${btn('Save Template')}.click()`)
    await br.waitFor(`!!document.querySelector('[data-template="${MANUAL}"]')`, 'manual saved')
    check('fixed template saves (name capitalised) and appears in the list', true)
    await br.shot(`${SHOTS}/pms_templates.png`)
    await br.evalJs(`document.querySelector('[aria-label="Delete ${MANUAL}"]').click()`)
    await br.waitFor(btn('Delete') + ' !== undefined', 'delete confirm')
    await br.evalJs(
      `[...document.querySelectorAll('.MuiDialog-root button')].find(b => b.innerText.trim() === 'Delete').click()`
    )
    await br.waitFor(`!document.querySelector('[data-template="${MANUAL}"]')`, 'deleted')
    check('template deleted after confirming', true)
  } catch (e) {
    console.log('FAILED:', e.message)
    try {
      await br.shot(`${SHOTS}/pms_settings_failure.png`)
    } catch (x) {}
    process.exitCode = 1
  } finally {
    await br.close()
    await api('PUT', '/settings/calendar', { hours_per_day: orig.hours_per_day, working_days: orig.working_days })
    const now = (await api('GET', `/settings?year=${nextMonday.slice(0, 4)}`)).detail
    for (const h of now.holidays) if (h.holiday_date === nextMonday) await api('DELETE', `/settings/holidays/${h.id}`)
    if (clash) await api('POST', '/settings/holidays', { holiday_date: clash.holiday_date, name: clash.name })
    await cleanProjects()
    console.log(
      results.every(Boolean) && !process.exitCode
        ? `\nALL ${results.length} CHECKS PASSED`
        : `\n${results.filter(x => !x).length} FAILED or stopped early`
    )
  }
})()
