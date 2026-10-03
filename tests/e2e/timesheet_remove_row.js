// My Timesheets: a row added by mistake can be removed (empty row at once; a row with draft hours after
// confirming, which deletes those hours); a row with submitted hours has no remove button.
// Run from frontend/:  node tests/e2e/timesheet_remove_row.js  (cleans up)
const fs = require('fs')
const path = require('path')
const { launch } = require('./cdp')

const ROOT = `${process.env.PMS_APP || 'http://127.0.0.1:3000'}/appModules/projects`
const API = 'http://127.0.0.1:8000/api'
const TOKEN = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
const NAME = 'Timesheet Remove Check'
const api = async (method, url, body) =>
  (await fetch(API + url, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json()
const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
const d = n => {
  const x = new Date()
  x.setDate(x.getDate() + n)

  return iso(x)
}
// The latest working day up to today, inside this week (Mon-Fri).
const logDay = (() => {
  const x = new Date()
  while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() - 1)

  return iso(x)
})()

;(async () => {
  const results = []
  const check = (name, ok, extra = '') => {
    results.push(ok)
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  [${extra}]`))
  }
  for (const p of (await api('GET', '/projects/options')).detail || []) if (p.project_name.startsWith(NAME)) await api('DELETE', `/projects/${p.id}`)
  const project = (await api('POST', '/projects/create', {
    project_name: NAME, project_type: 'Time & Material', customer_name: 'Acme Retail', customer_contact_name: 'Ravi Kumar',
    customer_mobile: '9876543210', start_date: d(-20), end_date: d(40), budget: 50000, project_manager_name: 'Dev User', project_manager_id: 1
  })).data
  for (const s of ['Pending Approval', 'Approved', 'Active']) await api('POST', `/projects/${project.id}/status`, { status: s })
  const mk = async title => (await api('POST', '/tasks/create', { project_id: project.id, title, assignee_name: 'Dev User' })).data
  const tA = await mk('Remove empty row task')
  const tB = await mk('Remove draft row task')
  const tC = await mk('Submitted row task')
  // tC: submitted hours (no remove button). The week must be submitted before the drafts of tB exist.
  await api('POST', '/timesheets/entries', { task_id: tC.id, work_date: logDay, hours: 1 })
  const monday = (() => {
    const x = new Date(logDay)
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7))

    return iso(x)
  })()
  await api('POST', '/timesheets/submit', { week_start: monday })

  const br = await launch(path.join(require('os').tmpdir(), 'chrome-ts-remove'), 1440, 1000)
  const main = `(document.querySelector('main')?.innerText || '')`
  const lastBtn = t => `[...document.querySelectorAll('button')].filter(b => b.innerText.trim() === ${JSON.stringify(t)}).pop()`
  const addRow = async task => {
    await br.waitFor(`[...document.querySelectorAll('#add_task_row option')].some(o => o.value === '${task.id}')`, `${task.task_key} in picker`)
    await br.setInput('#add_task_row', String(task.id))
    await br.evalJs(`${lastBtn('Add Row')}.click(); true`)
    await br.waitFor(`!!document.querySelector('[data-remove-row="${task.id}"]')`, `${task.task_key} row`)
  }
  try {
    await br.goto(`${ROOT}/dashboard/`)
    await br.sleep(1000)
    await br.evalJs(`['access_token','username','user_id','client_id'].forEach(k => localStorage.removeItem(k)); true`)
    await br.goto(`${ROOT}/timesheets/myTimesheets/`)
    await br.waitFor(`${main}.includes(${JSON.stringify(tC.task_key)})`, 'submitted row')
    check('a submitted week still offers "Add a task to this week"', await br.evalJs(`!!document.querySelector('#add_task_row')`))
    check('a row with submitted hours has no remove button', !(await br.evalJs(`!!document.querySelector('[data-remove-row="${tC.id}"]')`)))

    // 1. Empty row: removed at once
    await addRow(tA)
    await br.evalJs(`document.querySelector('[data-remove-row="${tA.id}"]').click(); true`)
    check('an empty row is removed at once',
      await br.waitFor(`!document.querySelector('[data-remove-row="${tA.id}"]')`, 'row gone', 5000).then(() => true, () => false))

    // 2. Row with draft hours: confirm, hours deleted
    await addRow(tB)
    const cell = `[...document.querySelectorAll('tr')].find(r => r.innerText.includes(${JSON.stringify(tB.task_key)})).querySelector('td input:not([disabled])')`
    await br.evalJs(`${cell}.focus(); true`)
    await br.evalJs(`(() => { const el = ${cell}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '2'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); return true })()`)
    await br.sleep(1500)
    const saved = ((await api('GET', `/timesheets/my-week?week_start=${monday}`)).detail?.rows || []).find(r => r.task_id === tB.id)
    check('hours typed in the new row are saved as draft', saved && saved.total === 2, JSON.stringify(saved?.cells))
    await br.evalJs(`document.querySelector('[data-remove-row="${tB.id}"]').click(); true`)
    await br.waitFor(`document.body.innerText.includes('Remove this row?')`, 'confirm dialog')
    await br.evalJs(`${lastBtn('Remove')}.click(); true`)
    await br.waitFor(`!document.querySelector('[data-remove-row="${tB.id}"]')`, 'row removed', 8000)
    const after = ((await api('GET', `/timesheets/my-week?week_start=${monday}`)).detail?.rows || []).find(r => r.task_id === tB.id)
    check('removing a row with draft hours deletes those hours', !after, JSON.stringify(after?.cells))
    const kept = ((await api('GET', `/timesheets/my-week?week_start=${monday}`)).detail?.rows || []).find(r => r.task_id === tC.id)
    check('submitted hours of other rows are untouched', kept && kept.total === 1, JSON.stringify(kept?.cells))
    const problems = (br.problems ? br.problems() : []).filter(x => !String(x.text).includes('favicon'))
    check('no console errors or failed requests', problems.length === 0, JSON.stringify(problems).slice(0, 300))
  } catch (e) {
    check('test ran to the end', false, e.message)
  } finally {
    await br.close()
    await api('DELETE', `/projects/${project.id}`)
  }
  const failed = results.filter(r => !r).length
  console.log(failed ? `\n${failed} FAILED` : `\nALL ${results.length} CHECKS PASSED`)
  process.exit(failed ? 1 : 0)
})()
