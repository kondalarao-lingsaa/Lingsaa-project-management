// End-to-end check of Task Calendar (month/week, drag to reschedule, add on a day), Capacity (weekly heatmap +
// drill-down) and Utilization (approved vs available, date validation) against the running app (:3000) and API (:8000).
// Needs Google Chrome. Run from frontend/:  node tests/e2e/workload.js   (creates and then deletes its own test data)
// A second login (user 2, "qa.manager") approves the hours, because nobody may approve their own time.
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { launch } = require('./cdp')

const ROOT = `${process.env.PMS_APP || 'http://127.0.0.1:3000'}/appModules/projects`
const API = 'http://127.0.0.1:8000/api'
const TOKEN = fs
  .readFileSync(path.join(__dirname, '../../.env.local'), 'utf8')
  .match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1]
  .trim()
const BACKEND = path.join(__dirname, '../../../backend/pms_api')
const MANAGER_TOKEN = execFileSync(
  path.join(BACKEND, 'venv/Scripts/python.exe'),
  [
    '-c',
    "import time; from jose import jwt; from app.core.config import settings as s; print(jwt.encode({'client_id': 900001, 'user_id': 2, 'username': 'qa.manager', 'role': 'admin', 'exp': int(time.time()) + 3600}, s.JWT_SECRET, algorithm=s.JWT_ALGORITHM))"
  ],
  { cwd: BACKEND }
)
  .toString()
  .trim()
const SHOTS = require('os').tmpdir()
const NAME = 'Workload E2e Check'

const api = async (method, url, body, token = TOKEN) => {
  const r = await fetch(API + url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })

  return r.json()
}
const iso = x =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
const addDays = (s, n) => {
  const x = new Date(`${s}T00:00:00`)
  x.setDate(x.getDate() + n)

  return iso(x)
}
const today = iso(new Date())
const monday = addDays(today, -((new Date().getDay() + 6) % 7))
const friday = addDays(monday, 4)
const d = n => addDays(today, n)

