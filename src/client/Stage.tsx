/**
 * dsh-galgame — CharacterLayer：立绘渲染（差分切换 + 说话弹跳 + 思考气泡 + 浮层插槽）。
 *
 * 参考文档：人物 anchor bottom-center，差分切换 120ms crossfade。
 * 弹跳：bounceKey 变化时用 ref 强制重触发 wrapper 的弹跳动画，绝不重挂 img；
 * keyframes 保留 translateX(-50%)（弹跳后立绘保持居中）。
 * 思考气泡与选项浮层（children）：以立绘为原点偏移，支持拖拽 + 位置持久化，
 * 立绘移位（shift）时浮层跟随。
 */
import { useEffect, useRef, type ReactNode } from 'react'
import type { CharacterManifest } from './types.ts'
import { portraitUrl } from './manifest.ts'
import { useHostDrag } from './useHostDrag.ts'
import styles from './galgame.module.css'

export interface StageProps {
  /** 当前角色 manifest。 */
  character: CharacterManifest
  /** 当前差分 ID（neutral / smile / thinking / angry …）。 */
  portrait: string
  /** 弹跳触发 key：行+单元变化即重触发弹跳。 */
  bounceKey: string | null
  /** 当前台词的思维链文本（非空时显示思考气泡）。 */
  reasoning?: string
  /** 流式输出中（显示思考徽标）。 */
  thinking?: boolean
  /** 选项/审批等待时立绘自动右移（给左侧让位）。 */
  shift?: boolean
  /** 全屏点击推进。 */
  onClick?: () => void
  /** 浮层插槽：选项/审批框渲染在立绘容器内（以立绘为原点绑定）。 */
  children?: ReactNode
}

export function Stage({ character, portrait, bounceKey, reasoning, thinking, shift = false, onClick, children }: StageProps) {
  const src = portraitUrl(portrait)
  const showBubble = reasoning !== undefined && reasoning.trim() !== ''
  const bounceRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)

  // 气泡拖拽（以立绘容器为坐标系，位置持久化）。
  const bubbleDrag = useHostDrag('dsh.galgame.bubblePos')

  // bounceKey 变化 → 重触发弹跳动画（强制 reflow，不重挂 img → 不闪烁）。
  useEffect(() => {
    const el = bounceRef.current
    if (el === null || bounceKey === null) return
    el.classList.remove(styles.bouncing)
    // eslint-disable-next-line no-void
    void el.offsetWidth
    el.classList.add(styles.bouncing)
  }, [bounceKey])

  // 思考气泡：reasoning 变化时自动滚动到底部（流式滚动效果）。
  useEffect(() => {
    const el = bubbleRef.current
    if (el === null) return
    el.scrollTop = el.scrollHeight
  }, [reasoning])

  return (
    <div className={styles.stage} onClick={onClick}>
      {thinking && !showBubble ? (
        <div className={styles.thinkingBadge} role="status">
          <span className={styles.thinkingDot} />
          <span className={styles.thinkingDot} />
          <span className={styles.thinkingDot} />
          <span style={{ marginLeft: 6 }}>说话中…</span>
        </div>
      ) : null}

      {/* 立绘位移层：正常居中（translateX 0），选项等待时右移 */}
      <div className={shift ? styles.portraitShifted : styles.portraitShift}>
        {/* 弹跳层：只做 transform 动画，img 不重挂 */}
        <div ref={bounceRef} className={styles.portraitWrap}>
          {/* 思考气泡：以立绘为原点偏移，支持拖拽调整位置 */}
          {showBubble ? (
            <div
              className={styles.thinkingBubble}
              role="note"
              style={bubbleDrag.style}
              onMouseDown={bubbleDrag.onMouseDown}
              onClick={(event) => event.stopPropagation()}
            >
              <div className={styles.thinkingBubbleTitle}>鲸鱼娘在想…</div>
              {/* ref 挂在滚动容器上（自动滚到底 + 滚轮可滚动） */}
              <div ref={bubbleRef} className={styles.thinkingBubbleText} data-gg-scroll="">
                {reasoning}
              </div>
            </div>
          ) : null}
          {/* key=portrait：仅差分切换时重挂，触发淡入（crossfade） */}
          <img
            key={portrait}
            className={styles.portrait}
            src={src}
            alt={`${character.displayName}（${portrait}）`}
            draggable={false}
          />
          {/* 浮层插槽：选项/审批框，以立绘为原点绑定（立绘移位时跟随） */}
          {children}
        </div>
      </div>
      <div className={styles.stageWatermark} aria-hidden="true">
        {character.displayName} · GalGame
      </div>
    </div>
  )
}
