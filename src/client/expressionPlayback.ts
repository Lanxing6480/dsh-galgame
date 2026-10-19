import { advanceExpression, initialExpressionState, type ExpressionState } from './expressionDirector.ts'

/** Bounded, session-local cache. Each unit remembers its entry state so a
 * backwards jump never inherits a future paragraph's emotion. */
export function createExpressionPlayback() {
  const entries = new Map<string, { before: ExpressionState; state: ExpressionState; text: string }>()
  let lastMessage = ''
  let lastState = initialExpressionState()
  return {
    update(messageKey: string, unitIndex: number, visibleText: string, complete: boolean): ExpressionState {
      const key = JSON.stringify([messageKey, unitIndex])
      let entry = entries.get(key)
      if (!entry) {
        const before = messageKey === lastMessage ? lastState : initialExpressionState()
        entry = { before, state: before, text: '' }
        entries.set(key, entry)
        if (entries.size > 256) entries.delete(entries.keys().next().value!)
      }
      if (!visibleText.startsWith(entry.text)) { entry.state = entry.before; entry.text = '' }
      // Process each newly visible boundary in order, even when a network chunk
      // contains multiple sentences. Results do not depend on chunk size.
      const from = entry.text.length
      for (const match of visibleText.matchAll(/[。！？!?；;\n]|——|……/g)) {
        const end = (match.index ?? 0) + match[0].length
        if (end <= from) continue
        entry.state = advanceExpression(entry.state, { unitKey: key, visibleText: visibleText.slice(0, end), complete: false }).state
      }
      entry.state = advanceExpression(entry.state, { unitKey: key, visibleText, complete }).state
      entry.text = visibleText
      lastMessage = messageKey
      lastState = entry.state
      return entry.state
    },
  }
}
