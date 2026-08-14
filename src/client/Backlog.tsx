/**
 * dsh-galgame — BacklogLayer：右上角「历史」抽屉（需求 11）。
 * 回放完整台词（用户 + 鲸鱼娘），流式中的内容以高亮追加。
 */
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ScriptLine } from './types.ts'
import styles from './galgame.module.css'

export interface BacklogProps {
  /** 已定稿台词。 */
  lines: readonly ScriptLine[]
  /** 流式中的台词（若有）。 */
  streaming: ScriptLine | null
  onClose: () => void
}

export function Backlog({ lines, streaming, onClose }: BacklogProps) {
  return (
    <div className={styles.backlogMask} onClick={onClose}>
      <div className={styles.backlogPanel} role="dialog" aria-modal="true" aria-label="对话历史" onClick={(event) => event.stopPropagation()}>
        <div className={styles.backlogHeader}>
          <span className={styles.backlogTitle}>对话历史</span>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="关闭历史">
            ✕
          </button>
        </div>
        <div className={styles.backlogList}>
          {lines.length === 0 && streaming === null ? (
            <div className={styles.backlogEmpty}>还没有对话记录</div>
          ) : (
            <>
              {lines.map((line) => (
                <div key={line.key} className={styles.backlogRow}>
                  <span className={line.speaker === 'user' ? styles.backlogNameUser : undefined}>
                    <span className={styles.backlogName}>{line.name}</span>
                  </span>
                  <span className={styles.backlogText}>
                    <MarkdownText text={line.text} />
                  </span>
                </div>
              ))}
              {streaming !== null ? (
                <div className={styles.backlogRow}>
                  <span className={styles.backlogName}>{streaming.name}</span>
                  <span className={styles.backlogStreaming}>
                    <MarkdownText text={streaming.text} />
                  </span>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
