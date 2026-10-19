/**
 * dsh-galgame — 会话快照 → GalGame 台词脚本（纯函数，无副作用）。
 *
 * 职责：
 *  - 只保留 user / assistant 的**可见文本**（隐藏 tool-call、reasoning、image）；
 *  - 长文本自动分句（需求 9）；
 *  - 流式 partial 单独提供「进行中的台词」。
 */

import type {
  AssistantBlock,
  ConversationNode,
  PartialAssistant,
  ScriptLine,
} from './types.ts'

/** 把 assistant blocks 里的可见文本拼出来（隐藏工具调用/思维链）。 */
export function visibleTextOfBlocks(blocks: readonly AssistantBlock[] | undefined): string {
  if (blocks === undefined || blocks.length === 0) return ''
  const parts: string[] = []
  for (const block of blocks) {
    if (block.kind !== 'text') continue
    const text = block.text ?? ''
    if (text.trim() !== '') parts.push(text)
  }
  return parts.join('\n')
}

/** 提取 assistant blocks 里的思维链文本（reasoning 块，用于思考气泡）。 */
export function reasoningTextOfBlocks(blocks: readonly AssistantBlock[] | undefined): string {
  if (blocks === undefined || blocks.length === 0) return ''
  const parts: string[] = []
  for (const block of blocks) {
    if (block.kind !== 'reasoning') continue
    const text = block.text ?? ''
    if (text.trim() !== '') parts.push(text)
  }
  return parts.join('\n')
}

/** 把 user content 里的文本拼出来（ContentBlock 兼容多种形态）。 */
export function visibleTextOfContent(content: readonly { type?: string; text?: string }[] | undefined): string {
  if (content === undefined || content.length === 0) return ''
  const parts: string[] = []
  for (const block of content) {
    const text = block.text
    if (typeof text === 'string' && text.trim() !== '') parts.push(text)
  }
  return parts.join('\n')
}

/**
 * 分段器（按换行块拆分，用户建议）：
 * 输出「显示单元」列表，每个单元 = 一个换行块（空行分隔的段落）。
 *  - 表格 / 列表 / 引用 / 标题 / 代码块都在各自的块内，整块不切；
 *  - 不再按句子标点切分 —— 任何标点（表格里的 ！？… 等）都不会拆碎内容；
 *  - 代码块（``` / ~~~ 包裹）内的空行不分割。
 * 每个单元交给 MarkdownText 渲染；长块由对话框滚动显示。
 */
export function splitIntoSentences(text: string): readonly string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (normalized === '') return []
  const blocks: string[] = []
  let current = ''
  let inCodeFence = false
  for (const line of normalized.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inCodeFence = !inCodeFence
    const isEmpty = line.trim() === ''
    if (isEmpty && !inCodeFence) {
      if (current.trim() !== '') {
        blocks.push(current.trim())
        current = ''
      }
    } else {
      current += (current === '' ? '' : '\n') + line
    }
  }
  if (current.trim() !== '') blocks.push(current.trim())
  return mergeLeadingListGuides(blocks)
}

/** 列表项单元判定。 */
function isListUnit(text: string): boolean {
  return /^\s*([-*+]|\d+[.)])\s+/.test(text)
}

/** 是否以句末标点收尾（完整句子的标志）。 */
function endsWithSentenceEnd(text: string): boolean {
  return /[。！？!?…～~]$/.test(text)
}

/**
 * 合并「列表引导句」：若一个单元不以句末标点收尾（标题行、冒号结尾的
 * 引导句，如「已完成的修复」「实现步骤：」），且下一单元是列表块，
 * 就把两者合并为一个单元 —— 避免标题/排头与列表被拆开显示（问题 5）。
 */
function mergeLeadingListGuides(units: readonly string[]): string[] {
  const merged: string[] = []
  for (const unit of units) {
    const last = merged[merged.length - 1]
    if (last !== undefined && isListUnit(unit) && !endsWithSentenceEnd(last) && !isListUnit(last)) {
      merged[merged.length - 1] = `${last}\n${unit}`
    } else {
      merged.push(unit)
    }
  }
  return merged
}

/** 单个节点 → 台词行（无可见文本则返回 null）。 */
function lineFromNode(node: ConversationNode): ScriptLine | null {
  if (node.kind === 'user') {
    const text = visibleTextOfContent(node.content)
    if (text === '') return null
    return {
      key: `user-${node.seq}`,
      playbackKey: `user-${node.seq}`,
      seq: node.seq,
      speaker: 'user',
      name: '我',
      text,
      portrait: 'neutral',
      time: node.time ?? 0,
      // 用户输入整段显示，不分段（问题 3：不用切段）。
      sentences: [text],
    }
  }
  if (node.kind === 'assistant') {
    const text = visibleTextOfBlocks(node.blocks)
    if (text === '') return null
    const reasoning = reasoningTextOfBlocks(node.blocks)
    return {
      key: `assistant-${node.seq}`,
      playbackKey: typeof node.turn === 'number' && typeof node.step === 'number'
        ? `assistant-${node.turn}-${node.step}` : `assistant-${node.seq}`,
      seq: node.seq,
      speaker: 'assistant',
      name: '鲸鱼娘',
      text,
      portrait: 'neutral',
      time: node.time ?? 0,
      sentences: splitIntoSentences(text),
      ...(reasoning === '' ? {} : { reasoning }),
    }
  }
  // steering / context / tool-result / command / compaction / ... 第一版不进入台词
  return null
}

/** 全量节点 → 台词脚本。 */
export function buildScript(nodes: readonly ConversationNode[]): readonly ScriptLine[] {
  const lines: ScriptLine[] = []
  for (const node of nodes) {
    const line = lineFromNode(node)
    if (line !== null) lines.push(line)
  }
  return lines
}

/**
 * 流式 partial → 「进行中的台词」行。
 * 无任何输出（text 与 reasoning 皆空）返回 null；
 * 只有思维链（text 空、reasoning 有）也返回行 —— 流式早期模型先思考后
 * 输出正文时，思考气泡能实时显示流式思维过程（问题 2 修复）。
 */
export function partialLine(partial: PartialAssistant | null): ScriptLine | null {
  if (partial === null) return null
  const text = visibleTextOfBlocks(partial.blocks)
  const reasoning = reasoningTextOfBlocks(partial.blocks)
  if (text === '' && reasoning === '') return null
  return {
    key: `partial-${partial.turn}-${partial.step}`,
    playbackKey: `assistant-${partial.turn}-${partial.step}`,
    seq: Number.MAX_SAFE_INTEGER - partial.turn,
    speaker: 'assistant',
    name: '鲸鱼娘',
    text,
    portrait: 'neutral',
    time: Date.now(),
    sentences: splitIntoSentences(text),
    ...(reasoning === '' ? {} : { reasoning }),
  }
}

/** 快照字段 → { 已定稿台词, 流式台词 }。 */
export function snapshotToScript(
  nodes: readonly ConversationNode[],
  partial: PartialAssistant | null,
): {
  settled: readonly ScriptLine[]
  streaming: ScriptLine | null
} {
  return {
    settled: buildScript(nodes),
    streaming: partialLine(partial),
  }
}
