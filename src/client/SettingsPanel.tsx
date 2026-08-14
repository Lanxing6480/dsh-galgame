/**
 * dsh-galgame — 设置面板（问题 3：历史按钮左侧的常用配置）。
 * 浮层卡片：自动翻句 / 打字机速度 / 说话弹跳 / 思考气泡。
 */
import type { GalgameSettings } from './settings.ts'
import styles from './galgame.module.css'

export interface SettingsPanelProps {
  settings: GalgameSettings
  onChange: (patch: Partial<GalgameSettings>) => void
  onClose: () => void
  t: (key: string, params?: Record<string, unknown>) => string
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={styles.settingRow}>
      <span className={styles.settingLabel}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={checked ? styles.settingSwitchOn : styles.settingSwitchOff}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.settingKnob} />
      </button>
    </label>
  )
}

export function SettingsPanel({ settings, onChange, onClose, t }: SettingsPanelProps) {
  return (
    <div className={styles.settingsMask} onClick={onClose}>
      <div className={styles.settingsCard} role="dialog" aria-modal="true" aria-label={t('galgame.settings.title')} onClick={(event) => event.stopPropagation()}>
        <div className={styles.settingsHeader}>
          <span className={styles.settingsTitle}>{t('galgame.settings.title')}</span>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="关闭设置">
            ✕
          </button>
        </div>
        <div className={styles.settingsBody}>
          <ToggleRow
            label={t('galgame.settings.autoMode')}
            checked={settings.autoMode}
            onChange={(value) => onChange({ autoMode: value })}
          />
          <ToggleRow
            label={t('galgame.settings.bounce')}
            checked={settings.bounce}
            onChange={(value) => onChange({ bounce: value })}
          />
          <ToggleRow
            label={t('galgame.settings.bubble')}
            checked={settings.bubble}
            onChange={(value) => onChange({ bubble: value })}
          />
          <ToggleRow
            label={t('galgame.settings.debug')}
            checked={settings.debug}
            onChange={(value) => onChange({ debug: value })}
          />
          <label className={styles.settingRow}>
            <span className={styles.settingLabel}>{t('galgame.settings.typeSpeed')}</span>
            <input
              type="range"
              className={styles.settingRange}
              min={8}
              max={80}
              step={2}
              value={settings.typeSpeed}
              onChange={(event) => onChange({ typeSpeed: Number(event.target.value) })}
            />
            <span className={styles.settingValue}>
              {settings.typeSpeed <= 14 ? t('galgame.settings.speed.fast') : settings.typeSpeed <= 34 ? t('galgame.settings.speed.normal') : t('galgame.settings.speed.slow')}
            </span>
          </label>
        </div>
      </div>
    </div>
  )
}
