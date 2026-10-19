/**
 * dsh-galgame 交互测试（jsdom + React 18 act）：
 * 在真实 DOM 里挂载 conversation.view 的 GalgameView，验证
 *  - 台词/流式/打字机的数据链路（useChat.legacy → adapter → 对话框）；
 *  - 提问卡作答（wait.answer(批次)）、放弃（wait.dismiss()）；
 *  - 审批卡决策（allowed-once / rejected）；
 *  - 输入条发送（running → steer，空闲 → queue）。
 *
 * 运行：pnpm test:dom
 * 依赖：jsdom（devDependencies）。若本机 pnpm 的链接布局让 jsdom 的传递依赖
 *       解析不到，可用 DSH_JSDOM_PATH 指向任一扁平安装的 jsdom 目录：
 *       DSH_JSDOM_PATH=/path/to/node_modules pnpm test:dom
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const pluginRequire = createRequire(join(packageDir, 'package.json'))
const pluginDir = packageDir

/** 解析 jsdom：优先包内依赖，其次 DSH_JSDOM_PATH 指向的 node_modules。 */
function loadJsdom() {
  const fromRequire = (req) => {
    try {
      return req('jsdom')
    } catch {
      return undefined
    }
  }
  const direct = fromRequire(pluginRequire)
  if (direct !== undefined) return direct
  const override = process.env.DSH_JSDOM_PATH ?? join(packageDir, 'node_modules/.pnpm/jsdom@25.0.1/node_modules')
  if (override !== undefined && override.trim() !== '') {
    const viaOverride = fromRequire(createRequire(join(override, 'noop.js')))
    if (viaOverride !== undefined) return viaOverride
  }
  return undefined
}

const jsdomModule = loadJsdom()
if (jsdomModule === undefined) {
  console.log('跳过：未能解析 jsdom（先 pnpm install，或设置 DSH_JSDOM_PATH 指向带 jsdom 的 node_modules）')
  process.exit(0)
}
const { JSDOM } = jsdomModule

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.localStorage = dom.window.localStorage
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Element = dom.window.Element
globalThis.Node = dom.window.Node
globalThis.MouseEvent = dom.window.MouseEvent
globalThis.KeyboardEvent = dom.window.KeyboardEvent
globalThis.Event = dom.window.Event
globalThis.getComputedStyle = dom.window.getComputedStyle
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.IS_REACT_ACT_ENVIRONMENT = true
// jsdom does not load image bytes: emulate successful preloads for Stage's
// cancellation/crossfade plumbing. Actual files are checked separately.
globalThis.Image = class {
  onload = null
  onerror = null
  _src = ''
  set src(value) { this._src = value; queueMicrotask(() => this.onload?.()) }
  get src() { return this._src }
}

const React = pluginRequire('react')
const { createRoot } = pluginRequire('react-dom/client')
const { createElement: h } = React
const act = React.act

const checks = []
function check(name, fn) {
  checks.push({ name, fn })
}

/** 让真实定时器（打字机/自动翻页）跑一会儿。 */
async function settle(ms = 320) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

// ---------------------------------------------------------------- bundle load
const source = readFileSync(join(pluginDir, 'lib', 'client.js'), 'utf8')
let captured
new Function('window', source)({
  __ModuleLoader__: {
    load(mod) {
      captured = mod
    },
  },
})
/**
 * 复刻真实 `MarkdownText` 对 labels 的硬依赖：代码块工具栏与脚注区都直接读
 * `labels.code.*` / `labels.footnotes`，没有可选链（空代码块会提前 return，
 * 所以只有非空代码块命中）。这里照同样规则校验 —— 漏传就会像线上一样抛错。
 *
 * 「历史」面板白屏正是从这条路径漏出去的：面板一次性渲染全部回复，几乎必然
 * 撞到代码块。此前的 stub 只读 props.text，从不碰 labels，所以测试全绿。
 *
 * `[[boom]]` 是测试专用钩子：强制渲染失败，用于验证 LayerBoundary 兜底。
 */
