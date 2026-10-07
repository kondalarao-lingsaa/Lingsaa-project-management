// REAL USER FLOW: one project from creation to closing, done entirely through the browser screens, each person in
// their own login (real /login page, email + password). The API is used only to READ for verification and to
// delete the test project at the end.
//
//   node tests/e2e/real_user_flow.js            (from frontend/)
//   env: KEEP=1 keeps the project (no cleanup), SHOTS=<dir> screenshot folder, HEADFUL=1 shows the browser
//
// Uses its own small CDP driver (real mouse clicks, real typing, file upload) on port 9444 so it does not clash
// with tests that use cdp.js.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const ORIGIN = process.env.PMS_APP || 'http://127.0.0.1:3000'
const APP = `${ORIGIN}/appModules/projects`
const API = (process.env.PMS_API || 'http://127.0.0.1:8000') + '/api'
const TOKEN = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
const PASSWORD = 'Demo@123'
const STAMP = String(Date.now()).slice(-6)
const NAME = `Zz UI Flow ${STAMP}`
const QA_SHOTS = 'C:/Users/KONDAL~1/AppData/Local/Temp/4/claude/c--Users-kondalarao-Documents-LINGSAA-PMS/f573adb2-d94a-4dfb-8a76-ee541f91402b/scratchpad/ui_flow'
const SHOTS = process.env.SHOTS || (fs.existsSync(path.dirname(QA_SHOTS)) ? QA_SHOTS : path.join(os.tmpdir(), 'ui_flow'))
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9444
fs.mkdirSync(SHOTS, { recursive: true })

const USERS = {
  priya: 'priya.sharma@lingsaa.com',
  dev: 'dev.user@lingsaa.com',
  arjun: 'arjun.mehta@lingsaa.com',
  anita: 'anita.rao@lingsaa.com',
  kiran: 'kiran.iyer@lingsaa.com',
  ravi: 'ravi.kumar@acmeretail.in',
  rohan: 'rohan.verma@lingsaa.com'
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const day = n => {
  const x = new Date()
  x.setDate(x.getDate() + n)

  return iso(x)
}
const monthsAhead = n => {
  const x = new Date()
  x.setMonth(x.getMonth() + n)

  return iso(x)
}
// Monday of the previous week and its Tuesday.
const prevWeekTuesday = () => {
  const x = new Date()
  const dow = (x.getDay() + 6) % 7 // 0 = Monday
  x.setDate(x.getDate() - dow - 7 + 1)

  return iso(x)
}
const J = JSON.stringify

// ------------------------------------------------------------------------------------------- read-only API
const api = async (url, token = TOKEN) => {
  const r = await fetch(API + url, { headers: { Authorization: `Bearer ${token}` } })

  return r.json().catch(() => ({}))
}
const tokens = {}
const tokenOf = async who => {
  if (tokens[who]) return tokens[who]
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: J({ email: USERS[who], password: PASSWORD }) })
  tokens[who] = (await r.json()).detail?.token

  return tokens[who]
}

