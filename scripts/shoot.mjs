/**
 * Screenshot the running dev server at a real device width, and report any
 * horizontal overflow.
 *
 *   node scripts/shoot.mjs <url> <out.png> [width] [height] [scale]
 *   npm run shoot -- http://localhost:5173/ shots/phone.png 390
 *
 * Chrome's --window-size is clamped to ~489 CSS px on Windows, which is no use
 * for testing a mobile-first layout (spec section 3: sellers use phones). So
 * this drives Chrome over the DevTools Protocol and uses
 * Emulation.setDeviceMetricsOverride, which honours any width.
 *
 * Node's built-in WebSocket and fetch are used, so there is no dependency to
 * install and nothing is added to the production bundle.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]

const [, , url = 'http://localhost:5173/', out = 'shot.png', widthArg = '390', heightArg = '900', scaleArg = '2', offsetArg = '0', clipArg = ''] =
  process.argv

const width = Number(widthArg)
const height = Number(heightArg)
const scale = Number(scaleArg)

const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!chromePath) {
  console.error('No Chrome or Edge found. Looked in:\n  ' + CHROME_CANDIDATES.join('\n  '))
  process.exit(1)
}

const port = 9000 + Math.floor(Math.random() * 900)
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    `--remote-debugging-port=${port}`,
    '--user-data-dir=' + resolve(process.env.TEMP || '/tmp', `shoot-${port}`),
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'ignore'] },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function browserEndpoint() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      const json = await res.json()
      if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl
    } catch {
      /* not up yet */
    }
    await sleep(150)
  }
  throw new Error(`Chrome did not open a DevTools port on ${port}`)
}

/** Minimal CDP client over the browser-level socket, using flat sessions. */
function cdp(ws) {
  let nextId = 1
  const pending = new Map()
  const listeners = []
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve: res, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(msg.error.message)) : res(msg.result)
      return
    }
    for (const fn of listeners) fn(msg)
  })
  return {
    send(method, params = {}, sessionId) {
      const id = nextId++
      const payload = { id, method, params }
      if (sessionId) payload.sessionId = sessionId
      ws.send(JSON.stringify(payload))
      return new Promise((res, reject) => pending.set(id, { resolve: res, reject }))
    },
    once(method, sessionId) {
      return new Promise((res) => {
        const fn = (msg) => {
          if (msg.method === method && (!sessionId || msg.sessionId === sessionId)) {
            listeners.splice(listeners.indexOf(fn), 1)
            res(msg.params)
          }
        }
        listeners.push(fn)
      })
    },
  }
}

try {
  const endpoint = await browserEndpoint()
  const ws = new WebSocket(endpoint)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  const client = cdp(ws)

  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true })

  await client.send('Page.enable', {}, sessionId)
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: scale,
    mobile: width < 768,
    screenWidth: width,
    screenHeight: height,
  }, sessionId)

  const loaded = client.once('Page.loadEventFired', sessionId)
  await client.send('Page.navigate', { url }, sessionId)
  await loaded
  // Web fonts and the first paint of the React tree.
  await sleep(1200)

  // An optional snippet to run before measuring — clicking a tab, dragging a
  // slider, opening a panel. Set SHOOT_EVAL to any JS expression.
  if (process.env.SHOOT_EVAL) {
    const pre = await client.send(
      'Runtime.evaluate',
      { expression: process.env.SHOOT_EVAL, returnByValue: true, awaitPromise: true },
      sessionId,
    )
    if (pre.exceptionDetails) {
      throw new Error('SHOOT_EVAL failed: ' + JSON.stringify(pre.exceptionDetails.text))
    }
    if (pre.result?.value !== undefined) console.log('  eval ->', pre.result.value)
    await sleep(600)
  }

  // Full page height, and whether anything overflows sideways.
  const { result } = await client.send(
    'Runtime.evaluate',
    {
      expression: `(() => {
        const d = document.documentElement;
        const vw = d.clientWidth;
        const offenders = [];
        for (const el of document.querySelectorAll('#root *')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (getComputedStyle(el).position === 'fixed') continue;
          if (r.right > vw + 1 || r.left < -1) {
            offenders.push(el.tagName.toLowerCase() + '.' + String(el.className).replace(/\\s+/g,'.').slice(0,60)
              + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + ']');
          }
        }
        return JSON.stringify({
          vw,
          scrollWidth: d.scrollWidth,
          height: Math.max(d.scrollHeight, document.body.scrollHeight),
          overflows: d.scrollWidth > vw,
          offenders: offenders.slice(0, 8),
        });
      })()`,
      returnByValue: true,
    },
    sessionId,
  )
  const info = JSON.parse(result.value)

  const shot = await client.send(
    'Page.captureScreenshot',
    {
      format: 'png',
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: Number(offsetArg) || 0,
        width: info.vw,
        // A band of the page, when asked for, so tall screens stay legible.
        height: clipArg ? Number(clipArg) : info.height,
        scale: 1,
      },
    },
    sessionId,
  )

  const outPath = resolve(out)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, Buffer.from(shot.data, 'base64'))

  console.log(`${url}  @ ${info.vw}×${info.height} CSS px (dsf ${scale})`)
  console.log(`  -> ${outPath}`)
  if (info.overflows) {
    console.log(`  HORIZONTAL OVERFLOW: scrollWidth ${info.scrollWidth} > viewport ${info.vw}`)
    for (const o of info.offenders) console.log(`     ${o}`)
  } else {
    console.log(`  no horizontal overflow (scrollWidth ${info.scrollWidth} = viewport ${info.vw})`)
  }
} finally {
  chrome.kill()
}
