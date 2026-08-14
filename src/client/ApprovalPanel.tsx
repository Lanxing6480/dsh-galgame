/**
 * dsh-galgame — ApprovalLayer：Agent 权限申请 → GalGame 风格审批框（bug 修复 1）。
 *
 * 数据来自会话快照的 pending（kind === 'approval'），与 question 同通道：
 * 非全屏卡片，浮在立绘前、对话框上方，answer('allowed-once' | 'rejected')。
 */
import { useState } from 'react'
import { useHostDrag } from './useHostDrag.ts'
import styles from './galgame.module.css'

export interface ApprovalWait {
  kind: 'approval'
  key: string
  sessionId: string
  payload: {
    approvalId: string
    toolName?: string
    reason?: string
    callId?: string
  }
  respond(result: unknown): Promise<unknown>
}

export interface ApprovalPanelProps {
  wait: ApprovalWait
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

  const respond = (outcome: 'allowed-once' | 'rejected') => {
    if (busy) return
    setBusy(true)
    setError(null)
    wait
      .respond({
        ok: true,
        value: { sessionId: wait.sessionId, approvalId: wait.payload.approvalId, outcome },
      })
      .then(() => {
        // 提交成功后 approval/resolved 会清掉 pending，组件随之卸载。
      })
      .catch((cause: unknown) => {
        setBusy(false)
        setError(String(cause instanceof Error ? cause.message : cause))
      })
  }

  const title = wait.payload.reason ?? t('galgame.approval.escalation', { toolName: wait.payload.toolName ?? '未知工具' })

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
            onClick={() => respond('rejected')}
          >
            {t('galgame.approval.reject')}
          </button>
          <button
            type="button"
            className={styles.choiceButton}
            disabled={busy}
            onClick={() => respond('allowed-once')}
          >
            {busy ? t('galgame.choice.submitting') : t('galgame.approval.allowOnce')}
          </button>
        </div>
      </div>
    </div>
  )
}
