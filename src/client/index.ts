/**
 * dsh-galgame — Client 半边入口。
 *
 * 注册第三个会话视图标签「galgame 模式」（位于「轨迹」右侧）：
 * conversation.view keyed entry `id: 'galgame'`、`order: 20`
 * （chat=0、trajectory=10）。注册经 slots 服务的 effect 包裹，
 * 插件卸载时标签自动移除。
 *
 * @module @lanxing/dsh-galgame/client
 */
import { GalgameView } from './GalgameView.tsx'

/** 字典命名空间（轨迹插件同款做法）。 */
const NS = 'galgame'

/** 简体中文（键集为基准）。 */
const zh = {
  'view.galgame': 'galgame 模式',
  'galgame.loading': '正在潜入深海，加载对话…',
  'galgame.empty.title': '欢迎来到 GalGame 模式',
  'galgame.empty.body': 'DeepSeek 娘（鲸鱼娘）正在深海等你。在下方的输入框里发一句话，她就会以 GalGame 的方式回应你。工具调用与思考过程都会藏在幕后。',
  'galgame.backlog': '历史',
  'galgame.input.placeholder': '对鲸鱼娘说…',
  'galgame.input.placeholderRunning': '插话引导鲸鱼娘…',
  'galgame.input.send': '发送',
  'galgame.input.hint': 'Enter 发送 · Shift+Enter 换行',
  'galgame.input.hintRunning': '任务执行中 · Enter 以插话引导（steer）',
  'galgame.approval.waiting': '权限申请 · 等待你的决定',
  'galgame.approval.escalation': '智能体想执行「{toolName}」，需要你的批准',
  'galgame.approval.reject': '拒绝',
  'galgame.approval.allowOnce': '允许一次',
  'galgame.choice.required': '请选择一个选项或输入你的答案。',
  'galgame.choice.customPlaceholder': '输入你的答案…',
  'galgame.choice.cancel': '放弃',
  'galgame.choice.next': '下一题',
  'galgame.choice.submit': '确定',
  'galgame.choice.submitting': '提交中…',
  'galgame.settings.title': '设置',
  'galgame.settings.autoMode': '自动翻句',
  'galgame.settings.bounce': '说话弹跳',
  'galgame.settings.bubble': '思考气泡',
  'galgame.settings.debug': '调试模式',
  'galgame.settings.typeSpeed': '打字机速度',
  'galgame.settings.speed.fast': '快',
  'galgame.settings.speed.normal': '中',
  'galgame.settings.speed.slow': '慢',
}

/** English dictionary。 */
const en = {
  'view.galgame': 'GalGame',
  'galgame.loading': 'Diving into the deep sea, loading the conversation…',
  'galgame.empty.title': 'Welcome to GalGame Mode',
  'galgame.empty.body': 'DeepSeek girl (the whale girl) is waiting in the deep sea. Send a message in the input box below and she will reply GalGame-style. Tool calls and thinking stay behind the scenes.',
  'galgame.backlog': 'History',
  'galgame.input.placeholder': 'Say something to the whale girl…',
  'galgame.input.placeholderRunning': 'Interrupt to guide the whale girl…',
  'galgame.input.send': 'Send',
  'galgame.input.hint': 'Enter to send · Shift+Enter for newline',
  'galgame.input.hintRunning': 'Task running · Enter steers the agent',
  'galgame.approval.waiting': 'Permission request · awaiting your decision',
  'galgame.approval.escalation': 'The agent wants to run "{toolName}" and needs your approval',
  'galgame.approval.reject': 'Reject',
  'galgame.approval.allowOnce': 'Allow once',
  'galgame.choice.required': 'Please pick an option or type your answer.',
  'galgame.choice.customPlaceholder': 'Type your answer…',
  'galgame.choice.cancel': 'Dismiss',
  'galgame.choice.next': 'Next',
  'galgame.choice.submit': 'Confirm',
  'galgame.choice.submitting': 'Submitting…',
  'galgame.settings.title': 'Settings',
  'galgame.settings.autoMode': 'Auto advance',
  'galgame.settings.bounce': 'Talk bounce',
  'galgame.settings.bubble': 'Thinking bubble',
  'galgame.settings.debug': 'Debug mode',
  'galgame.settings.typeSpeed': 'Typewriter speed',
  'galgame.settings.speed.fast': 'Fast',
  'galgame.settings.speed.normal': 'Normal',
  'galgame.settings.speed.slow': 'Slow',
}

/** 宽松 ctx（构造期仅需 slots / locale / sessions 服务；运行时由 DSH loader 提供）。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function apply(ctx: any) {
  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    'galgame: dictionaries',
  )
  const t = ctx.locale.bind(NS)

  // GalGame 模式激活时，在 conversation.composer 链上占一个更高优先级的空位，
  // **恒接管并渲染空**：默认 InputBar / 提问面板 / 审批面板全部屏蔽——
  // GalGame 有自己独立的输入条与浮层选项框，composer 区域不需要任何内容；
  // 切回聊天视图（卸载）时注销抢占，默认输入栏恢复。
  // （皮肤兼容通用方案：默认皮肤与皮肤 mod 均生效，避免双输入条/双提问框。）
  let composerBlocker: (() => void) | null = null
  const setGalgameMode = (active: boolean) => {
    if (active && composerBlocker === null) {
      try {
        composerBlocker = ctx.slots.register(
          {
            name: 'conversation.composer',
            priority: -100,
            // 恒接管：GalGame 模式下 composer 恒为空
            select: () => ({}),
          },
          // 空组件：接管后不渲染任何东西
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          function EmptyComposer() {
            return null
          } as any,
        )
      } catch {
        composerBlocker = null
      }
    } else if (!active && composerBlocker !== null) {
      composerBlocker()
      composerBlocker = null
    }
  }

  ctx.slots.inject(
    'conversation.view',
    () =>
      ctx.slots.register(
        {
          name: 'conversation.view',
          id: 'galgame',
          order: 20,
          locale: NS,
          label: () => t('view.galgame'),
          inject: (sessionId: string) => ({
            // 引导/插话发送（问题 2）：任务执行中用户输入默认 steer 而非排队。
            // 经 session.prompt(..., 'steer') 直达运行中的 agent 循环。
            sendSteer: async (text: string) => {
              const sessions = ctx.get('sessions')
              const binding = sessions?.binding?.(sessionId)
              const session = binding?.session
              if (session === undefined) return false
              try {
                const result = await session.prompt([{ type: 'text', text }], 'steer')
                return result.ok === true
              } catch {
                return false
              }
            },
            // GalGame 模式激活开关：挂载时屏蔽默认提问面板，卸载时恢复。
            setGalgameMode,
          }),
        },
        // 组件 props 为宽松接口；运行时契约与官方 view entry 一致
        // （useSession / sessionId / t / sendSteer / setGalgameMode）。
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        GalgameView as any,
      ),
  )
}

/** Cordis 服务级注入声明：locale（字典注册/翻译）、slots（视图标签注册）、
 *  sessions（引导/插话发送 steer）。
 *  缺了它，cordis 会拒绝访问 ctx.locale / ctx.slots / ctx.sessions。 */
const inject = ['locale', 'slots', 'sessions']

export { apply, inject }
