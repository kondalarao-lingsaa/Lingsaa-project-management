// End-to-end check of the staging account switcher (avatar menu): from an own login to the demo company, sign in
// with the Manager token, a bad token is refused, and back to the own login - without the browser console.
// Uses a made-up company (777777) as "own login", so no real account is touched. Run from frontend/:
//   node tests/e2e/account_switch.js
const path = require('path')
const { execFileSync } = require('child_process')
const { launch } = require('./cdp')

const ROOT = `${process.env.PMS_APP || 'http://127.0.0.1:3000'}/appModules/projects`
const BACKEND = path.join(__dirname, '../../../backend/pms_api')
const mint = (clientId, userId, username) =>
  execFileSync(
    path.join(BACKEND, 'venv/Scripts/python.exe'),
    ['-c', `import time; from jose import jwt; from app.core.config import settings as s; print(jwt.encode({'client_id': ${clientId}, 'user_id': ${userId}, 'username': '${username}', 'role': 'admin', 'exp': int(time.time()) + 3600}, s.JWT_SECRET, algorithm=s.JWT_ALGORITHM))`],
    { cwd: BACKEND }
  )
    .toString()
    .trim()
const OWN = mint(777777, 99, 'own.user')
const MANAGER = mint(900001, 2, 'qa.manager')

;(async () => {
  const results = []
  const check = (name, ok, extra = '') => {
    results.push(ok)
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : `  [${extra}]`))
  }
  const br = await launch(path.join(require('os').tmpdir(), 'chrome-switch'), 1440, 900)
  const ls = k => br.evalJs(`localStorage.getItem(${JSON.stringify(k)})`)
  const openMenu = async () => {
    await br.waitFor(`!!document.querySelector('[data-account]')`, 'avatar')
    for (let i = 0; i < 10 && !(await br.evalJs(`!!document.querySelector('[data-switch="token"]')`)); i++) {
      await br.evalJs(`document.querySelector('[data-account]').click()`)
      await br.sleep(500)
    }
  }
  try {
    await br.goto(`${ROOT}/dashboard/`)
    await br.sleep(1500)
    await br.evalJs(`localStorage.removeItem('pms_saved_login'); localStorage.setItem('access_token', ${JSON.stringify(OWN)}); localStorage.setItem('username', 'own.user'); localStorage.setItem('user_id', '99'); localStorage.setItem('client_id', '777777'); true`)
    await br.goto(`${ROOT}/dashboard/`)
    await openMenu()
    check('avatar menu shows the signed-in user and "Use demo company"', await br.evalJs(`!!document.querySelector('[data-switch="demo"]') && document.body.innerText.includes('own.user')`))

    await br.evalJs(`document.querySelector('[data-switch="demo"]').click()`)
    await br.waitFor(`!localStorage.getItem('access_token')`, 'demo')
    await br.sleep(2500)
    check('"Use demo company" switches to the demo login and keeps the own login aside', !(await ls('access_token')) && JSON.parse((await ls('pms_saved_login')) || '{}').username === 'own.user')

    await openMenu()
    await br.evalJs(`document.querySelector('[data-switch="token"]').click()`)
    await br.waitFor(`!!document.querySelector('#login_token')`, 'token dialog')
    await br.setInput('#login_token', 'not-a-token')
    await br.evalJs(`[...document.querySelectorAll('.MuiDialog-root button')].find(b => b.innerText.trim() === 'Sign in').click()`)
    await br.waitFor(`document.body.innerText.includes('This is not a login token')`, 'bad token')
    check('a wrong token is refused with a clear message', true)
    await br.setInput('#login_token', MANAGER)
    await br.evalJs(`[...document.querySelectorAll('.MuiDialog-root button')].find(b => b.innerText.trim() === 'Sign in').click()`)
    await br.waitFor(`localStorage.getItem('username') === 'qa.manager'`, 'manager')
    await br.sleep(2500)
    check('signing in with the Manager token makes you qa.manager (user 2, demo company)', (await ls('user_id')) === '2' && (await ls('client_id')) === '900001')
    check('the saved own login was not replaced by the Manager', JSON.parse((await ls('pms_saved_login')) || '{}').username === 'own.user')

    await openMenu()
    await br.waitFor(`!!document.querySelector('[data-switch="mine"]')`, 'back option')
    await br.evalJs(`document.querySelector('[data-switch="mine"]').click()`)
    await br.waitFor(`localStorage.getItem('username') === 'own.user'`, 'back')
    check('"Back to my login" restores the own login', (await ls('client_id')) === '777777')
  } catch (e) {
    console.log('FAILED:', e.message)
    process.exitCode = 1
  } finally {
    try {
      await br.evalJs(`['access_token','username','user_id','client_id','pms_saved_login'].forEach(k => localStorage.removeItem(k)); true`)
    } catch (x) {}
    await br.close()
    console.log(results.every(Boolean) && !process.exitCode ? `\nALL ${results.length} CHECKS PASSED` : `\n${results.filter(x => !x).length} FAILED or stopped early`)
  }
})()
