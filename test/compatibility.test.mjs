/** Registration/lifecycle regression tests using the real DSH slot ledger. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// Optional unpacked official package entry, for checking a specific DSH release
// without replacing this workspace's installed dependencies.
const { SlotCore } = await import(process.env.DSH_SLOT_CORE_PATH
  ? pathToFileURL(process.env.DSH_SLOT_CORE_PATH).href
  : '@deepseek-ai/dsh-client-ui-slots')

const require = createRequire(import.meta.url)
let bundle
new Function('window', readFileSync(process.env.DSH_GALGAME_BUNDLE_PATH
  ?? new URL('../lib/client.js', import.meta.url), 'utf8'))({
  __ModuleLoader__: { load(value) { bundle = value } },
})
const client = bundle.factory(name => name === '@deepseek-ai/dsh-client-ui-primitives'
  ? { MarkdownText: () => null } : require(name))

function harness() {
  const core = new SlotCore()
  const effects = new Set()
  const once = fn => {
    let active = true
    return () => { if (active) { active = false; fn() } }
  }
  const effect = fn => {
    const dispose = once(fn() ?? (() => {}))
    effects.add(dispose)
    return () => { effects.delete(dispose); dispose() }
  }
  const ctx = {
    effect,
    locale: { register: () => () => {}, bind: () => key => key },
    sessions: { binding: () => ({ session: { prompt: async () => ({ ok: true }) } }) },
    slots: {
      register: (options, component) => effect(() => core.register(options, component)),
      inject(name, callback) {
        return effect(() => {
          let dispose
          const reconcile = () => {
            dispose?.()
            dispose = core.spec(name) ? callback() : undefined
          }
          const unsubscribe = core.subscribeDeclaration(name, reconcile)
          reconcile()
          return () => { unsubscribe(); dispose?.() }
        })
      },
    },
  }
  let releaseOwner
  function declare() {
    releaseOwner = core.register({ name: 'root', children: {
      'conversation.view': { kind: 'list', scope: 'session' },
      'conversation.composer': { kind: 'chain', scope: 'root' },
    } }, () => null)
  }
  declare()
  const nativeComposer = () => 'native composer'
  core.register({ name: 'conversation.composer', priority: 0, select: () => ({}) }, nativeComposer)
  for (const [id, order] of [['chat', 0], ['trajectory', 10], ['other-plugin', 20]]) {
    core.register({ name: 'conversation.view', id, order }, () => id)
  }
  client.apply(ctx)
  const view = () => core.entries('conversation.view').find(e => e.options.id === 'galgame')
  const props = id => view().inject(id)
  const winner = input => core.entries('conversation.composer').find(e => e.select(input) !== null)?.component
  return {
    core, props, winner, nativeComposer,
    dispose() { for (const stop of [...effects].reverse()) stop() },
    redeclare() { releaseOwner(); declare() },
  }
}

test('loading GalGame leaves the ordinary composer and view ledger intact', () => {
  const h = harness()
  try {
    assert.equal(h.winner({ sessionId: 'chat' }), h.nativeComposer)
    assert.deepEqual(h.core.entries('conversation.view').map(e => e.options.id),
      ['chat', 'trajectory', 'other-plugin', 'galgame'])
    assert.equal(h.core.entries('conversation.composer').length, 1)
  } finally { h.dispose() }
})

test('GalGame composer takeover never matches another session or an absent session', () => {
  const h = harness()
  try {
    const props = h.props('galgame-session')
    // Allow this regression to demonstrate the published 1.2.0 behavior too.
    const release = props.activateGalgameMode?.() ?? (() => {
      props.setGalgameMode(true)
      return () => props.setGalgameMode(false)
    })()
    assert.equal(h.winner({ sessionId: 'other-session' }), h.nativeComposer)
    assert.equal(h.winner({}), h.nativeComposer)
    assert.equal(h.winner({ sessionId: 'galgame-session' })({}), null)
    release()
    assert.equal(h.winner({ sessionId: 'galgame-session' }), h.nativeComposer)
  } finally { h.dispose() }
})

test('two GalGame mounts have independent, idempotent release handles', () => {
  const h = harness()
  try {
    const props = h.props('shared-session')
    const first = props.activateGalgameMode()
    const second = props.activateGalgameMode()
    first(); first()
    assert.equal(h.winner({ sessionId: 'shared-session' })({}), null)
    second()
    assert.equal(h.winner({ sessionId: 'shared-session' }), h.nativeComposer)
  } finally { h.dispose() }
})

test('unmounting one session preserves the other session and other plugins', () => {
  const h = harness()
  try {
    const panel = () => 'other plugin input'
    h.core.register({ name: 'conversation.composer', priority: -50,
      select: input => input.sessionId === 'other-session' ? {} : null }, panel)
    const first = h.props('first').activateGalgameMode()
    const second = h.props('second').activateGalgameMode()
    first()
    assert.equal(h.winner({ sessionId: 'first' }), h.nativeComposer)
    assert.equal(h.winner({ sessionId: 'second' })({}), null)
    assert.equal(h.winner({ sessionId: 'other-session' }), panel)
    second()
    assert.equal(h.winner({ sessionId: 'other-session' }), panel)
  } finally { h.dispose() }
})

test('composer contribution follows slot redeclaration and plugin disposal', () => {
  const h = harness()
  try {
    const release = h.props('galgame-session').activateGalgameMode()
    h.redeclare()
    assert.equal(h.winner({ sessionId: 'galgame-session' })({}), null)
    assert.equal(h.winner({ sessionId: 'other-session' }), undefined)
    h.dispose()
    assert.equal(h.core.entries('conversation.composer').length, 0)
    assert.equal(h.core.entries('conversation.view').length, 0)
    release()
  } finally { h.dispose() }
})
