// Edit / delete is available wherever a record is listed: milestone rows on the Milestones page, deliverable rename,
// Kanban card edit, Task Details delete, Project Details delete - and a Closed project can no longer be edited.
// Run from frontend/:  node tests/e2e/edit_actions.js  (cleans up)
const fs = require('fs')
const path = require('path')
const { launch } = require('./cdp')

const ROOT = `${process.env.PMS_APP || 'http://127.0.0.1:3000'}/appModules/projects`
const API = 'http://127.0.0.1:8000/api'
const TOKEN = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
const NAME = 'Edit Actions Check'
const raw = (method, url, body) => fetch(API + url, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
const api = async (method, url, body) => (await raw(method, url, body)).json()
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
  const body = { project_name: NAME, project_type: 'Time & Material', customer_name: 'Acme Retail', customer_contact_name: 'Ravi Kumar', customer_mobile: '9876543210', start_date: d(-5), end_date: d(40), budget: 50000, project_manager_name: 'Dev User', project_manager_id: 1 }
  const project = (await api('POST', '/projects/create', body)).data
  for (const s of ['Pending Approval', 'Approved', 'Active']) await api('POST', `/projects/${project.id}/status`, { status: s })
  const ms = (await api('POST', `/projects/${project.id}/milestones`, { name: 'Edit Me Milestone', due_date: d(10), amount: 1000 })).data || ((await api('GET', `/projects/${project.id}/milestones`)).detail || [])[0]
  await api('POST', `/projects/${project.id}/milestones/${ms.id}/deliverables`, { name: 'Draft design' })
  const mkTask = async title => (await api('POST', '/tasks/create', { project_id: project.id, title, priority: 'Medium', task_type: 'Task', status: 'To Do' })).data
  const t1 = await mkTask('Kanban edit task')
  const t2 = await mkTask('Delete me task')

  const br = await launch(path.join(require('os').tmpdir(), 'chrome-edit'), 1440, 1000)
  const btn = t => `[...document.querySelectorAll('button')].find(b => b.innerText.trim() === ${JSON.stringify(t)})`
  const lastBtn = t => `[...document.querySelectorAll('button')].filter(b => b.innerText.trim() === ${JSON.stringify(t)}).pop()`
  const clickUntil = async (clickJs, readyJs, label) => {
    for (let i = 0; i < 12 && !(await br.evalJs(readyJs)); i++) {
      await br.evalJs(clickJs).catch(() => {})
      await br.sleep(600)
    }
    await br.waitFor(readyJs, label)
  }
  try {
    await br.goto(`${ROOT}/dashboard/`)
    await br.sleep(1000)
    await br.evalJs(`['access_token','username','user_id','client_id'].forEach(k => localStorage.removeItem(k)); true`)

    // 1. Milestones page: row Actions -> Edit
    await br.goto(`${ROOT}/planning/milestones/`)
    await br.waitFor(`document.body.innerText.includes('Edit Me Milestone')`, 'milestone row')
    const rowBtn = `[...document.querySelectorAll('tr')].find(r => r.innerText.includes('Edit Me Milestone')).querySelector('[data-row-actions]')`
    await clickUntil(`${rowBtn}.click()`, `[...document.querySelectorAll('[role=menuitem]')].some(m => m.innerText.trim() === 'Edit')`, 'row menu')
    await br.evalJs(`[...document.querySelectorAll('[role=menuitem]')].find(m => m.innerText.trim() === 'Edit').click()`)
    await br.waitFor(`document.querySelector('#name')?.value === 'Edit Me Milestone'`, 'edit form prefilled')
    await br.setInput('#name', 'edited milestone')
    await br.evalJs(`${lastBtn('Update')}.click()`)
    await br.waitFor(`!document.querySelector('#due_date')`, 'drawer closed')
    const msNow = ((await api('GET', `/projects/${project.id}/milestones`)).detail || [])[0]
    check('Milestones page: Actions > Edit changes the milestone', msNow.name === 'Edited Milestone', msNow.name)

    // 2. Deliverable rename on the project's Milestones tab
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}&tab=milestones`)
    await clickUntil(`document.querySelector('[aria-label="Rename Draft design"]').click()`, `!!document.querySelector('[data-rename-deliverable]')`, 'rename box')
    await br.setInput('[data-rename-deliverable]', 'Final design')
    await br.evalJs(`document.querySelector('[data-rename-deliverable]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); true`)
    await br.sleep(1500)
    const dl = ((await api('GET', `/projects/${project.id}/milestones`)).detail || [])[0].deliverables[0]
    check('Milestones tab: deliverable can be renamed (pencil, Enter)', dl.name === 'Final design', dl.name)

    // 3. Kanban card: pencil -> Edit Task
    await br.goto(`${ROOT}/tasks/kanban/`)
    await br.waitFor(`!!document.querySelector('[data-card-id="${t1.id}"] [data-card-edit]')`, 'card edit', 20000)
    await clickUntil(`document.querySelector('[data-card-id="${t1.id}"] [data-card-edit]').click()`, `document.querySelector('#title')?.value === 'Kanban edit task'`, 'task edit drawer')
    await br.setInput('#title', 'Kanban edited task')
    await br.evalJs(`${lastBtn('Update')}.click()`)
    await br.waitFor(`!document.querySelector('#title')`, 'task drawer closed')
    check('Kanban: card pencil opens Edit Task and saves', (await api('GET', `/tasks/${t1.id}`)).detail.title === 'Kanban Edited Task' || (await api('GET', `/tasks/${t1.id}`)).detail.title === 'Kanban edited task', (await api('GET', `/tasks/${t1.id}`)).detail.title)

    // 4. Task Details: Delete
    await br.goto(`${ROOT}/tasks/taskDetails/?id=${t2.id}`)
    await clickUntil(`${btn('Delete')}.click()`, `document.body.innerText.includes('Delete task?')`, 'delete confirm')
    await br.evalJs(`${lastBtn('Delete')}.click()`)
    await br.waitFor(`location.search.includes('tab=tasks')`, 'back to project tasks')
    check('Task Details: Delete removes the task and returns to the project task list', (await raw('GET', `/tasks/${t2.id}`)).status === 404)

    // 5. Closed project: no Edit, server refuses
    await api('POST', `/projects/${project.id}/status`, { status: 'Closed' })
    const st = (await api('GET', `/projects/${project.id}`)).detail.status
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}`)
    await br.waitFor(`!!${btn('Save as Template')}`, 'details header')
    check(`Closed project (${st}): Project Details hides Edit, keeps Delete`, !(await br.evalJs(`!!${btn('Edit')}`)) && (await br.evalJs(`!!${btn('Delete')}`)))
    const put = await raw('PUT', `/projects/${project.id}`, body)
    check('Closed project: the server refuses an edit (409)', put.status === 409, put.status)

    // 6. Project Details: Delete
    await clickUntil(`${btn('Delete')}.click()`, `document.body.innerText.includes('Delete project?')`, 'project delete confirm')
    await br.evalJs(`${lastBtn('Delete')}.click()`)
    await br.waitFor(`location.pathname.includes('allProjects')`, 'back to list')
    check('Project Details: Delete removes the project and returns to All Projects', (await raw('GET', `/projects/${project.id}`)).status === 404)
    const problems = br.problems().filter(p => !/409|favicon/.test(JSON.stringify(p)))
    check('no console errors or failed requests', problems.length === 0, JSON.stringify(problems.slice(0, 3)))
  } catch (e) {
    console.log('FAILED:', e.message)
    try {
      await br.shot(path.join(require('os').tmpdir(), 'edit_failure.png'))
    } catch (x) {}
    process.exitCode = 1
  } finally {
    await br.close()
    await api('DELETE', `/projects/${project.id}`)
    console.log(results.every(Boolean) && !process.exitCode ? `\nALL ${results.length} CHECKS PASSED` : `\n${results.filter(x => !x).length} FAILED or stopped early`)
  }
})()
