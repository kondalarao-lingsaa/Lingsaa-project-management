// End-to-end check of Documents (upload checks, download, versions, task + deliverable attachments) against the
// running app (http://127.0.0.1:3000) and API (:8000). Needs Google Chrome.
// Run from frontend/:  node tests/e2e/documents.js   (creates and then deletes its own test data)
const fs = require('fs')
const path = require('path')
const { launch } = require('./cdp')

const ROOT = `${process.env.PMS_APP || 'http://127.0.0.1:3000'}/appModules/projects`
const API = 'http://127.0.0.1:8000/api'
const TOKEN = fs.readFileSync(path.join(__dirname, '../../.env.local'), 'utf8').match(/NEXT_PUBLIC_PMS_DEV_TOKEN=(.*)/)[1].trim()
const SHOTS = require('os').tmpdir()
const NAME = 'Documents E2e Check'

const api = async (method, url, body) => {
  const r = await fetch(API + url, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })

  return r.json()
}

;(async () => {
  const results = []
  const check = (name, ok, extra = '') => {
    results.push(ok)
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  [${extra}]`))
  }

  for (const p of (await api('GET', `/projects/list?search=${encodeURIComponent(NAME)}&page_size=20`)).detail || []) if (p.project_name === NAME) await api('DELETE', `/projects/${p.id}`)
  const project = (await api('POST', '/projects/create', { project_name: NAME, project_type: 'Internal', start_date: '2026-09-01', project_manager_name: 'Qa Manager' })).data
  const task = (await api('POST', '/tasks/create', { project_id: project.id, title: 'Design the login screen' })).data
  const milestone = (await api('POST', `/projects/${project.id}/milestones`, { name: 'Design Phase' })).data
  await api('POST', `/projects/${project.id}/milestones/${milestone.id}/deliverables`, { name: 'Wireframes' })

  const br = await launch(path.join(SHOTS, 'chrome-documents'), 1440, 1000)
  const has = t => `document.body.innerText.includes(${JSON.stringify(t)})`
  const all = (...e) => e.join(' && ')
  const clickLast = text => br.evalJs(`(() => { const el = [...document.querySelectorAll('button')].filter(e => e.innerText.trim().startsWith(${JSON.stringify(text)})).pop(); if (!el) return false; el.click(); return true })()`)
  const setSelect = (selector, value) =>
    br.evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(String(value))}); el.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  // Picks a file in the (hidden) file input the way a user would, with the given bytes.
  const chooseFile = (name, text, type = 'application/octet-stream') =>
    br.evalJs(`(() => { const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(text)}], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} })); const input = document.querySelector('#file_input'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  // Captures the browser download (the blob link the app clicks) and reads it back.
  const captureDownloads = () =>
    br.evalJs(`(() => { window.__downloads = []; const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { const name = this.download; fetch(this.href).then(r => r.text()).then(text => window.__downloads.push({ name, text })); return } return click.call(this) }; return true })()`)
  const rowMenu = (text, item) =>
    br.evalJs(`(async () => {
      const tr = [...document.querySelectorAll('tbody tr')].find(r => r.innerText.includes(${JSON.stringify(text)}))
      tr.querySelector('td:last-child svg.lucide').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise(r => setTimeout(r, 400))
      const li = [...document.querySelectorAll('[role="menuitem"]')].find(m => m.innerText.trim().startsWith(${JSON.stringify(item)}))
      if (!li) return false
      li.click()
      return true
    })()`)
  const PDF = '%PDF-1.4\\n1 0 obj<<>>endobj\\ntrailer<<>>\\n%%EOF'

  try {
    // ---------- Upload from the Files tab ----------
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}&tab=files`)
    await br.waitFor(has('No files yet'), 'files tab')
    await br.sleep(700)
    await clickLast('Upload File')
    await br.waitFor(has('Drop a file here'), 'upload drawer')
    await br.sleep(800)
    await clickLast('Upload')
    await br.waitFor(all(has('Please Choose a File'), has('Please Select Category')), 'required')
    check('Upload with nothing chosen: "Please Choose a File" and "Please Select Category"', true)
    await chooseFile('setup.exe', 'MZ fake')
    await br.waitFor(has("'.exe' files are not allowed"), 'exe refused')
    check("choosing a .exe is refused in the form", true)
    await chooseFile('report.pdf', 'this is not a pdf')
    await setSelect('#category', 'Report')
    await clickLast('Upload')
    await br.waitFor(has('does not match'), 'fake pdf')
    check("a text file renamed to .pdf is refused by the server (content check)", true)
    await br.evalJs(`(() => { const el = document.querySelector('#title'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
    await chooseFile('signed_contract.pdf', PDF.replace(/\\\\n/g, '\n'), 'application/pdf')
    await br.waitFor(`document.querySelector('#title').value === 'Signed contract'`, 'title from name')
    check('title filled from the file name ("Signed contract")', true)
    await setSelect('#category', 'Contract')
    await clickLast('Upload')
    await br.waitFor(all(has('Signed contract'), `!document.body.innerText.includes('Drop a file here')`), 'uploaded', 20000)
    await br.sleep(700)
    check('PDF uploaded and listed (category Contract)', (await br.evalJs(`[...document.querySelectorAll('tbody tr')][0].innerText`)).includes('Contract'))

    await captureDownloads()
    await br.evalJs(`document.querySelector('[aria-label="Download Signed contract"]').click(); true`)
    await br.waitFor(`window.__downloads.length === 1`, 'download')
    const dl = await br.evalJs(`JSON.stringify(window.__downloads[0])`)
    check('download saves "signed_contract.pdf" with the uploaded content', dl.includes('signed_contract.pdf') && dl.includes('%PDF-1.4'), dl.slice(0, 120))

    // ---------- New version + history ----------
    await rowMenu('Signed contract', 'Upload New Version')
    await br.waitFor(has("New Version of 'Signed contract'"), 'version drawer')
    await br.sleep(700)
    await chooseFile('signed_contract_v2.pdf', PDF.replace(/\\\\n/g, '\n') + ' v2', 'application/pdf')
    await clickLast('Upload Version')
    await br.waitFor(`[...document.querySelectorAll('tbody tr')].some(r => r.innerText.includes('v2'))`, 'v2 listed', 20000)
    check('new version listed as v2 (still one row)', (await br.evalJs(`document.querySelectorAll('tbody tr').length`)) === 1)
    await rowMenu('Signed contract', 'Version History')
    await br.waitFor(all(has('Version History'), has('Version 2'), has('Version 1')), 'history')
    check('version history shows Version 2 (Latest) and Version 1', true)
    await clickLast('Close')
    await br.sleep(400)

    // ---------- Task attachment ----------
    await br.goto(`${ROOT}/tasks/taskDetails/?id=${task.id}`)
    await br.waitFor(all(has('Attachments'), has('No files attached')), 'task details')
    await br.sleep(700)
    await clickLast('Attach File')
    await br.waitFor(has('Drop a file here'), 'attach drawer')
    await br.sleep(800)
    check('attaching from a task pre-selects that task', (await br.evalJs(`document.querySelector('#task_id').value`)) === String(task.id))
    await chooseFile('login-notes.txt', 'Login screen notes: two factor later.', 'text/plain')
    await setSelect('#category', 'Technical')
    await clickLast('Upload')
    await br.waitFor(all(has('Login notes'), `!document.body.innerText.includes('Drop a file here')`), 'attached', 20000)
    check('file attached to the task and shown in Attachments', true)

    // ---------- Deliverable attachment ----------
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}&tab=milestones`)
    await br.waitFor(`!!document.querySelector('[aria-label="Attach file to Wireframes"]')`, 'milestones tab')
    await br.sleep(600)
    await br.evalJs(`document.querySelector('[aria-label="Attach file to Wireframes"]').click(); true`)
    await br.waitFor(has('Drop a file here'), 'deliverable drawer')
    await br.sleep(900)
    check('deliverable paperclip pre-fills milestone, deliverable and category Deliverable', (await br.evalJs(`[document.querySelector('#deliverable_id').value, document.querySelector('#category').value].join('|')`)).endsWith('|Deliverable'))
    await chooseFile('wireframes.csv', 'screen,status\nlogin,done', 'text/csv')
    await clickLast('Upload')
    await br.waitFor(`!document.body.innerText.includes('Drop a file here')`, 'deliverable uploaded', 20000)

    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}&tab=files`)
    await br.waitFor(all(has('Wireframes'), has('Login notes'), has('Signed contract')), 'files tab all')
    const text = await br.text()
    check('Files tab shows all 3, with "Attached To" task and deliverable', text.includes('Deliverable: Wireframes') && text.includes(task.task_key))
    await br.shot(`${SHOTS}/pms_documents.png`)

    // ---------- Portfolio + delete version ----------
    await br.goto(`${ROOT}/documents/`)
    await br.waitFor(has(project.project_code), 'documents page')
    check('Documents screen lists the files with their project', true)
    await br.goto(`${ROOT}/projects/projectDetails/?id=${project.id}&tab=files`)
    await br.waitFor(has('Signed contract'), 'files again')
    await rowMenu('Signed contract', 'Delete')
    await br.waitFor(has('becomes the latest again'), 'delete confirm')
    await br.evalJs(`[...document.querySelectorAll('[role="dialog"] button')].find(b => b.innerText.trim() === 'Delete').click()`)
    await br.waitFor(`![...document.querySelectorAll('tbody tr')].some(r => r.innerText.includes('Signed contract') && r.innerText.includes('v2'))`, 'v2 removed', 20000)
    check('deleting v2 brings version 1 back as the latest', (await br.text()).includes('Signed contract'))
  } catch (e) {
    console.log('FAILED:', e.message)
    try {
      await br.shot(`${SHOTS}/pms_documents_failure.png`)
    } catch (x) {}
    process.exitCode = 1
  } finally {
    await br.close()
    for (const t of (await api('GET', `/tasks/list?project_id=${project.id}&page_size=50`)).detail || []) await api('DELETE', `/tasks/${t.id}`)
    await api('DELETE', `/projects/${project.id}`)
    console.log(results.every(Boolean) && !process.exitCode ? `\nALL ${results.length} CHECKS PASSED` : `\n${results.filter(x => !x).length} FAILED or stopped early`)
  }
})()
