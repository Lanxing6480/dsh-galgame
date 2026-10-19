/**
 * dsh-galgame — 浮层渲染边界。
 *
 * 「历史」「设置」这类 root 级浮层是独立于舞台的可关闭层。它们的渲染一旦抛错，
 * 若没有边界接住，React 会卸载**整棵** GalGame 视图 —— 用户看到的就是整页
 * 白屏，只能刷新页面（刷新后 `backlogOpen` 归 false 才恢复正常）。
 *
 * 边界把故障限制在浮层内部：收起坏掉的那一块并给出一句提示，舞台与输入条
 * 继续可用。兜底层**自带关闭手段**（点遮罩或按钮）—— 因为被替换掉的原浮层
 * 连它自己的关闭按钮一起消失了，不给出路会把用户困住。
 *
 * 关闭后 `backlogOpen` 归 false，边界随子树卸载；再次打开是全新实例，
 * 错误状态自动清零并重新尝试渲染。
 *
 * @module @lanxing/dsh-galgame/client/LayerBoundary
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import styles from './galgame.module.css'

export interface LayerBoundaryProps {
  /** 被保护的浮层子树。 */
  children: ReactNode
  /** 兜底提示（插件字典 `galgame.layer.error`）。 */
  message: string
  /** 关闭动作（插件字典 `galgame.layer.close` 为按钮文案）。 */
  closeLabel: string
  /** 收起当前浮层（通常是 `setXxxOpen(false)`）。 */
  onClose: () => void
}

interface LayerBoundaryState {
  failed: boolean
}

/** 捕获子树渲染异常并降级为可关闭的提示层，避免整视图白屏。 */
export class LayerBoundary extends Component<LayerBoundaryProps, LayerBoundaryState> {
  state: LayerBoundaryState = { failed: false }

  static getDerivedStateFromError(): LayerBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // 保留控制台可见性：用户回报问题时可以直接从 DevTools 贴出栈。
    console.error('[dsh-galgame] 浮层渲染失败', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className={styles.layerErrorMask} onClick={this.props.onClose}>
          <div
            className={styles.layerError}
            role="alert"
            onClick={(event) => event.stopPropagation()}
          >
            <span>{this.props.message}</span>
            <button type="button" className={styles.layerErrorClose} onClick={this.props.onClose}>
              {this.props.closeLabel}
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
