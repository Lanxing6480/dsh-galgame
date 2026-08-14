/**
 * dsh-galgame — 角色 manifest 与资源 URL 解析。
 *
 * 资源 ID → URL：`/api/dsh-galgame/assets/<src>`（Host 半边提供静态路由）。
 * 差分规范（参考文档 5.5）：同画布、同人物锚点（bottom-center）、同基准线；
 * 差分切换时人物不跳位。
 *
 * 当前差分：仅 neutral（用户提供的透明底立绘）。
 * 后续补差分：把 smile.webp / thinking.webp / angry.webp 放入
 * `assets/characters/deepseek/portraits/`，并在下方 portraits 增加条目即可——
 * 组件全链路已按 portrait ID 解析，接口已预留。
 */
import type { CharacterManifest } from './types.ts'

/** 资源路由前缀（与 Host 半边注册一致）。 */
export const ASSET_BASE = '/api/dsh-galgame/assets'

/** 默认角色：鲸鱼娘（DeepSeek 深海少女）。 */
export const DEEPSEEK_MANIFEST: CharacterManifest = {
  id: 'deepseek',
  displayName: '鲸鱼娘',
  anchor: [0.5, 1.0],
  baseScale: 1.0,
  portraits: {
    neutral: { src: 'characters/deepseek/portraits/neutral.webp', type: 'image' },
    // 差分接口（后续补图后取消注释并放入对应文件）：
    // smile:    { src: 'characters/deepseek/portraits/smile.webp', type: 'image' },
    // thinking: { src: 'characters/deepseek/portraits/thinking.webp', type: 'image' },
    // angry:    { src: 'characters/deepseek/portraits/angry.webp', type: 'image' },
  },
}

/** 当前可用角色注册表（第一版仅鲸鱼娘；后续可扩展多角色）。 */
export const CHARACTERS: Record<string, CharacterManifest> = {
  [DEEPSEEK_MANIFEST.id]: DEEPSEEK_MANIFEST,
}

/** 解析 portrait 差分资源 URL；未注册的差分 ID 回退到 neutral。 */
export function portraitUrl(portraitId: string): string {
  const fallback = DEEPSEEK_MANIFEST.portraits.neutral
  return `${ASSET_BASE}/${DEEPSEEK_MANIFEST.portraits[portraitId]?.src ?? fallback.src}`
}

/** 取一个角色的显示名。 */
export function displayNameOf(characterId: string): string {
  return CHARACTERS[characterId]?.displayName ?? '鲸鱼娘'
}
