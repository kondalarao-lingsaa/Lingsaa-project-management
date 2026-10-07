// Close Project warns that closing is final, and an Admin can reopen a Closed project with a reason.
// Run from frontend/:  node tests/e2e/close_reopen.js  (cleans up)
const fs = require('fs')
const path = require('path')
const { launch } = require('./cdp')

const ROOT = `${process.env.PMS_APP || 'http://127.0.0.1:3000'}/appModules/projects`
const API = 'http://127.0.0.1:8000/api'
const TOKEN = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
const NAME = 'Close Reopen Check'
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
  for (const p of (await api('GET', '/projects/options')).detail || []) if (p.project_name.startsWith(NAME)) await api('DELETE', `/projects/${p.id}`)
  const project = (await api('POST', '/projects/create', {
    project_name: NAME, project_type: 'Internal', start_date: d(-5), end_date: d(40), budget: 10000, project_manager_name: 'Dev User', project_manager_id: 1
  })).data
  for (const s of ['Pending Approval', 'Active']) await api('POST', `/projects/${project.id}/status`, { status: s })

  const br = await launch(path.join(require('os').tmpdir(), 'chrome-close-reopen'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const click = t => br.evalJs(`(() => { const b = [...document.querySelectorAll('button')].filter(b => b.innerText.trim() === ${JSON.stringify(t)}).pop(); if (!b) return false; b.click(); return true })()`)
  try {
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}`)
    await br.waitFor(has('Close Project'), 'project details')
    await click('Close Project')
    await br.waitFor(has('Closing is final'), 'close warning')
    check('Close Project warns that closing is final', await br.evalJs(has('Only an Admin or Director can reopen it')))
    check('the confirm button says "Yes, close project"', await br.evalJs(`[...document.querySelectorAll('button')].some(b => b.innerText.trim() === 'Yes, close project')`))
    await click('Cancel')
    await br.sleep(500)
    check('Cancel leaves the project Active', (await api('GET', `/projects/${project.id}`)).detail.status === 'Active')

    await click('Close Project')
    await br.waitFor(has('Closing is final'), 'close warning again')
    await click('Yes, close project')
    await br.waitFor(has('Reopen Project'), 'reopen button')
    check('after closing, the Admin sees Reopen Project', (await api('GET', `/projects/${project.id}`)).detail.status === 'Closed')

    await click('Reopen Project')
    await br.waitFor(`!!document.querySelector('#reason_text')`, 'reopen dialog')
    await br.setInput('#reason_text', 'oops')
    await click('Reopen Project')
    await br.sleep(700)
    check('a reason under 10 characters is not accepted', (await api('GET', `/projects/${project.id}`)).detail.status === 'Closed')
    await br.setInput('#reason_text', 'closed by mistake, two tasks remain')
    await click('Reopen Project')
    await br.waitFor(`!document.querySelector('#reason_text')`, 'dialog closed')
    await br.sleep(800)
    check('the project is Active again', (await api('GET', `/projects/${project.id}`)).detail.status === 'Active')
    check('the reason is kept in the approval history', JSON.stringify(await api('GET', `/projects/${project.id}/approvals`)).includes('two tasks remain'))
  } catch (e) {
    console.log('FAILED:', e.message)
    process.exitCode = 1
  } finally {
    await br.close()
    await api('DELETE', `/projects/${project.id}`)
    console.log(results.every(Boolean) && !process.exitCode ? `\nALL ${results.length} CHECKS PASSED` : `\n${results.filter(x => !x).length} FAILED or stopped early`)
  }
})()