// ------------------------------------------------------------------------------------------- browser driver
async function launch() {
  const profile = path.join(os.tmpdir(), 'chrome-real-user-flow')
  // No "Save password?" bubble after signing in: in a headless browser it silently swallows every later mouse click.
  fs.mkdirSync(path.join(profile, 'Default'), { recursive: true })
  const prefsFile = path.join(profile, 'Default', 'Preferences')
  let prefs = {}
  try {
    prefs = JSON.parse(fs.readFileSync(prefsFile, 'utf8'))
  } catch (e) {}
  prefs.credentials_enable_service = false
  prefs.profile = { ...(prefs.profile || {}), password_manager_enabled: false, password_manager_leak_detection: false }
  fs.writeFileSync(prefsFile, J(prefs))
  const args = [`--remote-debugging-port=${PORT}`, '--disable-gpu', '--disable-features=PasswordManagerOnboarding,PasswordLeakDetection,AutofillSaveCardBubble', '--no-first-run', '--hide-scrollbars', '--window-size=1440,1000', `--user-data-dir=${profile}`, 'about:blank']
  if (!process.env.HEADFUL) args.unshift('--headless=new')
  const proc = spawn(CHROME, args, { stdio: 'ignore' })
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
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      issues.push({ kind: 'console.error', text: m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 600) })
    else if (m.method === 'Runtime.exceptionThrown')
      issues.push({ kind: 'exception', text: (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 600) })
    else if (m.method === 'Network.responseReceived' && m.params.response.status >= 400)
      issues.push({ kind: `http.${m.params.response.status}`, text: m.params.response.url.slice(0, 200) })
    else if (m.method === 'Network.loadingFailed' && !m.params.canceled && m.params.type !== 'Other')
      issues.push({ kind: 'network', text: `${m.params.errorText} ${m.params.type || ''}` })
  }
  const send = (method, params = {}) =>
    new Promise(res => {
      const i = ++id
      pending.set(i, res)
      ws.send(J({ id: i, method, params }))
    })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('DOM.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  // Real login only (no built-in dev token), and remember every toast the page shows.
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.removeItem('pms_dev_login') } catch (e) {}
      window.__toasts = []
      const __watch = () => new MutationObserver(() => {
        document.querySelectorAll('[role=status]').forEach(el => {
          const t = (el.innerText || '').trim(); if (!t || el.__seen === t) return
          el.__seen = t
          const box = el.parentElement
          const err = !!(box && box.querySelector('div[class*="error"], [data-icon-error]')) || /error|cannot|can't|not allowed|refused|only|limit|needs|must/i.test(t)
          window.__toasts.push({ t, err, at: Date.now() })
        })
      }).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
      if (document.documentElement) __watch(); else document.addEventListener('DOMContentLoaded', __watch)`
  })

  const evalJs = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.result.exceptionDetails) throw new Error(J(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text))

    return r.result.result.value
  }
  const waitFor = async (expr, label, ms = 20000) => {
    const start = Date.now()
    while (Date.now() - start < ms) {
      try {
        const v = await evalJs(expr)
        if (v) return v
      } catch (e) {}
      await sleep(250)
    }
    throw new Error('timeout waiting for: ' + label)
  }
  const mouse = async (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra })
  const key = async (k, code, vk, text) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, ...(text ? { text } : {}) })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk })
  }
  // A real mouse click at the centre of the element found by `expr` (JS returning an element). If something
  // else covers that point the click is still delivered but the cover is reported.
  const covered = []
  const click = async (expr, label = expr, ms = 15000) => {
    const box = await waitFor(
      `(() => { const el = (${expr}); if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'center' }); const r = el.getBoundingClientRect(); if (!r.width || !r.height) return null; window.__clickEl = el; return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`,
      label,
      ms
    )
    // Wait until React has hydrated the element (a click on server-rendered HTML before that does nothing).
    await waitFor(`(() => { let el = window.__clickEl; for (let i = 0; el && i < 4; i++, el = el.parentElement) if (Object.keys(el).some(k => k.startsWith('__reactProps'))) return true; return false })()`, `${label} hydrated`, 8000).catch(() => {})
    await sleep(120)
    const hit = await evalJs(`(() => { const r = window.__clickEl.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const h = document.elementFromPoint(x, y); return { ok: !!h && (window.__clickEl.contains(h) || h.contains(window.__clickEl) || !!h.closest('label')?.contains(window.__clickEl)), x, y, by: h ? (h.outerHTML || '').slice(0, 120) : null } })()`)
    if (!hit.ok) {
      // Something sits on top of the element (a toast, a sticky header): note it, and click the element itself.
      covered.push({ label, by: hit.by })
      await evalJs(`window.__clickEl.click(); window.__clickEl.focus && window.__clickEl.focus(); true`)
      await sleep(200)

      return true
    }
    await mouse('mouseMoved', hit.x, hit.y, { button: 'none', clickCount: 0 })
    await mouse('mousePressed', hit.x, hit.y)
    await mouse('mouseReleased', hit.x, hit.y)
    await sleep(200)

    return true
  }
  // Click into a field, select what is there and type the text (real key input).
  const type = async (expr, text, label) => {
    await click(expr, label)
    await evalJs(`(() => { const el = window.__clickEl; el.focus(); if (el.select) el.select(); return true })()`)
    if (text === '') await key('Delete', 'Delete', 46)
    else await send('Input.insertText', { text: String(text) })
    await sleep(100)
  }
  // Dates and selects: the browser's own picker cannot be driven headless, so set the value the way picking does.
  const pick = async (expr, value, label) =>
    waitFor(
      `(() => { const el = (${expr}); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.focus(); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${J(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new FocusEvent('blur')); el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); return true })()`,
      label || expr,
      10000
    )
  // Select the option whose text contains `text`.
  const pickOption = async (selector, text, label) => {
    const value = await waitFor(
      `(() => { const el = document.querySelector(${J(selector)}); if (!el) return null; const o = [...el.options].find(o => o.text.includes(${J(text)})); return o ? o.value : null })()`,
      label || `${selector} option ${text}`,
      15000
    )

    return pick(`document.querySelector(${J(selector)})`, value, label)
  }
  const setFiles = async (selector, files) => {
    const doc = await send('DOM.getDocument', { depth: -1 })
    const q = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector })
    if (!q.result?.nodeId) throw new Error('file input not found: ' + selector)
    await send('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files })
  }

  return {
    send,
    evalJs,
    waitFor,
    click,
    type,
    pick,
    pickOption,
    setFiles,
    key,
    covered,
    goto: async url => {
      await send('Page.navigate', { url })
      await sleep(400)
    },
    problems: () => issues.splice(0),
    toasts: () => evalJs(`(window.__toasts || []).splice(0)`).catch(() => []),
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

// ------------------------------------------------------------------------------------------- the run
const run = async () => {
  const br = await launch()
  const ctx = {}
  const report = [] // { step, title, status, notes[] }
  const findings = [] // things a real user would hit
  const toastCovers = []
  let cur = null
  const note = t => {
    console.log('     · ' + t)
    cur?.notes.push(t)
  }
  const finding = (title, detail) => {
    console.log('  !! ' + title + (detail ? ` - ${detail}` : ''))
    findings.push({ step: cur?.step, title, detail })
    cur?.notes.push('FINDING: ' + title)
  }
  const check = (label, ok, extra = '') => {
    console.log(`   ${ok ? 'ok ' : 'NO '} ${label}${ok ? '' : `  [${String(extra).slice(0, 300)}]`}`)
    if (!ok) {
      cur.failed = true
      cur.notes.push(`FAIL: ${label}${extra ? ` (${String(extra).slice(0, 200)})` : ''}`)
    }

    return ok
  }

  // ---- selectors
  const has = t => `document.body.innerText.includes(${J(t)})`
  const mainText = `(document.querySelector('main')?.innerText || document.body.innerText)`
  const visible = `(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' })`
  // The last visible button whose text starts with `t` (drawers and dialogs render last, so they win).
  const btn = (t, scope = 'document') => `[...${scope}.querySelectorAll('button')].filter(${visible}).filter(b => b.innerText.trim().replace(/\\s+/g, ' ').startsWith(${J(t)})).pop()`
  const btnExact = (t, scope = 'document') => `[...${scope}.querySelectorAll('button')].filter(${visible}).filter(b => b.innerText.trim().replace(/\\s+/g, ' ') === ${J(t)}).pop()`
  const dialog = `[...document.querySelectorAll('[role=dialog]')].filter(${visible}).pop()`
  const q = s => `document.querySelector(${J(s)})`

  const settle = async (ms = 600) => {
    await sleep(ms)
    await br.waitFor(`!document.querySelector('.MuiCircularProgress-root') || true`, 'settle', 3000).catch(() => {})
  }
  const toastLog = async () => {
    const t = await br.toasts()
    t.forEach(x => note(`toast${x.err ? ' (error?)' : ''}: ${x.t}`))

    return t
  }
  const waitToast = async (re, ms = 12000) => {
    const start = Date.now()
    const seen = []
    while (Date.now() - start < ms) {
      const t = await br.toasts()
      t.forEach(x => {
        seen.push(x)
        note(`toast: ${x.t}`)
      })
      const m = seen.find(x => re.test(x.t))
      if (m) return m.t
      await sleep(250)
    }

    return seen.map(x => x.t).join(' | ') ? null : null
  }

  // ---- sign in / out through the real screens
  // Click, and click again (up to 3 times) until `cond` holds: the first click can land while the page is busy.
  const clickFor = async (expr, cond, label) => {
    for (let i = 0; i < 3; i++) {
      await br.click(expr, label)
      if (await br.waitFor(cond, `${label} result`, 4000).catch(() => false)) return true
      if (i === 0) note(`${label}: first click did nothing, clicking again`)
    }
    throw new Error(`${label}: clicking did nothing`)
  }
  let who = null
  const signOut = async () => {
    const onApp = await br.evalJs(`!!document.querySelector('[data-account]')`).catch(() => false)
    if (!onApp) {
      await br.goto(`${APP}/dashboard/`)
      await br.waitFor(`!!document.querySelector('[data-account]') || location.pathname.startsWith('/login')`, 'app or login', 20000)
    }
    if (await br.evalJs(`!!document.querySelector('[data-account]')`)) {
      await clickFor(`document.querySelector('[data-account]')`, `(document.querySelector('[data-sign-out]')?.getBoundingClientRect().height || 0) > 0`, 'avatar')
      await br.click(`document.querySelector('[data-sign-out]')`, 'Sign out')
      await br.waitFor(`location.pathname.startsWith('/login')`, 'login page after sign out', 15000)
    }
  }
  const signIn = async person => {
    if (who === person) return
    if (who) await signOut()
    else {
      // Start signed out (an earlier run may have left a login in this browser profile).
      await br.goto(`${ORIGIN}/login`)
      await br.evalJs(`['access_token','username','user_id','client_id','pms_original_login','pms_dev_login'].forEach(k => localStorage.removeItem(k)); true`)
      await br.goto(`${ORIGIN}/login`)
      await sleep(1000)
    }
    await br.waitFor(`!!document.querySelector('[data-login-form]')`, 'login form', 30000)
    await br.type(`document.querySelector('#email')`, USERS[person], 'email')
    await br.type(`document.querySelector('#password')`, PASSWORD, 'password')
    await br.click(`document.querySelector('[data-login-form] button[type=submit]')`, 'Sign in')
    await br.waitFor(`!location.pathname.startsWith('/login') && !!document.querySelector('[data-account]')`, `${person} signed in`, 30000)
    await settle(1200)
    who = person
    note(`signed in as ${USERS[person]} -> ${await br.evalJs('location.pathname')}`)
  }

  // ---- sidebar navigation (falls back to the address bar when the sidebar has no such link)
  const nav = async (pathPart, readyExpr = 'true') => {
    // A link inside a closed sidebar group: open the group first, as a user does.
    const link = `[...document.querySelectorAll('aside a')].find(a => a.getAttribute('href') && a.getAttribute('href').includes(${J(pathPart)}))`
    const group = await br.evalJs(`(() => { const a = ${link}; if (!a) return false; const b = a.closest('div.grid')?.previousElementSibling; if (b && b.getAttribute('aria-expanded') === 'false') { window.__grp = b; return true } return false })()`).catch(() => false)
    if (group) {
      await br.click(`window.__grp`, `sidebar group for ${pathPart}`)
      await sleep(500)
    }
    const clicked = await br
      .click(`[...document.querySelectorAll('aside a')].filter(${visible}).find(a => a.getAttribute('href') && a.getAttribute('href').includes(${J(pathPart)}))`, `sidebar ${pathPart}`, 2500)
      .catch(() => false)
    if (!clicked) {
      note(`no visible sidebar link to ${pathPart}: used the address bar`)
      await br.goto(`${APP}/${pathPart}`)
    }
    await br.waitFor(`location.pathname.includes(${J(pathPart.split('?')[0])})`, `page ${pathPart}`, 20000)
    await br.waitFor(readyExpr, `ready ${pathPart}`, 25000)
    await settle()
  }
  const openProject = async (tab = null) => {
    await br.goto(`${APP}/projects/projectDetails/?id=${ctx.projectId}${tab ? `&tab=${tab}` : ''}`)
    await br.waitFor(`${mainText}.includes(${J(NAME)})`, 'project page', 25000)
    await settle()
  }
  const openTab = async label => {
    await br.click(btnExact(label, `document.querySelector('main')`), `tab ${label}`)
    await settle(900)
  }

  // ---- bell
  const bell = async (re, refs = []) => {
    await br.waitFor(`!!document.querySelector('[data-bell]')`, 'bell')
    // The bell checks every 30 s; a page load fetches at once.
    let items = []
    for (let i = 0; i < 3; i++) {
      await clickFor(`document.querySelector('[data-bell]')`, `!!document.querySelector('.MuiPopover-paper')`, 'bell')
      await sleep(800)
      items = await br.evalJs(`[...document.querySelectorAll('[data-notification]')].map(b => b.dataset.notification + ': ' + b.innerText.replace(/\\s+/g, ' ').trim())`)
      await br.key('Escape', 'Escape', 27)
      await sleep(300)
      if (items.some(t => re.test(t) && (!refs.length || refs.some(r => r && t.includes(r))))) break
      await br.evalJs('location.reload()')
      await br.waitFor(`!!document.querySelector('[data-bell]')`, 'bell after reload', 20000)
      await settle(1500)
    }
    const hit = items.find(t => re.test(t) && (!refs.length || refs.some(r => r && t.includes(r))))
    note(`bell: ${hit || '(none) latest=' + J(items.slice(0, 3))}`)

    return hit
  }

  const failShot = async step => {
    const file = path.join(SHOTS, `step${String(step).padStart(2, '0')}_${STAMP}.png`)
    await br.shot(file).catch(() => {})
    fs.writeFileSync(file.replace('.png', '.txt'), (await br.evalJs(`location.href + '\\n\\n' + document.body.innerText`).catch(() => '')).slice(0, 8000))
    cur.notes.push('screenshot: ' + file)
    console.log('     screenshot: ' + file)
  }

  const step = async (n, title, fn) => {
    cur = { step: n, title, notes: [], failed: false }
    console.log(`\n=== ${n}. ${title}`)
    if (n > 1 && !ctx.projectId) {
      cur.status = 'SKIP'
      cur.notes.push('no project')
      report.push(cur)

      return
    }
    try {
      await fn()
    } catch (e) {
      cur.failed = true
      cur.notes.push('STOPPED: ' + e.message)
      console.log('   ERROR ' + e.message)
    }
    const probs = br.problems().filter(p => !/favicon|_next\/webpack-hmr|hot-update/.test(p.text))
    if (probs.length) note('page problems: ' + J(probs.slice(0, 6)))
    if (br.covered.length) {
      const c = br.covered.splice(0)
      c.filter(x => /role="status"/.test(x.by || "") && /avatar|bell/.test(x.label)).forEach(x => toastCovers.push(`step ${n}: ${x.label}`))
      note("clicked through a cover: " + J(c))
    }
    await toastLog()
    if (cur.failed) await failShot(n)
    cur.status = cur.failed ? 'FAIL' : 'PASS'
    report.push(cur)
  }

  const statCard = label =>
    br.evalJs(`(() => { const s = [...document.querySelectorAll('main span[title]')].find(x => x.getAttribute('title') === ${J(label)}); if (!s) return null; const box = s.parentElement; return [...box.children].map(c => c.innerText.trim()).join(' | ') })()`)
  const projectApi = async () => (await api(`/projects/${ctx.projectId}`)).detail || {}

  try {
    // =============================================================================================== 1
    await step(1, 'Priya creates the project (Create Draft) and submits it for approval', async () => {
      await signIn('priya')
      await nav('projects/allProjects/', `[...document.querySelectorAll('main button')].some(b => b.innerText.trim().startsWith('Add Project'))`)
      await br.click(btn('Add Project', `document.querySelector('main')`), 'Add Project')
      await br.waitFor(has('Set up a new project'), 'project drawer')
      await settle(800)
      const hasCreateApprove = await br.evalJs(`!!${btnExact('Create & Approve')}`)
      note(`Create & Approve offered to the PM: ${hasCreateApprove}`)
      await br.type(q('#project_name'), NAME)
      await br.pickOption('#project_type', 'Fixed Price')
      await br.type(q('#customer_name'), 'Acme Retail')
      await br.type(q('#customer_contact_name'), 'Ravi Kumar')
      await br.type(q('#customer_mobile'), '9876543210')
      await br.pick(q('#start_date'), day(-14))
      await br.pick(q('#end_date'), monthsAhead(2))
      await br.type(q('#budget'), '300000')
      const pm = await br.evalJs(`${q('#project_manager_name')}.value`)
      check('Project Manager is filled with Priya Sharma', /priya sharma/i.test(pm), pm)
      if (!/priya sharma/i.test(pm)) await br.type(q('#project_manager_name'), 'Priya Sharma')
      await br.click(btn('Create Draft'), 'Create Draft')
      await waitToast(/created|draft/i)
      await br.waitFor(`!${has('Set up a new project')}`, 'drawer closed', 15000)
      await settle(1500)
      const found = ((await api('/projects/options')).detail || []).find(p => p.project_name === NAME)
      if (!check('project was created', Boolean(found))) throw new Error('no project')
      ctx.projectId = found.id
      ctx.code = found.project_code
      note(`project ${ctx.code} id ${ctx.projectId}`)
      // Open it the way a user does: from the list.
      if (!(await br.evalJs(`location.pathname.includes('projectDetails')`))) {
        const search = `document.querySelector('main input.search-input')`
        if (await br.evalJs(`!!${search}`)) await br.type(search, NAME)
        await settle(1200)
        await br.click(`[...document.querySelectorAll('main a')].find(a => a.innerText.trim() === ${J(NAME)})`, 'project name link')
      }
      await br.waitFor(`location.pathname.includes('projectDetails') && ${mainText}.includes(${J(NAME)})`, 'project details', 20000)
      await settle(1000)
      check('the new project is Draft', await br.evalJs(`${mainText}.includes('Draft')`))
      await br.click(btn('Submit for Approval', `document.querySelector('main')`), 'Submit for Approval')
      await waitToast(/approval|submitted|sent/i)
      await br.waitFor(`${mainText}.includes('Pending Approval')`, 'pending', 15000)
      await settle(1200)
      const p = await projectApi()
      check('status is Pending Approval', p.status === 'Pending Approval', p.status)
      const approveBtn = await br.evalJs(`!!${btnExact('Approve', `document.querySelector('main')`)}`)
      check('Priya sees no Approve button on her own project', !approveBtn)
      note('approval card: ' + (await br.evalJs(`document.querySelector('[data-approval-waiting]')?.innerText || ''`)).replace(/\s+/g, ' '))
    })

    // =============================================================================================== 2
    await step(2, 'Dev User (Admin) approves from the bell / My Approvals', async () => {
      await signIn('dev')
      check('bell shows the approval request', Boolean(await bell(new RegExp(`${STAMP}|${ctx.code}`))))
      await nav('approvals/', `!!document.querySelector('[data-approvals-list], [data-approvals-empty]')`)
      const key = `project-${ctx.projectId}`
      const row = `document.querySelector('[data-approval-item="${key}"]')`
      if (!check('My Approvals lists the project', await br.waitFor(`!!${row}`, 'approval row', 10000).catch(() => false))) throw new Error('not in inbox')
      await br.click(btnExact('Approve', row), 'Approve')
      await br.waitFor(`!!document.querySelector('#reason_text')`, 'note dialog')
      await br.type(q('#reason_text'), 'Budget and dates look fine. Go ahead.')
      await br.click(btnExact('Approve', dialog), 'Approve (dialog)')
      await waitToast(/approv/i)
      await settle(1500)
      const p = await projectApi()
      check('project is Approved', p.status === 'Approved', p.status)
    })

    // =============================================================================================== 3
    await step(3, 'Priya sees the approval in the bell and activates the project', async () => {
      await signIn('priya')
      check('bell shows the approval', Boolean(await bell(new RegExp(`approv.*(${STAMP}|${ctx.code})|(${STAMP}|${ctx.code}).*approv`, 'i'))))
      await openProject()
      await br.click(btn('Activate', `document.querySelector('main')`), 'Activate')
      await sleep(600)
      if (await br.evalJs(`!!${dialog}`)) await br.click(btn('Yes', dialog), 'confirm')
      await waitToast(/active/i)
      await br.waitFor(`${mainText}.includes('Active')`, 'active', 15000)
      await settle(1000)
      const p = await projectApi()
      check('project is Active', p.status === 'Active', p.status)
    })

    // =============================================================================================== 4
    const addMember = async (typed, full, role, pct, rate) => {
      await br.click(btn('Add Member', `document.querySelector('main')`), 'Add Member')
      await br.waitFor(has('Add Team Member'), 'member drawer')
      await settle(800)
      await br.type(q('#member_name'), typed)
      // The browser shows the datalist suggestions; picking one puts the full name in the field.
      const offered = await br.waitFor(`[...document.querySelectorAll('#pms-people option')].some(o => o.value === ${J(full)})`, `${full} in the suggestions`, 8000).catch(() => false)
      check(`suggestion list offers "${full}"`, offered)
      await br.evalJs(`(() => { const el = document.querySelector('#member_name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${J(full)}); el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: ${J(full)} })); return true })()`)
      await sleep(300)
      const linked = await br.evalJs(`document.querySelector('[data-login-link]')?.dataset.loginLink || ''`)
      const linkText = await br.evalJs(`document.querySelector('[data-login-link]')?.innerText || ''`)
      check(`${full}: green "Linked to their login"`, linked === 'linked' && linkText.includes('Linked to their login'), linkText)
      await br.pickOption('#role', role)
      // The form shows how much of the person's time is still free on other projects (other testers' data can use
      // some); stay inside it, as a PM would.
      await sleep(600)
      const hint = await br.evalJs(`(document.querySelector('#allocation_pct')?.parentElement.innerText || '')`)
      const free = /(\d+)% free/.exec(hint)
      let useAlloc = pct
      if (free && Number(free[1]) < Number(pct)) {
        useAlloc = String(Number(free[1])) // 0 = on the team, time not planned (demo projects may book them fully)
        note(`${full}: form says "${hint.replace(/\s+/g, ' ').trim()}" - using ${useAlloc}% instead of ${pct}%`)
      }
      await br.type(q('#allocation_pct'), useAlloc)
      if (await br.evalJs(`!!document.querySelector('#hourly_rate')`)) await br.type(q('#hourly_rate'), rate)
      else finding(`Cost Rate field not shown to the PM in Add Member`, 'cannot set the cost rate')
      await br.click(btn('Add Member', dialog.replace('[role=dialog]', '.MuiDrawer-root')), 'Add Member (drawer)')
      await waitToast(/added|member/i)
      await br.waitFor(`!${has('Add Team Member')}`, 'drawer closed', 15000)
      await settle(1200)
    }
    await step(4, 'Priya adds Arjun (Team Lead) and Anita (Designer) on the Team tab', async () => {
      await openProject('team')
      await br.waitFor(`[...document.querySelectorAll('main button')].some(b => b.innerText.includes('Add Member'))`, 'team tab')
      await addMember('Arj', 'Arjun Mehta', 'Team Lead', '50', '900')
      await addMember('Ani', 'Anita Rao', 'Designer', '50', '600')
      const team = await br.evalJs(mainText)
      check('team list shows both people', team.includes('Arjun Mehta') && team.includes('Anita Rao'))
      check('team list has no "Not linked to a login"', !team.includes('Not linked to a login'))
      const members = (await api(`/projects/${ctx.projectId}/members`)).detail || []
      note('members: ' + J(members.map(m => [m.member_name, m.role, m.user_id, m.hourly_rate])))
      const pick2 = members.filter(m => ['Arjun Mehta', 'Anita Rao'].includes(m.member_name))
      check('Arjun and Anita are linked to their logins (user ids)', pick2.length === 2 && pick2.every(m => m.user_id), J(pick2.map(m => [m.member_name, m.user_id])))
    })

    // =============================================================================================== 5
    await step(5, 'Priya adds milestone "Design Sign-off" (1,00,000) with deliverable "Home page mockup"', async () => {
      await openProject('milestones')
      await br.click(btn('Add Milestone', `document.querySelector('main')`), 'Add Milestone')
      await br.waitFor(`!!document.querySelector('#name')`, 'milestone drawer')
      await settle(500)
      await br.type(q('#name'), 'Design Sign-off')
      await br.type(q('#amount'), '100000')
      await br.pick(q('#due_date'), day(20))
      await br.click(btn('Add Milestone', `document.querySelector('.MuiDrawer-root')`), 'Add Milestone (drawer)')
      await waitToast(/milestone|added|created/i)
      const card = `document.querySelector('[data-milestone="Design Sign-off"]')`
      await br.waitFor(`!!${card}`, 'milestone card', 15000)
      await settle(800)
      await br.type(`${card}.querySelector('input[id^=deliverable-]')`, 'Home page mockup')
      await br.key('Enter', 'Enter', 13, '\r')
      await br.waitFor(`${card}.innerText.includes('Home page mockup')`, 'deliverable listed', 10000)
      const ms = ((await api(`/projects/${ctx.projectId}/milestones`)).detail || []).find(m => m.name === 'Design Sign-off')
      ctx.milestoneId = ms?.id
      check('milestone saved with amount 100000 and the deliverable', ms && Number(ms.amount) === 100000 && ms.deliverables?.length === 1, J(ms).slice(0, 200))
    })

    // =============================================================================================== 6
    const addTask = async (title, assignee, extra) => {
      await br.click(btn('Add Task', `document.querySelector('main')`), 'Add Task')
      await br.waitFor(`!!document.querySelector('#title')`, 'task drawer')
      await settle(1000)
      await br.type(q('#title'), title)
      await br.waitFor(`[...document.querySelector('#assignee_name').options].some(o => o.text.startsWith(${J(assignee)}))`, `${assignee} in the assignee list`, 10000)
      await br.pickOption('#assignee_name', assignee)
      if (extra) await extra()
      await br.click(btnExact('Submit', `document.querySelector('.MuiDrawer-root')`), 'Submit task')
      await waitToast(/task|created|added/i)
      await br.waitFor(`!document.querySelector('#title')`, 'task drawer closed', 15000)
      await settle(1000)
    }
    await step(6, 'Priya adds tasks "Design home page" (Anita) and "Build home page" (Arjun)', async () => {
      await openProject('tasks')
      await br.waitFor(`[...document.querySelectorAll('main button')].some(b => b.innerText.includes('Add Task'))`, 'tasks tab')
      await addTask('Design home page', 'Anita Rao', async () => {
        await br.type(q('#estimated_hours'), '16')
        await br.pickOption('#milestone_id', 'Design Sign-off')
        await br.pick(q('#due_date'), day(10))
      })
      await addTask('Build home page', 'Arjun Mehta')
      const tasks = (await api(`/tasks/list?project_id=${ctx.projectId}&page_size=50`)).detail || []
      note('tasks: ' + J(tasks.map(t => [t.task_key, t.title, t.assignee_name, t.assignee_id, t.milestone_id, t.estimated_hours, t.status])))
      const design = tasks.find(t => t.title === 'Design home page')
      const build = tasks.find(t => t.title === 'Build home page')
      ctx.taskId = design?.id
      ctx.taskKey = design?.task_key
      ctx.buildId = build?.id
      check('Design home page: Anita, 16 h, milestone, due +10', design && /anita/i.test(design.assignee_name) && Number(design.estimated_hours) === 16 && design.milestone_id === ctx.milestoneId, J(design).slice(0, 300))
      check('Build home page: Arjun', build && /arjun/i.test(build.assignee_name), J(build).slice(0, 200))
    })

    // =============================================================================================== 7
    const kanbanDrag = async status => {
      await nav('tasks/kanban/', `!!document.querySelector('main select[aria-label=Project]')`)
      await br.pickOption('main select[aria-label=Project]', ctx.code)
      await br.waitFor(`!!document.querySelector('[data-card-id="${ctx.taskId}"]')`, 'task card on the board', 15000)
      await settle(800)
      await br.evalJs(`(() => {
        const card = document.querySelector('[data-card-id="${ctx.taskId}"]')
        const col = [...document.querySelectorAll('main span')].find(s => s.innerText.trim() === ${J(status)}).closest('div.shrink-0')
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
        }, 200))
      })()`)
      await sleep(1500)
      await toastLog()
      const t = ((await api(`/tasks/list?project_id=${ctx.projectId}&page_size=50`)).detail || []).find(x => x.id === ctx.taskId)

      return t?.status
    }
    await step(7, 'Anita: bell "assigned to you", My Projects, My Tasks, Kanban -> In Progress', async () => {
      await signIn('anita')
      check('bell shows the assignment', Boolean(await bell(/assign/i, [ctx.code])))
      await nav('projects/myProjects/', `${mainText}.length > 50`)
      await sleep(1500)
      check('My Projects shows the project', await br.waitFor(`${mainText}.includes(${J(NAME)})`, 'my projects', 10000).catch(() => false))
      await nav('tasks/myTasks/', `${mainText}.length > 50`)
      check('My Tasks shows "Design home page"', await br.waitFor(`${mainText}.includes('Design home page')`, 'my tasks', 10000).catch(() => false))
      const st = await kanbanDrag('In Progress')
      check('task is In Progress after the drag', st === 'In Progress', st)
      const ms = ((await api(`/projects/${ctx.projectId}/milestones`)).detail || []).find(m => m.id === ctx.milestoneId)
      check('milestone became In Progress', ms?.status === 'In Progress', ms?.status)
    })

    // =============================================================================================== 8
    await step(8, 'Anita logs 6 h on last Tuesday and submits the week', async () => {
      await nav('timesheets/myTimesheets/', `!!document.querySelector('[aria-label="Previous week"]')`)
      await br.click(q('[aria-label="Previous week"]'), 'Previous week')
      await settle(1500)
      await br.waitFor(`!!document.querySelector('#add_task_row')`, 'add row select', 15000)
      await br.pickOption('#add_task_row', 'Design home page')
      await br.click(btn('Add Row', `document.querySelector('main')`), 'Add Row')
      const tue = prevWeekTuesday()
      const cell = `document.getElementById(${J(`cell-${ctx.taskId}|${tue}`)})`
      await br.waitFor(`!!${cell}`, 'Tuesday cell', 10000)
      check('Tuesday cell is open for typing', !(await br.evalJs(`${cell}.disabled`)))
      await br.type(cell, '6')
      await br.key('Enter', 'Enter', 13, '\r')
      await sleep(1500)
      await br.click(btn('Submit Week', `document.querySelector('main')`), 'Submit Week')
      await br.waitFor(`!!${dialog} && ${dialog}.innerText.includes('Submit this week')`, 'confirm dialog')
      note('confirm says: ' + (await br.evalJs(`${dialog}.innerText`)).replace(/\s+/g, ' '))
      await br.click(btnExact('Submit', dialog), 'Submit (confirm)')
      await waitToast(/submit/i)
      await settle(1200)
      check('the week shows Submitted', await br.waitFor(`${mainText}.includes('Submitted')`, 'Submitted', 8000).catch(() => false))
    })

    // =============================================================================================== 9
    await step(9, 'Arjun approves Anita\'s 6 h; Anita is told; Priya sees labour 3,600', async () => {
      await signIn('arjun')
      await nav('approvals/', `!!document.querySelector('[data-approvals-list], [data-approvals-empty]')`)
      const inboxHas = await br.evalJs(`[...document.querySelectorAll('[data-approval-item^="timesheet-"]')].some(e => e.innerText.includes('Anita'))`)
      check('My Approvals shows Anita\'s hours to Arjun', inboxHas)
      await nav('timesheets/approval/', `${mainText}.includes('Anita Rao') || ${mainText}.includes('All caught up')`)
      const sec = `[...document.querySelectorAll('main section')].find(s => s.innerText.includes('Anita Rao') && s.innerText.includes('6 h'))`
      if (!check('Timesheet Approval shows Anita Rao 6 h', await br.evalJs(`!!${sec}`), (await br.evalJs(mainText)).slice(0, 300))) throw new Error('nothing to approve')
      await br.click(btnExact('Approve', sec), 'Approve hours')
      await waitToast(/approv/i)
      await settle(1200)
      await signIn('anita')
      check('Anita\'s bell shows the approval', Boolean(await bell(/approv/i, [ctx.code, STAMP, 'Design home page', '6 h', '6h'])))
      await signIn('priya')
      await openProject('budget')
      await br.waitFor(`${mainText}.includes('Actual Cost')`, 'budget tab', 15000)
      const actual = await statCard('Actual Cost')
      note('Actual Cost card: ' + actual)
      check('labour (hours) is ₹3,600', /hours ₹3,600/.test(actual || ''), actual)
    })

    // =============================================================================================== 10
    await step(10, 'Anita adds a 15,000 Hardware expense and submits it', async () => {
      await signIn('anita')
      await nav('budget/expenses/', `[...document.querySelectorAll('main button')].some(b => b.innerText.includes('Add Expense'))`)
      await br.click(btn('Add Expense', `document.querySelector('main')`), 'Add Expense')
      await br.waitFor(`!!document.querySelector('#project_id')`, 'expense drawer')
      await settle(800)
      await br.pickOption('#project_id', NAME)
      await settle(800)
      await br.pickOption('#category', 'Hardware')
      await br.type(q('#description'), 'Test phones')
      await br.pick(q('#expense_date'), day(-3))
      await br.type(q('#amount'), '15000')
      if (!(await br.evalJs(`document.querySelector('#billable').checked`))) await br.click(q('#billable'), 'Billable')
      await sleep(400)
      const needsReceipt = await br.evalJs(`(document.querySelector('[data-receipt]')?.innerText || '').includes('*')`)
      note('receipt required by the form: ' + needsReceipt)
      if (needsReceipt) {
        const file = path.join(SHOTS, 'receipt.png')
        fs.writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
        await br.setFiles('#receipt', [file])
        await sleep(400)
      }
      await br.click(btn('Submit for Approval', `document.querySelector('.MuiDrawer-root')`), 'Submit for Approval')
      const t = await waitToast(/submit|sent|approval|saved/i)
      await br.waitFor(`!document.querySelector('#project_id')`, 'drawer closed', 15000).catch(() => {})
      await settle(1200)
      const exp = ((await api(`/expenses?project_id=${ctx.projectId}&page_size=50`)).detail || []).find(e => e.description === 'Test phones')
      ctx.expenseId = exp?.id
      note('expense: ' + J(exp && [exp.expense_key, exp.status, exp.amount, exp.billable, exp.receipt_document_id]))
      check('expense saved as Submitted, 15000, billable', exp && exp.status === 'Submitted' && Number(exp.amount) === 15000 && exp.billable, J(exp).slice(0, 200) + ' ' + t)
    })

    // =============================================================================================== 11
    await step(11, 'Priya cannot approve the 15,000 expense (above her 10,000 limit)', async () => {
      await signIn('priya')
      await nav('approvals/', `!!document.querySelector('[data-approvals-list], [data-approvals-empty]')`)
      const row = `document.querySelector('[data-approval-item="expense-${ctx.expenseId}"]')`
      const listed = await br.evalJs(`!!${row}`)
      note('expense listed in Priya\'s My Approvals: ' + listed)
      if (listed) {
        await br.click(btnExact('Approve', row), 'Approve expense')
        await br.waitFor(`!!document.querySelector('#reason_text')`, 'note dialog')
        await br.click(btnExact('Approve', dialog), 'Approve (dialog)')
        const t = await waitToast(/./)
        note('toast after approving: ' + t)
        await settle(1000)
      }
      if (listed) finding('My Approvals lists an expense the PM is not allowed to approve', 'the item is shown with an Approve button and only the server refuses')
      // The Expenses screen is the other place a PM approves expenses.
      // Filter to our project: other demo/test projects may fill the first page with newer expenses.
      await nav(`budget/expenses/?projectId=${ctx.projectId}`, `${mainText}.includes('Test phones') || ${mainText}.includes('No expenses')`)
      const key = (((await api(`/expenses?project_id=${ctx.projectId}&page_size=50`)).detail || []).find(e => e.id === ctx.expenseId) || {}).expense_key
      const approveBtn = `document.querySelector('[aria-label="Approve ${key}"]')`
      const offered = await br.waitFor(`!!${approveBtn}`, 'Approve on the Expenses screen', 6000).catch(() => false)
      note(`Expenses screen offers Priya an Approve button for ${key}: ${offered}`)
      if (offered) {
        await br.click(approveBtn, `Approve ${key}`)
        const t = await waitToast(/limit|approve|cannot|only|above|Finance|Director/i)
        check('approving is refused with a message', Boolean(t) && !/1 expense approved/i.test(t), t)
        await settle(800)
        ctx.priyaRefusal = t
        if (t && !listed) finding('Expenses screen shows the PM an Approve button for an expense above her limit (My Approvals hides it); only the server refuses', t)
      }
      const exp = ((await api(`/expenses?project_id=${ctx.projectId}&page_size=50`)).detail || []).find(e => e.id === ctx.expenseId)
      check('expense is still Submitted (Priya was refused)', exp?.status === 'Submitted', exp?.status)
    })

    // =============================================================================================== 12
    await step(12, 'Kiran (Finance) approves the expense; Anita is told; actual cost 18,600', async () => {
      await signIn('kiran')
      await nav('approvals/', `!!document.querySelector('[data-approvals-list], [data-approvals-empty]')`)
      const row = `document.querySelector('[data-approval-item="expense-${ctx.expenseId}"]')`
      if (!check('Kiran sees the expense in My Approvals', await br.waitFor(`!!${row}`, 'expense row', 8000).catch(() => false))) throw new Error('not listed')
      await br.click(btnExact('Approve', row), 'Approve expense')
      await br.waitFor(`!!document.querySelector('#reason_text')`, 'note dialog')
      await br.click(btnExact('Approve', dialog), 'Approve (dialog)')
      await waitToast(/approv/i)
      await settle(1200)
      const exp = ((await api(`/expenses?project_id=${ctx.projectId}&page_size=50`)).detail || []).find(e => e.id === ctx.expenseId)
      check('expense is Approved', exp?.status === 'Approved', exp?.status)
      await signIn('anita')
      check('Anita\'s bell shows the expense decision', Boolean(await bell(/expense|EXP|Test phones/i, [ctx.code, STAMP, 'Test phones'])))
      await signIn('priya')
      await openProject('budget')
      await br.waitFor(`${mainText}.includes('Actual Cost')`, 'budget tab', 15000)
      const actual = await statCard('Actual Cost')
      note('Actual Cost card: ' + actual)
      check('actual cost is ₹18,600', /₹18,600/.test(actual || ''), actual)
    })

    // =============================================================================================== 13
    await step(13, 'Anita raises change request "Add product search" (+50,000)', async () => {
      await signIn('anita')
      await nav('risks/changeRequests/', `${mainText}.length > 50`)
      const canAdd = await br.waitFor(`!!${btn('New Change Request', `document.querySelector('main')`)}`, 'New Change Request', 8000).catch(() => false)
      if (!check('Anita has a New Change Request button', canAdd)) throw new Error('no button')
      await br.click(btn('New Change Request', `document.querySelector('main')`), 'New Change Request')
      await br.waitFor(`!!document.querySelector('#choose_project')`, 'choose project', 8000)
      await br.pickOption('#choose_project', NAME)
      await br.click(btnExact('Continue', dialog), 'Continue')
      await br.waitFor(`!!document.querySelector('#title')`, 'change drawer')
      await settle(600)
      await br.type(q('#title'), 'Add product search')
      await br.pickOption('#change_type', 'Cost')
      await br.type(q('#reason'), 'Client wants a search box on every page')
      await br.type(q('#cost_impact'), '50000')
      await sleep(300)
      note('drawer preview: ' + (await br.evalJs(`(document.querySelector('.MuiDrawer-root')?.innerText || '').match(/When approved:[^]*?(?=\\n\\n|$)/)?.[0] || ''`)).replace(/\s+/g, ' '))
      await br.click(btn('Submit Change', `document.querySelector('.MuiDrawer-root')`), 'Submit Change')
      await waitToast(/change|submitted|raised|CR/i)
      await br.waitFor(`!document.querySelector('#cost_impact')`, 'drawer closed', 15000)
      await settle(1200)
      const crs = (await api(`/projects/${ctx.projectId}/change-requests`)).detail || []
      const cr = (Array.isArray(crs) ? crs : []).find(c => c.title === 'Add product search')
      ctx.crId = cr?.id
      note('CR: ' + J(cr && [cr.cr_key, cr.status, cr.cost_impact, cr.change_type]))
      check('change request saved as Submitted with +50,000', cr && cr.status === 'Submitted' && Number(cr.cost_impact) === 50000, J(cr).slice(0, 200))
      // Her row menu: Edit / Withdraw, never Approve.
      const rowSel = `[...document.querySelectorAll('main tr')].find(r => r.innerText.includes('Add product search'))`
      await br.waitFor(`!!(${rowSel})`, 'CR row', 10000)
      await br.click(`(${rowSel}).querySelector('svg.lucide-ellipsis, svg[class*=ellipsis], td:last-child svg')`, 'row menu')
      await sleep(500)
      const menu = await br.evalJs(`[...document.querySelectorAll('[role=menu] [role=menuitem]')].map(m => m.innerText.trim())`)
      note('Anita row menu: ' + J(menu))
      check('Anita\'s menu has no Approve', !menu.includes('Approve'), J(menu))
      await br.key('Escape', 'Escape', 27)
    })

    // =============================================================================================== 14
    await step(14, 'Priya approves the change request; budget 3,50,000, baseline 3,00,000', async () => {
      await signIn('priya')
      check('bell shows the change request', Boolean(await bell(/change|CR-|product search/i, [ctx.code, STAMP, 'product search'])))
      await nav('approvals/', `!!document.querySelector('[data-approvals-list], [data-approvals-empty]')`)
      const row = `[...document.querySelectorAll('[data-approval-item^="change-"]')].find(e => e.innerText.includes('Add product search'))`
      if (!check('My Approvals shows the CR', await br.waitFor(`!!(${row})`, 'CR row', 8000).catch(() => false))) throw new Error('not listed')
      await br.click(btnExact('Approve', `(${row})`), 'Approve CR')
      await br.waitFor(`!!document.querySelector('#reason_text')`, 'note dialog')
      await br.click(btnExact('Approve', dialog), 'Approve (dialog)')
      await waitToast(/approv/i)
      await settle(1200)
      const p = await projectApi()
      check('project budget is 350000', Number(p.budget) === 350000, p.budget)
      check('baseline budget stays 300000', Number(p.baseline?.budget) === 300000, J(p.baseline))
      await openProject('budget')
      await br.waitFor(`${mainText}.includes('Actual Cost')`, 'budget tab', 15000)
      const b = await statCard('Budget')
      note('Budget card: ' + b)
      check('Budget tab shows ₹3,50,000', /₹3,50,000/.test(b || ''), b)
      await openProject()
      const base = await br.evalJs(`document.querySelector('[data-baseline]')?.innerText || ''`)
      note('baseline on Overview: ' + base.replace(/\s+/g, ' '))
      check('Overview shows ₹3,00,000 → ₹3,50,000', base.includes('₹3,00,000') && base.includes('₹3,50,000'), base)
    })

    // =============================================================================================== 15
    await step(15, 'Anita moves her task to Done', async () => {
      await signIn('anita')
      const st = await kanbanDrag('Done')
      check('task is Done', st === 'Done', st)
    })

    // =============================================================================================== 16
    await step(16, 'Priya ticks the deliverable; the milestone goes to review by itself', async () => {
      await signIn('priya')
      await openProject('milestones')
      const card = `document.querySelector('[data-milestone="Design Sign-off"]')`
      await br.waitFor(`!!${card}`, 'milestone card', 15000)
      await br.click(`[...${card}.querySelectorAll('input[type=checkbox]')][0]`, 'deliverable checkbox')
      await br.waitFor(`${card}.innerText.includes('(1/1)')`, 'deliverable done', 10000)
      // Settings > Automation: with its task done and its deliverable ticked, the milestone is sent for review.
      await br.waitFor(`${card}.innerText.includes('Ready for Review')`, 'Ready for Review on the card', 15000)
      const ms = ((await api(`/projects/${ctx.projectId}/milestones`)).detail || []).find(m => m.id === ctx.milestoneId)
      check('milestone is Ready for Review', ms?.status === 'Ready for Review', ms?.status)
    })

    // =============================================================================================== 17
    await step(17, 'Ravi (client) accepts the milestone in the Client Portal; Priya is told', async () => {
      await signIn('ravi')
      await br.waitFor(`location.pathname.includes('/portal')`, 'portal', 15000)
      await br.waitFor(`!!document.querySelector('[data-portal-projects], [data-portal-empty]')`, 'portal list', 15000)
      const ids = await br.evalJs(`[...document.querySelectorAll('[data-portal-project]')].map(a => Number(a.dataset.portalProject))`)
      const owners = []
      for (const pid of ids) owners.push((await api(`/projects/${pid}`)).detail?.customer_name)
      note('portal projects: ' + J(ids.map((x, i) => [x, owners[i]])))
      check('portal lists only Acme Retail projects', owners.length > 0 && owners.every(o => /acme retail/i.test(o || '')), J(owners))
      check('portal lists this project', ids.includes(ctx.projectId))
      await br.click(q(`[data-portal-project="${ctx.projectId}"]`), 'open project')
      const li = `document.querySelector('[data-portal-milestone="${ctx.milestoneId}"]')`
      await br.waitFor(`!!${li}`, 'portal milestone', 15000)
      await br.click(btn('Accept', li), 'Accept')
      await br.waitFor(`!!document.querySelector('#reason_text')`, 'accept dialog')
      await br.type(q('#reason_text'), 'Looks great, accepted.')
      await br.click(btnExact('Accept', dialog), 'Accept (dialog)')
      await waitToast(/accept/i)
      await settle(1200)
      const ms = ((await api(`/projects/${ctx.projectId}/milestones`)).detail || []).find(m => m.id === ctx.milestoneId)
      check('milestone is Accepted', ms?.status === 'Accepted', ms?.status)
      await signIn('priya')
      // Ravi's own comment identifies this acceptance; the title should also say which project it is.
      const acc = await bell(/accept/i, [ctx.code, STAMP, 'Looks great, accepted.'])
      check('Priya\'s bell shows the acceptance', Boolean(acc))
      if (acc && !acc.includes(ctx.code) && !acc.includes(STAMP))
        finding('Milestone acceptance notification does not say which project', acc)
    })

    // =============================================================================================== 18
    await step(18, 'The invoice of the accepted milestone is drafted by itself: Draft 1,18,000 (18% GST); Priya has no Issue button', async () => {
      // Settings > Automation: accepting the milestone drafted its invoice with the project's GST and terms.
      await nav('billing/', `!!document.querySelector('main tbody tr')`)
      await settle(1200)
      const row = `[...document.querySelectorAll('main tbody tr')].find(r => r.innerText.includes(${J(NAME)}) || r.innerText.includes(${J(ctx.code)}))`
      await br.waitFor(`!!(${row})`, 'invoice row', 10000)
      const rowText = await br.evalJs(`(${row}).innerText.replace(/\\s+/g, ' ')`)
      note('invoice row: ' + rowText)
      check('invoice row shows ₹1,18,000 Draft', rowText.includes('₹1,18,000') && rowText.includes('Draft'), rowText)
      await br.click(`(${row})`, 'open invoice')
      await br.waitFor(`!!${dialog}`, 'invoice dialog')
      await settle(800)
      check('Priya has no Issue button', !(await br.evalJs(`!!${btnExact('Issue', dialog)}`)))
      ctx.invoiceText = rowText
      await br.click(btnExact('Close', dialog), 'Close invoice')
    })

    // =============================================================================================== 19
    await step(19, 'Kiran issues the invoice and marks it paid (future date refused); Ravi sees Paid', async () => {
      await signIn('kiran')
      await nav('billing/', `!!document.querySelector('main tbody tr')`)
      const row = `[...document.querySelectorAll('main tbody tr')].find(r => r.innerText.includes(${J(NAME)}) || r.innerText.includes(${J(ctx.code)}))`
      await br.waitFor(`!!(${row})`, 'invoice row', 10000)
      await br.click(`(${row})`, 'open invoice')
      await br.waitFor(`!!${dialog}`, 'invoice dialog')
      await br.click(btnExact('Issue', dialog), 'Issue')
      await br.waitFor(`[...document.querySelectorAll('[role=dialog]')].some(d => d.innerText.includes('Issue this invoice'))`, 'issue confirm')
      await br.click(btnExact('Issue', dialog), 'Issue (confirm)')
      await waitToast(/issued|invoice/i)
      await settle(1200)
      await br.click(btn('Mark Paid', dialog), 'Mark Paid')
      await br.waitFor(`!!document.querySelector('#paid_date')`, 'paid date')
      await br.pick(q('#paid_date'), day(1))
      await br.click(btnExact('Confirm Payment', dialog), 'Confirm Payment (future)')
      await sleep(800)
      const refused = await br.evalJs(`${dialog}.innerText.includes('cannot be in the future')`)
      check('a future payment date is refused', refused)
      await br.pick(q('#paid_date'), day(0))
      await br.click(btnExact('Confirm Payment', dialog), 'Confirm Payment')
      await waitToast(/paid|payment/i)
      await settle(1200)
      check('invoice shows Paid', await br.waitFor(`${dialog}.innerText.includes('Paid')`, 'paid', 8000).catch(() => false))
      await br.key('Escape', 'Escape', 27)
      await signIn('ravi')
      await br.click(q(`[data-portal-project="${ctx.projectId}"]`), 'open project')
      await br.waitFor(`!!document.querySelector('[data-portal-invoices]')`, 'portal invoices', 15000)
      const inv = await br.evalJs(`document.querySelector('[data-portal-invoices]').innerText.replace(/\\s+/g, ' ')`)
      note('portal invoices: ' + inv)
      check('Ravi sees the invoice as Paid', /Paid/.test(inv), inv)
    })

    // =============================================================================================== 20
    await step(20, 'Priya closes the project; Dev User sees Reopen Project', async () => {
      await signIn('priya')
      await openProject()
      note('status buttons: ' + J(await br.evalJs(`[...document.querySelector('main section').querySelectorAll('button')].map(b => b.innerText.trim()).filter(Boolean)`)))
      await br.click(btn('Close Project', `document.querySelector('main')`), 'Close Project')
      await br.waitFor(`!!${dialog}`, 'confirm close')
      const msg = await br.evalJs(`${dialog}.innerText.replace(/\\s+/g, ' ')`)
      note('close dialog: ' + msg)
      check('warning says "Closing is final"', msg.includes('Closing is final'), msg)
      await br.click(btnExact('Yes, close project', dialog), 'Yes, close project')
      await waitToast(/clos/i)
      await settle(1500)
      const p = await projectApi()
      check('project is Closed', p.status === 'Closed', p.status)
      await signIn('dev')
      await openProject()
      check('Dev User sees Reopen Project', await br.waitFor(`!!document.querySelector('[data-reopen-project]')`, 'reopen', 8000).catch(() => false))
    })
  } finally {
    await br.close()
    if (!process.env.KEEP) {
      for (const p of (await api('/projects/options')).detail || []) {
        if (p.project_name.startsWith('Zz UI Flow')) {
          const r = await fetch(`${API}/projects/${p.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } })
          console.log(`cleanup: deleted ${p.project_code} ${p.project_name} -> ${r.status}`)
        }
      }
      const left = ((await api('/projects/options')).detail || []).filter(p => p.project_name.startsWith('Zz UI Flow'))
      console.log(left.length ? `cleanup: ${left.length} "Zz UI Flow" projects LEFT` : 'cleanup: no "Zz UI Flow" projects left')
    } else console.log(`KEEP=1: project ${ctx.code} (${ctx.projectId}) kept`)
  }

  console.log('\n================ SUMMARY')
  for (const r of report) console.log(`${r.status}  ${String(r.step).padStart(2)}. ${r.title}${r.status === 'FAIL' ? '\n        ' + r.notes.filter(n => /FAIL|STOPPED|screenshot|FINDING/.test(n)).join('\n        ') : ''}`)
  if (toastCovers.length) findings.push({ step: "-", title: `A success toast (top-right) sat on top of the bell/avatar when the user went to use them (${toastCovers.length} times)`, detail: toastCovers.join(", ") })
  if (findings.length) {
    console.log('\nFINDINGS')
    findings.forEach(f => console.log(` - step ${f.step}: ${f.title}${f.detail ? ` (${f.detail})` : ''}`))
  }
  fs.writeFileSync(path.join(SHOTS, `report_${STAMP}.json`), J({ stamp: STAMP, report, findings }, null, 2))
  const failed = report.filter(r => r.status !== 'PASS').length
  console.log(failed ? `\n${failed} of ${report.length} steps FAILED` : `\nALL ${report.length} STEPS PASSED`)
  process.exit(failed ? 1 : 0)
}

module.exports = { launch, USERS, PASSWORD, APP, ORIGIN }
if (require.main === module) run()
