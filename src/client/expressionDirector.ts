/** Local expression director. No network, model, DOM, or session writes.
 * Feed ONLY the currently visible assistant text. Stable unitKey must survive
 * partial -> settled; use message identity + unit index, not partial/seq labels.
 */
export type Expression = 'neutral' | 'happy' | 'thinking' | 'surprised' | 'helpless' | 'angry' | 'sad' | 'shy'
export type ExpressionIntent = 'explain' | 'report' | 'instruct' | 'consider' | 'technical' | 'converse'
export interface ExpressionEvidence { rule: string; portrait: Expression; phrase: string; weight: number }
export interface ExpressionDecision {
  portrait: Expression | 'keep'
  intent: ExpressionIntent
  reason: string
  evidence: ExpressionEvidence[]
  ignored: string[]
  scores: Partial<Record<Expression, number>>
}

interface Rule { id: string; portrait: Expression; weight: number; pattern: RegExp }
// Scores are heuristic weights, NOT probabilities. Each rule scores once.
const RULES: readonly Rule[] = [
  // Explicit emotional/RP words remain a first-class route alongside work intent.
  { id: 'emotion-happy', portrait: 'happy', weight: 4, pattern: /开心|高兴|喜悦|欣喜/ },
  { id: 'emotion-shy', portrait: 'shy', weight: 4, pattern: /害羞|羞涩|脸红|不好意思/ },
  { id: 'emotion-angry', portrait: 'angry', weight: 4, pattern: /生气|恼火|不满|气鼓鼓/ },
  { id: 'emotion-sad', portrait: 'sad', weight: 4, pattern: /难过|失落|伤心|委屈|舍不得/ },
  { id: 'emotion-surprised', portrait: 'surprised', weight: 4, pattern: /惊讶|吃惊|惊喜/ },
  { id: 'emotion-helpless', portrait: 'helpless', weight: 4, pattern: /无奈|叹气/ },
  { id: 'emotion-thinking', portrait: 'thinking', weight: 4, pattern: /思索|沉思|琢磨/ },
  { id: 'surprise-exclamation', portrait: 'surprised', weight: 5, pattern: /呜哇|哇[啊呀哦]?|咦[？?！!]|诶[？?]/ },
  { id: 'unexpected-discovery', portrait: 'surprised', weight: 4, pattern: /(?:居然|竟然)(?:真)?(?:是|有|还|能)|没想到|原来如此[！!]/ },
  { id: 'happy-relief', portrait: 'happy', weight: 5, pattern: /太好了|终于(?:搞定|解决|完成|成功)了?|这下好了|搞定啦|好耶/ },
  { id: 'happy-laugh', portrait: 'happy', weight: 4, pattern: /嘿嘿|哈哈[哈！!～~]|开心地笑|忍不住笑/ },
  { id: 'verified-success', portrait: 'happy', weight: 4, pattern: /\d+\s*项(?:全部)?全绿|测试(?:全部|均|都)?通过|所有测试都通过/ },
  { id: 'consider-options', portrait: 'thinking', weight: 4, pattern: /让我(?:想想|想一想|琢磨一下)|我(?:再)?(?:想想|琢磨一下)|还需要(?:再)?确认|有两种可能/ },
  { id: 'consider-gesture', portrait: 'thinking', weight: 5, pattern: /托(?:着|住)?下巴|翻看(?:手里的)?本子/ },
  { id: 'resigned-phrase', portrait: 'helpless', weight: 5, pattern: /真拿.{0,6}没办法|只能这样了|只好这样了|偏偏又|还得再来一次/ },
  { id: 'resigned-gesture', portrait: 'helpless', weight: 5, pattern: /(?:摊开|摊了摊|摊摊)(?:双)?手|轻(?:轻)?叹(?:了)?(?:一口)?气|无奈地叹气/ },
  { id: 'avert-gaze', portrait: 'shy', weight: 4, pattern: /(?:心虚地?)?(?:移开|避开|挪开)(?:了)?(?:视线|目光)|心虚地?/ },
  { id: 'shy-praise', portrait: 'shy', weight: 5, pattern: /你(?:别|不要)(?:再)?这么夸我|(?:夸得|说得)我(?:有点)?不好意思|我有点(?:害羞|不好意思)/ },
  { id: 'shy-stammer', portrait: 'shy', weight: 4, pattern: /才[、，,]才没有|我[、，,]我才没/ },
  { id: 'shy-hesitation', portrait: 'shy', weight: 1, pattern: /那个[，,…]|这个嘛|咳[，,…]/ },
  { id: 'mild-displeasure', portrait: 'angry', weight: 5, pattern: /我(?:有点|真的|可)?(?:生气|不高兴)|气鼓鼓|轻哼(?:一声)?|哼[！!，,]/ },
  { id: 'quiet-sadness', portrait: 'sad', weight: 5, pattern: /我(?:有点|真的|还是)?(?:失落|难过|舍不得)|有点失落|垂下(?:了)?(?:眼睛|眼帘|眼眸)|失落地低下头/ },
]

