/**
 * dsh-galgame — 角色 manifest 与资源 URL 解析。
 *
 * 资源 ID → URL：`/api/dsh-galgame/assets/<src>`（Host 半边提供静态路由）。
 * 差分规范（参考文档 5.5）：同画布、同人物锚点（bottom-center）、同基准线；
 * 差分切换时人物不跳位。
 *
 * 8 种基础差分；原版 neutral.webp 作为 happy 保留。
 * 生成差分单独存放，原图和候选稿不覆盖。
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
    neutral: { src: 'characters/deepseek/portraits/expressions-v1/neutral.webp', type: 'image' },
    happy: { src: 'characters/deepseek/portraits/neutral.webp', type: 'image' },
    thinking: { src: 'characters/deepseek/portraits/expressions-v1/thinking.webp', type: 'image' },
    surprised: { src: 'characters/deepseek/portraits/expressions-v1/surprised.webp', type: 'image' },
    helpless: { src: 'characters/deepseek/portraits/expressions-v1/helpless.webp', type: 'image' },
    angry: { src: 'characters/deepseek/portraits/expressions-v1/angry.webp', type: 'image' },
    sad: { src: 'characters/deepseek/portraits/expressions-v1/sad.webp', type: 'image' },
    shy: { src: 'characters/deepseek/portraits/expressions-v1/shy.webp', type: 'image' },
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
