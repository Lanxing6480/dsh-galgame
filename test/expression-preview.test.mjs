import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../', import.meta.url))
let jsdom
try { jsdom = require('jsdom') } catch {
  // Existing pnpm install can have incomplete flattened links on this host.
  const store = join(root, 'node_modules', '.pnpm')
  const entries = existsSync(store) ? readdirSync(store).filter(s => s.startsWith('jsdom@')) : []
  for (const name of entries) {
    try { jsdom = require(join(store, name, 'node_modules', 'jsdom')); break } catch { /* try next installed version */ }
  }
}
if (!jsdom) throw new Error('jsdom is required; restore the package devDependencies before running this test')
const { JSDOM, VirtualConsole } = jsdom
const url = new URL('../docs/expression-preview/index.html', import.meta.url)
const html = readFileSync(url, 'utf8')

function page() {
  const errors = [], timers = new Map()
  let id = 0
  const console = new VirtualConsole()
  console.on('jsdomError', e => errors.push(e.message))
  const dom = new JSDOM(html, {
    url: url.href, runScripts: 'dangerously', virtualConsole: console,
    // No resources option: this is an in-memory DOM test; no browser/network.
    beforeParse(window) {
      window.setTimeout = fn => { const key = ++id; timers.set(key, fn); return key }
      window.clearTimeout = key => timers.delete(key)
    },
  })
  const $ = id => dom.window.document.getElementById(id)
  const click = id => $(id).click()
  const step = () => { const next = timers.entries().next().value; if (!next) return false; timers.delete(next[0]); next[1](); return true }
  assert.deepEqual(errors, [])
  return { dom, $, click, step, timers, errors }
}

test('preview actually renders the sample and manual paging reconstructs the trace', () => {
  const p = page()
  assert.equal(p.$('unit-count').textContent, '1 / 10')
  assert.equal(p.$('decision').textContent, '惊讶')
  assert.match(p.$('dialogue').textContent, /呜哇/)
  for (let i = 0; i < 9; i++) p.click('next')
  assert.equal(p.$('decision').textContent, '平静')
  assert.equal(p.$('switch-count').textContent, '4')
  assert.match(p.$('history').textContent, /59 项全绿/)
  assert.equal(p.$('next').disabled, true)
  p.click('prev')
  assert.equal(p.$('unit-count').textContent, '9 / 10')
  assert.equal(p.$('switch-count').textContent, '4')
  assert.deepEqual(p.errors, [])
  p.dom.window.close()
})
test('stream playback, pause and finish use the same four changes as manual paging', () => {
  const p = page()
  p.click('restart')
  assert.equal(p.$('switch-count').textContent, '0')
  p.step()
  assert.equal(p.$('decision').textContent, '惊讶')
  assert.match(p.$('position').textContent, /^5 \/ /)
  p.click('play')
  assert.equal(p.timers.size, 0)
  p.click('play')
  let ticks = 0
  while (p.step()) { if (++ticks > 4000) throw new Error('playback failed to terminate') }
  assert.equal(p.$('unit-count').textContent, '10 / 10')
  assert.equal(p.$('switch-count').textContent, '4')
  assert.equal(p.$('play').textContent, '播放')
  assert.deepEqual(p.errors, [])
  p.dom.window.close()
})
test('custom replies use actual rules; quoted negative words stay quiet and gaze triggers shy', () => {
  const p = page()
  p.$('source').value = '日志显示迁移失败、14 个修不了。\n\n她说：“我有点生气！”\n\n（移开视线）那个……不是我吃的。'
  p.click('apply')
  let ticks = 0
  while (p.step()) { if (++ticks > 400) throw new Error('custom replay failed to terminate') }
  assert.equal(p.$('decision').textContent, '目移／害羞')
  assert.equal(p.$('switch-count').textContent, '1')
  p.click('original')
  assert.equal(p.$('unit-count').textContent, '1 / 10')
  assert.equal(p.$('switch-count').textContent, '1')
  assert.deepEqual(p.errors, [])
  p.dom.window.close()
})
test('pasted markup remains inert text and whitespace-only input is rejected', () => {
  const p = page()
  p.$('source').value = '<img src=x onerror="window.pwned=1">\n\n<script>window.pwned=1</script>'
  p.click('apply')
  p.click('next')
  assert.equal(p.dom.window.pwned, undefined)
  assert.equal(p.$('dialogue').querySelectorAll('img,script').length, 0)
  p.$('source').value = '   '
  p.click('apply')
  assert.match(p.$('status').textContent, /先输入/)
  assert.deepEqual(p.errors, [])
  p.dom.window.close()
})
