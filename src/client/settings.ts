/**
 * dsh-galgame — 用户配置：localStorage 持久化 + 读取。
 */

export interface GalgameSettings {
  /** 自动翻句（模型运行时默认自动推进，需求 10 可关）。 */
  autoMode: boolean
  /** 打字机速度（ms/帧，越小越快）。 */
  typeSpeed: number
  /** 说话弹跳动画。 */
  bounce: boolean
  /** 思考气泡（显示思维链）。 */
  bubble: boolean
  /** 调试模式：显示各图层/组件边框范围（不同颜色区分）。 */
  debug: boolean
}

export const DEFAULT_SETTINGS: GalgameSettings = {
  autoMode: true,
  typeSpeed: 28,
  bounce: true,
  bubble: true,
  debug: false,
}

const STORAGE_KEY = 'dsh.galgame.settings'

/** 从 localStorage 读取配置（损坏/缺失回退默认值）。 */
export function loadSettings(): GalgameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<GalgameSettings>
    return {
      autoMode: typeof parsed.autoMode === 'boolean' ? parsed.autoMode : DEFAULT_SETTINGS.autoMode,
      typeSpeed: typeof parsed.typeSpeed === 'number' ? parsed.typeSpeed : DEFAULT_SETTINGS.typeSpeed,
      bounce: typeof parsed.bounce === 'boolean' ? parsed.bounce : DEFAULT_SETTINGS.bounce,
      bubble: typeof parsed.bubble === 'boolean' ? parsed.bubble : DEFAULT_SETTINGS.bubble,
      debug: typeof parsed.debug === 'boolean' ? parsed.debug : DEFAULT_SETTINGS.debug,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** 持久化配置。 */
export function saveSettings(settings: GalgameSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // localStorage 不可用时静默失败（配置仅当前会话生效）
  }
}