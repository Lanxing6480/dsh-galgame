/**
 * dsh-galgame — 浮层拖拽 hook：以立绘容器为坐标系，位置持久化。
 * 思考气泡与选项框共用（以立绘为原点绑定，立绘移位时浮层跟随）。
 */
import { useRef, useState } from 'react'

export interface HostDragPos {
  left: number
  top: number
}

function loadPos(storageKey: string): HostDragPos | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Partial<HostDragPos>
    if (typeof parsed.left === 'number' && typeof parsed.top === 'number') {
      return { left: parsed.left, top: parsed.top }
    }
    return null
  } catch {
    return null
  }
}

function savePos(storageKey: string, pos: HostDragPos): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(pos))
  } catch {
    // 忽略持久化失败
  }
}

/**
 * 拖拽定位：以宿主容器（立绘）为坐标系。
 * @param storageKey - 位置持久化键。
 * @param clampTop - top 是否限制不低于 0（防止拖出舞台顶部）。
 * @param defaultPos - 默认位置（localStorage 无值时使用；固化调好的排版）。
 * @param enabled - 是否允许拖拽（关闭后仅显示位置，不响应拖拽；调试模式可开）。
 * @returns 位置样式、拖拽启动处理器。
 */
export function useHostDrag(
  storageKey: string,
  clampTop = true,
  defaultPos?: HostDragPos | null,
  enabled = true,
): {
  style: { left: number; top: number; right: 'auto' } | undefined
  onMouseDown: (event: React.MouseEvent) => void
} {
  const [pos, setPos] = useState<HostDragPos | null>(() => loadPos(storageKey) ?? defaultPos ?? null)
  const dragRef = useRef<{ startX: number; startY: number; latest: HostDragPos } | null>(null)

  const startDrag = (event: React.MouseEvent) => {
    if (!enabled) return
    // 交互元素（按钮/输入框/链接等）上不启动拖拽：允许正常点击与输入
    // （否则 preventDefault 会阻止输入框获得焦点，bug 修复）。
    const clicked = event.target as HTMLElement | null
    if (clicked !== null && typeof clicked.closest === 'function') {
      const interactive = clicked.closest(
        'button, a, input, textarea, select, [role="button"], [role="radio"], [role="checkbox"], [role="switch"]',
      )
      if (interactive !== null) return
    }
    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget as HTMLElement
    const host = target.parentElement
    if (host === null) return
    const hostRect = host.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const origin = {
      left: targetRect.left - hostRect.left,
      top: targetRect.top - hostRect.top,
    }
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      latest: origin,
    }
    const onMove = (ev: MouseEvent) => {
      const drag = dragRef.current
      if (drag === null) return
      const next = {
        left: origin.left + (ev.clientX - drag.startX),
        top: clampTop ? Math.max(0, origin.top + (ev.clientY - drag.startY)) : origin.top + (ev.clientY - drag.startY),
      }
      drag.latest = next
      setPos(next)
    }
    const onUp = () => {
      const drag = dragRef.current
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (drag !== null) {
        savePos(storageKey, drag.latest)
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return {
    style: pos !== null ? { left: pos.left, top: pos.top, right: 'auto' } : undefined,
    onMouseDown: startDrag,
  }
}
