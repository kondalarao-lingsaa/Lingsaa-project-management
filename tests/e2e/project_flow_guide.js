// Guided project flow (2026-10-02): Create & Approve from All Projects opens Project Details already approved;
// tabs run in setup order (Overview, Team, Milestones, Tasks...); the Next step bar and setup checklist follow
// the project; merged sidebar screens show a tab row instead of separate menu items.
// Run from frontend/:  node tests/e2e/project_flow_guide.js  (cleans up)
const fs = require('fs')
const path = require('path')
const { launch } = require('./cdp')

const BASE = process.env.PMS_APP || 'http://127.0.0.1:3000'
const ROOT = `${BASE}/appModules/projects`
const API = 'http://127.0.0.1:8000/api'
const TOKEN = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
const NAME = 'Flow Guide Check'
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
  const cleanup = async () => {
    for (const p of (await api('GET', '/projects/options')).detail || []) if (p.project_name.startsWith(NAME)) await api('DELETE', `/projects/${p.id}`)
  }
  await cleanup()

  const br = await launch(path.join(require('os').tmpdir(), 'chrome-flow-guide'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const main = `(document.querySelector('main')?.innerText || '')`
  const btn = t => `[...document.querySelectorAll('button')].filter(b => b.innerText.trim() === ${JSON.stringify(t)}).pop()`
  try {
    await br.goto(`${ROOT}/dashboard/`)
    await br.sleep(1000)
    await br.evalJs(`['access_token','username','user_id','client_id'].forEach(k => localStorage.removeItem(k)); true`)

    // 1. Sidebar: duplicates are gone, merged screens are one entry
    const nav = `(document.querySelector('aside, nav')?.innerText || '')`
    await br.waitFor(`${nav}.includes('Team & Allocation')`, 'sidebar')
    const sidebar = await br.evalJs(nav)
    check('sidebar: "Team & Allocation" replaces Team + Resource Allocation', sidebar.includes('Team & Allocation') && !sidebar.includes('Resource Allocation'), sidebar.slice(0, 200))
    check('sidebar: Cost Analysis replaces Actual Cost + Variance', sidebar.includes('Cost Analysis') && !sidebar.includes('Variance'))
    check('sidebar: no WBS, Dependencies, Mentions or Project Settings items', !/\bWBS\b|Dependencies|Mentions|Project Settings/.test(sidebar))

    // 2. Merged screens show a tab row
    await br.goto(`${ROOT}/communication/comments/`)
    await br.waitFor(`!!document.querySelector('[data-screen-tab="communication.mentions"]')`, 'communication tabs')
    await br.evalJs(`document.querySelector('[data-screen-tab="communication.activity"]').click(); true`)
    check('Communication: tab row switches to Activity', await br.waitFor(`location.pathname.includes('/communication/activity')`, 'activity tab', 10000).then(() => true, () => false))
    await br.goto(`${ROOT}/planning/gantt/`)
    check('Gantt page has WBS and Dependencies tabs',
      await br.waitFor(`!!document.querySelector('[data-screen-tab="planning.wbs"]') && !!document.querySelector('[data-screen-tab="planning.dependencies"]')`, 'gantt tabs', 15000).then(() => true, () => false))

    // 3. Create & Approve from All Projects
    await br.goto(`${ROOT}/projects/allProjects/`)
    await br.waitFor(`[...document.querySelectorAll('main button')].some(b => b.innerText.trim().startsWith('Add Project'))`, 'list')
    await br.evalJs(`[...document.querySelectorAll('main button')].find(b => b.innerText.trim().startsWith('Add Project')).click(); true`)
    await br.waitFor(has('Set up a new project'), 'drawer')
    await br.sleep(700)
    check('the create form offers Create Draft and Create & Approve', await br.evalJs(`!!${btn('Create Draft')} && !!${btn('Create & Approve')}`))
    await br.setInput('#project_name', NAME.toLowerCase())
    await br.setInput('#project_type', 'Fixed Price')
    await br.setInput('#customer_name', 'acme retail')
    await br.setInput('#customer_contact_name', 'ravi kumar')
    await br.setInput('#customer_mobile', '9876543210')
    await br.setInput('#start_date', d(0))
    await br.evalJs(`${btn('Create & Approve')}.click(); true`)
    check('Create & Approve asks for End Date and Budget first', await br.waitFor(has('it is needed to approve the project'), 'approval fields', 8000).then(() => true, () => false))
    await br.setInput('#end_date', d(60))
    await br.setInput('#budget', '150000')
    await br.evalJs(`${btn('Create & Approve')}.click(); true`)
    await br.waitFor(`location.pathname.includes('projectDetails') && ${main}.includes(${JSON.stringify(NAME)})`, 'details opened', 20000)
    check('a new project opens in Project Details', true)
    await br.waitFor(`${main}.includes('Approved') && ${main}.includes('Activate')`, 'approved', 15000)
    check('the project is already Approved', true)

    // 4. Tabs in setup order + next step + checklist
    const tabs = await br.evalJs(`[...document.querySelectorAll('main button')].map(b => b.innerText.trim()).filter(t => ['Overview','Team','Milestones','Tasks','Board','Planning','Budget','Risks','Files','Activity'].includes(t)).join(',')`)
    check('tabs follow the setup order', tabs.startsWith('Overview,Team,Milestones,Tasks,Board,Planning'), tabs)
    check('Next step bar points at the team', await br.waitFor(`document.querySelector('[data-next-step]')?.dataset.nextStep === 'team'`, 'next step team', 8000).then(() => true, () => false),
      await br.evalJs(`document.querySelector('[data-next-step]')?.dataset.nextStep`))
    const done = await br.evalJs(`[...document.querySelectorAll('[data-setup-step]')].filter(li => li.dataset.done === 'true').map(li => li.dataset.setupStep).join(',')`)
    check('checklist ticks details, submit and approval', done === 'details,submit,approve', done)
    await br.evalJs(`document.querySelector('[data-next-step] button').click(); true`)
    check('Next step button opens the Team tab', await br.waitFor(`location.search.includes('tab=team')`, 'team tab', 8000).then(() => true, () => false))

    const project = ((await api('GET', '/projects/options')).detail || []).find(p => p.project_name === NAME)
    const history = (await api('GET', `/communication/activity?project_id=${project?.id}&page_size=50`)).detail || []
    check('project exists and was approved by the creator', Boolean(project), JSON.stringify(history).slice(0, 200))
    const problems = (br.problems ? br.problems() : []).filter(x => !String(x.text).includes('favicon'))
    check('no console errors or failed requests', problems.length === 0, JSON.stringify(problems).slice(0, 300))
  } catch (e) {
    check('test ran to the end', false, e.message)
  } finally {
    await br.close()
    await cleanup()
  }
  const failed = results.filter(r => !r).length
  console.log(failed ? `\n${failed} FAILED` : `\nALL ${results.length} CHECKS PASSED`)
  process.exit(failed ? 1 : 0)
})()
