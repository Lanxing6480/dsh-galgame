/**
 * dsh-galgame 冒烟测试（零依赖，`pnpm test` 直接跑）：
 *  1. 在伪 `window.__ModuleLoader__` 环境里求值 `lib/client.js`，取出插件 factory
 *     ——同时验证产物仍是 0.2.0-rc.2 的「惰性 CJS factory」移交格式；
 *  2. 用伪 cordis ctx 跑 `apply()`，检查注册面（locale / conversation.view /
 *     composer 链接管）与 `inject` 业务面（sendTurn/sendSteer 的 prompt 模式）；
 *  3. 用 `react-dom/server` 渲染无状态形态（空态 / 加载态 / 提问卡 / 审批卡）。
 *
 * 覆盖不到的部分（打字机、翻页、点击作答等需要真实 DOM 与 effect）见
 * `test/dom.test.mjs`。
 *
 * 运行：node test/smoke.test.mjs
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageRequire = createRequire(join(packageDir, 'package.json'))
const React = packageRequire('react')
const { renderToStaticMarkup } = packageRequire('react-dom/server')
const { createElement: h } = React

const checks = []
function check(name, fn) {
  checks.push({ kind: 'check', name, fn })
}
function section(title) {
  checks.push({ kind: 'section', title })
}

// ---------------------------------------------------------------- bundle load
const source = readFileSync(join(packageDir, 'lib', 'client.js'), 'utf8')
let captured
new Function('window', source)({
  __ModuleLoader__: {
    load(mod) {
      assert.equal(captured, undefined, '一个 bundle 只能注册一个 factory')
      captured = mod
    },
  },
})
assert.ok(captured !== undefined, 'bundle 未注册任何 factory')
assert.equal(captured.id, '@lanxing/dsh-galgame')

const primitivesStub = { MarkdownText: (props) => h('span', { 'data-md': '1' }, props.text) }
const client = captured.factory((specifier) => (
  specifier === '@deepseek-ai/dsh-client-ui-primitives' ? primitivesStub : packageRequire(specifier)
))

console.log('dsh-galgame 冒烟测试')
section('bundle')
check('导出 apply + inject（locale/slots/sessions）', () => {
  assert.equal(typeof client.apply, 'function')
  assert.deepEqual([...client.inject], ['locale', 'slots', 'sessions'])
})

// ---------------------------------------------------------------- fake cordis
const dictionary = {}
const registrations = []
const prompted = []
const ctx = {
  effect(fn, label) {
    assert.equal(typeof label, 'string')
    return fn()
  },
  locale: {
    register(namespace, dict) { dictionary[namespace] = dict; return () => {} },
    bind(namespace) {
      return (key, params) => {
        const entry = dictionary[namespace]
        const text = entry?.zh[key] ?? entry?.en[key] ?? key
        return params === undefined
          ? text
          : Object.entries(params).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), text)
      }
    },
  },
  slots: {
    register(options, Component) {
      const record = { options, Component, disposed: false }
      registrations.push(record)
      return () => { record.disposed = true }
    },
    inject(name, callback) {
      assert.equal(name, 'conversation.view')
      return callback()
    },
  },
  sessions: {
    binding(sessionId) {
      return {
        session: {
          async prompt(content, mode) {
            prompted.push({ sessionId, content, mode })
            return { ok: true, value: { accepted: true } }
          },
        },
      }
    },
  },
}
client.apply(ctx)

section('注册面')
check('字典注册（zh + en 双语）', () => {
  assert.ok(dictionary.galgame?.zh?.['view.galgame'])
  assert.ok(dictionary.galgame?.en?.['view.galgame'])
})

check('conversation.view 条目：id=galgame / order=20 / locale 标签', () => {
  assert.equal(registrations.length, 1)
  const { options } = registrations[0]
  assert.equal(options.name, 'conversation.view')
  assert.equal(options.id, 'galgame')
  assert.equal(options.order, 20)
  assert.equal(options.locale, 'galgame')
  assert.equal(options.label(), 'galgame 模式')
  assert.equal(typeof options.inject, 'function')
})

const view = registrations[0]
const injected = view.options.inject('session-1')

section('inject 业务面')
check('sendTurn → session.prompt(queue)', async () => {
  const ok = await injected.sendTurn('你好')
  assert.equal(ok, true)
  assert.deepEqual(prompted.at(-1), {
    sessionId: 'session-1',
    content: [{ type: 'text', text: '你好' }],
    mode: 'queue',
  })
})

check('sendSteer → session.prompt(steer)', async () => {
  const ok = await injected.sendSteer('插一句')
  assert.equal(ok, true)
  assert.equal(prompted.at(-1).mode, 'steer')
})

check('setGalgameMode 接管 / 释放 conversation.composer 链', () => {
  injected.setGalgameMode(true)
  const blocker = registrations.find((item) => item.options.name === 'conversation.composer')
  assert.ok(blocker, '未注册 composer 接管条目')
  assert.equal(blocker.options.priority, -100)
  assert.deepEqual(blocker.options.select({}), {})
  assert.equal(blocker.Component({}), null)
  injected.setGalgameMode(false)
  assert.equal(blocker.disposed, true)
})

// ------------------------------------------------------------- stateless render
const t = (key, params) => {
  const text = dictionary.galgame.zh[key] ?? key
  return params === undefined ? text : text.replaceAll(/\{(\w+)\}/g, (_, k) => String(params[k]))
}
const nodes = [
  { kind: 'user', seq: 1, time: 1, content: [{ type: 'text', text: '你好呀，鲸鱼娘' }] },
  { kind: 'assistant', seq: 2, time: 2, turn: 1, step: 1, blocks: [{ kind: 'text', text: '深海的回答。' }] },
]
function render({ nodeList = [], partial = null, running = false, openState = 'open', pending = undefined } = {}) {
  return renderToStaticMarkup(h(view.Component, {
    sessionId: 'session-1',
    useChat: (selector) => selector({ legacy: { nodes: nodeList, partial } }),
    useSession: (selector) => selector({
      sessionId: 'session-1',
      running,
      openState,
      openError: null,
      blank: nodeList.length === 0,
      hasMore: false,
      loadingOlder: false,
    }),
    useSessionStatus: (selector) => selector(new Map([
      ['session-1', { running, pendingInteraction: pending }],
    ])),
    sendTurn: async () => true,
    sendSteer: async () => true,
    setGalgameMode: () => {},
    t,
  }))
}

section('无状态渲染')
check('加载态文案', () => {
  assert.match(render({ openState: 'loading' }), /正在潜入深海/)
})

check('空态：欢迎文案 + 输入条占位', () => {
  const html = render()
  assert.match(html, /欢迎来到 GalGame 模式/)
  assert.match(html, /对鲸鱼娘说/)
})

check('提问卡：题目 / 选项 / 说明 / 放弃', () => {
  const html = render({
    nodeList: nodes,
    pending: {
      kind: 'question',
      key: 'q1',
      sessionId: 'session-1',
      questions: [{
        id: 'q1',
        question: '要选哪一个？',
        header: '确认',
        detail: '细节说明',
        options: [{ label: '选项A' }, { label: '选项B', description: 'B 的说明' }],
      }],
      answer: async () => {},
      dismiss: async () => {},
    },
  })
  assert.match(html, /要选哪一个？/)
  assert.match(html, /选项A/)
  assert.match(html, /B 的说明/)
  assert.match(html, /放弃/)
})

check('plan-review 形态复用同一张提问卡', () => {
  const html = render({
    nodeList: nodes,
    pending: {
      kind: 'plan-review',
      key: 'p1',
      sessionId: 'session-1',
      questions: [{ id: 'p1', question: '这份计划可以吗？', options: [{ label: '同意' }] }],
      answer: async () => {},
      dismiss: async () => {},
    },
  })
  assert.match(html, /这份计划可以吗？/)
})

check('审批卡：原因 / 工具名回退 / 两个决策按钮', () => {
  const withReason = render({
    nodeList: nodes,
    pending: { kind: 'approval', key: 'a1', sessionId: 'session-1', toolName: 'pwsh', reason: '想执行一条命令', answerable: true, answer: async () => {} },
  })
  assert.match(withReason, /想执行一条命令/)
  assert.match(withReason, /允许一次/)
  assert.match(withReason, /拒绝/)
  const withoutReason = render({
    nodeList: nodes,
    pending: { kind: 'approval', key: 'a2', sessionId: 'session-1', toolName: 'pwsh', answerable: true, answer: async () => {} },
  })
  assert.match(withoutReason, /pwsh/)
})

check('未知 pending 形态不渲染任何卡片', () => {
  const html = render({ nodeList: nodes, pending: { kind: 'mystery', key: 'm1', sessionId: 'session-1' } })
  assert.doesNotMatch(html, /要选哪一个？/)
  assert.doesNotMatch(html, /允许一次/)
})

check('props 缺失时钩子替身不抛错', () => {
  const html = renderToStaticMarkup(h(view.Component, {
    sessionId: 'session-1',
    sendTurn: async () => true,
    sendSteer: async () => true,
    setGalgameMode: () => {},
    t,
  }))
  assert.match(html, /欢迎来到 GalGame 模式/)
})

let passed = 0
for (const item of checks) {
  if (item.kind === 'section') {
    console.log(`\n${item.title}`)
    continue
  }
  const { name, fn } = item
  await fn()
  passed += 1
  console.log(`  ok  ${name}`)
}
console.log(`\n全部通过：${passed} 项`)
