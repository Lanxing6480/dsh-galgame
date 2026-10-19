import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { classifyExpression, advanceExpression, initialExpressionState } from '../src/client/expressionDirector.ts'
import { splitIntoSentences } from '../src/client/adapter.ts'
import { snapshotToScript } from '../src/client/adapter.ts'
import { createExpressionPlayback } from '../src/client/expressionPlayback.ts'

for (const [text, expected] of [
  ['呜哇——查完了，真的是三处同时断。', 'surprised'],
  ['咦？居然是这个原因。', 'surprised'],
  ['终于解决了！', 'happy'],
  ['59 项全绿；验证已经结束。', 'happy'],
  ['让我想想，有两种可能。', 'thinking'],
  ['（摊开双手）真拿你没办法。', 'helpless'],
  ['（移开视线）那个……不是我吃的。', 'shy'],
  ['你别这么夸我。', 'shy'],
  ['我有点生气。', 'angry'],
  ['我有点失落。', 'sad'],
  ['（开心地笑了笑）今天过得不错。', 'happy'],
  ['（害羞）轻轻低下头。', 'shy'],
  ['（生气）抱起双臂。', 'angry'],
  ['（难过）站了一会儿。', 'sad'],
  ['（惊讶）抬起头。', 'surprised'],
  ['（无奈）又看了一眼。', 'helpless'],
  ['（沉思）翻开本子。', 'thinking'],
  ['那个……这里有一个路径。', 'keep'],
  ['最后一块蛋糕大概是自己消失的吧。', 'keep'],
]) test(`expression: ${text}`, () => assert.equal(classifyExpression(text).portrait, expected))

for (const text of [
  '我没有生气。', '不要气鼓鼓的。', '他生气地离开了。', '她移开视线。',
  '如果终于解决了，我们就继续。', '你别害羞。',
  '害羞表情的实现步骤如下。', '日志显示迁移失败、历史会话打不开、14 个修不了。',
  '关键词是呜哇，字符串是太好了。', '测试没有通过。',
  '我并没有感到害羞。', '别难过。', '她很开心。', '用户有点生气。',
  '> 呜哇！我有点生气。', '她说：“我有点生气！”',
  '这段代码是 `throw new Error("太好了！")`。',
  '```js\nconst label = "呜哇！我有点生气"\n```',
  '[我有点生气！](https://example.invalid)',
]) test(`abstain: ${text.slice(0, 40)}`, () => assert.ok(['neutral', 'keep'].includes(classifyExpression(text).portrait)))

function stream(units) {
  let state = initialExpressionState()
  const events = []
  for (let u = 0; u < units.length; u++) {
    for (let n = 1; n <= units[u].length; n++) {
      const result = advanceExpression(state, { unitKey: `reply-1:${u}`, visibleText: units[u].slice(0, n), complete: n === units[u].length })
      state = result.state
      if (result.event) events.push({ unit: u, offset: n, ...result.event })
    }
  }
  return { state, events }
}

test('does not peek ahead; waits for a visible clause boundary', () => {
  const pending = advanceExpression(initialExpressionState(), { unitKey: '1', visibleText: '我有点生气', complete: false })
  assert.equal(pending.state.portrait, 'neutral')
  assert.equal(advanceExpression(pending.state, { unitKey: '1', visibleText: '我有点生气。', complete: false }).state.portrait, 'angry')
})
test('incremental quoted/code prefixes cannot trigger emotions', () => {
  for (const text of ['她说：“呜哇！我有点生气。”', '`呜哇！我有点生气。`', '```js\n"呜哇！我有点生气。"\n```', '[呜哇！我有点生气。](url)']) {
    assert.equal(stream([text]).events.length, 0, text)
  }
})
test('one emotional switch per unit and identical settled replay is idempotent', () => {
  const text = '呜哇！太好了！终于搞定了！'
  const { state, events } = stream([text])
  assert.equal(events.length, 1)
  assert.equal(events[0].to, 'surprised')
  const repeat = advanceExpression(state, { unitKey: 'reply-1:0', visibleText: text, complete: true })
  assert.equal(repeat.event, null)
  assert.deepEqual(repeat.state, state)
})
test('work explanation resets anger; weak cues do not force shy', () => {
  const result = stream(['我有点生气。', '根因是接口版本变化。', '那个……我们继续吧。'])
  assert.deepEqual(result.events.map(e => e.to), ['angry', 'neutral'])
})
test('quiet expression expires after two completed uncued units, not tokens', () => {
  const result = stream(['我有点生气。', '嗯。', '我们继续吧。'])
  assert.deepEqual(result.events.map(e => e.to), ['angry', 'neutral'])
  assert.equal(result.events[1].unit, 2)
})
test('provided work report uses the real splitter; only a few changes', () => {
  const sample = readFileSync(new URL('./fixtures/expression-work-report.md', import.meta.url), 'utf8')
  const units = splitIntoSentences(sample)
  assert.ok(units.some(x => x.includes('```powershell') && x.includes('--apply')))
  const { events } = stream(units)
  assert.deepEqual(events.map(e => e.to), ['surprised', 'neutral', 'happy', 'neutral'])
})

test('same message has a stable identity across streamed and settled nodes', () => {
  const { settled, streaming } = snapshotToScript(
    [{ kind: 'assistant', seq: 99, turn: 7, step: 2, blocks: [{ kind: 'text', text: '呜哇！' }] }],
    { turn: 7, step: 2, blocks: [{ kind: 'text', text: '呜哇！' }] },
  )
  assert.equal(settled[0].playbackKey, streaming.playbackKey)
})
test('playback handles batched sentences identically to small chunks', () => {
  const text = '呜哇！我很开心。终于解决了！'
  const whole = createExpressionPlayback().update('m1', 0, text, true)
  const incremental = createExpressionPlayback()
  let small
  for (let i = 1; i <= text.length; i++) small = incremental.update('m1', 0, text.slice(0, i), i === text.length)
  assert.deepEqual(whole, small)
  assert.equal(whole.portrait, 'surprised')
})
test('playback revisits start from their own entry state, not future expressions', () => {
  const player = createExpressionPlayback()
  assert.equal(player.update('m1', 0, '普通的一句话。', true).portrait, 'neutral')
  assert.equal(player.update('m1', 1, '（害羞）移开视线。', true).portrait, 'shy')
  assert.equal(player.update('m1', 0, '普通', false).portrait, 'neutral')
  assert.equal(player.update('m2', 0, '另一条普通消息。', true).portrait, 'neutral')
})