const mask = (text: string): string => text.replace(/[^\n]/g, ' ')

/** Preserve offsets while masking code, links, quotes and partial constructs.
 * Incomplete inline code/quotes stay masked: a streaming prefix must not act
 * on a quotation before the closing delimiter arrives.
 */
export function expressionText(raw: string): { text: string; ignored: string[] } {
  const ignored = new Set<string>()
  let fence = ''
  let text = raw.split('\n').map((line) => {
    const start = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (start && start[1][0] === fence[0] && start[1].length >= fence.length) fence = ''
      ignored.add('代码块')
      return mask(line)
    }
    if (start) { fence = start[1]; ignored.add('代码块'); return mask(line) }
    if (/^\s*>|^\s*\|/.test(line)) { ignored.add('引用／表格'); return mask(line) }
    return line
  }).join('\n')
  const chars = text.split('')
  const pairs: Record<string, string> = { '“': '”', '「': '」', '『': '』', '"': '"', '‘': '’' }
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '`') {
      let n = 1
      while (text[i + n] === '`') n++
      const end = text.indexOf('`'.repeat(n), i + n)
      const limit = end < 0 ? text.length : end + n
      for (let j = i; j < limit; j++) if (chars[j] !== '\n') chars[j] = ' '
      ignored.add('行内代码')
      i = limit - 1
    } else if (pairs[text[i]]) {
      const end = text.indexOf(pairs[text[i]], i + 1)
      const limit = end < 0 ? text.length : end + 1
      for (let j = i; j < limit; j++) if (chars[j] !== '\n') chars[j] = ' '
      ignored.add('引述内容')
      i = limit - 1
    }
  }
  text = chars.join('')
    .replace(/!?\[[^\]\n]*(?:\]\([^)]*(?:\)|$)|$)/g, (s) => { ignored.add('链接'); return mask(s) })
    .replace(/https?:\/\/[^\s）)]+|(?:[A-Za-z]:[\\/]|~\/)[^\s，。；]+/g, (s) => { ignored.add('地址／路径'); return mask(s) })
    .replace(/<[^>]*(?:>|$)|&(?:#x?[\da-f]+|\w+);/gi, mask)
    .replace(/[*_#]/g, ' ')
  return { text, ignored: [...ignored] }
}

function intentOf(text: string, raw: string): ExpressionIntent {
  if (/让我想|我琢磨|有两种可能|需要(?:再)?确认|权衡/.test(text)) return 'consider'
  if (/你(?:需要|要做)|接下来|运行以下|重启|操作步骤|先看报告|确认后/.test(text)) return 'instruct'
  if (/我改了什么|已完成|查完了|扫描结果|验证|测试|修复|新增|已打进|改为/.test(text)) return 'report'
  if (/根因|原因|因为|造成|所以|这意味着|说明|结论|契约|版本|接口|配置/.test(text)) return 'explain'
  if (!text.trim() && raw.trim() || /(?:^|\n)\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s)|代码|日志|脚本|源码|字段/.test(raw)) return 'technical'
  return 'converse'
}

/** Classify already-visible text, with an explicit abstention result. */
export function classifyExpression(raw: string): ExpressionDecision {
  const { text, ignored } = expressionText(raw)
  const intent = intentOf(text, raw)
  const evidence: ExpressionEvidence[] = []
  const used = new Set<string>()
  for (const clause of text.split(/(?<=[。！？!?；;\n])|——|……/)) {
    // Do not interpret descriptions about emotion labels or another actor.
    if (/表情|差分|关键词|字符串|字段|报错|示例|单元测试|匹配规则|检测规则/.test(clause)) {
      ignored.push('讨论表情／技术内容')
      continue
    }
    if (/(?:你|他|她|它|对方|用户|角色|小明|小红)(?:说|觉得|感到|有点|很|非常|十分|正在|生气|害羞|难过|开心|高兴|伤心|移开|心虚)|(?:让|使)(?:他|她|它|用户|对方)/.test(clause)) {
      ignored.push('其他主体的描述')
      continue
    }
    for (const rule of RULES) {
      if (used.has(rule.id)) continue
      const match = rule.pattern.exec(clause)
      if (!match) continue
      const before = clause.slice(0, match.index)
      const after = clause.slice(match.index + match[0].length)
      if (/(?:不|没|别|不要|不会|没有|并非|不是|不必|不该|不想|不再|不能|没必要)(?:让|让我|觉得|感到|显得|表现得|那么|太|很|再|真的|有点|这么|一点也)*$/.test(before)
        || /^(?:是|只是)?(?:假设|示例)|^(?:就|才|会)/.test(after)
        || /如果|假如|假设|要是/.test(before)) {
        ignored.push(`否定／条件语境：${match[0]}`)
        continue
      }
      used.add(rule.id)
      evidence.push({ rule: rule.id, portrait: rule.portrait, phrase: match[0], weight: rule.weight })
    }
  }
  const scores: Partial<Record<Expression, number>> = {}
  for (const hit of evidence) scores[hit.portrait] = (scores[hit.portrait] ?? 0) + hit.weight
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]) as [Expression, number][]
  const best = sorted[0]
  if (best && best[1] >= 4 && best[1] - (sorted[1]?.[1] ?? 0) >= 2) {
    return { portrait: best[0], intent, reason: `语气命中：${evidence.filter(e => e.portrait === best[0]).map(e => e.phrase).join('、')}`, evidence, ignored: [...new Set(ignored)], scores }
  }
  if (best && best[1] >= 4) return { portrait: 'keep', intent, reason: '多个表情线索接近，保持', evidence, ignored: [...new Set(ignored)], scores }
  const work = ['explain', 'report', 'instruct', 'technical'].includes(intent)
  return { portrait: work ? 'neutral' : 'keep', intent, reason: work ? '普通工作表达，使用平静姿态' : '没有足够明确的语气，保持', evidence, ignored: [...new Set(ignored)], scores }
}

