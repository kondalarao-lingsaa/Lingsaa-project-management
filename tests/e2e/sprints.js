// End-to-end check of Sprints (create with validation, plan from the backlog, start, sprint board + burndown, complete)
// against the running app (http://127.0.0.1:3000) and API (:8000). Needs Google Chrome.
// Run from frontend/:  node tests/e2e/sprints.js   (creates and then deletes its own test data)
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
const NAME = 'Sprints E2e Check'

const api = async (method, url, body) => {
  const r = await fetch(API + url, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })

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

  for (const p of (await api('GET', `/projects/list?search=${encodeURIComponent(NAME)}&page_size=20`)).detail || [])
    if (p.project_name === NAME) await api('DELETE', `/projects/${p.id}`)
  const project = (
    await api('POST', '/projects/create', {
      project_name: NAME,
      project_type: 'Internal',
      start_date: d(0),
      end_date: d(90),
      budget: 100000,
      project_manager_name: 'Qa Manager'
    })
  ).data
  for (const s of ['Pending Approval', 'Approved', 'Active'])
    await api('POST', `/projects/${project.id}/status`, { status: s })
  await api('POST', `/projects/${project.id}/members`, {
    member_name: 'Anita Rao',
    role: 'Developer',
    allocation_pct: 50
  })
  const mk = async (title, hours, priority) =>
    (await api('POST', '/tasks/create', { project_id: project.id, title, estimated_hours: hours, priority })).data
  const login = await mk('Build the login page', 16, 'High')
  const signup = await mk('Build the signup page', 8, 'Critical')
  const reset = await mk('Password reset email', 4, 'Low')

  const br = await launch(path.join(SHOTS, 'chrome-sprints'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const setVal = (sel, v) =>
    br.evalJs(`(() => { const el = document.querySelector(${JSON.stringify(
      sel
    )}); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(
        v
      )}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('blur', { bubbles: true })); return true })()`)
  const clickText = (t, scope = 'button') =>
    br.evalJs(
      `(() => { const b = [...document.querySelectorAll(${JSON.stringify(
        scope
      )})].find(x => x.innerText.trim() === ${JSON.stringify(t)}); if (!b) return false; b.click(); return true })()`
    )
  const sprintsOf = async () => (await api('GET', `/projects/${project.id}/sprints`)).detail || []

  try {
    await br.goto(`${ROOT}/sprints/sprintList/?projectId=${project.id}`)
    await br.waitFor(has('No sprints yet'), 'empty sprint list')
    check('Sprint List opens empty for the project', true)

    // ---------- create with validation ----------
    await clickText('New Sprint')
    await br.waitFor(
      `!!document.querySelector('#name') && document.querySelector('#name').value === 'Sprint 1'`,
      'drawer'
    )
    check('New Sprint drawer suggests the name "Sprint 1" and 14 days', await br.evalJs(has('14 days')))
    await setVal('#end_date', d(40))
    await clickText('Create Sprint')
    await br.waitFor(has('at most 28 days'), '28-day rule')
    check('a sprint longer than 28 days is refused in the form', true)
    await setVal('#end_date', d(13))
    await setVal('#goal', 'users can sign up and log in')
    await clickText('Create Sprint')
    await br.waitFor(`document.querySelectorAll('tbody tr').length === 1 && ${has('-S1')}`, 'created')
    const [s1] = await sprintsOf()
    check(
      'Sprint 1 saved with a capitalised goal',
      s1 && s1.name === 'Sprint 1' && s1.goal === 'Users can sign up and log in',
      JSON.stringify(s1)
    )
    check('capacity = 10 working days x 8 h x 50% = 40 h', s1.capacity_hours === 40, s1.capacity_hours)

    // ---------- plan from the backlog ----------
    await br.goto(`${ROOT}/sprints/sprintPlanning/?projectId=${project.id}&sprintId=${s1.id}`)
    await br.waitFor(`${has(login.title)} && ${has('3 open tasks not in a sprint')}`, 'backlog')
    check('Sprint Planning lists the 3 open tasks in the backlog (28 h)', await br.evalJs(has('28 h estimated')))
    await br.evalJs(
      `document.querySelector('[aria-label="Select ${login.task_key}"]').click(); document.querySelector('[aria-label="Select ${signup.task_key}"]').click(); true`
    )
    await br.waitFor(has('Selected: 24 h'), 'selection preview')
    check('selecting 2 tasks previews the load (24 h -> 60% of capacity)', await br.evalJs(has('60% of capacity')))
    await br.evalJs(`[...document.querySelectorAll('button')].find(b => b.innerText.startsWith('Add 2 to')).click()`)
    await br.waitFor(
      `${has('1 open task not in a sprint')} && !!document.querySelector('[aria-label="Remove ${login.task_key}"]')`,
      'added'
    )
    check('the 2 tasks move into Sprint 1 and leave the backlog', true)
    check('load bar shows 24 h of 40 h capacity', await br.evalJs(has('24 h of 40 h capacity')))
    await br.evalJs(`document.querySelector('[aria-label="Remove ${signup.task_key}"]').click()`)
    await br.waitFor(has('2 open tasks not in a sprint'), 'removed')
    check('a task can be sent back to the backlog', true)
    await br.evalJs(`document.querySelector('[aria-label="Select ${signup.task_key}"]').click()`)
    await br.evalJs(`[...document.querySelectorAll('button')].find(b => b.innerText.startsWith('Add 1 to')).click()`)
    await br.waitFor(has('1 open task not in a sprint'), 're-added')

    // ---------- Tasks -> Backlog page ----------
    await br.goto(`${ROOT}/tasks/backlog/?projectId=${project.id}`)
    await br.waitFor(`${has(reset.title)} && ${has('1 open task not in a sprint')}`, 'backlog page')
    check('Tasks > Backlog shows only the task that is not in a sprint', !(await br.evalJs(has(login.title))))

    // ---------- start ----------
    await br.goto(`${ROOT}/sprints/sprintList/?projectId=${project.id}`)
    await br.waitFor(has('Sprint 1'), 'list')
    await clickText('Start')
    await br.waitFor(`[...document.querySelectorAll('main a')].some(a => a.innerText.trim() === 'Board')`, 'started')
    check('Start makes Sprint 1 Active (Board link appears)', (await sprintsOf())[0].status === 'Active')

    // ---------- sprint board ----------
    await api('POST', `/tasks/${signup.id}/status`, { status: 'In Progress' })
    await api('POST', `/tasks/${signup.id}/status`, { status: 'Done' })
    await br.goto(`${ROOT}/sprints/sprintBoard/?projectId=${project.id}&sprintId=${s1.id}`)
    await br.waitFor(
      `${has(login.title)} && ${has(signup.title)} && !!document.querySelector('.recharts-line')`,
      'board'
    )
    check('Sprint Board shows only the sprint tasks on the kanban', !(await br.evalJs(has(reset.title))))
    check('progress shows 1 / 2 tasks and 8 / 24 h done', await br.evalJs(has('1 / 2 tasks · 8 / 24 h')))
    check(
      'burndown chart draws ideal and remaining lines',
      (await br.evalJs(`document.querySelectorAll('.recharts-line').length`)) === 2
    )
    await br.shot(`${SHOTS}/pms_sprint_board.png`)

    // ---------- complete ----------
    await clickText('Complete Sprint')
    await br.waitFor(`!!document.querySelector('#complete_target')`, 'complete dialog')
    check('Complete dialog offers to move the 1 unfinished task', await br.evalJs(has('Move the 1 unfinished task to')))
    await br.evalJs(
      `[...document.querySelectorAll('.MuiDialog-root button')].find(b => b.innerText.includes('Complete Sprint')).click()`
    )
    await br.waitFor(`!document.querySelector('.MuiDialog-root') && ${has('(Completed)')}`, 'completed')
    const done = (await sprintsOf())[0]
    check(
      'Sprint 1 is Completed with its numbers frozen (1 of 2 tasks)',
      done.status === 'Completed' && done.completed_tasks === 1 && done.committed_tasks === 2,
      JSON.stringify(done)
    )
    const back = (await api('GET', `/tasks/${login.id}`)).detail
    check('the unfinished task went back to the backlog', !back.sprint_id)
    await br.goto(`${ROOT}/sprints/sprintList/?projectId=${project.id}`)
    await br.waitFor(`!!document.querySelector('.recharts-bar')`, 'velocity')
    check('velocity chart and average velocity (8 h) appear', await br.evalJs(has('8 h')))
  } catch (e) {
    console.log('FAILED:', e.message)
    try {
      await br.shot(`${SHOTS}/pms_sprints_failure.png`)
    } catch (x) {}
    process.exitCode = 1
  } finally {
    await br.close()
    for (const t of (await api('GET', `/tasks/list?project_id=${project.id}&page_size=50`)).detail || [])
      await api('DELETE', `/tasks/${t.id}`)
    for (const s of await sprintsOf().catch(() => []))
      if (s.status === 'Planned') await api('DELETE', `/sprints/${s.id}`)
    await api('DELETE', `/projects/${project.id}`)
    console.log(
      results.every(Boolean) && !process.exitCode
        ? `\nALL ${results.length} CHECKS PASSED`
        : `\n${results.filter(x => !x).length} FAILED or stopped early`
    )
  }
})()
