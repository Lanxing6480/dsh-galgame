/**
 * dsh-galgame — 最小契约类型（对齐 DSH 0.2.0-rc.2 的 Web 客户端运行时）。
 *
 * 只声明本插件用到的窄接口，不依赖官方完整类型包，避免深依赖；
 * 字段名与官方契约一致：
 *  - 台词数据：`ChatSnapshot.legacy`（Chat 视图目标的兼容投影，
 *    `nodes` / `partial` 与旧版一致）；
 *  - 会话生命周期：`SessionSnapshot`（useSession 的选择面）；
 *  - 等待交互：`SessionStatus.pendingInteraction` 里 `PendingQuestion` /
 *    `PendingApproval` 两个领域对象；
 *  - 输入机：`InputState` / `InputActions`（仅在提供输入条后备发送时使用）。
 *
 * 0.2.0-rc.2 的架构变化（与 0.1.0-rc.6 的差异）：
 *  - 旧版 `useSession` 直接给「会话快照」，内含 nodes/partial/pending/running；
 *  - 新版 `useSession` 只给 Session 生命周期（running/openState/blank…），
 *    会话内容改由 `useChat`（Chat 目标）与 `useConversation`（目标中立的装配）
 *    提供，等待交互改由 `useSessionStatus` 的 pendingInteraction 发布。
 */

/** Assistant 内容块（UI 分类视图，与官方 AssistantBlock 联合一致）。 */
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

/** Chat 目标的兼容投影（官方 `LegacyConversationSlice`）的窄视图。 */
export interface LegacyConversationSlice {
  readonly nodes: readonly ConversationNode[]
  readonly partial: PartialAssistant | null
}

/** `useChat` 选择面（官方 ChatSnapshot）的窄视图。 */
export interface ChatSnapshotView {
  readonly legacy: LegacyConversationSlice
}

/**
 * `useSession` 选择面（官方 SessionSnapshot）的窄视图。
 * 0.2.0-rc.2 起它只描述会话生命周期与控制状态，不再携带台词节点。
 */
export interface SessionSnapshotView {
  readonly sessionId: string
  readonly running: boolean
  readonly openState: 'cold' | 'loading' | 'open' | 'error'
  readonly openError: { message?: string; code?: string } | null
  readonly blank: boolean
  readonly hasMore: boolean
  readonly loadingOlder: boolean
}

/** 提问选项。 */
export interface QuestionOption {
  label: string
  description?: string
}

/** 提问项（官方 `AskUserQuestionItem`）。 */
export interface QuestionItem {
  id: string
  question: string
  options?: readonly QuestionOption[]
  multiSelect?: boolean
  detail?: string
  header?: string
  intent?: { kind: string; approve?: string } | null
}

/** 单题答案（官方 `AskUserQuestionAnswerItem`）。 */
export interface QuestionAnswerItem {
  id: string
  selected: string[]
  custom?: string
}

/** 整批答案（官方 `AskUserQuestionAnswer`）。 */
export interface QuestionAnswer {
  answers: QuestionAnswerItem[]
}

/**
 * 等待中的提问（官方 `PendingQuestion` 的窄视图）。
 *
 * 由 dsh-client-ui-user-questions 注册进会话的 pending-interaction 域；
 * 经 `useSessionStatus` 的 `pendingInteraction` 取得。作答走 `answer()`，
 * 关闭走 `dismiss()`（工具调用型卡片只收起卡片，请求仍可由工具行重开）。
 */
export interface PendingQuestionWait {
  readonly kind: 'question' | 'plan-review'
  readonly key: string
  readonly sessionId: string
  readonly questions: readonly QuestionItem[]
  readonly callId?: string
  answer(answer: QuestionAnswer): Promise<void>
  dismiss(): Promise<void>
}

/**
 * 等待中的审批（官方 `PendingApproval` 的窄视图）。
 *
 * 由 dsh-client-ui-approval 注册；`answer()` 只接受
 * `'allowed-once' | 'rejected'` 两种交互决策。
 */
export interface PendingApprovalWait {
  readonly kind: 'approval'
  readonly key: string
  readonly sessionId: string
  readonly toolName: string
  readonly reason?: string
  readonly callId?: string
  readonly answerable: boolean
  answer(outcome: 'allowed-once' | 'rejected'): Promise<void>
}

/** 任一等待交互。 */
export type PendingInteraction = PendingQuestionWait | PendingApprovalWait

/** `useSessionStatus` 的单项状态（官方 `SessionStatus` 的窄视图）。 */
export interface SessionStatusView {
  readonly running?: boolean
  readonly pendingInteraction?: { readonly kind: string } & Record<string, unknown>
  readonly completionUnread?: boolean
}

/** `useSessionStatus` 的选择面：SessionId → 状态。 */
export type SessionStatusMap = ReadonlyMap<string, SessionStatusView>

/** 输入机状态（官方 `InputState` 的窄视图）。 */
export interface InputStateView {
  readonly draft: string
  readonly phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting'
}

/** 输入动作（官方 `InputActions` 的窄视图）。 */
export interface InputActionsView {
  setDraft(text: string): void
  submit(): void
}

/** GalGame 台词行（adapter 输出）。 */
export interface ScriptLine {
  key: string
  /** Stable across partial -> settled (turn + step when supplied by host). */
  playbackKey: string
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
