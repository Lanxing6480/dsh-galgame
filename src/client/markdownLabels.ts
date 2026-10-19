/**
 * dsh-galgame — Markdown 组件的本地化文案（`MarkdownLabels`）。
 *
 * 为什么必须供给：`MarkdownText` 的 `labels` 在类型上是**必填**属性，运行时
 * 也没有默认值兜底 —— 代码块工具栏直接读 `labels.code.copyLabel`、
 * 脚注区直接读 `labels.footnotes`，两处都没有可选链：
 *
 *   copyLabel:   context.labels.code.copyLabel
 *   copiedLabel: context.labels.code.copiedLabel
 *   children:    context.labels.footnotes
 *
 * 于是「历史」面板一打开就白屏：面板会把**全部**历史回复一次性渲染，其中几乎
 * 必然含有非空代码块（空代码块会提前 return，不读 labels），一旦命中就抛
 * `TypeError: Cannot read properties of undefined`，整棵组件树被 React 卸载。
 * 舞台对话框只渲染当前一句散文，所以平时不显形 —— 这条 bug 因此长期潜伏。
 *
 * 引用稳定性：`MarkdownText` 的流式渲染缓存以 `labels` 引用为键，注解原文
 * 要求「传一个 reference-stable 对象（按 locale 版本 memo）」，每次渲染新建
 * 对象会让打字机期间的增量缓存全部作废。故本模块按文案内容缓存。
 *
 * @module @lanxing/dsh-galgame/client/markdownLabels
 */
import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** 插件字典的翻译函数（与 view 注入的 `t` 同形，这里只用单参形态）。 */
export type Translate = (key: string) => string

/** 按文案内容缓存：语言切换后文案变化自然键变，同语言恒返回同一引用。 */
const cache = new Map<string, MarkdownLabels>()

/**
 * 构造与官方 `dsh-client-ui-chat` 的 `markdownLabels()` 同形的文案对象。
 * @param t - 绑定到插件字典的翻译函数。
 * @returns 可安全传给任意 `MarkdownText` 的 labels（同语言下引用稳定）。
 */
export function markdownLabels(t: Translate): MarkdownLabels {
  const copyLabel = t('markdown.copy')
  const footnotes = t('markdown.footnotes')
  // 文案即语言指纹：切到英文后这两个字符串会变，缓存键随之改变。
  const cacheKey = `${copyLabel}\u0000${footnotes}`
  const hit = cache.get(cacheKey)
  if (hit !== undefined) return hit

  const labels: MarkdownLabels = {
    code: {
      copyLabel,
      copiedLabel: t('markdown.copied'),
      // 官方把工具栏文案放在 `toolbarLabels` 里；缺了它代码卡片的标题会变空。
      toolbarLabels: {
        codeLabel: t('markdown.code'),
        wrapLabel: t('markdown.wrap'),
        unwrapLabel: t('markdown.unwrap'),
      },
    },
    footnotes,
  }
  cache.set(cacheKey, labels)
  return labels
}
