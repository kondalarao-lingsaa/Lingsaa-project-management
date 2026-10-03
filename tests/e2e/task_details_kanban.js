// End-to-end check of Task Details + Kanban against the running app (http://127.0.0.1:3000) and API (:8000).
// Needs Google Chrome. Run from frontend/:  node tests/e2e/task_details_kanban.js   (creates and then deletes its own test data)
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

  const project = (await api('POST', '/projects/create', { project_name: 'Kanban E2e Check', project_type: 'Internal', start_date: '2026-10-01', project_manager_name: 'Qa User' })).data
  const make = async title => (await api('POST', '/tasks/create', { project_id: project.id, title, priority: 'High' })).data
  const a = await make('Design the screens')
  const b = await make('Build the api')
  await make('Write the tests')

  const br = await launch(path.join(require('os').tmpdir(), 'chrome-kanban'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const all = (...e) => e.join(' && ')
  const no = e => `!(${e})`
  const setSelect = (selector, value) =>
    br.evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  const clickMain = text => br.evalJs(`(() => { const el = [...document.querySelectorAll('main button')].find(e => e.innerText.trim() === ${JSON.stringify(text)}); if (!el) return false; el.click(); return true })()`)
  const cardIdsIn = status =>
    br.evalJs(`(() => { const col = [...document.querySelectorAll('main span')].find(s => s.innerText.trim() === ${JSON.stringify(status)}).closest('div.shrink-0'); return [...col.querySelectorAll('[data-card-id]')].map(c => Number(c.dataset.cardId)) })()`)
  // HTML5 drag and drop, the way the browser fires it.
  const drag = (taskId, status) =>
    br.evalJs(`(() => {
      const card = document.querySelector('[data-card-id="${taskId}"]')
      const col = [...document.querySelectorAll('main span')].find(s => s.innerText.trim() === ${JSON.stringify(status)}).closest('div.shrink-0')
      const zone = col.querySelector('.min-h-\\\\[160px\\\\]')
      const box = zone.getBoundingClientRect()
      const dt = new DataTransfer()
      const at = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: box.left + 20, clientY: box.bottom - 10 }
      card.dispatchEvent(new DragEvent('dragstart', at))
      return new Promise(res => setTimeout(() => {
        zone.dispatchEvent(new DragEvent('dragover', at))
        zone.dispatchEvent(new DragEvent('drop', at))
        card.dispatchEvent(new DragEvent('dragend', at))
        res(true)
      }, 150))
    })()`)

  try {
    // ---------- Task Details ----------
    await br.goto(`${ROOT}/tasks/taskDetails/?id=${b.id}`)
    await br.waitFor(all(has('Build the api'), has('Watchers'), has('Add Subtask')), 'task details')
    check('Task Details opens with description, subtasks, tabs and details', (await br.text()).includes('Subtasks') && (await br.text()).includes('History'))

    await clickMain('Dependencies')
    await br.waitFor(has('Nothing blocks this task'), 'deps tab')
    await clickMain('Add')
    await br.waitFor(has('Please Select a Task'), 'dep required')
    check('adding a dependency without picking a task shows "Please Select a Task"', true)
    await setSelect('#depends_on', a.id)
    await clickMain('Add')
    await br.waitFor(all(has('Blocked by 1 open task'), has('Design the screens')), 'blocked banner')
    check('dependency added: blocked banner appears', true)

    await setSelect('#task_status', 'Done')
    await br.waitFor(has('This task is blocked by'), 'blocked toast')
    await br.sleep(800)
    check('status Done refused while blocked (stays To Do)', (await br.evalJs(`document.querySelector('#task_status').value`)) === 'To Do')

    await clickMain('Comments')
    await br.waitFor(`!!document.querySelector('#task_comment')`, 'comment box')
    await clickMain('Comment')
    await br.waitFor(has('Please Enter a Comment'), 'comment required')
    check('empty comment shows "Please Enter a Comment"', true)
    await br.setInput('#task_comment', 'looks good, start after design')
    await clickMain('Comment')
    await br.waitFor(all(has('Looks good, start after design'), has('Watchers (1)')), 'comment posted')
    check('comment posted (first letter capitalised) and commenter becomes a watcher', true)

    await clickMain('History')
    await br.waitFor(all(has('Now blocked by'), has('Created in To Do')), 'history')
    check('History tab lists creation, dependency and comment', (await br.text()).includes('Looks good'))

    await br.evalJs(`[...document.querySelectorAll('main button')].find(e => e.innerText.includes('Add Subtask')).click()`)
    await br.waitFor(has('Add work to a project'), 'subtask drawer')
    await br.sleep(800)
    check('Add Subtask opens the form with this task as parent', (await br.evalJs(`document.querySelector('#parent_task_id').value`)) === String(b.id))
    await br.setInput('#title', 'write the endpoints')
    await br.clickText('button', 'Submit')
    await br.waitFor(all(has('Write the endpoints'), no(has('Add work to a project')), has('0/1 done')), 'subtask created', 20000)
    check('subtask created and listed under Subtasks (0/1 done)', true)
    await br.shot(`${SHOTS}/pms_task_details.png`)

    // ---------- Kanban ----------
    await br.goto(`${ROOT}/tasks/kanban/?projectId=${project.id}`)
    await br.waitFor(`document.querySelectorAll('[data-card-id]').length === 4`, 'board cards')
    const todo = await cardIdsIn('To Do')
    check('Kanban shows the project\'s 4 tasks in To Do', todo.length === 4, todo)

    await drag(b.id, 'Done')
    await br.waitFor(has('This task is blocked by'), 'blocked drop')
    await br.sleep(1500)
    check('dragging a blocked task to Done is refused and the card goes back', (await cardIdsIn('To Do')).includes(b.id) && !(await cardIdsIn('Done')).includes(b.id))

    await drag(a.id, 'Done')
    await br.waitFor(has('moved to Done'), 'moved toast')
    await br.sleep(1200)
    check('dragging an unblocked task to Done moves it', (await cardIdsIn('Done')).includes(a.id))
    const server = await api('GET', `/tasks/${a.id}`)
    check('the move is saved on the server', server.detail.status === 'Done', server.detail.status)

    await drag(b.id, 'Done')
    await br.sleep(1500)
    check('once its blocker is Done, the task can be dropped in Done (below the first card)', JSON.stringify(await cardIdsIn('Done')) === JSON.stringify([a.id, b.id]), await cardIdsIn('Done'))

    await br.evalJs(`[...document.querySelectorAll('main button')].find(e => e.innerText.includes('My Tasks')).click()`)
    await br.waitFor(`document.querySelectorAll('[data-card-id]').length === 0`, 'mine filter')
    check('"My Tasks" filter narrows the board (none assigned to me)', true)
    await br.evalJs(`[...document.querySelectorAll('main button')].find(e => e.innerText.includes('My Tasks')).click()`)
    await br.waitFor(`document.querySelectorAll('[data-card-id]').length === 4`, 'filter off')
    await br.shot(`${SHOTS}/pms_kanban.png`)

    // ---------- Project Details > Board tab ----------
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}&tab=board`)
    await br.waitFor(`document.querySelectorAll('[data-card-id]').length === 4`, 'project board')
    check('Project Details has a working Board tab', true)
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}`)
    await br.waitFor(has('Progress'), 'overview')
    await br.waitFor(has('50%'), 'progress 50')
    check('project progress follows the board (2 of 4 Done = 50%)', true)

    // ---------- My Tasks: a task added here is assigned to me and shows up in the list ----------
    // Tasks can only go to the project's team, so join it first (user 1 = the dev login).
    await api('POST', `/projects/${project.id}/members`, { member_name: 'Dev User', user_id: 1, role: 'Developer', allocation_pct: 10 })
    await br.goto(`${ROOT}/tasks/myTasks/`)
    await br.waitFor(has('Tasks assigned to you'), 'my tasks')
    await br.waitFor(`document.querySelectorAll('tbody tr').length > 0`, 'my tasks loaded')
    await br.sleep(1200)
    await br.evalJs(`[...document.querySelectorAll('main button')].find(e => e.innerText.trim().startsWith('Add Task')).click()`)
    await br.waitFor(has('Add work to a project'), 'my task drawer')
    await br.sleep(900)
    check('Add Task on My Tasks pre-fills the assignee with me', (await br.evalJs(`document.querySelector('#assignee_name').value`)) !== '')
    await setSelect('#project_id', project.id)
    await br.setInput('#title', 'review my own task')
    await br.clickText('button', 'Submit')
    await br.waitFor(all(has('Review my own task'), no(has('Add work to a project'))), 'my task listed', 20000)
    check('the new task appears in My Tasks right after Submit', true)
  } catch (e) {
    console.log('FAILED:', e.message)
    try {
      await br.shot(`${SHOTS}/pms_kanban_failure.png`)
      console.log((await br.text()).slice(0, 600))
    } catch (x) {}
    process.exitCode = 1
  } finally {
    await br.close()
    await api('DELETE', `/projects/${project.id}`)
    console.log(results.every(Boolean) && !process.exitCode ? `\nALL ${results.length} CHECKS PASSED` : `\n${results.filter(r => !r).length} FAILED or stopped early`)
  }
})()
