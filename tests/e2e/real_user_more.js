// REAL-USER journeys for the modules outside the main project lifecycle. Every ACTION is done through the screens,
// each person signed in with their own email + password on /login (no dev login, no API set-up). The API is used
// only to READ for verification and, at the end, to clean up as the dev user.
// Journeys: A project setup + team linking, B timesheet rejection loop, C risks/issues, D sprints, E planning,
// F documents + @mentions, G templates, H client portal, I resource manager + finance, J reports, K settings,
// L global search, M close + reopen.
// Run from frontend/:  node tests/e2e/real_user_more.js      (ONLY=A,B,... to run some; KEEP=1 keeps the data)
// Needs the demo users (backend: scripts/seed_demo_roles.py), the app on :3000 and the API on :8000.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const ORIGIN = process.env.PMS_APP || 'http://127.0.0.1:3000'
const APP = `${ORIGIN}/appModules/projects`
const API = (process.env.PMS_API || 'http://127.0.0.1:8000') + '/api'
const DEV = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
const PASSWORD = 'Demo@123'
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'ui_more')
const STAMP = process.env.STAMP || String(Date.now()).slice(-6)
const DOWNLOADS = path.join(SHOTS, 'downloads', STAMP) // a fresh folder per run, so every download is a new file
fs.mkdirSync(DOWNLOADS, { recursive: true })
const NAME = `Zz UI More ${STAMP}`
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9447 // not cdp.js's 9333, so this can run next to the other e2e tests
const sleep = ms => new Promise(r => setTimeout(r, ms))

const USERS = {
  dev: 'dev.user@lingsaa.com',
  rohan: 'rohan.verma@lingsaa.com',
  priya: 'priya.sharma@lingsaa.com',
  arjun: 'arjun.mehta@lingsaa.com',
  anita: 'anita.rao@lingsaa.com',
  kiran: 'kiran.iyer@lingsaa.com',
  meena: 'meena.das@lingsaa.com',
  ravi: 'ravi.kumar@acmeretail.in'
}

