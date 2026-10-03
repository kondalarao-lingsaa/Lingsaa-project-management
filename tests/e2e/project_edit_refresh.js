// After editing a project, every Project Details tab shows the new data without a page refresh
// (bug 2026-10-02: Team / Budget tabs kept the old manager and budget until reload).
// Run from frontend/:  node tests/e2e/project_edit_refresh.js  (cleans up)
const fs = require('fs')
const path = require('path')
const { launch } = require('./cdp')

const ROOT = `${process.env.PMS_APP || 'http://127.0.0.1:3000'}/appModules/projects`
const API = 'http://127.0.0.1:8000/api'
const TOKEN = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
const NAME = 'Edit Refresh Check'
const api = async (method, url, body) =>
  (await fetch(API + url, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json()
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
  for (const p of (await api('GET', '/projects/options')).detail || []) if (p.project_name.startsWith(NAME)) await api('DELETE', `/projects/${p.id}`)
  const project = (await api('POST', '/projects/create', {
    project_name: NAME, project_type: 'Time & Material', customer_name: 'Acme Retail', customer_contact_name: 'Ravi Kumar',
    customer_mobile: '9876543210', start_date: d(-5), end_date: d(40), budget: 50000, project_manager_name: 'Dev User', project_manager_id: 1
  })).data

  const br = await launch(path.join(require('os').tmpdir(), 'chrome-edit-refresh'), 1440, 1000)
  const main = `(document.querySelector('main')?.innerText || '')`
  const tab = t => `[...document.querySelectorAll('main button')].find(b => b.innerText.trim() === ${JSON.stringify(t)})`
  const lastBtn = t => `[...document.querySelectorAll('button')].filter(b => b.innerText.trim() === ${JSON.stringify(t)}).pop()`
  // Client-side navigation only: a full page load would refill the cache and hide the bug.
  const openTab = async (t, readyJs, label) => {
    await br.waitFor(`!!${tab(t)}`, `${t} tab`)
    await br.evalJs(`${tab(t)}.click(); true`)
    return br.waitFor(readyJs, label, 8000).then(() => true, () => false)
  }
  const editProject = async (manager, budget) => {
    await br.waitFor(`!!document.querySelector('#project_manager_name')?.value`, 'edit form prefilled')
    await br.setInput('#project_manager_name', manager)
    await br.setInput('#budget', budget)
    await br.evalJs(`${lastBtn('Update')}.click(); true`)
    await br.waitFor(`!document.querySelector('#project_manager_name')`, 'drawer closed')
  }
  try {
    await br.goto(`${ROOT}/dashboard/`)
    await br.sleep(1000)
    await br.evalJs(`['access_token','username','user_id','client_id'].forEach(k => localStorage.removeItem(k)); true`)
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}`)
    await br.waitFor(`${main}.includes(${JSON.stringify(NAME)})`, 'project details')

    // Fill the caches of the Team and Budget tabs with the old data first.
    check('Team tab shows the first manager', await openTab('Team', `${main}.includes('Dev User')`, 'team'))
    check('Budget tab shows the first budget', await openTab('Budget', `${main}.includes('50,000')`, 'budget'))

    // 1. Edit from Project Details
    await br.evalJs(`[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Edit').click(); true`)
    await editProject('Priya Shah', '90000')
    check('after Edit on Project Details: Team tab shows the new manager (no refresh)',
      await openTab('Team', `${main}.includes('Priya Shah')`, 'team updated'), await br.evalJs(main).then(t => t.slice(0, 300)))
    check('after Edit on Project Details: Budget tab shows the new budget (no refresh)',
      await openTab('Budget', `${main}.includes('90,000')`, 'budget updated'))

    // 2. Edit from the All Projects list, then open the project again
    await br.evalJs(`window.next.router.push('/appModules/projects/projects/allProjects/'); true`)
    await br.waitFor(`${main}.includes(${JSON.stringify(NAME)}) && !!document.querySelector('tr svg.lucide-ellipsis')`, 'list row')
    const rowBtn = `[...document.querySelectorAll('tr')].find(r => r.innerText.includes(${JSON.stringify(NAME)})).querySelector('svg.lucide-ellipsis')`
    for (let i = 0; i < 10 && !(await br.evalJs(`[...document.querySelectorAll('[role=menuitem]')].some(m => m.innerText.trim() === 'Edit')`)); i++) {
      await br.evalJs(`${rowBtn}.dispatchEvent(new MouseEvent('click', { bubbles: true }))`).catch(() => {})
      await br.sleep(500)
    }
    await br.evalJs(`[...document.querySelectorAll('[role=menuitem]')].find(m => m.innerText.trim() === 'Edit').click(); true`)
    await editProject('Meena Iyer', '120000')
    await br.evalJs(`window.next.router.push('/appModules/projects/projects/projectDetails/?id=${project.id}&tab=team'); true`)
    check('after Edit in the list: Project Details Team tab shows the new manager (no refresh)',
      await br.waitFor(`${main}.includes('Meena Iyer')`, 'team after list edit', 8000).then(() => true, () => false))
    check('after Edit in the list: Budget tab shows the new budget (no refresh)', await openTab('Budget', `${main}.includes('1,20,000') || ${main}.includes('120,000')`, 'budget after list edit'))
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