const primitivesStub = {
  MarkdownText: (props) => {
    const text = typeof props.text === 'string' ? props.text : ''
    if (text.includes('[[boom]]')) throw new Error('intentional render failure')
    const fence = /```[^\n]*\n([\s\S]*?)```/.exec(text)
    if (fence !== null && fence[1].trim() !== '' && props.labels?.code?.copyLabel === undefined) {
      throw new TypeError("Cannot read properties of undefined (reading 'code')")
    }
    if (/^\[\^[^\]]+\]:/m.test(text) && props.labels?.footnotes === undefined) {
      throw new TypeError("Cannot read properties of undefined (reading 'footnotes')")
    }
    return h('span', { 'data-md': '1' }, props.text)
  },
}
const client = captured.factory((specifier) => (
  specifier === '@deepseek-ai/dsh-client-ui-primitives' ? primitivesStub : pluginRequire(specifier)
))

const dictionary = {}
const registrations = []
const ctx = {
  effect(fn) { return fn() },
  locale: {
    register(namespace, dict) { dictionary[namespace] = dict; return () => {} },
    bind(namespace) {
      return (key, params) => {
        const text = dictionary[namespace].zh[key] ?? key
        return params === undefined
          ? text
          : text.replaceAll(/\{(\w+)\}/g, (_, k) => String(params[k]))
      }
    },
  },
  slots: {
    register(options, Component) {
      const record = { options, Component, disposed: false }
      registrations.push(record)
      return () => { record.disposed = true }
    },
    inject(_name, callback) { return callback() },
  },
  sessions: {
    binding() {
      return { session: { async prompt() { return { ok: true } } } }
    },
  },
}
client.apply(ctx)
const view = registrations.find((item) => item.options.name === 'conversation.view')
const t = (key, params) => {
  const text = dictionary.galgame.zh[key] ?? key
  return params === undefined ? text : text.replaceAll(/\{(\w+)\}/g, (_, k) => String(params[k]))
}

// ---------------------------------------------------------------- mount helper
let activeRoot = null
function mount(initial) {
  if (activeRoot) act(() => activeRoot.unmount())
  localStorage.clear()
  let state = { nodeList: [], partial: null, running: false, pending: undefined, sessionId: 'session-1', ...initial }
  if (initial.settings) localStorage.setItem('dsh.galgame.settings', JSON.stringify(initial.settings))
  const container = document.getElementById('root')
  container.innerHTML = ''
  const root = createRoot(container)
  activeRoot = root
  const useChat = (selector) => selector({ legacy: { nodes: state.nodeList, partial: state.partial } })
  const useSession = (selector) => selector({
    sessionId: state.sessionId,
    running: state.running,
    openState: 'open',
    openError: null,
    blank: state.nodeList.length === 0,
    hasMore: false,
    loadingOlder: false,
  })
  const useSessionStatus = (selector) => selector(new Map([
    [state.sessionId, { running: state.running, pendingInteraction: state.pending }],
  ]))
  const render = () => act(() => {
    root.render(h(view.Component, {
      sessionId: state.sessionId,
      useChat,
      useSession,
      useSessionStatus,
      sendTurn: state.sendTurn ?? (async () => true),
      sendSteer: state.sendSteer ?? (async () => true),
      setGalgameMode: () => {},
      t,
    }))
  })
  render()
  return { container, root, update(patch) { state = { ...state, ...patch }; render() } }
}

const textOf = (container) => container.textContent ?? ''
const buttonByText = (container, label) => [...container.querySelectorAll('button')].find((b) => textOf(b).trim() === label)
const buttonByAria = (container, label) => [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label)

