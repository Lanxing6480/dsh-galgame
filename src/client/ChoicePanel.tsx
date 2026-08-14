/**
 * dsh-galgame — ChoiceLayer：提问工具（ask_user_question）→ GalGame 选择窗口（需求 6）。
 *
 * 数据来自会话快照的 pending（kind === 'question'）：
 * 选项按钮直接 respond 答案，agent 循环不被阻塞（纯前端交互）。
 */
import { useState } from 'react'
import type { PendingQuestionWait, QuestionItem } from './types.ts'
import { useHostDrag } from './useHostDrag.ts'
import styles from './galgame.module.css'

export interface ChoicePanelProps {
  /** pending 里 kind === 'question' 的交互载体。 */
  wait: PendingQuestionWait
  /** 是否允许拖拽调整位置（仅调试模式开启，位置已固化为默认值）。 */
  draggable?: boolean
  t: (key: string, params?: Record<string, unknown>) => string
}

/** 组装答案 wire 格式（与 dsh-client-ui-user-questions 一致）。 */
function buildAnswers(questions: readonly QuestionItem[], values: { selected: string[]; custom: string }[]): {
  answers: { id: string; selected: string[]; custom?: string }[]
} {
  return {
    answers: questions.map((item, index) => {
      const value = values[index]
      const custom = value.custom.trim()
      return {
        id: item.id,
        selected: custom === '' || item.multiSelect === true ? value.selected : [],
        ...(custom === '' ? {} : { custom }),
      }
    }),
  }
}

export function ChoicePanel({ wait, draggable = false, t }: ChoicePanelProps) {
  const questions = wait.payload.questions
  // 选项框拖拽：以立绘容器为坐标系；默认位置为用户调好的排版（left -627, top 80），
  // 平时不可拖（draggable=false），调试模式开启时可拖。
  const drag = useHostDrag('dsh.galgame.choicePos', true, { left: -627, top: 80 }, draggable)
  const [index, setIndex] = useState(0)
  // 每题独立的答案草稿（问题 2 修复：多题跳转不再丢失已选答案）。
  const [drafts, setDrafts] = useState<{ selected: string[]; custom: string }[]>(() =>
    questions.map(() => ({ selected: [], custom: '' })),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const question = questions[index]
  if (question === undefined) return null

  const multi = question.multiSelect === true
  const options = question.options ?? []
  const hasOptions = options.length > 0
  const draft = drafts[index]

  const patchDraft = (patch: Partial<{ selected: string[]; custom: string }>) => {
    setDrafts((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)))
  }

  const toggleOption = (label: string) => {
    if (busy) return
    if (multi) {
      const next = draft.selected.includes(label)
        ? draft.selected.filter((item) => item !== label)
        : [...draft.selected, label]
      patchDraft({ selected: next })
    } else {
      patchDraft({ selected: [label] })
    }
  }

  const submit = () => {
    if (busy) return
    if (draft.selected.length === 0 && draft.custom.trim() === '') {
      setError(t('galgame.choice.required'))
      return
    }
    setError(null)
    // 多题：保存当前题后跳下一题；最后一题提交全部草稿。
    if (index < questions.length - 1) {
      setIndex(index + 1)
      return
    }
    setBusy(true)
    const answer = buildAnswers(questions, drafts)
    wait
      .respond({ ok: true, value: { sessionId: wait.sessionId, answer } })
      .then(() => {
        // 提交成功后 pending 会被会话清除，组件随之卸载。
      })
      .catch((cause: unknown) => {
        setBusy(false)
        setError(String(cause instanceof Error ? cause.message : cause))
      })
  }

  const cancel = () => {
    if (busy) return
    wait.respond({
      ok: false,
      error: { code: 'cancelled', message: 'the user closed this question request', details: {} },
    }).catch(() => {})
  }

  return (
    // 以立绘为原点绑定：作为 Stage 的浮层插槽渲染（立绘移位时跟随），支持拖拽
    <div
      className={styles.choiceHost}
      style={{ ...drag.style, cursor: draggable ? 'grab' : 'default' }}
      onMouseDown={drag.onMouseDown}
      onClick={(event) => event.stopPropagation()}
    >
      <div className={styles.choiceCard} role="dialog" aria-modal="true" aria-label={question.question}>
        <div className={styles.choiceHeader}>
          <div>
            {question.header !== undefined ? <div className={styles.choiceEyebrow}>{question.header}</div> : null}
            <h2 className={styles.choiceTitle}>{question.question}</h2>
          </div>
        </div>
        <div className={styles.choiceBody}>
          {question.detail !== undefined ? <p className={styles.choiceDetail}>{question.detail}</p> : null}
          <div className={styles.choiceOptions} role={multi ? 'group' : 'radiogroup'}>
            {options.map((option) => {
              const isSelected = draft.selected.includes(option.label)
              return (
                <button
                  key={option.label}
                  type="button"
                  className={styles.choiceOption}
                  role={multi ? 'checkbox' : 'radio'}
                  aria-checked={isSelected}
                  disabled={busy}
                  onClick={() => toggleOption(option.label)}
                >
                  <span className={styles.choiceOptionLabel}>
                    {multi ? (isSelected ? '☑ ' : '☐ ') : isSelected ? '● ' : '○ '}
                    {option.label}
                  </span>
                  {option.description !== undefined ? (
                    <span className={styles.choiceOptionDesc}>{option.description}</span>
                  ) : null}
                </button>
              )
            })}
          </div>
          {/* 自定义答案统一用 textarea（支持 Shift+Enter 换行，bug 修复） */}
          <textarea
            className={styles.choiceCustomInput}
            value={draft.custom}
            disabled={busy}
            rows={hasOptions ? 1 : 3}
            placeholder={t('galgame.choice.customPlaceholder')}
            onChange={(event) => {
              patchDraft({ custom: event.target.value })
              if (multi) patchDraft({ selected: [] })
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
          />
        </div>
        {error !== null ? <p className={styles.choiceError} role="status">{error}</p> : null}
        <div className={styles.choiceFooter}>
          <button type="button" className={styles.choiceCancel} disabled={busy} onClick={cancel}>
            {t('galgame.choice.cancel')}
          </button>
          <button
            type="button"
            className={styles.choiceButton}
            disabled={busy || (draft.selected.length === 0 && draft.custom.trim() === '')}
            onClick={submit}
          >
            {busy ? t('galgame.choice.submitting') : index < questions.length - 1 ? t('galgame.choice.next') : t('galgame.choice.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
