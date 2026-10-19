/**
 * dsh-galgame — ApprovalLayer：Agent 权限申请 → GalGame 风格审批框（bug 修复 1）。
 *
 * 数据来源（DSH 0.2.0-rc.2）：会话 UI 状态的 `pendingInteraction`，其 `kind`
 * 为 `'approval'` 时是 dsh-client-ui-approval 发布的 `PendingApproval`：
 * 工具名与原因在 `toolName` / `reason`，决策走 `answer('allowed-once' | 'rejected')`。
 * 非全屏卡片，浮在立绘前、对话框上方。
 */
import { useState } from 'react'
import type { PendingApprovalWait } from './types.ts'
import { useHostDrag } from './useHostDrag.ts'
import styles from './galgame.module.css'

export interface ApprovalPanelProps {
  /** pendingInteraction 里的审批载体（PendingApproval）。 */
  wait: PendingApprovalWait
  /** 关联命令文本（从工具调用 args 提取的可读命令），可选。 */
  command?: string | null
  /** 是否允许拖拽调整位置（仅调试模式开启）。 */
  draggable?: boolean
  t: (key: string, params?: Record<string, unknown>) => string
}

export function ApprovalPanel({ wait, command, draggable = false, t }: ApprovalPanelProps) {
  // 审批框拖拽：以立绘容器为坐标系，位置持久化；平时不可拖（调试模式可拖）。
  const drag = useHostDrag('dsh.galgame.approvalPos', true, null, draggable)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const decide = (outcome: 'allowed-once' | 'rejected') => {
    if (busy) return
    setBusy(true)
    setError(null)
    wait
      .answer(outcome)
      .then(() => {
        // 提交成功后该 interaction 从会话状态清除，组件随之卸载。
      })
      .catch((cause: unknown) => {
        setBusy(false)
        setError(String(cause instanceof Error ? cause.message : cause))
      })
  }

  const title = wait.reason ?? t('galgame.approval.escalation', { toolName: wait.toolName })

  return (
    <div
      className={styles.choiceHost}
      style={{ ...drag.style, cursor: draggable ? 'grab' : 'default' }}
      onMouseDown={drag.onMouseDown}
      onClick={(event) => event.stopPropagation()}
    >
      <div className={styles.approvalCard} role="alertdialog" aria-modal="true" aria-label={title}>
        <div className={styles.approvalStrip}>
          <span className={styles.approvalDot} />
          <span>{t('galgame.approval.waiting')}</span>
        </div>
        <div className={styles.approvalBody}>
          <div className={styles.approvalHeadline}>{title}</div>
          {command !== null && command !== undefined && command !== '' ? (
            <code className={styles.approvalCommand}>{command}</code>
          ) : null}
        </div>
        {error !== null ? <p className={styles.choiceError} role="status">{error}</p> : null}
        <div className={styles.approvalActions}>
          <button
            type="button"
            className={styles.choiceCancel}
            disabled={busy}
            onClick={() => decide('rejected')}
          >
            {t('galgame.approval.reject')}
          </button>
          <button
            type="button"
            className={styles.choiceButton}
            disabled={busy}
            onClick={() => decide('allowed-once')}
          >
            {busy ? t('galgame.choice.submitting') : t('galgame.approval.allowOnce')}
          </button>
        </div>
      </div>
    </div>
  )
}
