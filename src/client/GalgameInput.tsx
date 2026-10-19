/**
 * dsh-galgame — 输入条（GalGame 风格，独立于舞台对话框）。
 *
 * 设计（用户反馈第 4 点）：
 *  - 常驻对话框下方，半透明圆角条；
 *  - 发送策略（问题 2）：任务执行（running）时默认「引导/插话发送」（steer，
 *    经 session.prompt 直达运行中的 agent），空闲时排队发送新回合；
 *  - 0.2.0-rc.2 适配：GalGame 模式接管了 `conversation.composer` 链，默认输入卡
 *    不挂载，输入草稿机（Lexical 编辑器）不可用，故发送不再经 `inputActions`，
 *    而是由父级注入的 `send`（内部直发 `session.prompt`）完成；
 *  - 发送后内容只进历史（Backlog），不占用舞台对话框；
 *  - 随输入自动扩展高度（最高 120px，超出内部滚动）。
 */
import { useEffect, useRef, useState } from 'react'
import styles from './galgame.module.css'

export interface GalgameInputProps {
  /** 发送：running 时 steer 插话，空闲时排队新回合（父级按运行态分流）。 */
  send: (text: string) => Promise<boolean>
  /** 当前是否任务执行中。 */
  running: boolean
  t: (key: string, params?: Record<string, unknown>) => string
}

/** 输入区最大高度 px（超出滚动）。 */
const MAX_HEIGHT = 120

export function GalgameInput({ send, running, t }: GalgameInputProps) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const fieldRef = useRef<HTMLTextAreaElement>(null)

  // 随内容自动扩展高度（问题 1）：先归零再量 scrollHeight，避免只增不减。
  const resize = () => {
    const el = fieldRef.current
    if (el === null) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }

  useEffect(resize, [draft])

  const submit = async () => {
    const text = draft.trim()
    if (text === '' || sending) return
    setSending(true)
    try {
      const ok = await send(text)
      if (ok) setDraft('')
    } finally {
      setSending(false)
    }
  }

  const canSend = !sending && draft.trim() !== ''

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
              void submit()
            }
          }}
        />
        <button
          type="button"
          className={styles.inputSend}
          disabled={!canSend}
          onClick={() => void submit()}
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
