// End-to-end check of Communication: header bell (unread count, open + mark read), @mention suggestions in task
// comments, Mentions / Comments / Activity screens, against the running app (:3000) and API (:8000).
// Needs Google Chrome. Run from frontend/:  node tests/e2e/communication.js   (creates and then deletes its own test data)
// A second login (user 2, "qa.manager") acts through the API so the browser user (dev.user) receives notifications.
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
const NAME = 'Communication E2e Check'

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
const d = n => {
  const x = new Date()
  x.setDate(x.getDate() + n)

  return iso(x)
}

;(async () => {
  const results = []
  const check = (name, ok, extra = '') => {
    results.push(ok)
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  [${extra}]`))
  }

  for (const p of (await api('GET', `/projects/list?search=${encodeURIComponent(NAME)}&page_size=20`)).detail || [])
    if (p.project_name === NAME) await api('DELETE', `/projects/${p.id}`)
  await api('POST', '/notifications/read', {})
  await api('POST', '/notifications/read', {}, MANAGER_TOKEN)
  const project = (
    await api('POST', '/projects/create', {
      project_name: NAME,
      project_type: 'Internal',
      start_date: d(-5),
      end_date: d(60),
      budget: 10000,
      project_manager_name: 'Priya Shah'
    })
  ).data
  for (const s of ['Pending Approval', 'Approved', 'Active'])
    await api('POST', `/projects/${project.id}/status`, { status: s })
  await api('POST', `/projects/${project.id}/members`, {
    member_name: 'Dev User',
    user_id: 1,
    role: 'Developer',
    allocation_pct: 10
  })
  await api('POST', `/projects/${project.id}/members`, {
    member_name: 'Qa Manager', // linked to the login user, so the team shows its real name "QA Manager"
    user_id: 2,
    role: 'Team Lead',
    allocation_pct: 10
  })
  await api('POST', `/projects/${project.id}/members`, {
    member_name: 'Anita Rao',
    role: 'Developer',
    allocation_pct: 0
  })
  // The manager gives dev a task -> dev's bell shows it.
  const task = (
    await api(
      'POST',
      '/tasks/create',
      { project_id: project.id, title: 'Fix the invoice total', assignee_name: 'Dev User', estimated_hours: 3 },
      MANAGER_TOKEN
    )
  ).data

  const br = await launch(path.join(SHOTS, 'chrome-communication'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`

  try {
    await br.goto(`${ROOT}/dashboard/`)
    await br.evalJs(
      `localStorage.removeItem('access_token'); localStorage.removeItem('user_id'); localStorage.removeItem('username'); true`
    )
    await br.goto(`${ROOT}/communication/comments/?projectId=${project.id}`)

    // ---------- bell ----------
    await br.waitFor(`Number(document.querySelector('[data-unread]')?.getAttribute('data-unread')) >= 1`, 'bell count')
    check('header bell shows an unread count', true)
    await br.evalJs(`document.querySelector('[data-bell]').click()`)
    await br.waitFor(has(`Qa Manager assigned ${task.task_key} to you`), 'bell list')
    check('the bell lists "Qa Manager assigned … to you"', true)
    await br.evalJs(
      `[...document.querySelectorAll('[data-notification="assigned"]')].find(b => b.innerText.includes(${JSON.stringify(
        task.task_key
      )})).click()`
    )
    await br.waitFor(`location.pathname.includes('/tasks/taskDetails') && ${has(task.title)}`, 'opened task')
    check('clicking a notification opens the task', true)
    await br.sleep(800)
    const after = (await api('GET', '/notifications?unread_only=true')).detail.filter(n => n.task_id === task.id)
    check('…and marks it read', after.length === 0, JSON.stringify(after))

    // ---------- @mention in a comment ----------
    await br.waitFor(`!!document.querySelector('#task_comment')`, 'comment box')
    await br.setInput('#task_comment', 'Thanks @Qa')
    await br.waitFor(
      `!!document.querySelector('[data-mention-list]') && document.querySelector('[data-mention-list]').innerText.includes('QA Manager')`,
      'suggestions'
    )
    check('typing "@Qa" suggests the team member QA Manager', true)
    await br.evalJs(
      `[...document.querySelectorAll('[data-mention-list] button')].find(b => b.innerText.includes('QA Manager')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))`
    )
    await br.waitFor(`document.querySelector('#task_comment').value === 'Thanks @QA Manager '`, 'inserted')
    check('choosing it inserts "@QA Manager "', true)
    await br.setInput('#task_comment', 'Thanks @QA Manager I will fix it today')
    await br.evalJs(`[...document.querySelectorAll('main button')].find(b => b.innerText.trim() === 'Comment').click()`)
    await br.waitFor(
      `[...document.querySelectorAll('main li span')].some(s => s.innerText === '@QA Manager')`,
      'posted'
    )
    check('the posted comment shows the mention highlighted', true)
    const mgrMentions = (await api('GET', '/communication/mentions?unread_only=true', null, MANAGER_TOKEN)).detail
    check(
      'Qa Manager receives the mention',
      mgrMentions.some(m => m.task_id === task.id && (m.comment || '').includes('I will fix it today')),
      JSON.stringify(mgrMentions.slice(0, 2))
    )

    // ---------- Mentions screen (manager mentions dev back) ----------
    await api('POST', `/tasks/${task.id}/comments`, { body: '@Dev User please also check the GST line' }, MANAGER_TOKEN)
    await api('POST', `/tasks/${task.id}/status`, { status: 'In Progress' }, MANAGER_TOKEN)
    await br.goto(`${ROOT}/communication/mentions/`)
    await br.waitFor(has('please also check the GST line'), 'mention listed')
    check(
      'Mentions shows who mentioned me, on which task, with the comment',
      await br.evalJs(`${has('Qa Manager')} && ${has(task.task_key)}`)
    )
    await br.evalJs(
      `[...document.querySelectorAll('main button')].find(b => b.innerText.trim() === 'Mark read').click()`
    )
    await br.waitFor(
      `[...document.querySelectorAll('main button')].some(b => b.innerText.trim() === 'Mark unread')`,
      'marked read'
    )
    const mentionsLeft = (await api('GET', '/communication/mentions?unread_only=true')).stack_values.unread
    check('"Mark read" clears the unread mention', mentionsLeft === 0, mentionsLeft)

    // ---------- Comments screen ----------
    await br.goto(`${ROOT}/communication/comments/?projectId=${project.id}`)
    await br.waitFor(`document.querySelectorAll('[data-comment]').length === 2`, 'comments')
    check(
      'Comments lists both comments of the project, newest first',
      await br.evalJs(`document.querySelector('[data-comment]').innerText.includes('GST line')`)
    )
    await br.setInput('input[aria-label="Search comments"]', 'fix it today')
    await br.waitFor(`document.querySelectorAll('[data-comment]').length === 1`, 'search')
    check('search narrows to the matching comment', true)

    // ---------- Activity screen ----------
    await br.goto(`${ROOT}/communication/activity/?projectId=${project.id}`)
    await br.waitFor(`document.querySelectorAll('[data-activity]').length >= 4`, 'activity')
    check(
      'Activity shows the task timeline (created, comments, status) grouped by day',
      await br.evalJs(
        `document.body.innerText.toLowerCase().includes('today') && !!document.querySelector('[data-activity="status"]') && !!document.querySelector('[data-activity="created"]')`
      )
    )
    await br.setInput('#activity_action', 'status')
    await br.waitFor(
      `document.querySelectorAll('[data-activity]').length >= 1 && [...document.querySelectorAll('[data-activity]')].every(e => e.dataset.activity === 'status')`,
      'filtered'
    )
    check('the "Status changes" filter shows only status rows', true)
    await br.shot(`${SHOTS}/pms_activity.png`)

    // ---------- bell: status notification + mark all read ----------
    await br.evalJs(`document.querySelector('[data-bell]').click()`)
    await br.waitFor(has(`${task.task_key} moved to In Progress`), 'status notification')
    check('status change by someone else reaches the bell', true)
    await br.shot(`${SHOTS}/pms_bell.png`)
    await br.clickText('button', 'Mark all read')
    await br.waitFor(`document.querySelector('[data-unread]').getAttribute('data-unread') === '0'`, 'all read')
    check('"Mark all read" empties the badge', true)
  } catch (e) {
    console.log('FAILED:', e.message)
    try {
      await br.shot(`${SHOTS}/pms_communication_failure.png`)
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
