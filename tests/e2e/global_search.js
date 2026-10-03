// End-to-end check of global search (Ctrl+K): opens with the shortcut and the header box, finds screens by name and
// records across modules, keyboard navigation opens the result. Reads only. Needs Google Chrome.
// Run from frontend/:  node tests/e2e/global_search.js
const path = require('path')
const { launch } = require('./cdp')

const ROOT = `${process.env.PMS_APP || 'http://127.0.0.1:3000'}/appModules/projects`

;(async () => {
  const results = []
  const check = (name, ok, extra = '') => {
    results.push(ok)
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  [${extra}]`))
  }
  const br = await launch(path.join(require('os').tmpdir(), 'chrome-search'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const resultsText = `(document.querySelector('[data-search-results]') || {}).innerText || ''`
  try {
    await br.goto(`${ROOT}/dashboard/`)
    await br.evalJs(`['access_token','username','user_id','client_id'].forEach(k => localStorage.removeItem(k)); true`)
    await br.goto(`${ROOT}/dashboard/`)
    await br.waitFor(`!!document.querySelector('[data-search-open]')`, 'header search')
    await br.sleep(1500)
    for (let i = 0; i < 10 && !(await br.evalJs(`!!document.querySelector('#global_search')`)); i++) {
      await br.evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })); true`)
      await br.sleep(500)
    }
    await br.waitFor(`!!document.querySelector('#global_search')`, 'dialog')
    check('Ctrl+K opens the search window', true)
    await br.setInput('#global_search', 'timesh')
    await br.waitFor(`${resultsText}.includes('My Timesheets')`, 'screens')
    check('typing "timesh" lists the Timesheets screens', await br.evalJs(`${resultsText}.includes('Team Timesheets')`))
    await br.setInput('#global_search', 'commerce')
    await br.waitFor(`${resultsText}.includes('E-Commerce Application')`, 'project result')
    check('typing "commerce" finds the E-Commerce Application project', true)
    await br.setInput('#global_search', 'zzqqxx')
    await br.waitFor(has('No records match "zzqqxx"'), 'no results')
    check('a search with no matches says so', true)
    await br.setInput('#global_search', 'commerce')
    await br.waitFor(`!!document.querySelector('[data-result="Projects"]')`, 'project row')
    // Move from the first row down to the project and open it with Enter.
    const target = await br.evalJs(`[...document.querySelectorAll('[data-index]')].findIndex(b => b.dataset.result === 'Projects')`)
    for (let i = 0; i < target; i++) await br.evalJs(`document.querySelector('#global_search').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); true`)
    await br.evalJs(`document.querySelector('#global_search').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); true`)
    await br.waitFor(`location.pathname.includes('projectDetails') && ${has('E-Commerce Application')}`, 'opened')
    check('arrow keys + Enter open the project', true)
    await br.evalJs(`document.querySelector('[data-search-open]').click()`)
    await br.waitFor(`!!document.querySelector('#global_search')`, 'reopen')
    check('the header search box opens it too', true)
    await br.setInput('#global_search', 'design')
    await br.sleep(1500)
    await br.shot(`${require('os').tmpdir()}/pms_search.png`)
    // Project Details > Activity tab (was "soon"): the project's own timeline.
    const projectUrl = await br.evalJs('location.href')
    await br.goto(projectUrl.split('&tab=')[0] + '&tab=activity')
    await br.waitFor(`document.querySelectorAll('[data-activity]').length > 0`, 'activity tab')
    check('Project Details > Activity shows the project timeline', await br.evalJs(`![...document.querySelectorAll('button')].some(b => b.innerText.includes('soon'))`))
  } catch (e) {
    console.log('FAILED:', e.message)
    process.exitCode = 1
  } finally {
    await br.close()
    console.log(results.every(Boolean) && !process.exitCode ? `\nALL ${results.length} CHECKS PASSED` : `\n${results.filter(x => !x).length} FAILED or stopped early`)
  }
})()