function click(element) {
  assert.ok(element, 'target element not found')
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function typeInto(textarea, value) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set
    setter.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const nodes = [
  { kind: 'user', seq: 1, time: 1, content: [{ type: 'text', text: '你好呀，鲸鱼娘' }] },
  {
    kind: 'assistant',
    seq: 2,
    time: 2,
    turn: 1,
    step: 1,
    blocks: [
      { kind: 'reasoning', text: '（内心：先想一下）' },
      { kind: 'tool-call', callId: 'c1', name: 'pwsh', argsRaw: '{}' },
      { kind: 'text', text: '深海的回答。\n\n第二段。' },
    ],
  },
]

// ---------------------------------------------------------------- dialogue
check('定稿台词：最后一行分两段播放，工具调用不外露', async () => {
  const { container } = mount({ nodeList: nodes })
  await settle()
  assert.match(textOf(container), /深海的回答。/)
  assert.match(textOf(container), /1 \/ 2/)
  assert.match(textOf(container), /鲸鱼娘/)
  assert.doesNotMatch(textOf(container), /pwsh/)
  assert.doesNotMatch(textOf(container), /内心：先想一下/)
})

check('▶ 翻到下一段', async () => {
  const { container } = mount({ nodeList: nodes })
  await settle()
  click(buttonByAria(container, '下一句'))
  await settle()
  assert.match(textOf(container), /第二段。/)
  assert.match(textOf(container), /2 \/ 2/)
})

check('◀ 回退到上一段', async () => {
  const { container } = mount({ nodeList: nodes })
  await settle()
  click(buttonByAria(container, '下一句'))
  await settle()
  click(buttonByAria(container, '上一句'))
  await settle()
  assert.match(textOf(container), /深海的回答。/)
})

check('流式片段实时上屏 + 思考气泡滚动', async () => {
  const { container } = mount({
    nodeList: nodes,
    partial: { turn: 1, step: 2, blocks: [{ kind: 'reasoning', text: '正在推理' }, { kind: 'text', text: '流式片段' }] },
    running: true,
  })
  await settle(80)
  assert.match(textOf(container), /流式片段/)
  assert.match(textOf(container), /正在推理/)
})

check('只有思维链的流式片段也能撑起气泡', async () => {
  const { container } = mount({
    nodeList: nodes,
    partial: { turn: 1, step: 2, blocks: [{ kind: 'reasoning', text: '只有思考' }] },
    running: true,
  })
  await settle(80)
  assert.match(textOf(container), /只有思考/)
})

// ---------------------------------------------------------------- backlog
// 回归：历史面板曾因 MarkdownText 缺 labels 而白屏（渲染到代码块即抛 TypeError，
// 整棵视图被卸载，只能刷新页面退出历史）。
check('历史面板：含代码块的回复正常渲染，不再白屏', async () => {
  const report = '修好了，关键改动如下：\n\n```powershell\nGet-ChildItem -Recurse\n```\n\n以上。'
  const { container } = mount({ nodeList: [assistant(report, 1, 1, 2)] })
  await settle()
  click(buttonByAria(container, '历史'))
  await settle(50)
  // 历史里必须真的把代码内容渲染出来，而不是落到边界兜底。
  assert.match(textOf(container), /Get-ChildItem/)
  assert.doesNotMatch(textOf(container), /渲染失败/)
  // 舞台仍在：顶部标题与输入条没有被连带卸载。
  assert.match(textOf(container), /galgame 模式/)
})

check('历史面板：带脚注的回复同样不会打崩视图', async () => {
  const { container } = mount({ nodeList: [assistant('正文[^1]\n\n[^1]: 脚注内容', 1, 1, 2)] })
  await settle()
  click(buttonByAria(container, '历史'))
  await settle(50)
  assert.match(textOf(container), /脚注内容/)
  assert.doesNotMatch(textOf(container), /渲染失败/)
})

check('历史面板：渲染异常被边界兜住，只收起浮层不白屏', async () => {
  // 舞台显示最后一句（正常），历史里第一条含测试钩子 [[boom]] 会抛错。
  const { container } = mount({
    nodeList: [assistant('第一条会炸 [[boom]]', 1, 1, 2), assistant('第二条正常回复', 1, 2, 3)],
  })
  await settle()
  click(buttonByAria(container, '历史'))
  await settle(50)
  assert.match(textOf(container), /渲染失败/)      // 边界兜底文案
  assert.match(textOf(container), /galgame 模式/)   // 舞台没被拖垮
  // 兜底层必须自带退出口：原浮层的关闭按钮已被替换掉了。
  const close = buttonByText(container, '关闭')
  assert.ok(close, '兜底层应提供关闭按钮')
  click(close)
  await settle(30)
  assert.doesNotMatch(textOf(container), /渲染失败/)
  assert.match(textOf(container), /第二条正常回复/)
  // 再次打开是全新边界实例，错误状态清零并重新尝试（仍会崩，但依旧只兜底）。
  click(buttonByAria(container, '历史'))
  await settle(30)
  assert.match(textOf(container), /渲染失败/)
  assert.match(textOf(container), /galgame 模式/)
})

// ---------------------------------------------------------------- questions
function questionWait(overrides = {}) {
  const answered = []
  const dismissed = []
  return {
    answered,
    dismissed,
    wait: {
      kind: 'question',
      key: 'q1',
      sessionId: 'session-1',
      questions: [{
        id: 'q1',
        question: '要选哪一个？',
        header: '确认',
        options: [{ label: '选项A' }, { label: '选项B', description: 'B 的说明' }],
      }],
      answer: async (batch) => { answered.push(batch) },
      dismiss: async () => { dismissed.push(true) },
      ...overrides,
    },
  }
}

check('提问卡：选项 + 确定 → 官方批次形状', async () => {
  const { wait, answered } = questionWait()
  const { container } = mount({ nodeList: nodes, pending: wait })
  await settle(60)
  assert.match(textOf(container), /要选哪一个？/)
  assert.match(textOf(container), /B 的说明/)
  click([...container.querySelectorAll('button')].find((b) => textOf(b).includes('选项A')))
  await settle(30)
  click(buttonByText(container, '确定'))
  await settle(30)
  assert.equal(answered.length, 1)
  assert.deepEqual(answered[0], { answers: [{ id: 'q1', selected: ['选项A'] }] })
})

check('提问卡：自定义文本作为 custom 答案', async () => {
  const { wait, answered } = questionWait()
  const { container } = mount({ nodeList: nodes, pending: wait })
  await settle(60)
  await typeInto(container.querySelector('textarea'), '我自己写答案')
  click(buttonByText(container, '确定'))
  await settle(30)
  assert.deepEqual(answered[0], { answers: [{ id: 'q1', selected: [], custom: '我自己写答案' }] })
})

check('提问卡：放弃 → dismiss()', async () => {
  const { wait, dismissed } = questionWait()
  const { container } = mount({ nodeList: nodes, pending: wait })
  await settle(60)
  click(buttonByText(container, '放弃'))
  await settle(30)
  assert.equal(dismissed.length, 1)
})

check('提问卡：多题先「下一题」再一次性提交', async () => {
  const answered = []
  const wait = {
    kind: 'question',
    key: 'q2',
    sessionId: 'session-1',
    questions: [
      { id: 'q1', question: '第一问？', options: [{ label: 'A1' }] },
      { id: 'q2', question: '第二问？', options: [{ label: 'A2' }] },
    ],
    answer: async (batch) => { answered.push(batch) },
    dismiss: async () => {},
  }
  const { container } = mount({ nodeList: nodes, pending: wait })
  await settle(60)
  click([...container.querySelectorAll('button')].find((b) => textOf(b).includes('A1')))
  await settle(30)
  click(buttonByText(container, '下一题'))
  await settle(30)
  assert.match(textOf(container), /第二问？/)
  click([...container.querySelectorAll('button')].find((b) => textOf(b).includes('A2')))
  await settle(30)
  click(buttonByText(container, '确定'))
  await settle(30)
  assert.deepEqual(answered[0], {
    answers: [
      { id: 'q1', selected: ['A1'] },
      { id: 'q2', selected: ['A2'] },
    ],
  })
})

check('plan-review 形态复用同一张提问卡', async () => {
  const { wait } = questionWait({ kind: 'plan-review' })
  const { container } = mount({ nodeList: nodes, pending: wait })
  await settle(60)
  assert.match(textOf(container), /要选哪一个？/)
})

// ---------------------------------------------------------------- approvals
function approvalWait(overrides = {}) {
  const decisions = []
  return {
    decisions,
    wait: {
      kind: 'approval',
      key: 'a1',
      sessionId: 'session-1',
      toolName: 'pwsh',
      reason: '想执行一条命令',
      answerable: true,
      answer: async (outcome) => { decisions.push(outcome) },
      ...overrides,
    },
  }
}

check('审批卡：显示原因 / 工具名 / 等待提示', async () => {
  const { wait } = approvalWait()
  const { container } = mount({ nodeList: nodes, pending: wait })
  await settle(60)
  assert.match(textOf(container), /想执行一条命令/)
  assert.match(textOf(container), /权限申请/)
})

check('审批卡：拒绝 → rejected', async () => {
  const { wait, decisions } = approvalWait()
  const { container } = mount({ nodeList: nodes, pending: wait })
  await settle(60)
  click(buttonByText(container, '拒绝'))
  await settle(30)
  assert.deepEqual(decisions, ['rejected'])
})

check('审批卡：允许一次 → allowed-once', async () => {
  const { wait, decisions } = approvalWait()
  const { container } = mount({ nodeList: nodes, pending: wait })
  await settle(60)
  click(buttonByText(container, '允许一次'))
  await settle(30)
  assert.deepEqual(decisions, ['allowed-once'])
})

check('审批卡：无 reason 时回退到工具名文案', async () => {
  const { wait } = approvalWait({ reason: undefined })
  const { container } = mount({ nodeList: nodes, pending: wait })
  await settle(60)
  assert.match(textOf(container), /pwsh/)
})

// ---------------------------------------------------------------- input bar
check('输入条：空闲时走 queue（sendTurn）并清空草稿', async () => {
  const turns = []
  const steers = []
  const { container } = mount({
    nodeList: nodes,
    running: false,
    sendTurn: async (text) => { turns.push(text); return true },
    sendSteer: async (text) => { steers.push(text); return true },
  })
  await settle(60)
  await typeInto(container.querySelector('textarea'), '  你好鲸鱼娘  ')
  click(buttonByAria(container, '发送'))
  await settle(30)
  assert.deepEqual(turns, ['你好鲸鱼娘'])
  assert.deepEqual(steers, [])
  assert.equal(container.querySelector('textarea').value, '')
})

check('输入条：运行中走 steer（sendSteer）', async () => {
  const turns = []
  const steers = []
  const { container } = mount({
    nodeList: nodes,
    running: true,
    sendTurn: async (text) => { turns.push(text); return true },
    sendSteer: async (text) => { steers.push(text); return true },
  })
  await settle(60)
  await typeInto(container.querySelector('textarea'), '插一句')
  click(buttonByAria(container, '发送'))
  await settle(30)
  assert.deepEqual(steers, ['插一句'])
  assert.deepEqual(turns, [])
})

check('输入条：发送失败保留草稿', async () => {
  const { container } = mount({ nodeList: nodes, running: false, sendTurn: async () => false })
  await settle(60)
  await typeInto(container.querySelector('textarea'), '别丢')
  click(buttonByAria(container, '发送'))
  await settle(30)
  assert.equal(container.querySelector('textarea').value, '别丢')
})

check('输入条：Enter 发送、Shift+Enter 换行', async () => {
  const turns = []
  const { container } = mount({ nodeList: nodes, running: false, sendTurn: async (text) => { turns.push(text); return true } })
  await settle(60)
  const textarea = container.querySelector('textarea')
  await typeInto(textarea, '回车发送')
  await act(async () => {
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  await settle(30)
  assert.deepEqual(turns, ['回车发送'])
})

// ---------------------------------------------------------------- runner
const expressionOf = (container) => container.querySelector('[data-gg-expression]')?.getAttribute('data-gg-expression')
const assistant = (text, turn = 1, step = 1, seq = 1) => ({ kind: 'assistant', seq, turn, step, blocks: [{ kind: 'text', text }] })

check('自动表情：真实打字机只分析已显示文字，保留情绪词匹配', async () => {
  const prefix = '这里是普通的一段话。'.repeat(8)
  const { container } = mount({ nodeList: [assistant(prefix + '我很开心。')], settings: { typeSpeed: 8, autoMode: false } })
  await settle(50)
  assert.equal(expressionOf(container), 'neutral')
  await settle(650)
  assert.equal(expressionOf(container), 'happy')
})
check('自动表情：思考差分不依赖气泡开关，正文开始退出思考', async () => {
  const mounted = mount({ running: true, partial: { turn: 2, step: 1, blocks: [{ kind: 'reasoning', text: '正在推理' }] }, settings: { bubble: false } })
  await settle(30)
  assert.equal(expressionOf(mounted.container), 'thinking')
  assert.match(textOf(mounted.container), /思考中/)
  mounted.update({ partial: { turn: 2, step: 1, blocks: [{ kind: 'reasoning', text: '正在推理' }, { kind: 'text', text: '呜哇！' }] } })
  await settle(30)
  assert.equal(expressionOf(mounted.container), 'surprised')
})
check('自动表情：流式第二段转定稿不回第一页，不重挂当前立绘', async () => {
  const text = '呜哇！\n\n我很开心。'
  const mounted = mount({ running: true, settings: { autoMode: false }, partial: { turn: 3, step: 1, blocks: [{ kind: 'text', text }] } })
  await settle(30)
  assert.equal(expressionOf(mounted.container), 'surprised')
  click(mounted.container.querySelector('[aria-label="点击继续"]'))
  await settle(200)
  assert.equal(expressionOf(mounted.container), 'happy')
  const before = mounted.container.querySelector('[data-gg-portrait] img:not([aria-hidden])')
  const bounceBefore = mounted.container.querySelector('[data-gg-bounce-key]').getAttribute('data-gg-bounce-key')
  mounted.update({ running: false, partial: null, nodeList: [assistant(text, 3, 1, 12)] })
  await settle(40)
  assert.match(textOf(mounted.container), /2 \/ 2/)
  assert.equal(expressionOf(mounted.container), 'happy')
  assert.equal(mounted.container.querySelector('[data-gg-portrait] img:not([aria-hidden])'), before)
  assert.equal(mounted.container.querySelector('[data-gg-bounce-key]').getAttribute('data-gg-bounce-key'), bounceBefore)
})
check('自动表情：回看不继承未来情绪，会话切换重置', async () => {
  const mounted = mount({ nodeList: [assistant('普通的一句话。\n\n（害羞）移开视线。')], settings: { autoMode: false, typeSpeed: 8 } })
  await settle(100)
  click(buttonByAria(mounted.container, '下一句'))
  await settle(140)
  assert.equal(expressionOf(mounted.container), 'shy')
  click(buttonByAria(mounted.container, '上一句'))
  await settle(100)
  assert.equal(expressionOf(mounted.container), 'neutral')
  mounted.update({ sessionId: 'session-2', nodeList: [assistant('普通的一句话。')] })
  await settle(100)
  assert.equal(expressionOf(mounted.container), 'neutral')
  assert.match(textOf(mounted.container), /普通的一句话/)
})
check('自动表情：关闭时平静，用户的话不驱动角色情绪', async () => {
  const disabled = mount({ partial: { turn: 4, step: 1, blocks: [{ kind: 'text', text: '我很生气！' }] }, running: true, settings: { expressions: false } })
  await settle(30)
  assert.equal(expressionOf(disabled.container), 'neutral')
  const user = mount({ nodeList: [{ kind: 'user', seq: 1, content: [{ type: 'text', text: '我很生气！' }] }] })
  await settle(30)
  assert.equal(expressionOf(user.container), 'neutral')
})

console.log('dsh-galgame 客户端交互测试')
let passed = 0
for (const { name, fn } of checks) {
  await fn()
  passed += 1
  console.log(`  ok  ${name}`)
}
console.log(`\n全部通过：${passed} 项`)
if (activeRoot) act(() => activeRoot.unmount())
