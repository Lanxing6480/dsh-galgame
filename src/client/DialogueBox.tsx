/**
 * dsh-galgame — DialogueLayer：名字牌 + 打字机对话框 + 翻页推进。
 *
 * 播放模型（问题 2 改造）：
 *  - 显示「当前句」（unit），打字机逐字显示；打满后切 MarkdownText 渲染
 *    （列表/代码/加粗等格式正确呈现）；
 *  - 流式期间（streaming=true）：内容实时增量即是打字机效果，整句直接显示；
 *  - 手动模式打字机逐字；自动模式整句显示（由上层定时推进）；
 *  - ◀ ▶ 前后翻页（含跨行回退），文本框半透明自适应长度。
 */
import { useEffect, useRef, useState } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import styles from './galgame.module.css'

export interface DialogueBoxProps {
  /** 说话者显示名（「你」/「鲸鱼娘」）。 */
  name: string
  /** 说话者是否为用户。 */
  isUser: boolean
  /** 当前句文本。 */
  unit: string
  /** 当前台词行稳定 key（换行时重置打字机）。 */
  lineKey: string | null
  /** 是否自动模式（需求 10）：整句显示，不逐字。 */
  autoMode: boolean
  /** 是否流式输出中：内容实时增量即打字机，整句直接显示。 */
  streaming: boolean
  /** 打字机速度（ms/帧），越小越快。 */
  typeSpeed: number
  /** 本次切换是否跳过打字机（滚轮跳转，体验优化 1）。 */
  instant?: boolean
  /** 点击/▶ 推进下一单元。 */
  onNext: () => void
  /** ◀ 回退上一单元（可跨行）。 */
  onPrev: () => void
  /** 是否有上一单元可回退。 */
  canPrev: boolean
  /** 当前单元位置（用于进度提示）。 */
  position: { index: number; total: number } | null
}

/** 打字机每帧追加字符数。 */
const TYPE_STEP = 2

export function DialogueBox({ name, isUser, unit, lineKey, autoMode, streaming, typeSpeed, instant = false, onNext, onPrev, canPrev, position }: DialogueBoxProps) {
  const [shown, setShown] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevUnitRef = useRef<string | null>(null)

  // 换句（unit 变化）→ 重置打字机：
  //  - 流式续写同一句（新 unit 以旧 unit 为前缀）→ 保持进度继续打
  //  - instant（滚轮跳转）→ 直接整句显示（跳过打字机）
  //  - 否则 → 从 0 开始
  useEffect(() => {
    const previous = prevUnitRef.current
    prevUnitRef.current = unit
    if (previous !== null && unit.startsWith(previous) && unit.length > previous.length) {
      // 同一句流式续写：保持已显示部分，继续打到新长度。
      return
    }
    setShown(instant ? unit.length : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit])

  // 打字机 interval（仅手动模式且非流式）。
  useEffect(() => {
    if (autoMode || streaming) return
    if (timerRef.current !== null) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setShown((current) => {
        if (current >= unit.length) {
          if (timerRef.current !== null) clearInterval(timerRef.current)
          return current
        }
        return Math.min(current + TYPE_STEP, unit.length)
      })
    }, Math.max(8, typeSpeed))
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode, streaming, lineKey, unit])

  // 自动/流式/用户行：整句直接显示（用户自己说的话不打字机，问题 3）。
  const effectiveShown = autoMode || streaming || isUser ? unit.length : shown
  const finished = effectiveShown >= unit.length
  const hasText = unit.length > 0
  // 打字机阶段也渲染 Markdown（streaming 模式容忍不完整语法）：
  // 字号/格式从一开始就是渲染好的，不再「先原文后渲染」（问题 1）。
  const partialText = unit.slice(0, effectiveShown)
  const typing = !finished && !streaming

  // 点击推进，但交互元素（复制按钮/链接/输入框等）不触发翻页（bug 修复）。
  const handleClick = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement | null
    if (target !== null && typeof target.closest === 'function') {
      const interactive = target.closest('button, a, input, textarea, select, [role="button"], [contenteditable="true"]')
      if (interactive !== null) return
    }
    onNext()
  }

  return (
    <div className={styles.dialogueArea}>
      <span className={isUser ? `${styles.namePlate} ${styles.namePlateUser}` : styles.namePlate}>{name}</span>
      <div className={styles.dialogueBox} onClick={handleClick} role="button" tabIndex={0} aria-label="点击继续" data-gg-scroll="">
        {hasText ? (
          <div className={typing ? styles.dialogueTyping : styles.dialogueBody}>
            <MarkdownText text={partialText} streaming={typing || streaming} />
          </div>
        ) : (
          <span className={styles.dialoguePlaceholder}>&nbsp;</span>
        )}
        <div className={styles.dialogueControls} onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className={styles.pageButton}
            onClick={onPrev}
            disabled={!canPrev || streaming}
            aria-label="上一句"
            title="上一句"
          >
            ◀
          </button>
          {position !== null ? (
            <span className={styles.pageProgress}>
              {position.total > 1 ? `${position.index + 1} / ${position.total}` : ''}
            </span>
          ) : null}
          {streaming ? (
            <span className={styles.autoHint}>说话中</span>
          ) : autoMode ? (
            <span className={styles.autoHint}>自动</span>
          ) : null}
          <button
            type="button"
            className={styles.pageButton}
            onClick={onNext}
            disabled={streaming}
            aria-label="下一句"
            title="下一句"
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  )
}