// ---------- read-only API (verification) ----------
const tokens = {}
const tokenOf = async who => {
  if (who === 'devtoken') return DEV
  if (!tokens[who]) {
    const r = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: USERS[who], password: PASSWORD }) })).json()
    tokens[who] = r.detail.token
  }

  return tokens[who]
}
const api = async (method, url, body, who = 'devtoken') => {
  const r = await fetch(API + url, { method, headers: { Authorization: `Bearer ${await tokenOf(who)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })

  return r.json().catch(() => ({}))
}
const read = (url, who) => api('GET', url, null, who)

const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
const d = n => {
  const x = new Date()
  x.setDate(x.getDate() + n)

  return iso(x)
}
const mondayOf = s => {
  const x = new Date(s + 'T00:00:00')
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))

  return iso(x)
}
const THIS_MONDAY = mondayOf(d(0))
const LAST_TUESDAY = (() => {
  const x = new Date(THIS_MONDAY + 'T00:00:00')
  x.setDate(x.getDate() - 6)

  return iso(x)
})()

// ---------- a small Chrome driver (copy of cdp.js + real mouse/keyboard, files, downloads, toasts) ----------
async function launch(profile, width = 1440, height = 1000) {
  fs.rmSync(profile, { recursive: true, force: true })
  // Chrome's "Save password?" bubble after the sign-in form would take the keyboard and mouse: switch it off.
  fs.mkdirSync(path.join(profile, 'Default'), { recursive: true })
  fs.writeFileSync(path.join(profile, 'Default', 'Preferences'), JSON.stringify({ credentials_enable_service: false, profile: { password_manager_enabled: false, password_manager_leak_detection: false } }))
  const proc = spawn(CHROME, [`--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--disable-save-password-bubble', '--disable-features=PasswordManagerOnboarding,PasswordLeakDetection,AutofillServerCommunication', '--no-first-run', `--window-size=${width},${height}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
  let targets
  for (let i = 0; i < 80; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      if (targets.find(t => t.type === 'page')) break
    } catch (e) {}
    await sleep(250)
  }
  const page = targets.find(t => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise(r => (ws.onopen = r))
  let id = 0
  const pending = new Map()
  const issues = []
  const toasts = []
  const downloads = []
  const onEvent = m => {
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map(a => a.value ?? a.description ?? '').join(' ')
      if (text.startsWith('__TOAST__')) toasts.push({ error: text.startsWith('__TOAST__E'), text: text.slice(11) })
      else if (m.params.type === 'error' || m.params.type === 'warning') issues.push({ kind: `console.${m.params.type}`, text: text.slice(0, 600) })
    } else if (m.method === 'Runtime.exceptionThrown') issues.push({ kind: 'exception', text: (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 800) })
    else if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) issues.push({ kind: `http.${m.params.response.status}`, text: m.params.response.url.slice(0, 300) })
    else if (m.method === 'Network.loadingFailed' && !m.params.canceled && !/ERR_ABORTED/.test(m.params.errorText)) issues.push({ kind: 'network', text: `${m.params.errorText} ${m.params.type || ''}` })
    else if (m.method === 'Page.downloadWillBegin') downloads.push({ name: m.params.suggestedFilename, url: m.params.url })
  }
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    } else if (m.method) onEvent(m)
  }
  const send = (method, params = {}) =>
    new Promise(res => {
      const i = ++id
      pending.set(i, res)
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('DOM.enable')
  await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS })
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  // No dev login: every page uses the person's own sign-in. Toasts are reported to the console so they survive
  // page loads (an error toast of react-hot-toast has the red #ff4b4b icon).
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.removeItem('pms_dev_login') } catch (e) {}
      (() => { const seen = new WeakSet(); const scan = () => document.querySelectorAll('[role="status"]').forEach(el => { if (seen.has(el) || !el.innerText.trim()) return; seen.add(el);
        const bar = el.parentElement; const red = bar && [...bar.querySelectorAll('div')].some(x => getComputedStyle(x).backgroundColor === 'rgb(255, 75, 75)');
        console.log((red ? '__TOAST__E ' : '__TOAST__S ') + el.innerText.trim()) });
        const start = () => new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
        if (document.body) start(); else document.addEventListener('DOMContentLoaded', start) })()`
  })

  const evalJs = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails))

    return r.result.result.value
  }
  const waitFor = async (expr, label, ms = 20000) => {
    const start = Date.now()
    let last
    while (Date.now() - start < ms) {
      try {
        if (await evalJs(expr)) return true
      } catch (e) {
        last = e.message
      }
      await sleep(200)
    }
    throw new Error('timeout waiting for: ' + label + (last ? ` (${last.slice(0, 120)})` : ''))
  }
  const mouse = async (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra })
  // A real mouse click in the middle of the element (an element hidden under something else is reported).
  const clickEl = async (expr, label = expr) => {
    // A person waits for a closing drawer / fading backdrop before clicking: allow up to 3 s.
    let box
    for (let i = 0; i < 15; i++) {
      box = await measure(expr)
      if (!box || !box.covered) break
      await sleep(200)
    }
    if (!box) throw new Error('not found to click: ' + label)
    if (!box.w || !box.h) throw new Error('not visible to click: ' + label)
    if (box.covered) issues.push({ kind: 'covered', text: `${label} is under "${box.top}"` })
    await mouse('mouseMoved', box.x, box.y, { button: 'none', clickCount: 0 })
    await mouse('mousePressed', box.x, box.y)
    await mouse('mouseReleased', box.x, box.y)
    await sleep(150)
  }
  const measure = async expr => {
    return evalJs(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'center' }); const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2; const top = document.elementFromPoint(x, y);
      return { x, y, w: r.width, h: r.height, covered: !!top && top !== el && !el.contains(top) && !top.contains(el), top: top ? (top.innerText || top.className || top.tagName).toString().slice(0, 60) : '' } })()`)
  }
  const key = async (k, code, keyCode, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: keyCode, modifiers })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: keyCode, modifiers })
  }
  // Types like a person: focus, select what is there, delete it, type the text one key at a time, leave the field.
  const type = async (sel, text, { blur = true } = {}) => {
    const q = `document.querySelector(${JSON.stringify(sel)})`
    const ok = await evalJs(`(() => { const el = ${q}; if (!el) return false; el.scrollIntoView({ block: 'center' }); el.focus(); el.select ? el.select() : document.execCommand('selectAll'); return true })()`)
    if (!ok) throw new Error('field not found: ' + sel)
    await key('Backspace', 'Backspace', 8)
    for (const ch of String(text)) await send('Input.insertText', { text: ch })
    if (blur) await evalJs(`${q}.blur(); true`)
    await sleep(100)
  }
  // Selects and date pickers: set the value as the picker would.
  const pick = (sel, value) =>
    evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.focus(); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.blur(); return true })()`)
  const setFiles = async (sel, files) => {
    const doc = await send('DOM.getDocument', { depth: 1 })
    const node = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: sel })
    if (!node.result?.nodeId) throw new Error('file input not found: ' + sel)
    await send('DOM.setFileInputFiles', { nodeId: node.result.nodeId, files })
  }

  return {
    goto: async url => {
      await send('Page.navigate', { url })
      await sleep(600)
    },
    evalJs,
    waitFor,
    clickEl,
    type,
    pick,
    key,
    setFiles,
    send,
    problems: () => issues.splice(0),
    toasts: () => toasts.splice(0),
    downloads,
    text: () => evalJs('document.body.innerText'),
    shot: async file => {
      const r = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'))
    },
    close: async () => {
      try {
        await send('Browser.close')
      } catch (e) {}
      ws.close()
      proc.kill()
    }
  }
}

// ---------- results ----------
const results = [] // { j, name, ok, note }
const pageNotes = [] // console errors / failed requests / error toasts seen on a screen
const J = {}
const mark = (j, name, ok, note = '') => {
  results.push({ j, name, ok, note })
  console.log(`${ok ? 'PASS' : 'FAIL'} [${j}] ${name}${ok ? '' : `  -- ${note}`}`)
}

const main = async () => {
  fs.mkdirSync(SHOTS, { recursive: true })
  const br = await launch(path.join(os.tmpdir(), 'chrome-ui-more'))
  const S = {} // shared state across journeys
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const mainHas = t => `(document.querySelector('main')?.innerText || '').includes(${JSON.stringify(t)})`
  const btnX = (t, scope = 'document') => `[...${scope}.querySelectorAll('button')].filter(b => b.offsetParent && b.innerText.trim() === ${JSON.stringify(t)}).pop()`
  const btnStarts = (t, scope = 'document') => `[...${scope}.querySelectorAll('button')].filter(b => b.offsetParent && b.innerText.trim().startsWith(${JSON.stringify(t)})).pop()`
  const dialog = `document.querySelector('.MuiDialog-root, [role="dialog"]')`
  const click = (t, label) => br.clickEl(btnX(t), label || `button "${t}"`)
  const clickStarts = (t, label) => br.clickEl(btnStarts(t), label || `button "${t}..."`)
  const clickIn = (scope, t) => br.clickEl(btnX(t, scope), `button "${t}" in ${scope.slice(0, 40)}`)
  const rowX = t => `[...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes(${JSON.stringify(t)}))`
  const rowMenu = async (rowText, item) => {
    await br.clickEl(`(${rowX(rowText)})?.querySelector('td:last-child button, td:last-child svg')`, `row menu of ${rowText}`)
    await br.waitFor(`[...document.querySelectorAll('[role="menuitem"]')].some(m => m.innerText.trim().startsWith(${JSON.stringify(item)}))`, `menu item ${item}`, 5000)
    await br.clickEl(`[...document.querySelectorAll('[role="menuitem"]')].find(m => m.innerText.trim().startsWith(${JSON.stringify(item)}))`, `menu ${item}`)
  }
  let who = null

  // Records console errors, failed requests, overlapped buttons and error toasts of the screen just used.
  const screenCheck = (j, screen, { allow = [] } = {}) => {
    const probs = br.problems().filter(p => !/favicon|_next\/webpack|hot-update|Download the React DevTools|\[Fast Refresh\]/.test(p.text) && !allow.some(a => p.text.includes(a) || p.kind.includes(a)))
    const errs = br.toasts().filter(t => t.error && !allow.some(a => t.text.includes(a)))
    for (const p of probs) pageNotes.push({ j, screen, who, ...p })
    for (const t of errs) pageNotes.push({ j, screen, who, kind: 'error-toast', text: t.text })

    return probs.length + errs.length
  }
  const step = async (j, name, fn) => {
    br.toasts()
    try {
      const r = await fn()
      if (r === false) throw new Error('check was false')
      mark(j, name, true)

      return true
    } catch (e) {
      const file = path.join(SHOTS, `${j}_${name.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.png`)
      try {
        await br.shot(file)
      } catch (x) {}
      mark(j, name, false, `${(e.message || String(e)).slice(0, 300)} (as ${who}; shot ${file})`)
      screenCheck(j, `${name} (failed step)`)

      return false
    }
  }

  // ---------- sign in / out through the screens ----------
  const signIn = async person => {
    await br.goto(`${ORIGIN}/login/`)
    // Someone still signed in is sent on from /login: sign them out with the account menu.
    await sleep(800)
    if (await br.evalJs(`!!document.querySelector('[data-account]')`)) {
      await br.clickEl(`document.querySelector('[data-account]')`, 'account menu')
      await br.waitFor(`!!document.querySelector('[data-sign-out]')`, 'sign out item', 5000)
      await br.clickEl(`document.querySelector('[data-sign-out]')`, 'Sign out')
      await br.waitFor(`location.pathname.startsWith('/login')`, 'signed out')
    }
    await br.waitFor(`!!document.querySelector('[data-login-form]')`, 'login form')
    await br.type('#email', USERS[person])
    await br.type('#password', PASSWORD)
    await br.clickEl(`document.querySelector('[data-login-form] button[type=submit]')`, 'Sign in')
    await br.waitFor(`!location.pathname.startsWith('/login') && !!document.querySelector('[data-account]')`, `${person} signed in`, 25000)
    await sleep(800)
    who = person
    br.problems()
    br.toasts()
  }
  const open = async (url, ready, label) => {
    await br.goto(url.startsWith('http') ? url : `${APP}/${url}`)
    if (ready) await br.waitFor(ready, label || url, 25000)
    await sleep(700)
  }
  const sidebar = () => br.evalJs(`document.querySelector('aside nav')?.innerText || ''`)
  const projectTab = async (tab, ready) => open(`projects/projectDetails/?id=${S.pid}${tab === 'overview' ? '' : `&tab=${tab}`}`, ready || `${mainHas(NAME)}`, `project ${tab} tab`)
  const run = j => !ONLY || ONLY.includes(j[0])

  // =============================================================================================================
  // A. Project setup through the screens
  // =============================================================================================================
  J.A = async () => {
    await step('A', 'Priya signs in on the login page', () => signIn('priya'))
    await step('A', 'Priya creates a Fixed Price draft for Acme Retail from All Projects', async () => {
      await open('projects/allProjects/', btnStarts('Add Project') + ' !== undefined')
      await clickStarts('Add Project')
      await br.waitFor(has('Set up a new project'), 'project drawer')
      await sleep(600)
      await br.type('#project_name', NAME)
      await br.pick('#project_type', 'Fixed Price')
      await br.type('#customer_name', 'Acme Retail')
      await br.type('#customer_contact_name', 'Ravi Kumar')
      await br.type('#customer_mobile', '9876543210')
      await br.pick('#start_date', d(-21))
      await br.pick('#end_date', d(70))
      await br.type('#budget', '200000')
      const extraBtn = await br.evalJs(`!!${btnX('Create & Approve')}`)
      S.pmCanSelfApprove = extraBtn
      await click('Create Draft')
      await br.waitFor(`location.pathname.includes('projectDetails') || ${has(NAME)}`, 'created', 20000)
      await sleep(1500)
      const p = ((await read(`/projects/list?search=${encodeURIComponent(NAME)}&page_size=5`)).detail || []).find(x => x.project_name === NAME)
      if (!p) throw new Error('project not found after Create Draft')
      S.pid = p.id
      S.code = p.project_code
      screenCheck('A', 'All Projects > Add Project')

      return p.status === 'Draft' && p.project_manager_name === 'Priya Sharma'
    })
    if (!S.pid) return
    await step('A', 'Priya submits it for approval', async () => {
      await projectTab('overview', btnX('Submit for Approval') + ' !== undefined')
      await click('Submit for Approval')
      await sleep(800)
      if (await br.evalJs(`!!${dialog}`)) await br.clickEl(`[...document.querySelectorAll('.MuiDialog-root button')].filter(b => /Submit/.test(b.innerText)).pop()`, 'confirm submit')
      await br.waitFor(`${mainHas('Pending Approval')}`, 'pending')
      await sleep(800)
      screenCheck('A', 'Project Details (submit)')

      return (await read(`/projects/${S.pid}`)).detail.status === 'Pending Approval'
    })
    await step('A', 'Dev User (Admin) approves it from My Approvals', async () => {
      await signIn('dev')
      await open('approvals/', `!!document.querySelector('[data-approval-item="project-${S.pid}"]')`, 'approval item')
      await br.clickEl(`[...document.querySelector('[data-approval-item="project-${S.pid}"]').querySelectorAll('button')].find(b => b.innerText.trim() === 'Approve')`, 'Approve')
      await br.waitFor(`!!document.querySelector('#reason_text')`, 'note dialog')
      await br.type('#reason_text', 'Budget fits this quarter')
      await br.clickEl(`[...document.querySelectorAll('.MuiDialog-root button')].find(b => b.innerText.trim() === 'Approve')`, 'dialog Approve')
      await br.waitFor(`!document.querySelector('[data-approval-item="project-${S.pid}"]')`, 'item gone')
      screenCheck('A', 'My Approvals')

      return (await read(`/projects/${S.pid}`)).detail.status === 'Approved'
    })
    await step('A', 'Priya activates the approved project', async () => {
      await signIn('priya')
      await projectTab('overview', btnX('Activate') + ' !== undefined')
      await click('Activate')
      await sleep(800)
      if (await br.evalJs(`!!${dialog}`)) await br.clickEl(`[...document.querySelectorAll('.MuiDialog-root button')].filter(b => /Activate|Yes|Confirm/.test(b.innerText)).pop()`, 'confirm activate')
      await br.waitFor(`${btnX('Close Project')} !== undefined || ${mainHas('Active')}`, 'active')
      await sleep(800)
      screenCheck('A', 'Project Details (activate)')

      return (await read(`/projects/${S.pid}`)).detail.status === 'Active'
    })
    const addMember = async (typed, role, pct) => {
      await click('Add Member')
      await br.waitFor(has('Add Team Member'), 'member drawer')
      await sleep(800)
      // Type the first letters, then the browser offers the login users (datalist); picking one fills the full name.
      await br.type('#member_name', typed.slice(0, 3), { blur: false })
      const offered = await br.evalJs(`[...document.querySelectorAll('#pms-people option')].map(o => o.value)`)
      if (!offered.includes(typed)) throw new Error(`suggestion list does not offer ${typed}: ${offered.join(', ')}`)
      await br.type('#member_name', typed) // = choosing the suggestion
      await br.waitFor(`!!document.querySelector('[data-login-link]')`, 'link hint')
      const link = await br.evalJs(`document.querySelector('[data-login-link]').dataset.loginLink + ' | ' + document.querySelector('[data-login-link]').innerText`)
      await br.pick('#role', role)
      // Other testers' projects may hold part of this person's time: read the hint ("... - 40% free") and stay inside it.
      await sleep(800)
      const hint = await br.evalJs(`[...document.querySelectorAll('.MuiDrawer-root span')].map(e => e.innerText).find(t => /% free/.test(t)) || ''`)
      const free = /(\d+)% free/.test(hint) ? Number(hint.match(/(\d+)% free/)[1]) : 100
      // No free time (demo projects may book them fully): add them at 0% - on the team, time not planned.
      await br.type('#allocation_pct', String(Math.min(pct, free)))
      S.alloc = { ...(S.alloc || {}), [typed]: Math.min(pct, free) }
      await clickIn(`document.querySelector('.MuiDrawer-root')`, 'Add Member')
      await br.waitFor(`!${has('Add Team Member')}`, 'drawer closed', 15000)
      await sleep(1000)

      return link
    }
    await step('A', 'Priya adds Arjun (Team Lead) picking his name from the suggestion list - linked to his login', async () => {
      await projectTab('team', btnStarts('Add Member') + ' !== undefined')
      const link = await addMember('Arjun Mehta', 'Team Lead', 10)
      screenCheck('A', 'Team tab > Add Member')
      if (!link.startsWith('linked')) throw new Error('drawer said: ' + link)
      const m = ((await read(`/projects/${S.pid}/members`)).detail || []).find(x => x.member_name === 'Arjun Mehta')

      return m && m.user_id === 4
    })
    await step('A', 'Priya adds Anita (Member, Developer) the same way - linked', async () => {
      const link = await addMember('Anita Rao', 'Developer', 10)
      screenCheck('A', 'Team tab > Add Member')
      if (!link.startsWith('linked')) throw new Error('drawer said: ' + link)
      const m = ((await read(`/projects/${S.pid}/members`)).detail || []).find(x => x.member_name === 'Anita Rao')
      if (!m || m.user_id !== 5) throw new Error('stored member: ' + JSON.stringify(m))

      return true
    })
    await step('A', 'Priya adds a milestone and 3 tasks from the screens', async () => {
      await projectTab('milestones', btnStarts('Add Milestone') + ' !== undefined')
      await clickStarts('Add Milestone')
      await br.waitFor(`!!document.querySelector('.MuiDrawer-root #name')`, 'milestone drawer')
      await sleep(500)
      await br.type('#name', 'Design Sign-off')
      await br.pick('#due_date', d(10))
      if (await br.evalJs(`!!document.querySelector('#amount')`)) await br.type('#amount', '50000')
      await clickIn(`document.querySelector('.MuiDrawer-root')`, 'Add Milestone')
      await br.waitFor(`!document.querySelector('.MuiDrawer-root #name')`, 'milestone saved', 15000)
      screenCheck('A', 'Milestones tab > Add Milestone')
      const tasks = [
        ['design the home page', 'Anita Rao', 8, -14, 3],
        ['build the cart page', 'Anita Rao', 12, -10, 12],
        ['test the checkout', 'Arjun Mehta', 6, 0, 8]
      ]
      for (const [title, person, hours, s, e] of tasks) {
        await projectTab('tasks', btnStarts('Add Task', `document.querySelector('main')`) + ' !== undefined')
        await br.clickEl(btnStarts('Add Task', `document.querySelector('main')`), 'Add Task')
        await br.waitFor(has('Add work to a project'), 'task drawer')
        await br.waitFor(`[...document.querySelectorAll('#assignee_name option')].some(o => o.text.startsWith(${JSON.stringify(person)}))`, 'assignee options')
        await sleep(400)
        await br.type('#title', title)
        const v = await br.evalJs(`[...document.querySelectorAll('#assignee_name option')].find(o => o.text.startsWith(${JSON.stringify(person)})).value`)
        await br.pick('#assignee_name', v)
        await br.pick('#start_date', d(s))
        await br.pick('#due_date', d(e))
        await br.type('#estimated_hours', String(hours))
        if (title.startsWith('design')) {
          const ms = await br.evalJs(`[...document.querySelectorAll('#milestone_id option')].find(o => o.text.includes('Design Sign-off'))?.value`)
          if (ms) await br.pick('#milestone_id', ms)
        }
        await clickIn(`document.querySelector('.MuiDrawer-root')`, 'Submit')
        await br.waitFor(`!${has('Add work to a project')}`, `task ${title} saved`, 15000)
        await sleep(600)
      }
      screenCheck('A', 'Tasks tab > Add Task')
      const list = (await read(`/tasks/list?project_id=${S.pid}&page_size=50`)).detail || []
      S.tasks = Object.fromEntries(list.map(t => [t.title.split(' ')[0].toLowerCase(), t]))
      if (list.length !== 3) throw new Error(`${list.length} tasks`)

      return list.find(t => t.title === 'Design the home page')?.assignee_name === 'Anita Rao'
    })
    await step('A', "Anita's own login sees the project in My Projects and her tasks in My Tasks", async () => {
      await signIn('anita')
      await open('projects/myProjects/', `${mainHas(NAME)} || ${mainHas('No projects')}`, 'my projects')
      if (!(await br.evalJs(mainHas(NAME)))) throw new Error('project not in My Projects')
      await open('tasks/myTasks/', `${mainHas('Design the home page')}`, 'my tasks')
      screenCheck('A', 'My Projects / My Tasks (Anita)')

      return true
    })
    await step('A', "Arjun's own login sees the project in My Projects", async () => {
      await signIn('arjun')
      await open('projects/myProjects/', `${mainHas(NAME)} || ${mainHas('No projects')}`, 'my projects')
      screenCheck('A', 'My Projects (Arjun)')

      return br.evalJs(mainHas(NAME))
    })
  }

  // =============================================================================================================
  // B. Timesheet rejection loop
  // =============================================================================================================
  J.B = async () => {
    const task = S.tasks?.design
    if (!task) return mark('B', 'needs the project of journey A', false, 'no task')
    const cell = day => `[id="cell-${task.id}|${day}"]`
    const weekPage = async back => {
      await open('timesheets/myTimesheets/', `!!document.querySelector('[aria-label="Previous week"]')`, 'my timesheets')
      for (let i = 0; i < back; i++) {
        await br.clickEl(`document.querySelector('[aria-label="Previous week"]')`, 'Previous week')
        await sleep(1200)
      }
      await br.waitFor(`!!document.querySelector('#add_task_row') || !!document.querySelector(${JSON.stringify(cell(LAST_TUESDAY))})`, 'week grid', 15000)
    }
    const addRow = async () => {
      if (await br.evalJs(`!!document.querySelector(${JSON.stringify(cell(LAST_TUESDAY))}) || !!document.querySelector(${JSON.stringify(cell(d(0)))})`)) return
      await br.waitFor(`[...document.querySelectorAll('#add_task_row option')].some(o => o.value === '${task.id}')`, 'task in picker')
      await br.pick('#add_task_row', task.id)
      await click('Add Row')
      await br.waitFor(`!!document.querySelector('[data-remove-row="${task.id}"]')`, 'row added')
    }
    const entries = async () => ((await read(`/timesheets/my-week?week_start=${mondayOf(LAST_TUESDAY)}`, 'anita')).detail?.rows || []).find(r => r.task_id === task.id)

    await step('B', 'Anita: 25 h, 0.1 h refused at the cell; a future day cannot be typed', async () => {
      await signIn('anita')
      await weekPage(0)
      await addRow()
      const notes = []
      await br.type(cell(d(0)), '25')
      await br.waitFor(has('A day has at most 24 hours'), '24h message', 6000).catch(() => notes.push('25 h not refused'))
      await br.type(cell(d(0)), '0.1')
      await br.waitFor(has('Use steps of 0.25'), 'step message', 6000).catch(() => notes.push('0.1 h not refused'))
      await br.type(cell(d(0)), '')
      await sleep(800)
      const future = mondayOf(d(1)) === THIS_MONDAY ? d(1) : null
      if (future) {
        const locked = await br.evalJs(`document.querySelector(${JSON.stringify(cell(future))})?.disabled`)
        if (!locked) notes.push('future day cell is editable')
      }
      const saved = (((await read(`/timesheets/my-week?week_start=${THIS_MONDAY}`, 'anita')).detail?.rows || []).find(r => r.task_id === task.id) || {}).total || 0
      if (saved) notes.push(`${saved} h were saved this week`)
      screenCheck('B', 'My Timesheets (validation)', { allow: ['A day has at most 24', 'Use steps of 0.25'] })
      if (notes.length) throw new Error(notes.join('; '))

      return true
    })
    await step('B', 'Anita logs 4 h last Tuesday and submits the week', async () => {
      await weekPage(1)
      await addRow()
      await br.type(cell(LAST_TUESDAY), '4')
      await br.waitFor(`(document.querySelector('tfoot')?.innerText || '').includes('4')`, 'total 4')
      await sleep(1000)
      await clickStarts('Submit Week')
      await br.waitFor(has('Submit this week?'), 'confirm')
      await br.clickEl(`[...document.querySelectorAll('[role="dialog"] button')].find(b => b.innerText.trim() === 'Submit')`, 'Submit')
      await br.waitFor(`document.querySelector(${JSON.stringify(cell(LAST_TUESDAY))})?.disabled`, 'locked')
      screenCheck('B', 'My Timesheets (submit)')
      const e = await entries()

      return e && e.cells[LAST_TUESDAY]?.status === 'Submitted' && e.cells[LAST_TUESDAY]?.hours === 4
    })
    const section = `[...document.querySelectorAll('main section')].find(s => s.innerText.includes('Anita Rao') && s.innerText.includes(${JSON.stringify(S.code)}))`
    await step('B', 'Arjun (Team Lead) sees it in Timesheet Approval and rejects it - a reason is required', async () => {
      await signIn('arjun')
      await open('timesheets/approval/', `${mainHas('Anita Rao')} || ${mainHas('All caught up')}`, 'approval page')
      await br.waitFor(`!!(${section})`, "Anita's week in Arjun's queue", 8000)
      await br.clickEl(`[...(${section}).querySelectorAll('button')].find(b => b.innerText.trim() === 'Reject')`, 'Reject')
      await br.waitFor(has('Send hours back?'), 'reject dialog')
      await clickStarts('Send Back')
      await br.waitFor(has('Please Enter a Reason'), 'reason required', 5000)
      await br.type('#reject_reason', 'tuesday hours belong to the cart page task, please move 1 h')
      await clickStarts('Send Back')
      await br.waitFor(`!${has('Send hours back?')}`, 'dialog closed')
      await sleep(800)
      screenCheck('B', 'Timesheet Approval (reject)')
      const e = await entries()

      return e?.cells[LAST_TUESDAY]?.status === 'Rejected'
    })
    await step('B', 'Anita sees the reason in the bell and on My Timesheets', async () => {
      await signIn('anita')
      await open('dashboard/', `!!document.querySelector('[data-bell]')`)
      await br.clickEl(`document.querySelector('[data-bell]')`, 'bell')
      await br.waitFor(`[...document.querySelectorAll('[data-notification="timesheet"]')].some(n => n.innerText.includes('rejected 4 h'))`, 'bell rejection', 10000)
      const bell = await br.evalJs(`[...document.querySelectorAll('[data-notification="timesheet"]')].find(n => n.innerText.includes('rejected 4 h')).innerText`)
      if (!/Tuesday hours belong/i.test(bell)) throw new Error('bell has no reason: ' + bell)
      await br.key('Escape', 'Escape', 27)
      await weekPage(1)
      await br.waitFor(has('Tuesday hours belong to the cart page task'), 'reason on the week', 8000)
      screenCheck('B', 'Bell + My Timesheets (rejected)')

      return true
    })
    await step('B', 'Anita fixes the hours (3 h) and submits again', async () => {
      await br.type(cell(LAST_TUESDAY), '3')
      await sleep(1500)
      await clickStarts('Submit Week')
      await br.waitFor(has('Submit this week?'), 'confirm')
      await br.clickEl(`[...document.querySelectorAll('[role="dialog"] button')].find(b => b.innerText.trim() === 'Submit')`, 'Submit')
      await br.waitFor(`document.querySelector(${JSON.stringify(cell(LAST_TUESDAY))})?.disabled`, 'locked again')
      screenCheck('B', 'My Timesheets (resubmit)')
      const e = await entries()

      return e?.cells[LAST_TUESDAY]?.status === 'Submitted' && e.cells[LAST_TUESDAY].hours === 3
    })
    await step('B', 'Arjun approves; the task gets 3 actual hours', async () => {
      await signIn('arjun')
      await open('timesheets/approval/', `!!(${section})`, 'queue')
      await br.clickEl(`[...(${section}).querySelectorAll('button')].find(b => b.innerText.trim() === 'Approve')`, 'Approve')
      await br.waitFor(`!(${section})`, 'card gone', 10000)
      screenCheck('B', 'Timesheet Approval (approve)')
      const e = await entries()
      const t = (await read(`/tasks/${task.id}`)).detail

      return e?.cells[LAST_TUESDAY]?.status === 'Approved' && t.actual_hours === 3
    })
  }

  // =============================================================================================================
  // C. Risks -> It Happened -> issue -> fix task -> resolve; Raise Issue; delete with open fix task refused
  // =============================================================================================================
  J.C = async () => {
    if (!S.pid) return mark('C', 'needs the project of journey A', false, 'no project')
    const risksTab = async view => {
      await projectTab('risks', `${mainHas('Risk')}`)
      if (view) {
        await br.clickEl(`[...document.querySelectorAll('main button')].find(b => b.innerText.trim() === ${JSON.stringify(view)})`, `${view} view`)
        await sleep(900)
      }
    }
    const issues = async () => (await read(`/projects/${S.pid}/issues`)).detail || []
    const moveTask = async (taskId, statuses) => {
      await open(`tasks/taskDetails/?id=${taskId}`, `!!document.querySelector('#task_status')`, 'task details')
      for (const s of statuses) {
        await br.pick('#task_status', s)
        await br.waitFor(`document.querySelector('#task_status').value === ${JSON.stringify(s)}`, `status ${s}`)
        await sleep(1200)
      }
    }

    await step('C', 'Priya adds a High risk (mitigation required) owned by Anita', async () => {
      await signIn('priya')
      await risksTab()
      await clickStarts('Add Risk')
      await br.waitFor(has('Response Plan'), 'risk drawer')
      await sleep(600)
      await br.type('#title', 'payment gateway vendor may be late')
      await br.pick('#category', 'External')
      await br.pick('#probability', 4)
      await br.pick('#impact', 5)
      await clickIn(`document.querySelector('.MuiDrawer-root')`, 'Add Risk')
      await br.waitFor(has('required for High risks'), 'mitigation rule', 5000)
      await br.type('#mitigation', 'weekly check-in call with the vendor')
      const anita = await br.evalJs(`[...document.querySelectorAll('#owner_member_id option')].find(o => o.text.startsWith('Anita Rao'))?.value`)
      if (!anita) throw new Error('Anita is not in the risk owner list')
      await br.pick('#owner_member_id', anita)
      await clickIn(`document.querySelector('.MuiDrawer-root')`, 'Add Risk')
      await br.waitFor(`!${has('Response Plan')} && ${mainHas('Payment gateway vendor may be late')}`, 'risk saved', 15000)
      screenCheck('C', 'Risks tab > Add Risk', { allow: ['required for High risks', 'highlighted'] })

      return true
    })
    await step('C', '"It Happened" raises an issue from the risk', async () => {
      await rowMenu('Payment gateway vendor may be late', 'It Happened')
      await br.waitFor(has('Did this risk happen?'), 'confirm')
      await clickStarts('Yes, raise an issue')
      await br.waitFor(`(${rowX('Payment gateway vendor may be late')})?.innerText.includes('Occurred')`, 'occurred', 10000)
      const list = await issues()
      S.issue1 = list.find(i => /payment gateway/i.test(i.title))
      screenCheck('C', 'Risks tab > It Happened')

      return Boolean(S.issue1)
    })
    await step('C', 'Create Fix Task on the issue gives Anita a task', async () => {
      await risksTab('Issues')
      await br.waitFor(`!!(${rowX(S.issue1.issue_key)})`, 'issue row')
      await br.clickEl(`[...(${rowX(S.issue1.issue_key)}).querySelectorAll('button')].find(b => b.innerText.includes('Create Fix Task'))`, 'Create Fix Task')
      await br.waitFor(`!!(${rowX(S.issue1.issue_key)})?.querySelector('a[href*="taskDetails"]')`, 'fix task link', 10000)
      S.issue1 = (await issues()).find(i => i.id === S.issue1.id)
      const t = (await read(`/tasks/${S.issue1.task_id}`)).detail
      screenCheck('C', 'Issues > Create Fix Task')

      return t && t.assignee_name === 'Anita Rao'
    })
    await step('C', 'Resolve is blocked while the fix task is open (and needs a resolution)', async () => {
      await rowMenu(S.issue1.issue_key, 'Resolve')
      await br.waitFor(has('Resolve issue?'), 'resolve dialog')
      await clickIn(dialog, 'Resolve')
      await br.waitFor(has('Please Enter Resolution'), 'resolution required', 5000)
      await br.type('#dialog_text', 'switched to the backup payment gateway')
      await clickIn(dialog, 'Resolve')
      await br.waitFor(has('Finish the task first'), 'blocked', 8000)
      await click('Cancel')
      screenCheck('C', 'Issues > Resolve (blocked)', { allow: ['Finish the task first', 'http.400', 'http.409', 'http.422'] })

      return (await issues()).find(i => i.id === S.issue1.id).status !== 'Resolved'
    })
    await step('C', 'Anita moves the fix task to Done on Task Details', async () => {
      await signIn('anita')
      const t = (await read(`/tasks/${S.issue1.task_id}`)).detail
      const meta = await open(`tasks/taskDetails/?id=${t.id}`, `!!document.querySelector('#task_status')`, 'task details').then(() => br.evalJs(`[...document.querySelectorAll('#task_status option')].map(o => o.value)`))
      const path = ['In Progress', ...(meta.includes('Testing') ? [] : []), 'Done']
      await moveTask(t.id, path)
      screenCheck('C', 'Task Details (status)')
      const after = (await read(`/tasks/${t.id}`)).detail
      if (after.status !== 'Done') throw new Error(`task is ${after.status} (options ${meta.join('/')})`)

      return true
    })
    await step('C', 'Priya resolves the issue with a resolution', async () => {
      await signIn('priya')
      await risksTab('Issues')
      await br.waitFor(`!!(${rowX(S.issue1.issue_key)})`, 'issue row')
      await rowMenu(S.issue1.issue_key, 'Resolve')
      await br.waitFor(has('Resolve issue?'), 'resolve dialog')
      await br.type('#dialog_text', 'switched to the backup payment gateway')
      await clickIn(dialog, 'Resolve')
      await br.waitFor(`(${rowX(S.issue1.issue_key)})?.innerText.includes('Resolved')`, 'resolved', 10000)
      screenCheck('C', 'Issues > Resolve')

      return (await issues()).find(i => i.id === S.issue1.id).status === 'Resolved'
    })
    await step('C', 'Priya raises an issue directly (title + severity required)', async () => {
      await risksTab('Issues')
      await clickStarts('Raise Issue')
      await br.waitFor(`!!document.querySelector('.MuiDrawer-root #severity')`, 'issue drawer')
      await sleep(600)
      await clickIn(`document.querySelector('.MuiDrawer-root')`, 'Raise Issue')
      await br.waitFor(`${has('Please Enter Issue Title')} || ${has('Please Select Severity')}`, 'required errors', 5000)
      await br.type('#title', 'checkout page crashes on old android phones')
      await br.pick('#severity', 'High')
      const anita = await br.evalJs(`[...document.querySelectorAll('#owner_member_id option')].find(o => o.text.startsWith('Anita Rao'))?.value`)
      if (anita) await br.pick('#owner_member_id', anita)
      await clickIn(`document.querySelector('.MuiDrawer-root')`, 'Raise Issue')
      await br.waitFor(`!document.querySelector('.MuiDrawer-root #severity')`, 'issue saved', 10000)
      await sleep(800)
      S.issue2 = (await issues()).find(i => /checkout page crashes/i.test(i.title))
      screenCheck('C', 'Issues > Raise Issue', { allow: ['highlighted', 'Please Enter', 'Please Select'] })

      return Boolean(S.issue2)
    })
    await step('C', 'Deleting an issue whose fix task is still open is refused', async () => {
      await br.waitFor(`!!(${rowX(S.issue2.issue_key)})`, 'issue 2 row')
      await br.clickEl(`[...(${rowX(S.issue2.issue_key)}).querySelectorAll('button')].find(b => b.innerText.includes('Create Fix Task'))`, 'Create Fix Task')
      await br.waitFor(`!!(${rowX(S.issue2.issue_key)})?.querySelector('a[href*="taskDetails"]')`, 'fix task 2', 10000)
      br.toasts()
      await rowMenu(S.issue2.issue_key, 'Delete')
      await br.waitFor(has('Delete issue?'), 'delete confirm')
      await clickIn(dialog, 'Delete')
      await sleep(2000)
      const toasts = br.toasts()
      const still = (await issues()).some(i => i.id === S.issue2.id)
      screenCheck('C', 'Issues > Delete', { allow: ['http.400', 'http.409', 'http.422'] })
      if (!still) throw new Error('the issue was deleted although its fix task is open; toasts: ' + JSON.stringify(toasts))
      S.deleteRefusal = toasts.map(t => t.text).join(' | ')
      if (await br.evalJs(`!!${dialog}`)) await click('Cancel').catch(() => {})

      return true
    })
  }

  // =============================================================================================================
  // D. Sprints: New Sprint, Sprint Planning, Start, Sprint Board, Complete
  // =============================================================================================================
  J.D = async () => {
    if (!S.pid) return mark('D', 'needs the project of journey A', false, 'no project')
    const sprints = async () => (await read(`/projects/${S.pid}/sprints`)).detail || []
    const cart = S.tasks.build
    const test = S.tasks.test
    await step('D', 'Priya creates Sprint 1 from Sprint List (New Sprint)', async () => {
      await signIn('priya')
      await open(`sprints/sprintList/?projectId=${S.pid}`, `${mainHas('No sprints yet')} || ${mainHas('Sprint')}`, 'sprint list')
      await clickStarts('New Sprint')
      await br.waitFor(`document.querySelector('.MuiDrawer-root #name')?.value?.startsWith('Sprint')`, 'sprint drawer')
      await sleep(500)
      await br.type('#goal', 'customers can pay for the cart')
      await clickIn(`document.querySelector('.MuiDrawer-root')`, 'Create Sprint')
      await br.waitFor(`!document.querySelector('.MuiDrawer-root #name')`, 'sprint saved', 10000)
      await sleep(800)
      S.sprint = (await sprints())[0]
      screenCheck('D', 'Sprint List > New Sprint')

      return S.sprint && S.sprint.status === 'Planned'
    })
    await step('D', 'Sprint Planning: move two tasks from the backlog into the sprint', async () => {
      await open(`sprints/sprintPlanning/?projectId=${S.pid}&sprintId=${S.sprint.id}`, `!!document.querySelector('[aria-label="Select ${cart.task_key}"]')`, 'backlog')
      await br.clickEl(`document.querySelector('[aria-label="Select ${cart.task_key}"]')`, 'select cart')
      await br.clickEl(`document.querySelector('[aria-label="Select ${test.task_key}"]')`, 'select test')
      await br.waitFor(`${btnStarts('Add 2 to')} !== undefined`, 'Add 2 button', 5000)
      await clickStarts('Add 2 to')
      await br.waitFor(`!!document.querySelector('[aria-label="Remove ${cart.task_key}"]') && !!document.querySelector('[aria-label="Remove ${test.task_key}"]')`, 'moved', 10000)
      screenCheck('D', 'Sprint Planning')
      const t = (await read(`/tasks/${cart.id}`)).detail

      return t.sprint_id === S.sprint.id
    })
    await step('D', 'Start the sprint from Sprint List', async () => {
      await open(`sprints/sprintList/?projectId=${S.pid}`, `${mainHas(S.sprint.name)}`, 'sprint list')
      await br.clickEl(`[...(${rowX(S.sprint.name)}).querySelectorAll('button')].find(b => b.innerText.trim() === 'Start')`, 'Start')
      await sleep(700)
      if (await br.evalJs(`!!${dialog}`)) await br.clickEl(`[...document.querySelectorAll('.MuiDialog-root button')].filter(b => /Start/.test(b.innerText)).pop()`, 'confirm start')
      await br.waitFor(`[...document.querySelectorAll('main a')].some(a => a.innerText.trim() === 'Board')`, 'started', 10000)
      screenCheck('D', 'Sprint List > Start')

      return (await sprints())[0].status === 'Active'
    })
    await step('D', 'Sprint Board shows the sprint tasks and the burndown', async () => {
      await br.clickEl(`[...document.querySelectorAll('main a')].find(a => a.innerText.trim() === 'Board')`, 'Board link')
      await br.waitFor(`location.pathname.includes('sprintBoard') && ${mainHas('Build the cart page')} && ${mainHas('Test the checkout')}`, 'board', 15000)
      await br.waitFor(`!!document.querySelector('.recharts-surface')`, 'burndown', 8000)
      const other = await br.evalJs(mainHas('Design the home page'))
      screenCheck('D', 'Sprint Board')

      return !other
    })
    await step('D', 'Complete the sprint (unfinished tasks go back)', async () => {
      await clickStarts('Complete Sprint')
      await br.waitFor(`!!${dialog}`, 'complete dialog')
      await br.clickEl(`[...document.querySelectorAll('.MuiDialog-root button')].find(b => b.innerText.includes('Complete Sprint'))`, 'dialog Complete Sprint')
      await br.waitFor(`!${dialog}`, 'dialog closed', 10000)
      await sleep(800)
      screenCheck('D', 'Sprint Board > Complete')

      return (await sprints())[0].status === 'Completed'
    })
  }

  // =============================================================================================================
  // E. Planning: Gantt, dependency on Task Details, Roadmap, WBS, Task Calendar
  // =============================================================================================================
  J.E = async () => {
    if (!S.pid) return mark('E', 'needs the project of journey A', false, 'no project')
    await step('E', 'Gantt shows the project tasks as bars', async () => {
      await signIn('priya')
      await open(`planning/gantt/?projectId=${S.pid}`, `!!document.querySelector('[data-bar]')`, 'gantt bars')
      const bars = await br.evalJs(`[...document.querySelectorAll('[data-bar]')].map(b => b.dataset.bar)`)
      screenCheck('E', 'Gantt')
      if (!bars.includes(S.tasks.design.task_key)) throw new Error('bars: ' + bars.join(','))

      return true
    })
    await step('E', 'Task Details > Dependencies: "Test the checkout" is blocked by "Build the cart page"', async () => {
      await open(`tasks/taskDetails/?id=${S.tasks.test.id}`, btnX('Dependencies') + ' !== undefined || ' + btnStarts('Dependencies') + ' !== undefined', 'task details')
      await clickStarts('Dependencies')
      await br.waitFor(`!!document.querySelector('#depends_on')`, 'dependency picker')
      await br.waitFor(`[...document.querySelectorAll('#depends_on option')].some(o => o.value === '${S.tasks.build.id}')`, 'cart task offered')
      await br.pick('#depends_on', S.tasks.build.id)
      await br.clickEl(`[...document.querySelector('#depends_on').parentElement.querySelectorAll('button')].find(b => b.innerText.trim() === 'Add')`, 'Add dependency')
      await br.waitFor(`${mainHas('Blocked by 1 open task')}`, 'blocked notice', 10000)
      screenCheck('E', 'Task Details > Dependencies')
      const deps = (await read(`/tasks/${S.tasks.test.id}/dependencies`)).detail

      return deps.blocked_by.some(x => x.task_id === S.tasks.build.id || x.id === S.tasks.build.id || x.task_key === S.tasks.build.task_key)
    })
    await step('E', 'Gantt / Dependencies tab shows the link', async () => {
      await open(`planning/dependencies/?projectId=${S.pid}`, `${mainHas(S.tasks.test.task_key)} || ${mainHas('No dependencies')}`, 'dependencies')
      screenCheck('E', 'Planning > Dependencies')

      return br.evalJs(`${mainHas(S.tasks.test.task_key)} && ${mainHas(S.tasks.build.task_key)}`)
    })
    await step('E', 'Roadmap opens and lists the project', async () => {
      await open('planning/roadmap/', `${mainHas(S.code)} || ${mainHas(NAME)}`, 'roadmap')
      screenCheck('E', 'Roadmap')

      return true
    })
    await step('E', 'WBS opens with the milestone and tasks', async () => {
      await open(`planning/wbs/?projectId=${S.pid}`, `${mainHas('Design the home page')}`, 'wbs')
      screenCheck('E', 'WBS')

      return br.evalJs(mainHas('Design Sign-off'))
    })
    await step('E', 'Task Calendar opens and shows a task due this month', async () => {
      await open(`tasks/calendar/?projectId=${S.pid}`, `!!document.querySelector('[data-cal-title]')`, 'calendar')
      // The tasks are due within the next 12 days: maybe next month.
      const want = [S.tasks.design.task_key, S.tasks.build.task_key, S.tasks.test.task_key]
      let found = await br.evalJs(`[...document.querySelectorAll('[data-task]')].map(e => e.dataset.task)`)
      if (!want.some(k => found.includes(k))) {
        await br.clickEl(`document.querySelector('[aria-label="Next"]')`, 'Next month')
        await sleep(1500)
        found = await br.evalJs(`[...document.querySelectorAll('[data-task]')].map(e => e.dataset.task)`)
      }
      screenCheck('E', 'Task Calendar')
      if (!want.some(k => found.includes(k))) throw new Error('calendar shows ' + found.join(','))

      return true
    })
  }

  // =============================================================================================================
  // F. Documents (upload, new version, download) + comment with @mention -> Anita's Mentions + bell
  // =============================================================================================================
  J.F = async () => {
    if (!S.pid) return mark('F', 'needs the project of journey A', false, 'no project')
    const dir = path.join(SHOTS, 'files')
    fs.mkdirSync(dir, { recursive: true })
    const pdf = v => `%PDF-1.4\n1 0 obj<<>>endobj\n% ${NAME} ${v}\ntrailer<<>>\n%%EOF\n`
    const f1 = path.join(dir, 'cart_design_spec.pdf')
    const f2 = path.join(dir, 'cart_design_spec_v2.pdf')
    fs.writeFileSync(f1, pdf('v1'))
    fs.writeFileSync(f2, pdf('v2 with review changes'))
    const docs = async () => (await read(`/documents/list?project_id=${S.pid}&page_size=50`)).detail || []
    const menu = async (text, item) => {
      await br.clickEl(`(${rowX(text)})?.querySelector('td:last-child svg.lucide')`, `row menu of ${text}`)
      await br.waitFor(`[...document.querySelectorAll('[role="menuitem"]')].some(m => m.innerText.trim().startsWith(${JSON.stringify(item)}))`, `menu item ${item}`, 5000)
      await br.clickEl(`[...document.querySelectorAll('[role="menuitem"]')].find(m => m.innerText.trim().startsWith(${JSON.stringify(item)}))`, `menu ${item}`)
    }

    await step('F', 'Priya uploads a PDF from the Files tab (Upload File)', async () => {
      await signIn('priya')
      await projectTab('files', `${btnStarts('Upload File')} !== undefined`)
      await clickStarts('Upload File')
      await br.waitFor(has('Drop a file here'), 'upload drawer')
      await sleep(700)
      await br.setFiles('#file_input', [f1])
      await br.waitFor(`document.querySelector('#title')?.value === 'Cart design spec'`, 'title from file name', 8000)
      await br.pick('#category', 'Design')
      if ((await br.evalJs(`document.querySelector('#category').value`)) !== 'Design') {
        const any = await br.evalJs(`[...document.querySelectorAll('#category option')].map(o => o.value).filter(Boolean)[0]`)
        await br.pick('#category', any)
      }
      await clickIn(`document.querySelector('.MuiDrawer-root')`, 'Upload')
      await br.waitFor(`!${has('Drop a file here')} && ${mainHas('Cart design spec')}`, 'uploaded', 20000)
      screenCheck('F', 'Files tab > Upload File')

      return (await docs()).some(x => x.title === 'Cart design spec')
    })
    await step('F', 'Upload New Version makes it v2 (still one row)', async () => {
      await sleep(600)
      await menu('Cart design spec', 'Upload New Version')
      await br.waitFor(has("New Version of 'Cart design spec'"), 'version drawer')
      await sleep(700)
      await br.setFiles('#file_input', [f2])
      await sleep(500)
      await clickIn(`document.querySelector('.MuiDrawer-root')`, 'Upload Version')
      await br.waitFor(`[...document.querySelectorAll('tbody tr')].some(r => r.innerText.includes('Cart design spec') && r.innerText.includes('v2'))`, 'v2 listed', 20000)
      screenCheck('F', 'Files tab > Upload New Version')

      return (await br.evalJs(`[...document.querySelectorAll('tbody tr')].filter(r => r.innerText.includes('Cart design spec')).length`)) === 1
    })
    await step('F', 'Download saves the latest version as a file', async () => {
      const before = new Set(fs.readdirSync(DOWNLOADS))
      br.downloads.length = 0
      await br.clickEl(`document.querySelector('[aria-label="Download Cart design spec"]')`, 'Download')
      const start = Date.now()
      let file
      while (Date.now() - start < 15000 && !file) {
        await sleep(400)
        file = fs.readdirSync(DOWNLOADS).find(n => !before.has(n) && n.endsWith('.pdf'))
      }
      screenCheck('F', 'Files tab > Download')
      if (!file) throw new Error('no file saved; download events: ' + JSON.stringify(br.downloads))
      const body = fs.readFileSync(path.join(DOWNLOADS, file), 'utf8')
      if (!body.includes('v2 with review changes')) throw new Error(`${file} is not version 2`)

      return true
    })
    await step('F', 'Priya comments on a task with @Anita (picked from the suggestions)', async () => {
      await open(`tasks/taskDetails/?id=${S.tasks.design.id}`, `!!document.querySelector('#task_comment')`, 'task comment box')
      await br.type('#task_comment', 'Please check the spec @Ani', { blur: false })
      await br.waitFor(`(document.querySelector('[data-mention-list]')?.innerText || '').includes('Anita Rao')`, 'mention suggestions', 8000)
      await br.clickEl(`[...document.querySelectorAll('[data-mention-list] button')].find(b => b.innerText.includes('Anita Rao'))`, 'Anita suggestion')
      await br.waitFor(`document.querySelector('#task_comment').value.includes('@Anita Rao')`, 'inserted', 5000)
      await br.evalJs(`(() => { const el = document.querySelector('#task_comment'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); return true })()`)
      for (const ch of 'v2 is in Files') await br.send('Input.insertText', { text: ch })
      await br.clickEl(`[...document.querySelectorAll('main button')].find(b => b.innerText.trim() === 'Comment')`, 'Comment')
      await br.waitFor(`[...document.querySelectorAll('main li span')].some(s => s.innerText === '@Anita Rao')`, 'posted with mention', 10000)
      screenCheck('F', 'Task Details > Comment')

      return true
    })
    await step('F', "Anita sees the mention in Mentions and in the bell", async () => {
      await signIn('anita')
      await open('communication/mentions/', `${mainHas('Please check the spec')}`, 'mentions')
      await br.clickEl(`document.querySelector('[data-bell]')`, 'bell')
      await br.waitFor(`[...document.querySelectorAll('[data-notification]')].some(n => n.innerText.includes('mentioned you') || n.innerText.includes('Please check the spec'))`, 'bell mention', 8000)
      await br.key('Escape', 'Escape', 27)
      screenCheck('F', 'Mentions + bell (Anita)')

      return true
    })
  }

  // =============================================================================================================
  // G. Templates: Save as Template, Use -> new project (end date empty), editor validation
  // =============================================================================================================
  J.G = async () => {
    if (!S.pid) return mark('G', 'needs the project of journey A', false, 'no project')
    const pname = (await read(`/projects/${S.pid}`)).detail.project_name
    const TPL = `${pname} Template`
    const FROM = `${NAME} From Template`
    const MANUAL = `${NAME} Manual`
    await step('G', 'Priya saves the project as a template', async () => {
      await signIn('priya')
      await projectTab('overview', `${btnStarts('Save as Template')} !== undefined`)
      await clickStarts('Save as Template')
      await br.waitFor(`!!document.querySelector('#template_name')`, 'dialog')
      const suggested = await br.evalJs(`document.querySelector('#template_name').value`)
      if (suggested !== TPL) await br.type('#template_name', TPL)
      await click('Save Template')
      await br.waitFor(`!!document.querySelector('[data-template-saved]')`, 'saved', 10000)
      const msg = await br.evalJs(`document.querySelector('[data-template-saved]').innerText`)
      screenCheck('G', 'Save as Template')
      if (!/1 milestone/.test(msg)) throw new Error('saved message: ' + msg)
      if (await br.evalJs(`!!${dialog}`)) await br.key('Escape', 'Escape', 27)

      return true
    })
    await step('G', 'Project Templates > Use creates a project from it (end date left empty)', async () => {
      await open('projects/projectTemplates/', `!!document.querySelector(${JSON.stringify(`[data-template="${TPL}"]`)})`, 'templates list')
      await br.clickEl(`[...document.querySelector(${JSON.stringify(`[data-template="${TPL}"]`)}).querySelectorAll('button')].find(b => b.innerText.includes('Use'))`, 'Use')
      await br.waitFor(`${has('Create Project from Template')} && !!document.querySelector('#project_name')`, 'use drawer')
      await sleep(600)
      await br.type('#project_name', FROM)
      await br.pick('#start_date', d(14))
      const endBefore = await br.evalJs(`document.querySelector('#end_date')?.value || ''`)
      if (endBefore) await br.pick('#end_date', '')
      // Fixed Price from the source: the client fields are needed.
      for (const [id, v] of [['customer_name', 'Acme Retail'], ['customer_contact_name', 'Ravi Kumar'], ['customer_mobile', '9876543210']])
        if (await br.evalJs(`document.querySelector('#${id}') && !document.querySelector('#${id}').value`)) await br.type(`#${id}`, v)
      await click('Create Draft')
      await br.waitFor(`location.pathname.includes('projectDetails') && ${mainHas(FROM)}`, 'new project opened', 20000)
      screenCheck('G', 'Project Templates > Use')
      const np = ((await read(`/projects/list?search=${encodeURIComponent(FROM)}&page_size=5`)).detail || []).find(p => p.project_name === FROM)
      if (!np) throw new Error('new project not found')
      S.fromTpl = np.id
      const tasks = (await read(`/tasks/list?project_id=${np.id}&page_size=50`)).detail || []
      const ms = (await read(`/projects/${np.id}/milestones`)).detail || []
      const titles = tasks.map(t => t.title)
      const ok = ['Design the home page', 'Build the cart page', 'Test the checkout'].every(t => titles.includes(t)) && ms.some(m => m.name === 'Design Sign-off')
      if (!ok) throw new Error(`tasks ${titles.join(', ')}; milestones ${ms.map(m => m.name).join(', ')}`)
      S.tplCheck = { end: np.end_date, start: np.start_date, tasks: titles.length, ms: ms.length, statuses: [...new Set(tasks.map(t => t.status))], assignees: tasks.map(t => t.assignee_name).filter(Boolean) }
      if (!np.end_date) throw new Error('end date not worked out from the template length')

      return true
    })
    await step('G', 'Template editor refuses a milestone on day = length', async () => {
      await open('projects/projectTemplates/', `${btnStarts('New Template')} !== undefined`)
      await clickStarts('New Template')
      await br.waitFor(`!!document.querySelector('[aria-label="Milestone 1 due day"]')`, 'editor')
      await sleep(500)
      await br.type('#name', MANUAL)
      await br.type('#duration_days', '20')
      await br.type('[aria-label="Milestone 1 name"]', 'Handover')
      await br.type('[aria-label="Milestone 1 due day"]', '20')
      if (await br.evalJs(`!!document.querySelector('[aria-label="Task 1 name"]')`)) {
        await br.type('[aria-label="Task 1 name"]', 'Kick off meeting')
        await br.type('[aria-label="Task 1 start day"]', '0')
        await br.type('[aria-label="Task 1 days"]', '2')
      }
      await click('Save Template')
      await br.waitFor(has('After the last day (day 19)'), 'milestone day error', 6000)
      const saved = ((await read('/templates?search=' + encodeURIComponent(MANUAL))).detail || []).length
      if (saved) throw new Error('template was saved anyway')
      await br.type('[aria-label="Milestone 1 due day"]', '19')
      await click('Save Template')
      await br.waitFor(`!!document.querySelector(${JSON.stringify(`[data-template="${MANUAL}"]`)})`, 'fixed template saved', 10000)
      screenCheck('G', 'Template editor', { allow: ['highlighted', 'After the last day'] })

      return true
    })
  }

  // =============================================================================================================
  // H. Client portal (Ravi): only Acme non-draft projects; Ask for Changes (5+ chars); messages with Priya
  // =============================================================================================================
  J.H = async () => {
    if (!S.pid) return mark('H', 'needs the project of journey A', false, 'no project')
    const ms = async () => ((await read(`/projects/${S.pid}/milestones`)).detail || []).find(m => m.name === 'Design Sign-off')
    const msBox = `document.querySelector('[data-milestone="Design Sign-off"]')`
    await step('H', "Anita finishes the milestone's task (Design the home page -> Done)", async () => {
      await signIn('anita')
      await open(`tasks/taskDetails/?id=${S.tasks.design.id}`, `!!document.querySelector('#task_status')`, 'task details')
      for (const s of ['In Progress', 'Done']) {
        if ((await read(`/tasks/${S.tasks.design.id}`)).detail.status === s) continue
        await br.pick('#task_status', s)
        await sleep(1500)
      }
      screenCheck('H', 'Task Details (status, Anita)')

      return (await read(`/tasks/${S.tasks.design.id}`)).detail.status === 'Done'
    })
    await step('H', 'Priya sends the milestone for client review (Start Work, Send for Review)', async () => {
      await signIn('priya')
      for (const label of ['Start Work', 'Resume Work', 'Send for Review']) {
        await projectTab('milestones', `!!${msBox}`)
        const has1 = await br.evalJs(`[...${msBox}.querySelectorAll('button')].some(b => b.innerText.trim() === ${JSON.stringify(label)})`)
        if (!has1) {
          if ((await ms()).status === 'Ready for Review') break
          continue
        }
        await br.clickEl(`[...${msBox}.querySelectorAll('button')].find(b => b.innerText.trim() === ${JSON.stringify(label)})`, label)
        await sleep(1500)
        if (await br.evalJs(`!!${dialog}`)) await br.clickEl(`[...document.querySelectorAll('.MuiDialog-root button')].filter(b => !/Cancel/.test(b.innerText)).pop()`, 'confirm')
        await sleep(1200)
      }
      screenCheck('H', 'Milestones tab (send for review)')
      const m = await ms()
      if (m.status !== 'Ready for Review') throw new Error('milestone is ' + m.status + '; toasts ' + JSON.stringify(br.toasts()))

      return true
    })
    await step('H', 'Ravi sees only Acme Retail projects that are not drafts', async () => {
      await signIn('ravi')
      await br.waitFor(`location.pathname.includes('/portal')`, 'portal home')
      await br.waitFor(`!!document.querySelector('[data-portal-projects]') || !!document.querySelector('[data-portal-empty]')`, 'portal list')
      const ids = await br.evalJs(`[...document.querySelectorAll('[data-portal-project]')].map(e => Number(e.dataset.portalProject))`)
      const all = (await read('/projects/list?page_size=100')).detail || []
      const wrong = all.filter(p => ids.includes(p.id) && (p.customer_name !== 'Acme Retail' || p.status === 'Draft')).map(p => `${p.project_code} ${p.customer_name} ${p.status}`)
      const missing = all.filter(p => p.customer_name === 'Acme Retail' && !['Draft'].includes(p.status) && !ids.includes(p.id)).map(p => `${p.project_code} ${p.status}`)
      const nav = await sidebar()
      screenCheck('H', 'Client Portal list')
      const notes = []
      if (!ids.includes(S.pid)) notes.push('our Active Acme project is not shown')
      if (S.fromTpl && ids.includes(S.fromTpl)) notes.push('the Draft Acme project is shown')
      if (wrong.length) notes.push('not Acme / draft shown: ' + wrong.join(', '))
      if (missing.length) S.notes = { ...(S.notes || {}), portalHidden: missing }
      if (/Projects|Tasks|Timesheets/.test(nav)) notes.push('sidebar shows internal screens: ' + nav)
      if (notes.length) throw new Error(notes.join('; '))

      return true
    })
    await step('H', 'Ask for Changes needs at least 5 characters, then reaches the team', async () => {
      await br.clickEl(`document.querySelector('[data-portal-project="${S.pid}"] a, [data-portal-project="${S.pid}"]')`, 'open project card')
      await br.waitFor(`location.pathname.includes('/portal/project') && !!document.querySelector('[data-portal-milestones]')`, 'portal project', 15000)
      const m = await ms()
      await br.waitFor(`!!document.querySelector('[data-portal-milestone="${m.id}"]')`, 'milestone in portal')
      await br.clickEl(`[...document.querySelector('[data-portal-milestone="${m.id}"]').querySelectorAll('button')].find(b => b.innerText.trim() === 'Ask for Changes')`, 'Ask for Changes')
      await br.waitFor(`!!document.querySelector('#reason_text')`, 'feedback dialog')
      await br.type('#reason_text', 'logo')
      await clickIn(dialog, 'Send to the Team')
      await br.waitFor(has('at least 5 characters'), 'short refused', 5000)
      if ((await ms()).status !== 'Ready for Review') throw new Error('4 characters were accepted')
      await br.type('#reason_text', 'please make the logo bigger on the home page')
      await clickIn(dialog, 'Send to the Team')
      await br.waitFor(`!document.querySelector('#reason_text')`, 'dialog closed', 8000)
      await sleep(1000)
      screenCheck('H', 'Portal > Ask for Changes')
      const after = await ms()

      return after.status === 'Changes Requested' && /logo bigger/i.test(after.feedback || '')
    })
    await step('H', 'Ravi messages the team', async () => {
      await br.type('#message_text', 'when will the new home page be ready?', { blur: false })
      await click('Send')
      await br.waitFor(`(document.querySelector('[data-message-thread]')?.innerText || '').includes('when will the new home page be ready')`, 'message shown', 8000)
      screenCheck('H', 'Portal > Messages')

      return true
    })
    await step('H', 'Priya sees the message on the Client tab and replies; Ravi sees the reply', async () => {
      await signIn('priya')
      await projectTab('client', `(document.querySelector('[data-message-thread]')?.innerText || '').includes('home page be ready')`)
      await br.type('#message_text', 'it will be ready by friday with the bigger logo', { blur: false })
      await click('Send')
      await br.waitFor(`(document.querySelector('[data-message-thread]')?.innerText || '').includes('ready by friday')`, 'reply shown', 8000)
      screenCheck('H', 'Project Details > Client')
      await signIn('ravi')
      await open(`portal/project/?id=${S.pid}`, `(document.querySelector('[data-message-thread]')?.innerText || '').includes('ready by friday')`, 'reply in portal')
      screenCheck('H', 'Portal (reply)')

      return true
    })
  }

  // H (part 2): the team fixes it, the client accepts, Finance invoices it (an invoice is needed for journey L).
  J.H2 = async () => {
    if (!S.pid) return
    const ms = async () => ((await read(`/projects/${S.pid}/milestones`)).detail || []).find(m => m.name === 'Design Sign-off')
    const msBox = `document.querySelector('[data-milestone="Design Sign-off"]')`
    await step('H', 'Priya sends the changed milestone for review again; Ravi accepts it', async () => {
      await signIn('priya')
      for (let i = 0; i < 3 && (await ms()).status !== 'Ready for Review'; i++) {
        await projectTab('milestones', `!!${msBox}`)
        const label = await br.evalJs(`[...${msBox}.querySelectorAll('button')].map(b => b.innerText.trim()).find(t => ['Send for Review', 'Start Work', 'Resume Work'].includes(t))`)
        if (!label) throw new Error('no Send for Review / Start Work on ' + (await ms()).status)
        await br.clickEl(`[...${msBox}.querySelectorAll('button')].find(b => b.innerText.trim() === ${JSON.stringify(label)})`, label)
        await sleep(1500)
        if (await br.evalJs(`!!${dialog}`)) await br.clickEl(`[...document.querySelectorAll('.MuiDialog-root button')].filter(b => !/Cancel/.test(b.innerText)).pop()`, 'confirm')
        await sleep(1000)
      }
      screenCheck('H', 'Milestones tab (send again)')
      const m = await ms()
      if (m.status !== 'Ready for Review') throw new Error('milestone is ' + m.status)
      await signIn('ravi')
      await open(`portal/project/?id=${S.pid}`, `!!document.querySelector('[data-portal-milestone="${m.id}"]')`, 'portal project')
      await br.clickEl(`[...document.querySelector('[data-portal-milestone="${m.id}"]').querySelectorAll('button')].find(b => b.innerText.trim() === 'Accept')`, 'Accept')
      await br.waitFor(`!!document.querySelector('#reason_text')`, 'accept dialog')
      await clickIn(dialog, 'Accept')
      await br.waitFor(`document.querySelector('[data-portal-milestone="${m.id}"]')?.innerText.includes('Accepted')`, 'accepted', 10000)
      screenCheck('H', 'Portal > Accept')

      return (await ms()).status === 'Accepted'
    })
    // Settings > Automation: accepting the milestone drafted its invoice; Finance finds it in Billing.
    await step('H', 'Kiran (Finance) finds the draft invoice of the accepted milestone in Billing', async () => {
      await signIn('kiran')
      await open('billing/', `!!document.querySelector('main tbody tr')`, 'billing')
      screenCheck('H', 'Billing (Kiran)')
      const inv = ((await read('/billing/invoices?page_size=50')).detail || []).find(i => i.project_id === S.pid)
      S.invoice = inv

      return Boolean(inv) && inv.invoice_type === 'Milestone' && inv.status === 'Draft'
    })
  }

  // =============================================================================================================
  // I. Resource Manager (Meena) and Finance (Kiran)
  // =============================================================================================================
  J.I = async () => {
    if (!S.pid) return mark('I', 'needs the project of journey A', false, 'no project')
    await step('I', 'Meena: sidebar has no Budget or Billing', async () => {
      await signIn('meena')
      const nav = await sidebar()
      screenCheck('I', 'Dashboard (Meena)')
      if (/Budget|Billing/.test(nav)) throw new Error('sidebar: ' + nav.replace(/\n/g, ' | '))

      return nav.includes('Resources')
    })
    for (const [label, url, ready] of [
      ['Capacity', 'resources/capacity/', `!!document.querySelector('[data-person="Anita Rao"]')`],
      ['Utilization', 'resources/utilization/', `!!document.querySelector('[data-person="Anita Rao"]')`],
      ['Resource Allocation', 'resources/allocation/', `!!(${rowX('Anita Rao')})`]
    ])
      await step('I', `Meena: ${label} shows Anita`, async () => {
        await open(url, ready, label)
        // The grid has a column per project (scrolls sideways): our project's column holds her allocation.
        const pct = `${S.alloc?.['Anita Rao'] ?? 10}%`
        if (label === 'Resource Allocation' && !(await br.evalJs(`(${rowX('Anita Rao')}).innerText.includes(${JSON.stringify(pct)}) && (document.querySelector('main thead')?.innerText || '').includes(${JSON.stringify(S.code.replace('PRJ-', ''))})`))) throw new Error(`her ${pct} on our project is not in the grid`)
        screenCheck('I', label + ' (Meena)')

        return true
      })
    await step('I', 'Meena: opening Billing by its address is refused', async () => {
      await open('billing/', null)
      await sleep(2500)
      const t = await br.evalJs(`document.querySelector('main')?.innerText || ''`)
      screenCheck('I', 'Billing by URL (Meena)', { allow: ['http.403'] })
      if (/Create Invoice/.test(t)) throw new Error('Billing screen opened for the Resource Manager')

      return true
    })
    await step('I', 'Kiran (Finance): Budget, Expenses, Billing and Reports open without errors', async () => {
      await signIn('kiran')
      const nav = await sidebar()
      const bad = []
      for (const [label, url, ready] of [
        ['Budget', 'budget/budget/', `${mainHas('Budget')}`],
        ['Expenses', 'budget/expenses/', `${mainHas('Expense')}`],
        ['Billing', 'billing/', `${mainHas('Invoice')}`],
        ['Reports', 'reports/', `document.querySelectorAll('[data-report]').length > 0`]
      ]) {
        try {
          await open(url, ready, label)
        } catch (e) {
          bad.push(`${label}: ${e.message}`)
        }
        if (screenCheck('I', `${label} (Kiran)`)) bad.push(`${label}: console/network errors (see list)`)
      }
      if (!/Billing/.test(nav)) bad.push('Billing not in sidebar')
      if (bad.length) throw new Error(bad.join('; '))

      return true
    })
    await step('I', 'Kiran cannot edit tasks (no Edit, status locked, no Add Task)', async () => {
      const locked = `${mainHas('This page is not part of your role')}`
      await open(`tasks/taskDetails/?id=${S.tasks.build.id}`, `${mainHas('Build the cart page')} || ${locked}`, 'task details')
      const edit = await br.evalJs(`${btnX('Edit')} !== undefined`)
      const statusOpen = await br.evalJs(`!!document.querySelector('#task_status') && !document.querySelector('#task_status').disabled`)
      await open('tasks/allTasks/', `${mainHas('Task')} || ${locked}`, 'all tasks')
      const add = await br.evalJs(`${btnStarts('Add Task', `document.querySelector('main')`)} !== undefined`)
      await projectTab('overview', `${mainHas(S.code)} || ${locked}`)
      const tabs = await br.evalJs(`[...document.querySelectorAll('main button')].map(b => b.innerText.trim()).filter(t => ['Tasks', 'Board'].includes(t))`)
      if (tabs.length) S.notes = { ...(S.notes || {}), kiranTaskTabs: tabs }
      screenCheck('I', 'Task Details / All Tasks (Kiran)')
      const bad = [edit && 'Edit button shown', statusOpen && 'status can be changed', add && 'Add Task shown'].filter(Boolean)
      if (bad.length) throw new Error(bad.join('; '))

      return true
    })
  }

  // =============================================================================================================
  // J. Reports (Rohan): every report opens, filters, CSV download
  // =============================================================================================================
  J.J = async () => {
    await step('J', 'Rohan opens Reports: 7 reports listed', async () => {
      await signIn('rohan')
      await open('reports/', `document.querySelectorAll('[data-report]').length > 0`, 'reports')
      S.reports = await br.evalJs(`[...document.querySelectorAll('[data-report]')].map(e => e.dataset.report)`)
      screenCheck('J', 'Reports')
      if (S.reports.length !== 7) throw new Error('reports: ' + S.reports.join(','))

      return true
    })
    for (const key of S.reports || []) {
      await step('J', `Report "${key}": opens, filters by our project, CSV downloads`, async () => {
        await br.clickEl(`document.querySelector('[data-report="${key}"]')`, key)
        await br.waitFor(`!!document.querySelector('.report-print') || ${has('could not be run')}`, `${key} ran`, 20000)
        if (await br.evalJs(has('The report could not be run'))) throw new Error('"The report could not be run"')
        const notes = []
        if (S.pid && (await br.evalJs(`!!document.querySelector('#report_project')`))) {
          if (await br.evalJs(`[...document.querySelectorAll('#report_project option')].some(o => o.value === '${S.pid}')`)) {
            await br.pick('#report_project', S.pid)
            await sleep(1500)
            await br.waitFor(`!!document.querySelector('.report-print') || ${has('could not be run')}`, 'filtered', 15000)
            const rows = await br.evalJs(`[...document.querySelectorAll('.report-print tbody tr')].map(r => r.innerText)`)
            if (rows.length && !rows.some(r => r.includes(S.code) || r.includes(NAME)) && !rows.some(r => /No |nothing/i.test(r)) && key === 'project-status') notes.push('project filter did not narrow to our project')
          } else notes.push('our project is not in the project filter')
        }
        if (await br.evalJs(`!!document.querySelector('#report_from')`)) {
          await br.pick('#report_from', d(0))
          await br.pick('#report_to', d(-5))
          await br.waitFor(has('To date cannot be before From date'), 'date rule', 4000).catch(() => notes.push('To before From not flagged'))
          await br.pick('#report_from', d(-30))
          await br.pick('#report_to', d(0))
          await sleep(1200)
        }
        const before = new Set(fs.readdirSync(DOWNLOADS))
        await br.clickEl(btnStarts('Download Excel'), 'Download Excel (CSV)')
        let file
        for (let i = 0; i < 30 && !file; i++) {
          await sleep(300)
          file = fs.readdirSync(DOWNLOADS).find(n => !before.has(n) && n.endsWith('.csv'))
        }
        if (!file) notes.push('no CSV file saved')
        else if (!fs.readFileSync(path.join(DOWNLOADS, file), 'utf8').trim()) notes.push('CSV is empty')
        if (S.pid && (await br.evalJs(`!!document.querySelector('#report_project')`))) await br.pick('#report_project', '')
        screenCheck('J', `Report ${key}`)
        if (notes.length) throw new Error(notes.join('; '))

        return true
      })
    }
  }

  // =============================================================================================================
  // K. Settings (Dev User)
  // =============================================================================================================
  J.K = async () => {
    const HOL = 'Zz UI More Holiday'
    // A Sunday about two months ahead, in this year's list if possible.
    const holDate = (() => {
      const x = new Date()
      x.setDate(x.getDate() + 50)
      while (x.getDay() !== 0) x.setDate(x.getDate() + 1)

      return iso(x)
    })()
    await step('K', 'Dev User: Users & Access lists the company users with roles', async () => {
      await signIn('dev')
      await open('settings/access/', `!!document.querySelector('[data-users-roles]')`, 'users & roles')
      const t = await br.evalJs(`document.querySelector('[data-users-roles]').innerText`)
      screenCheck('K', 'Settings > Users & Access')
      const missing = ['Rohan Verma', 'Priya Sharma', 'Arjun Mehta', 'Anita Rao', 'Kiran Iyer', 'Meena Das', 'Ravi Kumar'].filter(n => !t.includes(n))
      if (missing.length) throw new Error('missing users: ' + missing.join(', '))

      return true
    })
    await step('K', 'Roles & Permissions matrix shows every role (viewing only)', async () => {
      await br.waitFor(`!!document.querySelector('[data-permission-matrix]') && !!document.querySelector('[data-matrix-table]')`, 'matrix')
      const roles = await br.evalJs(`[...document.querySelectorAll('[data-matrix-role]')].map(e => e.dataset.matrixRole)`)
      await br.clickEl(`document.querySelector('[data-matrix-role="finance"]')`, 'Finance role')
      await sleep(500)
      const cells = await br.evalJs(`document.querySelectorAll('[data-cell]').length`)
      screenCheck('K', 'Settings > Permission matrix')
      if (roles.length < 7 || !cells) throw new Error(`roles ${roles.join(',')}, cells ${cells}`)

      return true
    })
    await step('K', 'Approval Rules are visible (not changed)', async () => {
      await br.waitFor(`!!document.querySelector('[data-approval-rules]') && !!document.querySelector('[data-approval-matrix]')`, 'rules')
      const t = await br.evalJs(`document.querySelector('[data-approval-rules]').innerText`)

      return /1,00,000/.test(t) && /10,00,000/.test(t)
    })
    await step('K', `Add and remove the holiday "${HOL}"`, async () => {
      await open('settings/', `!!document.querySelector('#holiday_name')`, 'settings')
      if (holDate.slice(0, 4) !== d(0).slice(0, 4)) {
        await br.clickEl(`document.querySelector('[aria-label="Next year"]')`, 'Next year')
        await sleep(1000)
      }
      await br.pick('#holiday_date', holDate)
      await br.type('#holiday_name', HOL)
      await click('Add')
      await br.waitFor(`!!document.querySelector(${JSON.stringify(`[data-holiday="${HOL}"]`)})`, 'holiday listed', 10000)
      const listed = (await read(`/settings?year=${holDate.slice(0, 4)}`)).detail.holidays.some(h => h.name === HOL && h.holiday_date === holDate)
      if (!listed) throw new Error('not saved on the server')
      await br.clickEl(`document.querySelector(${JSON.stringify(`[aria-label="Remove ${HOL}"]`)})`, 'Remove holiday')
      await br.waitFor(`${btnX('Remove')} !== undefined`, 'confirm', 5000)
      await click('Remove')
      await br.waitFor(`!document.querySelector(${JSON.stringify(`[data-holiday="${HOL}"]`)})`, 'holiday removed', 10000)
      screenCheck('K', 'Settings > Holidays')

      return !(await read(`/settings?year=${holDate.slice(0, 4)}`)).detail.holidays.some(h => h.name === HOL)
    })
  }

  // =============================================================================================================
  // L. Global search (Ctrl+K) as Priya and as Anita (no invoices for Anita)
  // =============================================================================================================
  J.L = async () => {
    const search = async q => {
      await open('dashboard/', `!!document.querySelector('[data-search-open]')`)
      await sleep(800)
      for (let i = 0; i < 6 && !(await br.evalJs(`!!document.querySelector('#global_search')`)); i++) {
        await br.key('k', 'KeyK', 75, 2) // Ctrl+K
        await sleep(500)
      }
      if (!(await br.evalJs(`!!document.querySelector('#global_search')`))) throw new Error('Ctrl+K did not open the search')
      await br.type('#global_search', q, { blur: false })
      await sleep(1800)
      await br.waitFor(`!!document.querySelector('[data-search-results]')`, 'results')

      return br.evalJs(`[...document.querySelectorAll('[data-result]')].map(e => e.dataset.result + ': ' + e.innerText.replace(/\\n/g, ' '))`)
    }
    const invoices = (await read('/billing/invoices?page_size=50')).detail || []
    const inv = invoices[0]
    await step('L', 'Priya: Ctrl+K finds our project by name and opens it with Enter', async () => {
      await signIn('priya')
      const r = await search(STAMP)
      if (!r.some(x => x.startsWith('Projects') && x.includes(STAMP))) throw new Error('results: ' + r.join(' | '))
      const idx = await br.evalJs(`[...document.querySelectorAll('[data-index]')].findIndex(b => b.dataset.result === 'Projects' && b.innerText.includes(${JSON.stringify(STAMP)}))`)
      for (let i = 0; i < idx; i++) await br.key('ArrowDown', 'ArrowDown', 40)
      await br.key('Enter', 'Enter', 13)
      await br.waitFor(`location.pathname.includes('projectDetails')`, 'opened', 10000)
      screenCheck('L', 'Global search (Priya)')

      return true
    })
    await step('L', 'Priya: invoice search returns invoices', async () => {
      if (!inv) throw new Error('no invoice exists to search for (journey I creates none)')
      const r = await search(inv.invoice_no)
      if (!r.some(x => x.startsWith('Invoices'))) throw new Error('results: ' + r.join(' | '))

      return true
    })
    await step('L', 'Anita: the same search shows no invoices (and no amounts)', async () => {
      await signIn('anita')
      const r1 = await search(inv ? inv.invoice_no : 'Acme')
      const r2 = await search('Acme')
      screenCheck('L', 'Global search (Anita)')
      const bad = [...r1, ...r2].filter(x => x.startsWith('Invoices') || x.startsWith('Expenses') || /₹/.test(x))
      if (bad.length) throw new Error('Anita sees: ' + bad.join(' | '))

      return true
    })
  }

  // =============================================================================================================
  // M. Close and Reopen
  // =============================================================================================================
  J.M = async () => {
    if (!S.pid) return mark('M', 'needs the project of journey A', false, 'no project')
    // A Draft invoice blocks closing ("issue or cancel them"): Finance cancels the one journey H made.
    const draft = ((await read('/billing/invoices?page_size=50')).detail || []).find(i => i.project_id === S.pid && i.status === 'Draft')
    if (draft)
      await step('M', 'Kiran (Finance) cancels the draft invoice on Billing so the project can close', async () => {
        await signIn('kiran')
        await open('billing/', `!!(${rowX(draft.invoice_no)})`, 'invoice row')
        await br.clickEl(`(${rowX(draft.invoice_no)}).querySelector('td')`, 'invoice row')
        await br.waitFor(`${btnX('Cancel Invoice')} !== undefined`, 'invoice dialog')
        await click('Cancel Invoice')
        await br.waitFor(has('Cancel this invoice?'), 'confirm')
        await click('Cancel Invoice') // the confirm dialog's button is the last one with this label
        await sleep(1500)
        screenCheck('M', 'Billing > Cancel Invoice (Kiran)')
        const now = ((await read('/billing/invoices?page_size=50')).detail || []).find(i => i.id === draft.id)

        return now?.status === 'Cancelled'
      })
    await step('M', 'Priya closes the project after the "Closing is final" warning', async () => {
      await signIn('priya')
      await projectTab('overview', `${btnX('Close Project')} !== undefined`)
      await click('Close Project')
      await br.waitFor(has('Closing is final'), 'warning', 6000)
      const warn = await br.evalJs(has('Only an Admin or Director can reopen it'))
      await click('Yes, close project')
      await sleep(2000)
      const p = (await read(`/projects/${S.pid}`)).detail
      const toasts = br.toasts().map(t => t.text)
      screenCheck('M', 'Project Details > Close', { allow: ['http.409', 'http.400'] })
      if (p.status !== 'Closed') throw new Error(`still ${p.status}; app said: ${toasts.join(' | ')}`)

      return warn
    })
    await step('M', 'Priya (PM) is not offered Reopen', async () => {
      await projectTab('overview', `${mainHas('Closed')}`)

      return !(await br.evalJs(`${btnX('Reopen Project')} !== undefined`))
    })
    await step('M', 'Dev User reopens with a reason (a short reason is refused)', async () => {
      await signIn('dev')
      await projectTab('overview', `${btnX('Reopen Project')} !== undefined`)
      await click('Reopen Project')
      await br.waitFor(`!!document.querySelector('#reason_text')`, 'reopen dialog')
      await br.type('#reason_text', 'oops')
      await clickIn(dialog, 'Reopen Project')
      await sleep(1000)
      const shortMsg = await br.evalJs(has('at least'))
      if ((await read(`/projects/${S.pid}`)).detail.status !== 'Closed') throw new Error('reopened with the reason "oops"')
      await br.type('#reason_text', 'closed by mistake, the client asked for one more change')
      await clickIn(dialog, 'Reopen Project')
      await br.waitFor(`!document.querySelector('#reason_text')`, 'dialog closed', 8000)
      await sleep(1000)
      screenCheck('M', 'Project Details > Reopen')
      const p = (await read(`/projects/${S.pid}`)).detail
      if (p.status !== 'Active') throw new Error('status ' + p.status)
      if (!shortMsg) throw new Error('reopened correctly, but the short reason showed no message')

      return true
    })
  }

  // A (part 2): a Director sets up a project for Priya by typing her name as Project Manager.
  J.A2 = async () => {
    const FOR = `${NAME} For Priya`
    await step('A', 'Rohan (Director) creates an Internal project with "Priya Sharma" typed as Project Manager', async () => {
      await signIn('rohan')
      await open('projects/allProjects/', btnStarts('Add Project') + ' !== undefined')
      await clickStarts('Add Project')
      await br.waitFor(has('Set up a new project'), 'project drawer')
      await sleep(600)
      await br.type('#project_name', FOR)
      await br.pick('#project_type', 'Internal')
      await br.pick('#start_date', d(0))
      await br.pick('#end_date', d(30))
      await br.type('#project_manager_name', 'Priya Sharma')
      // A Director has only Submit (approved on their own authority); it needs a budget.
      await br.type('#budget', '10000')
      await click('Submit')
      await br.waitFor(`location.pathname.includes('projectDetails') && ${mainHas(FOR)}`, 'created', 20000)
      screenCheck('A', 'All Projects > Add Project (Rohan)')
      const p = ((await read(`/projects/list?search=${encodeURIComponent(FOR)}&page_size=5`)).detail || []).find(x => x.project_name === FOR)
      S.forPriya = p
      if (!p) throw new Error('not created')
      if (p.project_manager_id !== 3) throw new Error(`saved with project_manager_name "${p.project_manager_name}" but project_manager_id ${p.project_manager_id} (not linked to Priya's login)`)

      return true
    })
    await step('A', "Priya's own login sees the project she was named manager of", async () => {
      if (!S.forPriya) throw new Error('no project')
      await signIn('priya')
      await open('projects/myProjects/', `${mainHas(NAME)} || ${mainHas('No projects')}`, 'my projects')
      await sleep(800)
      const mine = await br.evalJs(mainHas(FOR))
      await open(`projects/projectDetails/?id=${S.forPriya.id}`, `${mainHas(FOR)} || ${mainHas('not found')} || ${mainHas('Not Found')} || ${mainHas('not part')}`, 'project details')
      const opens = await br.evalJs(mainHas(FOR))
      screenCheck('A', 'My Projects (Priya, named PM)', { allow: ['http.404', 'http.403'] })
      if (!mine || !opens) throw new Error(`in My Projects: ${mine}; opens: ${opens}`)

      return true
    })
  }

  // =============================================================================================================
  // Clean up (dev user, API)
  // =============================================================================================================
  const cleanup = async () => {
    const left = []
    for (const p of (await read(`/projects/list?search=${encodeURIComponent('Zz UI More')}&page_size=50`)).detail || []) {
      if (!p.project_name.toLowerCase().startsWith('zz ui more')) continue
      if (p.status === 'Closed') await api('POST', `/projects/${p.id}/reopen`, { reason: 'test clean up, removing test data' })
      for (const inv of (await read(`/billing/invoices?project_id=${p.id}&page_size=50`)).detail || [])
        if (inv.project_id === p.id && inv.status !== 'Cancelled') await api('POST', `/billing/invoices/${inv.id}/status`, { status: 'Cancelled', reason: 'test clean up' })
      for (const t of (await read(`/tasks/list?project_id=${p.id}&page_size=100`)).detail || []) await api('DELETE', `/tasks/${t.id}`)
      for (const s of (await read(`/projects/${p.id}/sprints`)).detail || []) await api('DELETE', `/sprints/${s.id}`)
      const r = await api('DELETE', `/projects/${p.id}`)
      if ((await read(`/projects/${p.id}`)).detail?.id) left.push(`${p.project_name}: ${JSON.stringify(r).slice(0, 120)}`)
    }
    for (const t of (await read('/templates?search=Zz%20UI%20More')).detail || []) await api('DELETE', `/templates/${t.id}`)
    for (const y of [d(0).slice(0, 4), String(Number(d(0).slice(0, 4)) + 1)])
      for (const h of (await read(`/settings?year=${y}`)).detail?.holidays || []) if (h.name.startsWith('Zz UI More')) await api('DELETE', `/settings/holidays/${h.id}`)
    const remaining = ((await read(`/projects/list?search=${encodeURIComponent('Zz UI More')}&page_size=50`)).detail || []).length
    const tpl = ((await read('/templates?search=Zz%20UI%20More')).detail || []).length
    console.log(`\nCleanup: ${remaining} test projects and ${tpl} test templates left${left.length ? ' -- ' + left.join('; ') : ''}`)
  }

  try {
    if (process.env.PROJECT_ID) {
      S.pid = Number(process.env.PROJECT_ID)
      const p = (await read(`/projects/${S.pid}`)).detail
      S.code = p.project_code
      const list = (await read(`/tasks/list?project_id=${S.pid}&page_size=50`)).detail || []
      S.tasks = Object.fromEntries(list.map(t => [t.title.split(' ')[0].toLowerCase(), t]))
    }
    for (const j of Object.keys(J)) {
      if (!run(j)) continue
      console.log(`\n=== Journey ${j} ===`)
      try {
        await J[j]()
      } catch (e) {
        mark(j, 'journey ran to the end', false, e.message)
      }
    }
  } finally {
    await br.close()
    if (!process.env.KEEP) await cleanup().catch(e => console.log('cleanup error ' + e.message))
    console.log('\nState: ' + JSON.stringify({ deleteRefusal: S.deleteRefusal, tplCheck: S.tplCheck, notes: S.notes }))
    console.log('\n---- Screen problems seen (console errors, failed requests, error toasts, covered buttons) ----')
    for (const n of pageNotes) console.log(`[${n.j}] ${n.screen} (${n.who}) ${n.kind}: ${n.text}`)
    console.log('\n---- Summary ----')
    for (const j of Object.keys(J).filter(k => k.length === 1)) {
      const rs = results.filter(r => r.j === j)
      if (rs.length) console.log(`${j}: ${rs.filter(r => r.ok).length}/${rs.length} pass`)
    }
    const failed = results.filter(r => !r.ok).length
    console.log(failed ? `${failed} FAILED` : `ALL ${results.length} STEPS PASSED`)
    process.exit(failed ? 1 : 0)
  }
}

if (require.main === module) main()
module.exports = { launch, USERS, PASSWORD, ORIGIN, APP, read, api }
