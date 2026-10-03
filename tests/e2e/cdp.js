// Tiny Chrome DevTools driver: open a URL, run steps (wait / click / type / screenshot / eval).
const { spawn } = require('child_process')
const fs = require('fs')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function launch(profile, width = 1500, height = 1000) {
  const proc = spawn(CHROME, [`--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${width},${height}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
  let targets
  for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.find(t => t.type === 'page')) break } catch (e) {}
    await sleep(250)
  }
  const page = targets.find(t => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise(r => (ws.onopen = r))
  let id = 0
  const pending = new Map()
  // Problems seen by the page (console errors, uncaught exceptions, failed requests) - read with problems().
  const issues = []
  const onEvent = m => {
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning'))
      issues.push({ kind: `console.${m.params.type}`, text: m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 3000) })
    else if (m.method === 'Runtime.exceptionThrown') issues.push({ kind: 'exception', text: (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 3000) })
    else if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) issues.push({ kind: `http.${m.params.response.status}`, text: m.params.response.url.slice(0, 300) })
    else if (m.method === 'Network.loadingFailed' && !m.params.canceled) issues.push({ kind: 'network', text: `${m.params.errorText} ${m.params.type || ''}` })
  }
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } else if (m.method) onEvent(m) }
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })

  const evalJs = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails))
    return r.result.result.value
  }
  const waitFor = async (expr, label, ms = 30000) => {
    const start = Date.now()
    while (Date.now() - start < ms) { try { if (await evalJs(expr)) return true } catch (e) {} await sleep(250) }
    throw new Error('timeout waiting for: ' + label)
  }
  return {
    goto: async url => { await send('Page.navigate', { url }) },
    evalJs, waitFor, sleep,
    problems: () => issues.splice(0),
    text: () => evalJs('document.body.innerText'),
    shot: async file => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')) },
    setInput: (selector, value) => evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true })()`),
    clickText: (tag, text) => evalJs(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(tag)})].find(e => e.innerText && e.innerText.trim().startsWith(${JSON.stringify(text)})); if (!el) return false; el.click(); return true })()`),
    close: async () => { try { await send('Browser.close') } catch (e) {} ws.close(); proc.kill() }
  }
}
module.exports = { launch, sleep }
