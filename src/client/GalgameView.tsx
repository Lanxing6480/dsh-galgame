/**
 * dsh-galgame — GalgameView：conversation.view 的「galgame」标签视图根组件。
 *
 * 编排（纯展示层，零会话写入）：
 *  快照 → adapter → 播放位置（分句/打字机/自动模式/配置）→ 各层
 *
 * 播放模型（问题 2 改造）：
 *  - 显示文本 = 流式文本 ?? 当前行文本；分句实时计算；
 *  - 流式期间内容增量即打字机，句子按节奏自动推进；
 *  - 流式结束转定稿行（同源文本）不重置句位置；
 *  - 手动模式打字机逐字，点击/◀▶ 翻页；配置面板（问题 3）控制各项开关。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { snapshotToScript, splitIntoSentences } from './adapter.ts'
import { DEEPSEEK_MANIFEST } from './manifest.ts'
import { loadSettings, saveSettings, type GalgameSettings } from './settings.ts'
import { Stage } from './Stage.tsx'
import { DialogueBox } from './DialogueBox.tsx'
import { ChoicePanel } from './ChoicePanel.tsx'
import { ApprovalPanel } from './ApprovalPanel.tsx'
import { Backlog } from './Backlog.tsx'
import { GalgameInput } from './GalgameInput.tsx'
import { SettingsPanel } from './SettingsPanel.tsx'
import styles from './galgame.module.css'

export interface GalgameViewProps {
  /** 会话 id（conversation.view 标准注入）。 */
  sessionId: string
  /** 会话快照选择器（conversation.view 标准注入）。 */
  useSession: <T>(selector: (snapshot: any) => T) => T
  /** 输入状态选择器（会话标准注入）。 */
  useInput: <T>(selector: (state: { draft: string; phase: string }) => T) => T
  /** 输入动作（会话标准注入）。 */
  inputActions: { setDraft(text: string): void; submit(): void }
  /** 引导/插话发送（插件 inject 提供，问题 2：任务执行中默认 steer）。 */
  sendSteer: (text: string) => Promise<boolean>
  /** GalGame 模式激活开关（插件 inject 提供）：挂载时屏蔽默认提问面板，卸载恢复。 */
  setGalgameMode: (active: boolean) => void
  /** locale 翻译（注册时声明了 NS 命名空间）。 */
  t: (key: string, params?: Record<string, unknown>) => string
}

/** 自动模式每单元停留 ms（需求 10）。 */
const AUTO_ADVANCE_MS = 950
/** 流式输出时句推进节奏 ms。 */
const STREAM_ADVANCE_MS = 900

