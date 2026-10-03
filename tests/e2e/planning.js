// End-to-end check of Planning (Gantt drag & drop with rules, critical path, warnings, roadmap, WBS, dependencies)
// against the running app (http://127.0.0.1:3000) and API (:8000). Needs Google Chrome.
// Run from frontend/:  node tests/e2e/planning.js   (creates and then deletes its own test data)
const fs = require('fs')
const path = require('path')
const { launch } = require('./cdp')

const ROOT = `${process.env.PMS_APP || 'http://127.0.0.1:3000'}/appModules/projects`
const API = 'http://127.0.0.1:8000/api'
const TOKEN = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
const SHOTS = require('os').tmpdir()
const NAME = 'Planning E2e Check'

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
  const project = (await api('POST', '/projects/create', { project_name: NAME, project_type: 'Internal', start_date: d(0), end_date: d(60), project_manager_name: 'Qa Manager' })).data
  const mk = async (title, a, b, extra = {}) => (await api('POST', '/tasks/create', { project_id: project.id, title, start_date: d(a), due_date: d(b), estimated_hours: 8, ...extra })).data
  const design = await mk('Design the screens', 0, 4)
  const build = await mk('Build the api', 5, 14)
  const test = await mk('Test the release', 15, 18)
  const guide = await mk('Write user guide', 2, 6)
  await api('POST', `/tasks/${build.id}/dependencies`, { depends_on_id: design.id })
  await api('POST', `/tasks/${test.id}/dependencies`, { depends_on_id: build.id })
  await api('POST', '/tasks/create', { project_id: project.id, title: 'Undated idea' })
  const release = (await api('POST', `/projects/${project.id}/milestones`, { name: 'Release', due_date: d(16) })).data
  await mk('Late for milestone', 10, 20, { milestone_id: release.id })

  const br = await launch(path.join(SHOTS, 'chrome-planning'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const all = (...e) => e.join(' && ')
  const barBox = key => br.evalJs(`JSON.stringify(document.querySelector('[data-bar="${key}"]').getBoundingClientRect())`).then(JSON.parse)
  // Mouse drag: press on the bar, move the window by dx pixels, release.
  const dragBar = (key, dx) =>
    br.evalJs(`(async () => {
      const bar = document.querySelector('[data-bar="${key}"]')
      const r = bar.getBoundingClientRect()
      const x = r.left + r.width / 2, y = r.top + r.height / 2
      bar.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }))
      await new Promise(res => setTimeout(res, 80))
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x + ${dx}, clientY: y }))
      await new Promise(res => setTimeout(res, 80))
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x + ${dx}, clientY: y }))
      return true
    })()`)

  try {
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}&tab=planning`)
    await br.waitFor(`document.querySelectorAll('[data-bar]').length === 5`, 'bars')
    await br.sleep(800)
    check('Planning tab draws the 5 dated tasks as bars', true)
    check('the undated task is listed under "Not on the timeline yet"', (await br.text()).includes('Not on the timeline yet') && (await br.text()).includes('Undated idea'))
    check('2 dependency arrows drawn', (await br.evalJs(`document.querySelectorAll('svg path[marker-end]').length`)) === 2)
    check('critical path = 3 tasks (design -> build -> test)', (await br.text()).includes('Critical path (3)'))
    const text = await br.text()
    check('warnings: undated task and milestone due before its task', text.includes('no start or due date') && text.includes("Milestone 'Release' is due"))
    check('milestone diamond for Release on the timeline', (await br.evalJs(`!![...document.querySelectorAll('[title]')].find(e => e.title.startsWith('Release · due'))`)))

    // Week zoom = 14 px a day. Moving "Build" 3 days earlier would start it before Design is due.
    const before = await barBox(build.task_key)
    await dragBar(build.task_key, -42)
    await br.waitFor(has('so it can start from'), 'blocked move')
    await br.sleep(1200)
    const after = await barBox(build.task_key)
    check('dragging Build before its blocker is refused and the bar goes back', Math.abs(after.left - before.left) < 2, `${before.left} -> ${after.left}`)

    // Moving the user guide 5 days later is fine.
    await dragBar(guide.task_key, 70)
    await br.waitFor(has('rescheduled'), 'moved')
    await br.sleep(800)
    const moved = (await api('GET', `/tasks/${guide.id}`)).detail
    check('dragging the user guide 5 days later saves the new dates', moved.start_date === d(7) && moved.due_date === d(11), `${moved.start_date} ${moved.due_date}`)

    const weekWidth = (await barBox(design.task_key)).width
    await br.evalJs(`[...document.querySelectorAll('main button')].find(b => b.innerText.trim().toLowerCase() === 'day').click()`)
    await br.sleep(600)
    check('Day zoom makes the bars wider', (await barBox(design.task_key)).width > weekWidth * 2)
    await br.shot(`${SHOTS}/pms_gantt.png`)

    // ---------- Roadmap ----------
    await br.goto(`${ROOT}/planning/roadmap/`)
    await br.waitFor(has(NAME), 'roadmap')
    check('Roadmap shows the project bar and its milestone', await br.evalJs(`!![...document.querySelectorAll('[title]')].find(e => e.title.startsWith('Release · due')) && !![...document.querySelectorAll('a[title]')].find(e => e.title.startsWith('${NAME}:'))`))

    // ---------- WBS ----------
    await br.goto(`${ROOT}/planning/wbs/?projectId=${project.id}`)
    await br.waitFor(all(has('1. Release'), has('Not in a milestone')), 'wbs')
    check('WBS groups tasks under milestones with hour totals', (await br.text()).includes('Work Items'))

    // ---------- Dependencies ----------
    await api('POST', `/tasks/${build.id}/status`, { status: 'In Progress' })
    await br.goto(`${ROOT}/planning/dependencies/`)
    await br.waitFor(has(build.task_key), 'dependencies')
    await br.evalJs(`[...document.querySelectorAll('main button')].find(b => b.innerText.includes('Only problems')).click()`)
    await br.waitFor(has('Work started while the blocker is not done'), 'problem flagged')
    check('Dependencies screen flags "work started while the blocker is not done"', true)
  } catch (e) {
    console.log('FAILED:', e.message)
    try {
      await br.shot(`${SHOTS}/pms_planning_failure.png`)
    } catch (x) {}
    process.exitCode = 1
  } finally {
    await br.close()
    for (const t of (await api('GET', `/tasks/list?project_id=${project.id}&page_size=50`)).detail || []) await api('DELETE', `/tasks/${t.id}`)
    await api('DELETE', `/projects/${project.id}`)
    console.log(results.every(Boolean) && !process.exitCode ? `\nALL ${results.length} CHECKS PASSED` : `\n${results.filter(x => !x).length} FAILED or stopped early`)
  }
})()
