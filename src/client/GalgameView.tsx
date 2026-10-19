/**
 * dsh-galgame — GalgameView：conversation.view 的「galgame」标签视图根组件。
 *
 * 编排（纯展示层，零会话写入）：
 *  快照 → adapter → 播放位置（分句/打字机/自动模式/配置）→ 各层
 *
 * 数据来源（DSH 0.2.0-rc.2 契约）：
 *  - 台词节点/流式片段：`useChat(s => s.legacy)`（Chat 视图目标的兼容投影，
 *    字段与旧版 ConversationSnapshot 的 nodes / partial 一致）；
 *  - 会话生命周期：`useSession`（running / openState / blank …）；
 *  - 等待交互（提问 / 审批）：`useSessionStatus` 的 `pendingInteraction`
 *    （提问域与审批域各自 registerPendingInteraction 发布的对象）。
 *
 * 播放模型（问题 2 改造）：
 *  - 显示文本 = 流式文本 ?? 当前行文本；分句实时计算；
 *  - 流式期间内容增量即打字机，句子按节奏自动推进；
 *  - 流式结束转定稿行（同源文本）不重置句位置；
 *  - 手动模式打字机逐字，点击/◀▶ 翻页；配置面板（问题 3）控制各项开关。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { snapshotToScript, splitIntoSentences } from './adapter.ts'
import { DEEPSEEK_MANIFEST } from './manifest.ts'
import { createExpressionPlayback } from './expressionPlayback.ts'
import { initialExpressionState, type ExpressionState } from './expressionDirector.ts'
import { loadSettings, saveSettings, type GalgameSettings } from './settings.ts'
import type {
  ChatSnapshotView,
  PendingApprovalWait,
  PendingInteraction,
  PendingQuestionWait,
  SessionSnapshotView,
  SessionStatusMap,
} from './types.ts'
import { Stage } from './Stage.tsx'
import { DialogueBox } from './DialogueBox.tsx'
import { ChoicePanel } from './ChoicePanel.tsx'
import { ApprovalPanel } from './ApprovalPanel.tsx'
import { Backlog } from './Backlog.tsx'
import { GalgameInput } from './GalgameInput.tsx'
import { SettingsPanel } from './SettingsPanel.tsx'
import { LayerBoundary } from './LayerBoundary.tsx'
import { markdownLabels } from './markdownLabels.ts'
import styles from './galgame.module.css'

/** 选择器钩子的通用形状（框架注入的标准 props）。 */
type SelectorHook<Snapshot> = <T>(selector: (snapshot: Snapshot) => T) => T

export interface GalgameViewProps {
  /** 会话 id（conversation.view 标准注入）。 */
  sessionId: string
  /** Chat 目标选择器（session 标准注入，ui-chat 提供）。 */
  useChat?: SelectorHook<ChatSnapshotView>
  /** 会话生命周期选择器（session 标准注入，ui-session 提供）。 */
  useSession?: SelectorHook<SessionSnapshotView>
  /** 会话 UI 状态选择器（全局标准注入，ui-session 提供）。 */
  useSessionStatus?: SelectorHook<SessionStatusMap>
  /** 排队发送（插件 inject 提供：新回合）。 */
  sendTurn: (text: string) => Promise<boolean>
  /** 引导/插话发送（插件 inject 提供：running 时 steer）。 */
  sendSteer: (text: string) => Promise<boolean>
  /** GalGame 模式激活开关（插件 inject 提供）：挂载时屏蔽默认 composer，卸载恢复。 */
  setGalgameMode: (active: boolean) => void
  /** locale 翻译（注册时声明了 NS 命名空间）。 */
  t: (key: string, params?: Record<string, unknown>) => string
}

/** 自动模式每单元停留 ms（需求 10）。 */
const AUTO_ADVANCE_MS = 950
/** 流式输出时句推进节奏 ms。 */
const STREAM_ADVANCE_MS = 900

/** 无 Chat 目标时的空快照（ui-chat 未装载时兜底，保证钩子调用形状不变）。 */
const EMPTY_CHAT: ChatSnapshotView = { legacy: { nodes: [], partial: null } }
/** 稳定的空节点数组（选择器必须返回稳定引用，否则订阅侧会反复重渲染）。 */
const EMPTY_NODES: readonly never[] = EMPTY_CHAT.legacy.nodes
/** 无会话快照时的空值（理论上 view 只在本会话内挂载）。 */
const EMPTY_SESSION: SessionSnapshotView = {
  sessionId: '',
  running: false,
  openState: 'open',
  openError: null,
  blank: true,
  hasMore: false,
  loadingOlder: false,
}
/** 无状态表时的空值。 */
const EMPTY_STATUS: SessionStatusMap = new Map()

