// End-to-end check of Projects + Tasks against the running app (http://127.0.0.1:3000) and API (:8000).
// Needs Google Chrome. Run from frontend/:  node tests/e2e/regression.js   (creates and then deletes its own test data)
const { launch } = require('./cdp')
const path = require('path')
const D = require('os').tmpdir()
const ROOT = `${process.env.PMS_APP || 'http://127.0.0.1:3000'}/appModules/projects`

;(async () => {
  // A run that stopped half way can leave its project behind; remove it so "create" does not hit a duplicate name.
  const TOKEN = require('fs').readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
  const call = (method, url) => fetch(`http://127.0.0.1:8000/api${url}`, { method, headers: { Authorization: `Bearer ${TOKEN}` } }).then(r => r.json())
  for (const p of (await call('GET', '/projects/options')).detail || []) if (p.project_name === 'Regression Check Project') await call('DELETE', `/projects/${p.id}`)
  const b = await launch(path.join(process.env.TEMP, 'chrome-regression'), 1500, 1200)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const all = (...e) => e.join(' && ')
  const no = e => `!(${e})`
  const results = []
  const check = (name, ok, extra = '') => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  [${extra}]`)) }
  const clickMain = text => b.evalJs(`(() => { const el = [...document.querySelectorAll('main button')].find(e => e.innerText.trim().startsWith(${JSON.stringify(text)})); if (!el) return false; el.click(); return true })()`)
  const openRowMenu = title => b.evalJs(`(() => { const tr = [...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes(${JSON.stringify(title)})); if (!tr) return false; tr.querySelector('td:last-child svg').dispatchEvent(new MouseEvent('click', { bubbles: true })); return true })()`)
  const setRowStatus = (title, value) => b.evalJs(`(() => { const tr = [...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes(${JSON.stringify(title)})); const el = tr.querySelector('select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  const perPage = n => b.evalJs(`(() => { const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === '100')); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, '${n}'); sel.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  const search = async text => { await b.setInput('input[placeholder^="Search with"]', text); await b.sleep(150) }
  try {
    // ---------- Projects list: search, filters, custom columns ----------
    await b.goto(`${ROOT}/projects/allProjects/`)
    // Start from the default columns: a stopped earlier run can leave a saved column choice in this Chrome profile.
    await b.evalJs(`localStorage.removeItem('pms.columns.projects.allProjects'); true`)
    await b.goto(`${ROOT}/projects/allProjects/`)
    await b.waitFor(`document.querySelectorAll('tbody tr').length === 5`, 'first page')
    check('list shows 5 rows per page by default (same as Lingsaa_Accounts)', true)
    await perPage(10)
    await b.waitFor(has('PRJ-2026-0001'), 'projects list')
    await search('mobile')
    await b.waitFor(all(has('Mobile Banking App'), no(has('HR Portal Revamp'))), 'search narrows')
    check('search box narrows the projects list', true)
    await search('')
    await b.waitFor(has('HR Portal Revamp'), 'list restored')

    await clickMain('Filters')
    await b.waitFor(`!!document.querySelector('.filterCustBtn.active')`, 'filters active')
    await b.evalJs(`(() => { const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.text === 'All Priorities')); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, 'Critical'); sel.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
    await b.waitFor(all(has('Mobile Banking App'), no(has('HR Portal Revamp')), has('Filters (1)')), 'priority filter')
    check('Filters panel: Critical priority filter works and the button shows "Filters (1)"', true)
    await b.evalJs(`(() => { const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.text === 'All Priorities')); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, ''); sel.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
    await b.waitFor(has('HR Portal Revamp'), 'filter cleared')

    await clickMain('Custom')
    await b.waitFor(`!!document.querySelector('[role="menu"]')`, 'columns menu')
    await b.evalJs(`[...document.querySelectorAll('[role="menuitem"]')].find(li => li.innerText.trim() === 'Manager').click()`)
    await b.sleep(500)
    const headers = await b.evalJs(`[...document.querySelectorAll('thead th')].map(t => t.innerText.trim())`)
    check('Custom menu hides the Manager column', !headers.includes('Manager') && headers.includes('Project'), headers.join('|'))
    await b.goto(`${ROOT}/projects/allProjects/`)
    await b.waitFor(has('PRJ-2026-0007'), 'reloaded')
    await b.sleep(500)
    const headers2 = await b.evalJs(`[...document.querySelectorAll('thead th')].map(t => t.innerText.trim())`)
    check('hidden column choice is remembered after a reload', !headers2.includes('Manager'), headers2.join('|'))
    await clickMain('Custom'); await b.waitFor(`!!document.querySelector('[role="menu"]')`, 'menu again')
    await b.evalJs(`[...document.querySelectorAll('[role="menuitem"]')].find(li => li.innerText.trim() === 'Manager').click()`)
    await b.sleep(300)
    await b.evalJs(`document.querySelector('.MuiBackdrop-root') && document.querySelector('.MuiBackdrop-root').click()`)
    await b.sleep(400)
    const actionsVisible = await b.evalJs(`(() => { const th = [...document.querySelectorAll('thead th')].find(t => t.innerText.trim() === 'Actions'); const r = th.getBoundingClientRect(); return r.right <= window.innerWidth + 1 })()`)
    check('Actions column stays visible (pinned right)', actionsVisible)

    // ---------- Create, workflow, edit, delete ----------
    await clickMain('Add Project').catch?.(() => {})
    await b.evalJs(`[...document.querySelectorAll('button')].find(e => e.innerText.trim().startsWith('Add Project')).click()`)
    await b.waitFor(has('Set up a new project'), 'drawer')
    await b.sleep(700)
    await b.setInput('#project_name', 'regression check project')
    await b.setInput('#customer_mobile', '9876543210')
    await b.setInput('#customer_email', 'qa@example.com')
    await b.clickText('button', 'Create Draft')
    await b.waitFor(all(has('Please Enter Client Name'), has('Please Select Start Date'), has('Please Select Project Type'), has('Please Enter Contact Person Name')), 'required errors')
    check('required Project Type, Client, Contact Person and Start Date are flagged on submit', true)
    await b.setInput('#customer_pan', 'abcdefghij')
    await b.evalJs(`document.querySelector('#customer_pan').dispatchEvent(new FocusEvent('focusout', { bubbles: true })); true`)
    await b.waitFor(has('Enter a valid 10-character PAN (e.g. ABCDE1234F)'), 'pan error')
    check('PAN mask: all letters keeps only "ABCDE" and shows the Lingsaa PAN message', (await b.evalJs(`document.querySelector('#customer_pan').value`)) === 'ABCDE')
    await b.setInput('#customer_pan', '')
    await b.setInput('#customer_gstin', '36aabcl1234m1z5')
    check('GSTIN fills the PAN automatically', (await b.evalJs(`document.querySelector('#customer_pan').value`)) === 'AABCL1234M')
    await b.setInput('#customer_name', 'qa client')
    await b.setInput('#project_type', 'Fixed Price')
    await b.setInput('#customer_contact_name', 'ravi kumar')
    await b.setInput('#start_date', '2026-10-01')
    await b.clickText('button', 'Create Draft')
    // A new project opens in Project Details (setup checklist) straight after it is created.
    await b.waitFor(`location.pathname.includes('projectDetails') && ${has('Regression Check Project')} && ${no(has('Set up a new project'))}`, 'created', 20000)
    check('project created from the drawer (name auto-capitalised) and opened in Project Details', true)
    await b.waitFor(all(has('Submit for Approval'), has('Project setup'), has('Next step: Fill in the project details')), 'details')
    check('Project Details shows the setup checklist and the next step', true)
    await b.clickText('button', 'Submit for Approval')
    await b.waitFor(has('Add End Date and Budget before sending this project for approval'), 'approval gate')
    check('approval is blocked until End Date and Budget are filled', true)
    await b.clickText('button', 'Edit'); await b.waitFor(has('Update project information'), 'edit drawer'); await b.sleep(900)
    await b.setInput('#end_date', '2026-12-31'); await b.setInput('#budget', '250000')
    await b.clickText('button', 'Update'); await b.waitFor(no(has('Update project information')), 'updated', 20000)
    await b.sleep(800)
    await b.clickText('button', 'Submit for Approval'); await b.waitFor(has('Send Back to Draft'), 'pending')
    // The page refreshes after Submit; retry the click until the project has moved on.
    for (let i = 0; i < 10 && !(await b.evalJs(`[...document.querySelectorAll('button')].some(x => x.innerText.trim() === 'Activate')`)); i++) {
      await b.evalJs(`[...document.querySelectorAll('button')].find(x => x.innerText.trim() === 'Approve' && !x.disabled)?.click(); true`)
      await b.sleep(1200)
    }
    await b.waitFor(`[...document.querySelectorAll('button')].some(x => x.innerText.trim() === 'Activate')`, 'approved')
    await b.clickText('button', 'Activate'); await b.waitFor(all(has('Put On Hold'), has('Close Project')), 'active')
    check('workflow: Draft -> Pending Approval -> Approved -> Active from the page', true)

    // ---------- Tasks inside the project ----------
    await clickMain('Tasks')
    await b.waitFor(has('Add Task'), 'tasks tab')
    await b.waitFor(has('This project has no tasks yet'), 'empty tasks')
    check('Tasks tab opens (empty state for a new project)', true)
    await b.evalJs(`[...document.querySelectorAll('main button')].find(e => e.innerText.trim().startsWith('Add Task')).click()`)
    await b.waitFor(has('Add work to a project'), 'task drawer')
    await b.sleep(700)
    await b.setInput('#title', 'write the regression report')
    await b.setInput('#priority', 'High')
    await b.clickText('button', 'Assign to me')
    await b.clickText('button', 'Submit')
    await b.waitFor(all(has('Write the regression report'), no(has('Add work to a project'))), 'task created', 20000)
    check('task created inside the project (first letter capitalised)', true)
    await setRowStatus('Write the regression report', 'Done')
    await b.sleep(1200)
    await clickMain('Overview')
    await b.waitFor(has('100%'), 'progress 100')
    check('marking the only task Done makes the project 100%', true)
    await clickMain('Tasks')
    await b.waitFor(has('Write the regression report'), 'tasks tab again')
    await openRowMenu('Write the regression report'); await b.waitFor(has('Delete'), 'menu')
    await b.clickText('li', 'Delete'); await b.waitFor(has('Delete task?'), 'confirm'); await b.evalJs(`[...document.querySelectorAll('.MuiDialog-root button')].find(x => x.innerText.trim() === 'Delete').click()`)
    await b.waitFor(no(has('Write the regression report')), 'task removed', 15000)
    check('task deleted with confirmation', true)

    // ---------- Clean up the project ----------
    await b.goto(`${ROOT}/projects/allProjects/`)
    await b.waitFor(has('Regression Check Project'), 'list again')
    await openRowMenu('Regression Check Project'); await b.waitFor(has('Delete'), 'menu2')
    await b.clickText('li', 'Delete'); await b.waitFor(has('Delete project?'), 'confirm2'); await b.clickText('button', 'Delete')
    await b.waitFor(no(has('Regression Check Project')), 'project removed', 15000)
    check('project deleted with confirmation', true)

    // ---------- Tasks list toolbar ----------
    await b.goto(`${ROOT}/tasks/allTasks/`)
    await b.waitFor(has('DEMO-'), 'tasks list')
    await search('demo task 1')
    await b.waitFor(has('Demo task 1'), 'task search')
    await clickMain('Filters')
    await b.waitFor(`!!document.querySelector('.filterCustBtn.active')`, 'task filters')
    check('All Tasks has the same search, Filters and Custom toolbar', (await b.text()).includes('Custom') && (await b.text()).includes('Project'))
    await b.shot(`${D}/regression_tasks_filters.png`)
  } catch (e) {
    console.log('FAILED:', e.message)
    try { await b.shot(`${D}/regression_failure.png`); console.log((await b.text()).slice(0, 700)) } catch (x) {}
    process.exitCode = 1
  } finally {
    console.log(results.every(Boolean) && !process.exitCode ? `\nALL ${results.length} CHECKS PASSED` : `\n${results.filter(r => !r).length} FAILED or stopped early`)
    await b.close()
  }
})()
