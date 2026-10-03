// End-to-end check of Reports (catalog, filters, summary, sorting, totals, CSV download, deep link) against the
// running app (http://127.0.0.1:3000) and API (:8000). Needs Google Chrome.
// Run from frontend/:  node tests/e2e/reports.js   (creates and then deletes its own test data)
const fs = require('fs')
const path = require('path')
const { launch } = require('./cdp')

const ROOT = `${process.env.PMS_APP || 'http://127.0.0.1:3000'}/appModules/projects`
const API = 'http://127.0.0.1:8000/api'
const TOKEN = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
const SHOTS = require('os').tmpdir()
const NAME = 'Reports E2e Check'

const api = async (method, url, body) => {
  const r = await fetch(API + url, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })

  return r.json()
}
const d = n => {
  const x = new Date()
  x.setDate(x.getDate() + n)

  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

;(async () => {
  const results = []
  const check = (name, ok, extra = '') => {
    results.push(ok)
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  [${extra}]`))
  }

  for (const p of (await api('GET', `/projects/list?search=${encodeURIComponent(NAME)}&page_size=20`)).detail || []) if (p.project_name === NAME) await api('DELETE', `/projects/${p.id}`)
  const project = (await api('POST', '/projects/create', { project_name: NAME, project_type: 'Internal', start_date: d(-30), end_date: d(60), budget: 50000, project_manager_name: 'Qa Manager' })).data
  await api('POST', '/tasks/create', { project_id: project.id, title: 'Very late report task', start_date: d(-20), due_date: d(-9), priority: 'High' })
  await api('POST', '/tasks/create', { project_id: project.id, title: 'Slightly late report task', start_date: d(-5), due_date: d(-1) })
  await api('POST', `/projects/${project.id}/risks`, { title: 'Report risk example', category: 'Technical', probability: 5, impact: 4, mitigation: 'spike the risky part first' })

  const br = await launch(path.join(SHOTS, 'chrome-reports'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const all = (...e) => e.join(' && ')
  const setSelect = (selector, value) =>
    br.evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  const rows = () => br.evalJs(`[...document.querySelectorAll('.report-print tbody tr')].map(r => r.innerText)`)

  try {
    await br.goto(`${ROOT}/reports/`)
    await br.waitFor(all(`document.querySelectorAll('[data-report]').length === 7`, has('Project Status')), 'catalog')
    check('Reports screen lists 7 reports and opens Project Status', true)

    await br.waitFor(`[...document.querySelectorAll('#report_project option')].some(o => o.value === '${project.id}')`, 'project filter')
    await setSelect('#report_project', project.id)
    await br.waitFor(`document.querySelectorAll('.report-print tbody tr').length === 1`, 'filtered', 20000)
    const status = (await rows())[0]
    check('filtered to the project: 2 overdue tasks, health flagged, budget ₹50,000', status.includes('₹50,000') && /\t2\t/.test(status) && !status.includes('On Track'), status)

    await br.evalJs(`document.querySelector('[data-report="overdue-tasks"]').click(); true`)
    await br.waitFor(all(has('Very late report task'), has('Slightly late report task')), 'overdue report', 20000)
    const overdue = await rows()
    check('Overdue Tasks: most overdue first (9 days, then 1)', overdue[0].includes('Very late') && overdue[1].includes('Slightly late'), overdue.join(' | '))
    await br.evalJs(`[...document.querySelectorAll('.report-print thead th')].find(th => th.innerText.startsWith('Days Late')).click(); true`)
    await br.sleep(300)
    check('clicking "Days Late" sorts ascending (1 day first)', (await rows())[0].includes('Slightly late'))
    check('chart is drawn', await br.evalJs(`!!document.querySelector('.report-print .recharts-surface')`))

    await br.evalJs(`(() => { window.__downloads = []; const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { const name = this.download; fetch(this.href).then(r => r.text()).then(text => window.__downloads.push({ name, text })); return } return click.call(this) }; return true })()`)
    await br.evalJs(`[...document.querySelectorAll('button')].find(b => b.innerText.includes('Download Excel')).click(); true`)
    await br.waitFor(`window.__downloads.length === 1`, 'csv download')
    const csv = await br.evalJs(`JSON.stringify(window.__downloads[0])`)
    check('Download Excel saves overdue-tasks-<date>.csv with the title and rows', csv.includes(`overdue-tasks-${d(0)}.csv`) && csv.includes('Overdue Tasks') && csv.includes('Very late report task'), csv.slice(0, 160))

    await br.evalJs(`document.querySelector('[data-report="timesheet-hours"]').click(); true`)
    await br.waitFor(`!!document.querySelector('#report_from')`, 'period filters')
    await br.setInput('#report_from', d(0))
    await br.setInput('#report_to', d(-5))
    await br.waitFor(has('To date cannot be before From date'), 'date rule')
    check('Timesheet Hours: To before From is flagged and the report is not run', true)
    await br.setInput('#report_to', d(0))
    await br.waitFor(has('Timesheet Hours'), 'timesheet report')

    await br.evalJs(`document.querySelector('[data-report="budget"]').click(); true`)
    await br.waitFor(all(has('Budget vs Actual'), `!!document.querySelector('.report-print tfoot')`), 'budget totals', 20000)
    check('Budget vs Actual shows a Total row', (await br.evalJs(`document.querySelector('.report-print tfoot').innerText`)).startsWith('Total'))

    await br.goto(`${ROOT}/reports/?report=risks`)
    await br.waitFor(all(has('Risk Register'), has('Report risk example')), 'deep link')
    check('link ?report=risks opens the Risk Register (High 20 listed)', (await rows()).some(r => r.includes('Report risk example') && r.includes('High') && r.includes('20')))
    await br.shot(`${SHOTS}/pms_reports.png`)
  } catch (e) {
    console.log('FAILED:', e.message)
    try {
      await br.shot(`${SHOTS}/pms_reports_failure.png`)
    } catch (x) {}
    process.exitCode = 1
  } finally {
    await br.close()
    for (const t of (await api('GET', `/tasks/list?project_id=${project.id}&page_size=50`)).detail || []) await api('DELETE', `/tasks/${t.id}`)
    await api('DELETE', `/projects/${project.id}`)
    console.log(results.every(Boolean) && !process.exitCode ? `\nALL ${results.length} CHECKS PASSED` : `\n${results.filter(x => !x).length} FAILED or stopped early`)
  }
})()
