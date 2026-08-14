/**
 * dsh-galgame — 最小契约类型（从 DSH 0.1.0-rc.6 运行时快照取所需叶子字段）。
 *
 * 只声明本插件用到的窄接口，不依赖官方完整类型包，避免深依赖；
 * 字段名与官方 ConversationSnapshot / ConversationNode / AssistantBlock 一致。
 */

/** Assistant 内容块（UI 分类视图）。 */
export interface AssistantBlock {
  kind: 'text' | 'reasoning' | 'image' | 'tool-call' | 'other'
  text?: string
  callId?: string
  name?: string
  argsRaw?: string
}

/** 核心 ContentBlock（user 消息内容）。 */
export interface ContentBlock {
  type?: string
  text?: string
  [key: string]: unknown
}

/** 最终会话节点（legacy 顶层 nodes 数组元素）。 */
export interface ConversationNode {
  kind: string
  seq: number
  time?: number
  key?: string
  content?: readonly ContentBlock[]
  blocks?: readonly AssistantBlock[]
  turn?: number
  step?: number
  messageId?: string
  text?: string
  [key: string]: unknown
}

/** 流式中的 assistant 输出。 */
export interface PartialAssistant {
  turn: number
  step: number
  blocks: readonly AssistantBlock[]
}

/** 提问等待（pending 里 kind === 'question' 的载体）。 */
export interface QuestionOption {
  label: string
  description?: string
}

export interface QuestionItem {
  id: string
  question: string
  options?: QuestionOption[]
  multiSelect?: boolean
  detail?: string
  header?: string
  intent?: { kind: string; approve?: string } | null
}

/** PendingWait 的渲染面（kind === 'question'）。 */
export interface PendingQuestionWait {
  kind: 'question'
  key: string
  sessionId: string
  payload: { questions: readonly QuestionItem[] }
  respond(result: unknown): Promise<unknown>
  markSettled?(): void
}

export interface PendingApprovalWait {
  kind: 'approval'
  key: string
  sessionId: string
  payload: Record<string, unknown>
  respond(result: unknown): Promise<unknown>
}

export type PendingInteraction = PendingQuestionWait | PendingApprovalWait

/** 会话快照的窄视图（useSession 选择器读到的字段）。 */
export interface ConversationSnapshotView {
  sessionId: string
  nodes: readonly ConversationNode[]
  partial: PartialAssistant | null
  pending: readonly PendingInteraction[]
  running: boolean
  openState: string
  openError: { message?: string; code?: string } | null
  blank: boolean
  composerPhase: string
  hasMore: boolean
  loadingOlder: boolean
  queue: readonly { id: string; preview: string; placement: string }[]
}

/** GalGame 台词行（adapter 输出）。 */
export interface ScriptLine {
  key: string
  seq: number
  speaker: 'user' | 'assistant'
  name: string
  text: string
  portrait: string
  time: number
  /** 台词内句列表（adapter 已分句）。 */
  sentences: readonly string[]
  /** 思维链文本（reasoning 块，仅 assistant；用于思考气泡）。 */
  reasoning?: string
}

/** 角色差分资源。 */
export interface PortraitDef {
  src: string
  type: 'image'
}

/** 角色 manifest（参考文档 CharacterManifest）。 */
export interface CharacterManifest {
  id: string
  displayName: string
  anchor: readonly [number, number]
  baseScale: number
  portraits: Record<string, PortraitDef>
}
