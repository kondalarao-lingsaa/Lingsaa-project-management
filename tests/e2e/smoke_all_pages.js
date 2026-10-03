// Smoke test of every PMS page: opens each one (desktop and phone width) and reports console errors, uncaught
// exceptions, failed API calls (4xx/5xx except expected 404 "no records"), error screens and sideways scrolling on
// phones. Run from frontend/:  node tests/e2e/smoke_all_pages.js   (reads only, changes nothing)
const fs = require('fs')
const path = require('path')
const { launch } = require('./cdp')

const APP = process.env.PMS_APP || 'http://127.0.0.1:3000'
const API = 'http://127.0.0.1:8000/api'
const TOKEN = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
const PAGES_DIR = path.join(__dirname, '../../src/pages/appModules/projects')

const api = async url => (await fetch(API + url, { headers: { Authorization: `Bearer ${TOKEN}` } })).json()
const routes = dir =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return routes(full)

    return e.name === 'index.js' ? [path.relative(PAGES_DIR, dir).replace(/\\/g, '/')] : []
  })

// Messages that are noise, not app problems.
const IGNORE = [/Download the React DevTools/i, /\[Fast Refresh\]/i, /favicon/i, /webpack-hmr|_next\/webpack|turbopack-hmr/i, /ERR_ABORTED/i]

;(async () => {
  const project = ((await api('/projects/list?page_size=1&search=E-Commerce')).detail || [])[0]
  const task = ((await api(`/tasks/list?page_size=1&project_id=${project.id}`)).detail || [])[0]
  const query = { 'projects/projectDetails': `?id=${project.id}`, 'tasks/taskDetails': `?id=${task.id}` }
  const pages = routes(PAGES_DIR).filter(Boolean).sort()

  const br = await launch(path.join(require('os').tmpdir(), 'chrome-smoke'), 1440, 1000)
  const report = []
  try {
    await br.goto(`${APP}/appModules/projects/dashboard/`)
    await br.sleep(2000)
    await br.evalJs(`['access_token','username','user_id','client_id'].forEach(k => localStorage.removeItem(k)); true`)
    for (const width of [1440, 390]) {
      await br.evalJs('true')
      for (const page of pages) {
        if (width === 390) await br.evalJs(`true`)
        const url = `${APP}/appModules/projects/${page}/${query[page] || ''}`
        br.problems()
        await br.goto(url)
        await br.sleep(width === 1440 ? 3500 : 2500)
        const state = await br.evalJs(`JSON.stringify({
          title: (document.querySelector('main h1, main h2, h1') || {}).innerText || '',
          errorScreen: /Application error|Unhandled Runtime Error|Something went wrong|This page could not be found/i.test(document.body.innerText),
          overflow: document.documentElement.scrollWidth - window.innerWidth
        })`).then(JSON.parse)
        const issues = br.problems().filter(p => !IGNORE.some(r => r.test(p.text)) && !(p.kind === 'http.404' && p.text.includes(':8000/')))
        report.push({ width, page, ...state, issues })
        const bad = state.errorScreen || issues.length || (width === 390 && state.overflow > 4)
        console.log(`${bad ? 'ISSUE' : 'ok   '} ${width}px ${page.padEnd(28)} ${state.title.slice(0, 30).padEnd(30)} ${state.errorScreen ? 'ERROR SCREEN ' : ''}${width === 390 && state.overflow > 4 ? `overflow ${state.overflow}px ` : ''}${issues.map(i => `${i.kind}: ${i.text}`).join(' | ').slice(0, 300)}`)
      }
      if (width === 1440) {
        // Phone width for the second round.
        await br.close()
        Object.assign(br, await launch(path.join(require('os').tmpdir(), 'chrome-smoke-m'), 390, 844))
        await br.goto(`${APP}/appModules/projects/dashboard/`)
        await br.sleep(1500)
        await br.evalJs(`['access_token','username','user_id','client_id'].forEach(k => localStorage.removeItem(k)); true`)
      }
    }
  } finally {
    await br.close()
    fs.writeFileSync(path.join(require('os').tmpdir(), 'pms_smoke_report.json'), JSON.stringify(report, null, 2))
    const bad = report.filter(r => r.errorScreen || r.issues.length || (r.width === 390 && r.overflow > 4))
    console.log(`\n${report.length} page views, ${bad.length} with issues`)
  }
})()