;(async () => {
  const results = []
  const check = (name, ok, extra = '') => {
    results.push(ok)
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  [${extra}]`))
  }

  for (const p of (await api('GET', `/projects/list?search=${encodeURIComponent(NAME)}&page_size=20`)).detail || [])
    if (p.project_name === NAME) await api('DELETE', `/projects/${p.id}`)
  const projectStart = addDays(monday, -12)
  const project = (
    await api('POST', '/projects/create', {
      project_name: NAME,
      project_type: 'Internal',
      start_date: projectStart,
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
  await api('POST', `/projects/${project.id}/members`, {
    member_name: 'Dev User',
    user_id: 1,
    role: 'Developer',
    allocation_pct: 50,
    hourly_rate: 500
  })
  const mk = async body => (await api('POST', '/tasks/create', { project_id: project.id, ...body })).data
  const aStart = today < monday ? monday : today > friday ? friday : today
  const big = await mk({
    title: 'Big build this week',
    assignee_name: 'Anita Rao',
    estimated_hours: 30,
    start_date: aStart,
    due_date: friday
  })
  const late = await mk({
    title: 'Late fix',
    assignee_name: 'Anita Rao',
    estimated_hours: 8,
    start_date: d(-6),
    due_date: d(-3)
  })
  const review = await mk({ title: 'Review the docs', assignee_name: 'Anita Rao', estimated_hours: 2, due_date: d(3) })
  await mk({ title: 'Someday research', assignee_name: 'Anita Rao', estimated_hours: 10 })
  await mk({ title: 'Nobody owns this', estimated_hours: 5, due_date: d(7) })
  const devTask = await mk({
    title: 'Dev logging task',
    assignee_name: 'Dev User',
    estimated_hours: 20,
    start_date: projectStart,
    due_date: d(20)
  })
  await api('POST', `/projects/${project.id}/milestones`, { name: 'Beta', due_date: d(5) })

  // Hours for Utilization: 4 h this week + 2 h last week approved, 3 h last week still waiting.
  const prevMonday = addDays(monday, -7)
  const logDay = today > friday ? friday : today
  const e1 = (await api('POST', '/timesheets/entries', { task_id: devTask.id, work_date: logDay, hours: 4 })).data
  const e2 = (
    await api('POST', '/timesheets/entries', { task_id: devTask.id, work_date: addDays(prevMonday, 1), hours: 2 })
  ).data
  await api('POST', '/timesheets/entries', { task_id: devTask.id, work_date: prevMonday, hours: 3 })
  await api('POST', '/timesheets/submit', { week_start: monday })
  await api('POST', '/timesheets/submit', { week_start: prevMonday })
  await api('POST', '/timesheets/approve', { entry_ids: [e1.id, e2.id] }, MANAGER_TOKEN)

  const br = await launch(path.join(SHOTS, 'chrome-workload'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const chip = key => `document.querySelector('[data-task="${key}"]')`
  // HTML5 drag: start on the chip, hover and drop on the target day cell.
  const dragTo = (key, day) =>
    br
      .evalJs(
        `(() => {
      const el = ${chip(key)}, target = document.querySelector('[data-day="${day}"]')
      if (!el || !target) return false
      const dt = new DataTransfer(), r = el.getBoundingClientRect(), t = target.getBoundingClientRect()
      el.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt, clientX: r.left + 4, clientY: r.top + 4 }))
      return true
    })()`
      )
      .then(async ok => {
        await br.sleep(150)
        await br.evalJs(`(() => {
        const target = document.querySelector('[data-day="${day}"]'), dt = new DataTransfer(), t = target.getBoundingClientRect()
        target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: t.left + 10, clientY: t.top + 10 }))
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: t.left + 10, clientY: t.top + 10 }))
        return true
      })()`)
        return ok
      })

  try {
    await br
      .evalJs(
        `localStorage.removeItem('access_token'); localStorage.removeItem('user_id'); localStorage.removeItem('username'); true`
      )
      .catch(() => {})

    // ---------- Task Calendar ----------
    await br.goto(`${ROOT}/tasks/calendar/?projectId=${project.id}`)
    await br.waitFor(`!!${chip(big.task_key)} && !!${chip(review.task_key)}`, 'calendar chips')
    check('Task Calendar shows the project tasks on the month grid', true)
    check(
      'a multi-day task shows once, as a pill on its due day (no long bar)',
      await br.evalJs(
        `document.querySelectorAll('[data-task="${big.task_key}"]').length === 1 && !!document.querySelector('[data-day="${friday}"] [data-task="${big.task_key}"]')`
      )
    )
    check(
      'overdue task is flagged overdue (red status dot)',
      await br.evalJs(
        `${chip(late.task_key)} ? ${chip(late.task_key)}.dataset.overdue === 'true' : ${JSON.stringify(
          late.due_date
        )} < document.querySelector('[data-day]').dataset.day`
      )
    )
    await br.evalJs(`document.querySelector('[data-day="${friday}"]').click()`)
    await br.waitFor(`!!document.querySelector('[data-day-panel]')`, 'day panel')
    check(
      'clicking a day opens its agenda panel with the task card',
      await br.evalJs(`document.querySelector('[data-day-panel]').innerText.includes(${JSON.stringify(big.title)})`)
    )
    await br.evalJs(`document.querySelector('[aria-label="Close day panel"]').click()`)
    await br.waitFor(has('1 open task has no dates'), 'undated link')
    check('the undated task is counted with a link ("1 open task has no dates")', true)

    // The month grid shows only the weeks the month needs; step forward when a date is in the next month.
    const showDay = async day => {
      for (let i = 0; i < 2 && !(await br.evalJs(`!!document.querySelector('[data-day="${day}"]')`)); i++) {
        await br.evalJs(`document.querySelector('[aria-label="Next"]').click()`)
        await br.sleep(900)
      }
    }
    await showDay(d(5))
    await br.waitFor(has('Beta'), 'milestone')
    check('the Beta milestone appears on the calendar', true)

    await showDay(review.due_date)
    await br.waitFor(`!!${chip(review.task_key)}`, 'review pill')
    const target = (await br.evalJs(`!!document.querySelector('[data-day="${d(5)}"]')`)) ? d(5) : d(1)
    await dragTo(review.task_key, target)
    await br.waitFor(has('rescheduled'), 'reschedule toast')
    await br.sleep(500)
    const moved = (await api('GET', `/tasks/${review.id}`)).detail
    check(
      'dragging a due-date-only task to another day moves the due date and leaves the start empty',
      moved.due_date === target && !moved.start_date,
      `${moved.start_date} ${moved.due_date}`
    )

    await showDay(d(8))
    await br.evalJs(`document.querySelector('[aria-label="Add task due ${d(8)}"]').click()`)
    await br.waitFor(
      `document.querySelector('#due_date') && document.querySelector('#due_date').value === '${d(8)}'`,
      'drawer due date'
    )
    check('"+" on a day opens New Task with that due date filled in', true)
    await br.evalJs(`[...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Close').click()`)
    await br.sleep(400)

    await br.evalJs(
      `[...document.querySelectorAll('main button')].find(b => b.innerText.trim().toLowerCase() === 'week').click()`
    )
    await br.waitFor(
      `document.querySelector('[data-cal-title]').innerText.includes(' - ') && document.querySelectorAll('[data-day]').length === 7`,
      'week view'
    )
    check('Week view shows 7 days', true)
    await br.shot(`${SHOTS}/pms_calendar_week.png`)

    // ---------- Capacity ----------
    await br.goto(`${ROOT}/resources/capacity/?projectId=${project.id}`)
    await br.waitFor(`!!document.querySelector('[data-cell="Anita Rao|0"]')`, 'capacity grid')
    const cap = (await api('GET', `/resources/capacity?project_id=${project.id}`)).detail
    const w0 = cap.people.find(p => p.member_name === 'Anita Rao').weeks[0]
    const cell = await br.evalJs(`document.querySelector('[data-cell="Anita Rao|0"]').innerText`)
    // 30 h build + 8 h overdue fix + part of the moved 2 h review all land in this week; 20 h = 5 days x 8 h x 50%.
    check(
      'Capacity: Anita this week shows planned / available from the API (20 h available, 38+ planned)',
      cell.replace(/\s/g, '') === `${Math.round(w0.planned)}/${Math.round(w0.available)}` &&
        w0.available === 20 &&
        w0.planned >= 38,
      `${cell} vs ${JSON.stringify(w0)}`
    )
    check(
      'the over-full week is flagged Over with its %',
      w0.state === 'Over' &&
        (await br.evalJs(`document.querySelector('[data-cell="Anita Rao|0"]').title`)).includes(`${w0.load_pct}%`)
    )
    check(
      'unassigned work card shows 1 task',
      await br
        .waitFor(`/Unassigned Work\\s*1 task\\b/.test(document.body.innerText)`, 'project unassigned count')
        .then(() => true)
        .catch(() => false),
      JSON.stringify(cap.unassigned) + ' | ' + JSON.stringify(((await br.text()).match(/Unassigned[\s\S]{0,60}/) || [''])[0])
    )
    await br.evalJs(`document.querySelector('[data-person="Anita Rao"]').click()`)
    await br.waitFor(has('Over-full in'), 'drill-down')
    const drill = await br.text()
    check(
      'clicking Anita lists her tasks with the overdue one and the unscheduled hours',
      drill.includes(late.task_key) && drill.includes('Overdue') && drill.includes('10 h of work has no due date')
    )
    await br.shot(`${SHOTS}/pms_capacity.png`)

    // ---------- Utilization ----------
    await br.goto(`${ROOT}/resources/utilization/?projectId=${project.id}`)
    await br.waitFor(`!!document.querySelector('[data-person="Dev User"]')`, 'utilization rows')
    const row = await br.evalJs(`document.querySelector('[data-person="Dev User"]').innerText`)
    const util = (await api('GET', `/resources/utilization?project_id=${project.id}`)).detail.people.find(
      p => p.member_name === 'Dev User'
    )
    check('Utilization: Dev User shows 6 h approved and 3 h waiting', row.includes('6 h') && row.includes('3 h'), row)
    check(
      'utilization % on screen matches approved / available',
      row.includes(`${util.utilization}%`),
      `${util.utilization} in ${row}`
    )
    await br.evalJs(
      `(() => { const el = document.querySelector('#util_from'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '${d(
        5
      )}'); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`
    )
    await br.waitFor(has('To date cannot be before From date'), 'range error')
    check('From after To shows a field error', true)
    await br.evalJs(
      `[...document.querySelectorAll('main button')].find(b => b.innerText.trim() === 'This month').click()`
    )
    await br.waitFor(
      `document.querySelector('#util_from').value === '${today.slice(0, 7)}-01' && !${has(
        'To date cannot be before From date'
      )}`,
      'preset'
    )
    await br.sleep(300)
    check(
      '"This month" preset resets the period and clears the error (no red border)',
      !(await br.evalJs(`document.querySelector('#util_from').className.includes('border-red-500')`))
    )
    await br.shot(`${SHOTS}/pms_utilization.png`)
  } catch (e) {
    console.log('FAILED:', e.message)
    try {
      await br.shot(`${SHOTS}/pms_workload_failure.png`)
    } catch (x) {}
    process.exitCode = 1
  } finally {
    await br.close()
    for (const t of (await api('GET', `/tasks/list?project_id=${project.id}&page_size=50`)).detail || [])
      await api('DELETE', `/tasks/${t.id}`)
    await api('DELETE', `/projects/${project.id}`)
    console.log(
      results.every(Boolean) && !process.exitCode
        ? `\nALL ${results.length} CHECKS PASSED`
        : `\n${results.filter(x => !x).length} FAILED or stopped early`
    )
  }
})()
