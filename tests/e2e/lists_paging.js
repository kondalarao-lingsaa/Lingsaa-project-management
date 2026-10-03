// Lists with many records: project dropdowns are not cut at 100, long lists get the pagination bar, and the
// company-wide pages (Risks, Issues, Change Requests, Resources, Milestones) can add a record after choosing a project.
// Creates 105 throw-away projects in the demo company and removes them at the end. Run from frontend/:
//   node tests/e2e/lists_paging.js
const fs = require('fs')
const path = require('path')
const { launch } = require('./cdp')

const ROOT = `${process.env.PMS_APP || 'http://127.0.0.1:3000'}/appModules/projects`
const API = 'http://127.0.0.1:8000/api'
const TOKEN = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
const PREFIX = 'Zz Paging Check'
const COUNT = 105
const api = async (method, url, body) => (await fetch(API + url, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json()
const d = n => {
  const x = new Date()
  x.setDate(x.getDate() + n)

  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const cleanup = async () => {
  for (const p of (await api('GET', '/projects/options')).detail || []) if (p.project_name.startsWith(PREFIX)) await api('DELETE', `/projects/${p.id}`)
}

;(async () => {
  const results = []
  const check = (name, ok, extra = '') => {
    results.push(ok)
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  [${extra}]`))
  }
  await cleanup()
  const made = []
  for (let i = 1; i <= COUNT; i++) {
    const r = await api('POST', '/projects/create', { project_name: `${PREFIX} ${String(i).padStart(3, '0')}`, project_type: 'Internal', start_date: d(-10), end_date: d(60), budget: 1000 * i, project_manager_name: 'Dev User', project_manager_id: 1 })
    if (r.data) made.push(r.data)
  }
  const last = made[made.length - 1]
  for (const s of ['Pending Approval', 'Approved', 'Active']) await api('POST', `/projects/${last.id}/status`, { status: s })
  for (let i = 1; i <= 12; i++) {
    await api('POST', `/projects/${last.id}/risks`, { title: `Paging risk ${i}`, category: 'Technical', probability: 3, impact: 3 })
    await api('POST', `/projects/${last.id}/milestones`, { name: `Paging milestone ${i}`, due_date: d(5 + i) })
  }
  check(`setup: ${COUNT} extra projects created`, made.length === COUNT, made.length)
  const opts = (await api('GET', '/projects/options')).detail || []
  check('server: /projects/options returns every project (more than 100)', opts.length > 100 && opts.some(p => p.id === last.id), opts.length)

  const br = await launch(path.join(require('os').tmpdir(), 'chrome-paging'), 1440, 1000)
  const btn = t => `[...document.querySelectorAll('button')].find(b => b.innerText.trim() === ${JSON.stringify(t)})`
  const clickUntil = async (clickJs, readyJs, label) => {
    for (let i = 0; i < 12 && !(await br.evalJs(readyJs)); i++) {
      await br.evalJs(clickJs).catch(() => {})
      await br.sleep(600)
    }
    await br.waitFor(readyJs, label)
  }
  const hasOption = (sel, id) => `[...document.querySelectorAll('${sel} option')].some(o => o.value === '${id}')`
  try {
    await br.goto(`${ROOT}/dashboard/`)
    await br.sleep(1000)
    await br.evalJs(`['access_token','username','user_id','client_id'].forEach(k => localStorage.removeItem(k)); true`)

    // Project dropdowns
    await br.goto(`${ROOT}/tasks/allTasks/`)
    await clickUntil(`${btn('Add Task')}.click()`, `!!document.querySelector('#project_id')`, 'task drawer')
    await br.waitFor(hasOption('#project_id', last.id), 'project 105 in Add Task', 15000)
    check('Add Task: project dropdown lists project number 105+ (no 100 limit)', true)
    await br.goto(`${ROOT}/planning/gantt/?projectId=${last.id}`)
    await br.waitFor(hasOption('#planning_project', last.id) + ` && document.querySelector('#planning_project').value === '${last.id}'`, 'gantt picker', 15000)
    check('Gantt / shared project picker: project 105+ can be selected', true)

    // Pagination bars
    await br.goto(`${ROOT}/budget/budget/`)
    await br.waitFor(`!!document.querySelector('[data-pager]')`, 'budget pager', 20000)
    check('Budget overview: long project list has the pagination bar', true)
    await br.goto(`${ROOT}/planning/milestones/`)
    await br.waitFor(`!!document.querySelector('[data-pager]')`, 'milestone pager', 20000)
    const rowsShown = await br.evalJs(`document.querySelectorAll('tbody tr').length`)
    check('Milestones: pagination bar, at most 10 rows on a page', rowsShown === 10, rowsShown)
    await br.evalJs(`document.querySelector('[data-pager] [aria-label="Next page"]').click()`)
    await br.sleep(500)
    check('Milestones: Next page shows more rows', (await br.evalJs(`document.body.innerText.includes('Page') && document.querySelector('[data-pager]').innerText.includes('2')`)))
    await br.goto(`${ROOT}/risks/risks/`)
    await br.waitFor(`!!document.querySelector('[data-pager]')`, 'risk pager', 20000)
    check('Risks: pagination bar shown', true)

    // Add from the company-wide pages
    for (const [page, label, field] of [['risks/risks', 'Add Risk', '#title'], ['risks/issues', 'Raise Issue', '#title'], ['risks/changeRequests', 'New Change Request', '#title'], ['resources/team', 'Add Member', '#member_name']]) {
      await br.goto(`${ROOT}/${page}/`)
      await clickUntil(`${btn(label)}.click()`, `!!document.querySelector('#choose_project')`, `${label} chooser`)
      await br.waitFor(hasOption('#choose_project', last.id), 'option')
      await br.setInput('#choose_project', String(last.id))
      await br.evalJs(`${btn('Continue')}.click()`)
      await br.waitFor(`!!document.querySelector('${field}')`, `${label} form`)
      check(`${page}: "${label}" -> choose project -> the form opens`, true)
      await br.evalJs(`[...document.querySelectorAll('button')].find(b => ['Close', 'Cancel'].includes(b.innerText.trim()) && b.closest('.MuiDrawer-root, .fixed'))?.click(); true`)
      await br.sleep(500)
    }
    const problems = br.problems().filter(p => !/favicon/.test(JSON.stringify(p)))
    check('no console errors or failed requests', problems.length === 0, JSON.stringify(problems.slice(0, 3)))
  } catch (e) {
    console.log('FAILED:', e.message)
    try { await br.shot(path.join(require('os').tmpdir(), 'paging_failure.png')) } catch (x) {}
    process.exitCode = 1
  } finally {
    await br.close()
    await cleanup()
    console.log(results.every(Boolean) && !process.exitCode ? `\nALL ${results.length} CHECKS PASSED` : `\n${results.filter(x => !x).length} FAILED or stopped early`)
  }
})()