export function GalgameView({ sessionId, useSession, useInput, inputActions, sendSteer, setGalgameMode, t }: GalgameViewProps) {
  const nodes = useSession((snapshot) => snapshot.nodes)
  const partial = useSession((snapshot) => snapshot.partial)
  const pending = useSession((snapshot) => snapshot.pending)
  const running = useSession((snapshot) => snapshot.running)
  const openState = useSession((snapshot) => snapshot.openState)

  // GalGame 模式激活：屏蔽默认提问/审批面板（皮肤兼容）；卸载时恢复。
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

  const { settled, streaming } = useMemo(() => snapshotToScript(nodes, partial), [nodes, partial])

  // 舞台播放全部台词行：用户输入也显示在对话框里（问题 3，「我」+ 内容整段）。
  const settledLines = settled

  // 播放位置：settledLines 索引 + 句索引。
  const [lineIdx, setLineIdx] = useState(-1)
  const [unitIdx, setUnitIdx] = useState(0)
  const [mode, setMode] = useState<'auto' | 'manual'>('manual')
  const [backlogOpen, setBacklogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 新台词到达 → 自动跟随到最新（回退翻页是临时回看）。
  useEffect(() => {
    if (settledLines.length === 0) {
      setLineIdx(-1)
      return
    }
    setLineIdx(settledLines.length - 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledLines.length])

  const line = lineIdx >= 0 && lineIdx < settledLines.length ? settledLines[lineIdx] : null
  const isAssistantLine = line?.speaker === 'assistant'

  // 统一显示文本：流式优先，否则当前行文本。分句实时计算（问题 2）。
  const displayText = streaming !== null ? streaming.text : (line?.text ?? '')
  const sentences = useMemo(() => splitIntoSentences(displayText), [displayText])
  const lineKey = streaming !== null ? streaming.key : (line?.key ?? null)

  // 行切换：streaming → 定稿（同源文本）不重置句位置；否则重置到 0。
  const lastStreamingRef = useRef<string | null>(null)
  useEffect(() => {
    if (streaming !== null) {
      lastStreamingRef.current = streaming.text
      return
    }
    const sameSource = line !== null && lastStreamingRef.current !== null && line.text === lastStreamingRef.current
    lastStreamingRef.current = null
    if (!sameSource) setUnitIdx(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineKey, streaming !== null])

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
  useEffect(() => {
    if (streaming === null || mode !== 'auto') return
    if (unitIdx >= sentences.length - 1) return
    const timer = setTimeout(() => {
      setUnitIdx((index) => Math.min(index + 1, sentences.length - 1))
    }, STREAM_ADVANCE_MS)
    return () => clearTimeout(timer)
  }, [streaming, mode, unitIdx, sentences.length])

  // 定稿行自动推进（仅 assistant 行）。
  useEffect(() => {
    if (mode !== 'auto' || streaming !== null || !isAssistantLine || sentences.length === 0) return
    if (unitIdx >= sentences.length - 1) return
    const timer = setTimeout(() => {
      setUnitIdx((index) => Math.min(index + 1, sentences.length - 1))
    }, AUTO_ADVANCE_MS)
    return () => clearTimeout(timer)
  }, [mode, streaming, unitIdx, sentences.length, isAssistantLine])

  /** 下一句：流式/自动中点击 = 接管；手动 = 前进一句；行尾则下一行。 */
  const next = () => {
    if (mode === 'auto') {
      setMode('manual')
      return
    }
    if (sentences.length === 0) return
    if (unitIdx < sentences.length - 1) {
      setUnitIdx((index) => index + 1)
      return
    }
    if (streaming === null && lineIdx < settledLines.length - 1) {
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

  // 提问 / 审批等待。
  const questionWait = pending.find((item: { kind: string }) => item.kind === 'question')
  const approvalWait = pending.find((item: { kind: string }) => item.kind === 'approval')

  // 弹跳：配置开关 + 行/句变化触发（每说一句话跳动一次）；用户行不弹。
  const bounceKey = settings.bounce
    ? streaming !== null
      ? `${streaming.key}-stream`
      : isAssistantLine && line !== null
        ? `${line.key}-${unitIdx}`
        : null
    : null

  // 思考气泡：仅在流式思考期间显示（实时滚动思维链）；
  // 提问/审批等待时 streaming 为 null → 收起；最终输出定稿后也收起。
  const reasoning = settings.bubble && streaming !== null ? streaming.reasoning : undefined

  const displayUnit = sentences[unitIdx] ?? ''
  const displayName = streaming !== null ? streaming.name : (line?.name ?? '')
  const displayIsUser = streaming === null && line?.speaker === 'user'

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
    <div className={styles.root} ref={rootRef} data-gg-debug={settings.debug ? 'true' : 'false'}>
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
        portrait={line?.portrait ?? 'neutral'}
        bounceKey={bounceKey}
        reasoning={reasoning}
        thinking={streaming !== null}
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
            name={displayName}
            isUser={displayIsUser}
            unit={displayUnit}
            lineKey={lineKey}
            autoMode={mode === 'auto' && streaming === null}
            streaming={streaming !== null}
            typeSpeed={settings.typeSpeed}
            instant={instantJump}
            onNext={next}
            onPrev={prev}
            canPrev={canPrev}
            position={position}
          />
        )}
        <GalgameInput useInput={useInput} inputActions={inputActions} sendSteer={sendSteer} running={running} t={t} />
      </div>

      {/* 历史 / 设置面板（root 级浮层） */}
      {backlogOpen ? (
        <Backlog lines={settled} streaming={streaming} onClose={() => setBacklogOpen(false)} />
      ) : null}
      {settingsOpen ? (
        <SettingsPanel settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} t={t} />
      ) : null}
    </div>
  )
}
