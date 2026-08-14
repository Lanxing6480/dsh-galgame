/**
 * dsh-galgame — 输入条（GalGame 风格，独立于舞台对话框）。
 *
 * 设计（用户反馈第 4 点）：
 *  - 常驻对话框下方，半透明圆角条；
 *  - 发送策略（问题 2）：任务执行（running）时默认「引导/插话发送」（steer，
 *    经 session.prompt 直达运行中的 agent），而非排队发送；空闲时走标准
 *    inputActions 发送；
 *  - 发送后内容只进历史（Backlog），不占用舞台对话框；
 *  - 随输入自动扩展高度（最高 120px，超出内部滚动）。
 */
import { useEffect, useRef, useState } from 'react'
import styles from './galgame.module.css'

export interface GalgameInputProps {
  /** 会话输入状态选择器（标准注入 useInput）。 */
  useInput: <T>(selector: (state: { draft: string; phase: string }) => T) => T
  /** 输入动作（标准注入 inputActions：setDraft / submit / addImages …）。 */
  inputActions: {
    setDraft(text: string): void
    submit(): void
  }
  /** 引导/插话发送（inject 提供；running 时使用）。 */
  sendSteer: (text: string) => Promise<boolean>
  /** 当前是否任务执行中。 */
  running: boolean
  t: (key: string, params?: Record<string, unknown>) => string
}

/** 输入区最大高度 px（超出滚动）。 */
const MAX_HEIGHT = 120

export function GalgameInput({ useInput, inputActions, sendSteer, running, t }: GalgameInputProps) {
  // 本地镜像草稿（提交时同步给 inputActions，避免每次按键都触发快照重渲染）。
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const busy = useInput((state) => state.phase === 'submitting' || state.phase === 'adjudicating')

  // 随内容自动扩展高度（问题 1）：先归零再量 scrollHeight，避免只增不减。
  const resize = () => {
    const el = fieldRef.current
    if (el === null) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }

  useEffect(resize, [draft])

  const send = async () => {
    const text = draft.trim()
    if (text === '' || busy || sending) return
    if (running) {
      // 任务执行中：默认引导/插话发送（steer）。
      setSending(true)
      try {
        const ok = await sendSteer(text)
        if (ok) setDraft('')
      } finally {
        setSending(false)
      }
      return
    }
    // 空闲：标准发送。
    inputActions.setDraft(text)
    inputActions.submit()
    setDraft('')
  }

  const canSend = !busy && !sending && draft.trim() !== ''

  return (
    <div className={styles.inputArea} onClick={(event) => event.stopPropagation()}>
      <div className={styles.inputBox}>
        <textarea
          ref={fieldRef}
          className={styles.inputField}
          data-gg-scroll=""
          value={draft}
          rows={1}
          placeholder={running ? t('galgame.input.placeholderRunning') : t('galgame.input.placeholder')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
        />
        <button
          type="button"
          className={styles.inputSend}
          disabled={!canSend}
          onClick={() => void send()}
          aria-label={t('galgame.input.send')}
          title={t('galgame.input.send')}
        >
          ➤
        </button>
      </div>
      <span className={styles.inputHint}>{running ? t('galgame.input.hintRunning') : t('galgame.input.hint')}</span>
    </div>
  )
}