/** 常量选择器钩子：props 缺失时的稳定替身（不构成条件调用 hook）。 */
function constChatHook<T>(selector: (snapshot: ChatSnapshotView) => T): T {
  return selector(EMPTY_CHAT)
}
function constSessionHook<T>(selector: (snapshot: SessionSnapshotView) => T): T {
  return selector(EMPTY_SESSION)
}
function constStatusHook<T>(selector: (status: SessionStatusMap) => T): T {
  return selector(EMPTY_STATUS)
}

/** pendingInteraction → 提问等待载体。 */
function asQuestionWait(value: PendingInteraction | undefined): PendingQuestionWait | undefined {
  if (value === undefined) return undefined
  const kind = (value as { kind?: unknown }).kind
  if (kind !== 'question' && kind !== 'plan-review') return undefined
  return value as PendingQuestionWait
}

/** pendingInteraction → 审批等待载体。 */
function asApprovalWait(value: PendingInteraction | undefined): PendingApprovalWait | undefined {
  if (value === undefined) return undefined
  if ((value as { kind?: unknown }).kind !== 'approval') return undefined
  return value as PendingApprovalWait
}

export function GalgameView(props: GalgameViewProps) {
  return <GalgameSession key={props.sessionId} {...props} />
}

function GalgameSession({
  sessionId,
  useChat,
  useSession,
  useSessionStatus,
  sendTurn,
  sendSteer,
  setGalgameMode,
  t,
}: GalgameViewProps) {
  // props 缺失时用模块级常量替身：hook 身份在渲染之间稳定，不违反 hooks 规则。
  const chatHook = useChat ?? constChatHook
  const sessionHook = useSession ?? constSessionHook
  const statusHook = useSessionStatus ?? constStatusHook

  const nodes = chatHook((snapshot) => snapshot?.legacy?.nodes ?? EMPTY_NODES)
  const partial = chatHook((snapshot) => snapshot?.legacy?.partial ?? null)
  const running = sessionHook((snapshot) => snapshot?.running ?? false)
  const openState = sessionHook((snapshot) => snapshot?.openState ?? 'open')
  const pending = statusHook((statuses) => statuses?.get?.(sessionId)?.pendingInteraction as PendingInteraction | undefined)

  // 提问 / 审批等待（供自动推进暂停判断，需在 effect 前定义）。
  const questionWait = asQuestionWait(pending)
  const approvalWait = asApprovalWait(pending)

  // GalGame 模式激活：屏蔽默认 composer（含官方提问/审批卡）；卸载时恢复。
  useEffect(() => {
    setGalgameMode(true)
    return () => setGalgameMode(false)
  }, [setGalgameMode])

  // 配置（localStorage 持久化）。
  const [settings, setSettings] = useState<GalgameSettings>(() => loadSettings())
  const updateSettings = (patch: Partial<GalgameSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch }
      saveSettings(next)
      return next
    })
  }

  // Markdown 组件文案：`MarkdownText` 的 labels 是必填项，漏传时历史面板一旦
  // 渲染到代码块就会抛错并卸载整棵视图（白屏）。同语言下引用稳定，见模块注释。
  const mdLabels = markdownLabels(t)

  const { settled, streaming } = useMemo(() => snapshotToScript(nodes ?? [], partial ?? null), [nodes, partial])

  // 舞台播放全部台词行：用户输入也显示在对话框里（问题 3，「我」+ 内容整段）。
  const settledLines = settled

  // 播放位置：settledLines 索引 + 句索引。
  const [lineIdx, setLineIdx] = useState(() => settledLines.length - 1)
  const followedCount = useRef(settledLines.length)
  const navigationRef = useRef(false)
  const currentLineIdx = followedCount.current === settledLines.length ? lineIdx : settledLines.length - 1
  const [unitIdx, setUnitIdx] = useState(0)
  const [mode, setMode] = useState<'auto' | 'manual'>('manual')
  const [backlogOpen, setBacklogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 新台词到达 → 自动跟随到最新（回退翻页是临时回看）。
  useEffect(() => {
    followedCount.current = settledLines.length
    if (settledLines.length === 0) {
      setLineIdx(-1)
      return
    }
    setLineIdx(settledLines.length - 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledLines.length])

  const line = currentLineIdx >= 0 && currentLineIdx < settledLines.length ? settledLines[currentLineIdx] : null
  const isAssistantLine = line?.speaker === 'assistant'

  // 统一显示文本：流式优先，否则当前行文本。分句实时计算（问题 2）。
  const displayText = streaming !== null ? streaming.text : (line?.text ?? '')
  const sentences = useMemo(() => splitIntoSentences(displayText), [displayText])
  const lineKey = streaming !== null ? streaming.key : (line?.key ?? null)
  const playbackKey = streaming?.playbackKey ?? line?.playbackKey ?? 'empty'
  const playbackUnitKey = `${sessionId}:${playbackKey}:${unitIdx}`

  // 行切换：streaming → 定稿（同源文本）不重置句位置；否则重置到 0。
  // （bug 修复：lastStreamingRef 必须实时跟随流式文本，否则结束后误判
  //   「不同源」强制翻回第一句。）
  const lastStreamingRef = useRef<string | null>(null)
  useEffect(() => {
    if (streaming !== null) lastStreamingRef.current = streaming.text
  }, [streaming])
  useEffect(() => {
    if (navigationRef.current) { navigationRef.current = false; return }
    if (streaming !== null) { setUnitIdx(0); return }
    const sameSource = line !== null && lastStreamingRef.current !== null && line.text === lastStreamingRef.current
    lastStreamingRef.current = null
    if (!sameSource) setUnitIdx(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackKey])

  // 播放位置持久化（bug 修复：切换视图/重挂后停在上次翻到的地方）。
  const PLAYBACK_KEY = `dsh.galgame.playback.${sessionId}`
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current || settledLines.length === 0) return
    restoredRef.current = true
    try {
      const raw = localStorage.getItem(PLAYBACK_KEY)
      if (raw === null) return
      const saved = JSON.parse(raw) as { lineKey?: string; unitIdx?: number }
      if (saved && typeof saved.lineKey === 'string' && typeof saved.unitIdx === 'number') {
        const index = settledLines.findIndex((item) => item.key === saved.lineKey)
        if (index >= 0) {
          navigationRef.current = index !== currentLineIdx
          setLineIdx(index)
          setUnitIdx(saved.unitIdx)
        }
      }
    } catch {
      // 忽略损坏的持久化
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledLines])
  useEffect(() => {
    if (streaming !== null || lineKey === null) return
    try {
      localStorage.setItem(PLAYBACK_KEY, JSON.stringify({ lineKey, unitIdx }))
    } catch {
      // 忽略持久化失败
    }
  }, [lineKey, unitIdx, streaming])

  // 自动模式：模型运行中且开启配置时默认自动（需求 10）；流式期间持续 auto。
  // 用户行（自己说的话）不参与自动推进。
  useEffect(() => {
    if (!settings.autoMode) {
      setMode('manual')
      return
    }
    if (streaming !== null) {
      setMode('auto')
      return
    }
    if (running && isAssistantLine && lineIdx === settledLines.length - 1) {
      setMode('auto')
      return
    }
    if (!running) setMode('manual')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, streaming !== null, lineIdx, settledLines.length, settings.autoMode, isAssistantLine])

  // 流式推进：句子按节奏自动前进（用户点击后 manual 暂停）。
  // 选择框（question/approval）弹出时暂停自动翻页，让用户自己点击切换（优化）。
  useEffect(() => {
    if (streaming === null || mode !== 'auto') return
    if (questionWait !== undefined || approvalWait !== undefined) return
    if (unitIdx >= sentences.length - 1) return
    const timer = setTimeout(() => {
      setUnitIdx((index) => Math.min(index + 1, sentences.length - 1))
    }, STREAM_ADVANCE_MS)
    return () => clearTimeout(timer)
  }, [streaming, mode, unitIdx, sentences.length, questionWait, approvalWait])

  // 定稿行自动推进（仅 assistant 行）；选择框弹出时同样暂停。
  useEffect(() => {
    if (mode !== 'auto' || streaming !== null || !isAssistantLine || sentences.length === 0) return
    if (questionWait !== undefined || approvalWait !== undefined) return
    if (unitIdx >= sentences.length - 1) return
    const timer = setTimeout(() => {
      setUnitIdx((index) => Math.min(index + 1, sentences.length - 1))
    }, AUTO_ADVANCE_MS)
    return () => clearTimeout(timer)
  }, [mode, streaming, unitIdx, sentences.length, isAssistantLine, questionWait, approvalWait])

  // 选择框弹出时强制回到手动模式（停止自动，用户自己点击切换）。
  useEffect(() => {
    if (questionWait !== undefined || approvalWait !== undefined) setMode('manual')
  }, [questionWait, approvalWait])

  /** 下一段：自动中点击 = 接管并推进一段（流式时「出一个翻一个」）；手动 = 前进；行尾则下一行。 */
  const next = () => {
    if (mode === 'auto') setMode('manual')
    if (sentences.length === 0) return
    if (unitIdx < sentences.length - 1) {
      setUnitIdx((index) => index + 1)
      return
    }
    if (streaming === null && lineIdx < settledLines.length - 1) {
      navigationRef.current = true
      setLineIdx((index) => index + 1)
      setUnitIdx(0)
    }
  }

  /** 上一句：行内回退；行首则上一行末尾。 */
  const prev = () => {
    setMode('manual')
    if (unitIdx > 0) {
      setUnitIdx((index) => index - 1)
      return
    }
    if (streaming === null && lineIdx > 0) {
      navigationRef.current = true
      const previous = settledLines[lineIdx - 1]
      setLineIdx((index) => index - 1)
      setUnitIdx(previous !== undefined ? previous.sentences.length - 1 : 0)
    }
  }

  const canPrev = (lineIdx > 0 || unitIdx > 0) && streaming === null
  const position = sentences.length > 0 ? { index: unitIdx, total: sentences.length } : null

  // 滚轮跳转：本次切换跳过打字机（体验优化 1：滚轮快速切换时直接显示整句）。
  const [instantJump, setInstantJump] = useState(false)
  useEffect(() => {
    if (instantJump) setInstantJump(false)
  }, [instantJump])

  // 弹跳：配置开关 + 行/句变化触发（每说一句话跳动一次）；用户行不弹。
  const bounceKey = settings.bounce && (streaming !== null ? streaming.text.trim() !== '' : isAssistantLine)
    ? playbackUnitKey : null

  // 思考气泡：仅在流式思考期间显示（实时滚动思维链）；
  // 提问/审批等待时 streaming 为 null → 收起；最终输出定稿后也收起。
  const reasoning = settings.bubble && streaming !== null ? streaming.reasoning : undefined

  const displayUnit = sentences[unitIdx] ?? ''
  const displayName = streaming !== null ? streaming.name : (line?.name ?? '')
  const displayIsUser = streaming === null && line?.speaker === 'user'
  const thinkingOnly = running && streaming !== null && streaming.text.trim() === '' && Boolean(streaming.reasoning?.trim())
  const expressionPlayback = useMemo(() => createExpressionPlayback(), [])
  const [expression, setExpression] = useState<{ key: string; state: ExpressionState }>(
    () => ({ key: '', state: initialExpressionState() }),
  )
  const unitComplete = streaming === null || unitIdx < sentences.length - 1
  const onVisibleText = useCallback((text: string, finished: boolean) => {
    if (displayIsUser || thinkingOnly || !settings.expressions || text === '') return
    const state = expressionPlayback.update(playbackKey, unitIdx, text, finished && unitComplete)
    setExpression({ key: playbackUnitKey, state })
  }, [displayIsUser, thinkingOnly, settings.expressions, expressionPlayback, playbackKey, unitIdx, playbackUnitKey, unitComplete])
  const activeExpression = expression.key === playbackUnitKey ? expression.state : null
  const portrait = !settings.expressions || displayIsUser ? 'neutral'
    : thinkingOnly ? 'thinking' : activeExpression?.portrait ?? 'neutral'

  // 滚轮快速切换上下句（优化 1）。
  const rootRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef(next)
  nextRef.current = next
  const prevRef = useRef(prev)
  prevRef.current = prev
  useEffect(() => {
    const root = rootRef.current
    if (root === null) return
    const onWheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null
      const scroller = target?.closest?.('[data-gg-scroll]') as HTMLElement | null
      if (scroller !== null && scroller.scrollHeight > scroller.clientHeight) return
      event.preventDefault()
      // 滚轮跳转：跳过打字机（instantJump 传给 DialogueBox）
      if (event.deltaY > 0) {
        setInstantJump(true)
        nextRef.current()
      } else if (event.deltaY < 0) {
        setInstantJump(true)
        prevRef.current()
      }
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => root.removeEventListener('wheel', onWheel)
  }, [])

  // 输入条发送：running 时 steer 插话，空闲时排队新回合（0.2.0-rc.2 直发 prompt）。
  const send = useCallback(
    async (text: string): Promise<boolean> => (running ? sendSteer(text) : sendTurn(text)),
    [running, sendSteer, sendTurn],
  )

  // 加载中。
  if (openState === 'loading') {
    return (
      <div className={styles.root}>
        <div className={styles.emptyState}>{t('galgame.loading')}</div>
      </div>
    )
  }

  const empty =
    settledLines.length === 0 &&
    streaming === null &&
    questionWait === undefined &&
    approvalWait === undefined

  return (
    <div className={styles.root} ref={rootRef} data-gg-debug={settings.debug ? 'true' : 'false'}
      data-gg-expression={portrait} data-gg-expression-reason={settings.debug ? activeExpression?.decision.reason : undefined}>
      <div className={styles.topBar}>
        <span className={styles.topTitle}>{t('view.galgame')}</span>
        <div className={styles.topActions}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setSettingsOpen(true)}
            aria-label={t('galgame.settings.title')}
            title={t('galgame.settings.title')}
          >
            ⚙
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setBacklogOpen(true)}
            aria-label={t('galgame.backlog')}
            title={t('galgame.backlog')}
          >
            {t('galgame.backlog')}
          </button>
        </div>
      </div>

      <Stage
        character={DEEPSEEK_MANIFEST}
        portrait={portrait}
        bounceKey={bounceKey}
        reasoning={reasoning}
        thinking={thinkingOnly}
        shift={questionWait !== undefined || approvalWait !== undefined}
        onClick={next}
      >
        {/* 提问 / 审批：以立绘为原点绑定的浮层插槽（仅调试模式可拖拽调整位置） */}
        {questionWait !== undefined ? <ChoicePanel wait={questionWait} draggable={settings.debug} t={t} /> : null}
        {approvalWait !== undefined ? <ApprovalPanel wait={approvalWait} draggable={settings.debug} t={t} /> : null}
      </Stage>

      {empty ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateTitle}>{t('galgame.empty.title')}</div>
          <div className={styles.emptyStateBody}>{t('galgame.empty.body')}</div>
        </div>
      ) : null}

      {/* 底部浮层：对话框 + 输入条，盖在立绘之上（问题 2），不挤压立绘 */}
      <div className={styles.stageOverlay}>
        {empty ? null : (
          <DialogueBox
            key={playbackUnitKey}
            name={displayName}
            isUser={displayIsUser}
            unit={displayUnit}
            lineKey={playbackKey}
            onVisibleText={onVisibleText}
            autoMode={mode === 'auto' && streaming === null}
            streaming={streaming !== null}
            typeSpeed={settings.typeSpeed}
            labels={mdLabels}
            instant={instantJump}
            onNext={next}
            onPrev={prev}
            canPrev={canPrev}
            position={position}
          />
        )}
        <GalgameInput send={send} running={running} t={t} />
      </div>

      {/* 历史 / 设置面板（root 级浮层）。各自套边界：任一浮层渲染失败只收起
          自己，不能连带卸载舞台与输入条（否则就是一整页白屏）。 */}
      {backlogOpen ? (
        <LayerBoundary
          message={t('galgame.layer.error')}
          closeLabel={t('galgame.layer.close')}
          onClose={() => setBacklogOpen(false)}
        >
          <Backlog lines={settled} streaming={streaming} labels={mdLabels} onClose={() => setBacklogOpen(false)} />
        </LayerBoundary>
      ) : null}
      {settingsOpen ? (
        <LayerBoundary
          message={t('galgame.layer.error')}
          closeLabel={t('galgame.layer.close')}
          onClose={() => setSettingsOpen(false)}
        >
          <SettingsPanel settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} t={t} />
        </LayerBoundary>
      ) : null}
    </div>
  )
}