export interface ExpressionState {
  unitKey: string | null
  portrait: Expression
  emotionalSwitch: boolean
  evaluatedText: string
  completed: boolean
  quietUnits: number
  decision: ExpressionDecision
}
export interface ExpressionUpdate {
  state: ExpressionState
  event: { from: Expression; to: Expression; reason: string } | null
}
export function initialExpressionState(): ExpressionState {
  return { unitKey: null, portrait: 'neutral', emotionalSwitch: false, evaluatedText: '', completed: false, quietUnits: 0, decision: classifyExpression('') }
}

/** Pure reducer: never delay text; evaluate only completed clauses, or unit end.
 * At most one emotional switch per unit, plus a neutral reset on entering work.
 * Repeat delivery/partial settlement with identical key+text is idempotent.
 */
export function advanceExpression(previous: ExpressionState, input: { unitKey: string; visibleText: string; complete: boolean }): ExpressionUpdate {
  const entering = previous.unitKey !== input.unitKey
  let state = entering ? { ...previous, unitKey: input.unitKey, emotionalSwitch: false, evaluatedText: '', completed: false } : { ...previous }
  const masked = expressionText(input.visibleText).text
  let end = input.complete ? input.visibleText.length : 0
  if (!input.complete) {
    for (const m of masked.matchAll(/[。！？!?；;\n]|——|……/g)) end = (m.index ?? 0) + m[0].length
  }
  const ready = input.visibleText.slice(0, end)
  if ((!ready || ready === state.evaluatedText) && !(input.complete && !state.completed)) return { state, event: null }
  const decision = classifyExpression(ready)
  state = { ...state, decision, evaluatedText: ready }
  let target = decision.portrait
  if (input.complete && !state.completed) {
    state.completed = true
    state.quietUnits = target !== 'keep' && target !== 'neutral' ? 0 : state.quietUnits + 1
    if (target === 'keep' && !decision.evidence.length && state.quietUnits >= 2) {
      target = 'neutral'
      state.decision = { ...decision, reason: '连续两段没有情绪线索，回到平静' }
    }
  }
  if (target === 'keep' || target === state.portrait) return { state, event: null }
  if (state.emotionalSwitch) {
    state.decision = { ...decision, reason: '本段已经选定表情，保持至下一段' }
    return { state, event: null }
  }
  const from = state.portrait
  state.portrait = target
  if (target !== 'neutral') { state.emotionalSwitch = true; state.quietUnits = 0 }
  return { state, event: { from, to: target, reason: state.decision.reason } }
}
