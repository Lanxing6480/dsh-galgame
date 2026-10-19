# dsh-galgame · DESIGN.md

> GalGame 模式界面插件 · 设计文档（阶段：第一版实现指南 + v1.2.0 契约迁移）
> 依据：`Agent_GalGame_UI_参考与设计指南_Markdown.md`（视觉小说 UI 参考）+ **DSH 0.2.0-rc.2** 实际源码契约
>
> 契约版本沿革：v1.0.0 / v1.1.0 依据 DSH `0.1.0-rc.6`；v1.2.0 依据 `0.2.0-rc.2`
> 重新对齐了数据来源（`useChat` / `useSession` / `useSessionStatus`）与等待交互对象
> （`PendingQuestion` / `PendingApproval`），迁移对照见 §3.6。

## 0. 一句话

### 2026-10-18 本地自动表情扩展（未发布）

`expressionDirector.ts` 将表达功能与情绪词／动作短语结合，明确返回 portrait 或 keep；`expressionPlayback.ts` 按消息和显示单元缓存，逐个处理可见短句边界，使网络分块不影响演出结果。`DialogueBox.onVisibleText` 只上报已显示前缀，`GalgameView` 据此更新舞台；思考专用差分由 reasoning-only 流式状态驱动。

稳定身份：ScriptLine.playbackKey 对 assistant 优先用 turn+step，缺失时退回 seq；partial 与 settled 不使用两套演出 key。GalgameView 按 sessionId 重挂局部状态，播放位置 localStorage 也按会话隔离。原说话弹跳与自动表情开关独立，不新增付费推理或会话事件写入。

资源：8 种差分，PNG 独立副本 + 原版 happy；Stage 固定比例画框，预加载成功才切换，过期请求取消，旧图保留至淡化结束。未制作工具专用立绘，未启用晕倒／强抖动。下文早期“仅 neutral／不做自动分类”描述为历史阶段范围。

在 DSH Web 聊天主界面新增第三个标签栏「galgame 模式」（位于「轨迹」右侧），把真实的 agent 会话渲染成 GalGame 演出：鲸鱼娘立绘 + 差分 + 对话框 + 打字机 + 分句点击 + 提问选项 + 历史回顾。**纯视觉层**：不写会话、不干预 agent 循环，随时可切回常规聊天。

## 1. 目标（12 条需求 → 实现落点）

| # | 需求 | 落点 |
|---|---|---|
| 1 | 差分图片读取人物立绘 | CharacterManifest（portrait 资源 ID）+ PortraitController，图片经 Host 静态路由 `/api/dsh-galgame/assets/*` 加载 |
| 2 | 「轨迹」右边新标签 | `conversation.view` keyed entry：`id: "galgame"`、`order: 20`（chat=0、trajectory=10） |
| 3 | 进入召唤鲸鱼娘立绘 | 默认角色 manifest `deepseek`（鲸鱼娘），Stage 立绘层 |
| 4 | 输入框正常输入 | `conversation.composer` 与 `conversation.view` 相互独立（ConversationRoot 固定渲染 composer），视图内无需自建输入框 |
| 5 | 隐藏工具调用/思维链 | adapter 只提取 `AssistantBlock` 中 `kind === 'text'` 的块；user 侧取 `content` 的 text 块 |
| 6 | 提问工具 → GalGame 选择窗口 | `useSessionStatus((map) => map.get(sessionId)?.pendingInteraction)` 取 `kind: 'question' / 'plan-review'` 的 `PendingQuestion`，ChoicePanel 渲染选项后 `wait.answer(批次)` |
| 7 | 与常规对话不冲突随时切换 | 视图激活态由 conversation 的 store（`s.view`）管理，标签栏原生支持；本插件零状态写 |
| 8 | 说话蹦两下 | CSS keyframes（bounce），`prefers-reduced-motion` 时关闭 |
| 9 | 长输出分句点击 | `splitIntoSentences()` 分句器；DialogueBox 维护句索引，点击/空格推进 |
| 10 | 执行时长输出自动模式 | `useSession(s => s.running)` 且流式输出时自动推进分句；用户点击即暂停自动 |
| 11 | 右上角展开历史 | Backlog 抽屉：完整台词回放（含已隐藏的工具信息摘要） |
| 12 | 纯视觉不阻塞 | 只订阅快照 + 交互对象作答；不发模型请求、不写会话日志 |

## 2. 架构（参考文档「聊天数据与演出 UI 分离」）

```
useChat(s => s.legacy)      ─ 台词数据（nodes / partial，Chat 视图目标的兼容投影）
useSession                  ─ 会话生命周期（running / openState / blank …）
useSessionStatus            ─ 等待交互（pendingInteraction：提问 / 审批领域对象）
        │
        ▼
GalgameAdapter（纯函数，无副作用）
  - 过滤工具/思维链 → 台词行
  - 分句
  - 情绪/差分推断（第一版：neutral，预留标签口）
        │
        ▼
StageState（组件内 useState/useReducer，可序列化）
  - currentLine / sentenceIndex / autoMode / bounceKey
        │
        ▼
React 渲染层
  BackgroundLayer（背景）
  CharacterLayer（立绘 + 差分 crossfade + 弹跳）
  DialogueLayer（名字牌 + 文本框 + 打字机 + 继续指示）
  ChoiceLayer（提问选项）
  BacklogLayer（历史抽屉）
```

关键边界：
- **adapter 不碰 DOM/React**，纯函数便于测试。
- **演出状态只存组件局部**；切换视图/会话后重放历史（由快照重建），不持久化演出位置。
- **不写 conversation 的任何数据**：不 publish 事件、不注册 conversationEvents、不写会话日志。
- **发送不依赖 composer 草稿机**：GalGame 模式接管 `conversation.composer` 链后，
  默认输入卡的 Lexical 编辑器不再挂载，故 `sendTurn` / `sendSteer` 直发
  `ctx.sessions.binding(id).session.prompt([{type:'text',text}], 'queue' | 'steer')`。

## 3. 关键契约（来自 DSH 0.2.0-rc.2 源码，非猜测）

### 3.1 标签栏注册（仿 dsh-client-ui-trajectory）
```ts
ctx.slots.inject('conversation.view', () => ctx.slots.register({
  name: 'conversation.view',
  id: 'galgame',
  order: 20,                      // chat=0, trajectory=10 → 第三个
  locale: NS,
  label: () => t('view.galgame'),
  inject: (sessionId) => ({ sendTurn, sendSteer, setGalgameMode }),
}, GalgameView))
```
- 视图组件标准 props（0.2.0-rc.2）：`sessionId` + `useSession` + `useProjection`
  （session 标准席位，ui-session 提供）、`useConversation` / `useInput` / `inputActions`
  （conversation 标准席位）、`useChat`（chat 标准席位）、`useSessions` / `useSessionStatus` /
  `useSessionRetainInfo`（全局席位）+ entry inject + `t`。
- 视图切换：`resolveView(tabs, store.view)`，缺失回退 `chat`。✅

### 3.2 数据来源（0.2.0-rc.2 三处分工）
```
useChat(s => s.legacy).nodes: readonly ConversationNode[]
  - UserMessageNode     {kind:'user', seq, time, content: ContentBlock[]}
  - AssistantMessageNode{kind:'assistant', seq, time, turn, step, blocks: AssistantBlock[]}
  - SteeringMessageNode / ToolResultNode / CommandNode / Compaction / Context / ...
useChat(s => s.legacy).partial: {turn, step, blocks: AssistantBlock[]} | null  流式中

useSession (SessionSnapshot)
  - running / openState('cold'|'loading'|'open'|'error') / openError / blank
  - hasMore / loadingOlder / pendingSubmissions / promptError / awaitingFirstTurn …

useSessionStatus (ReadonlyMap<SessionId, SessionStatus>)
  - running / completionUnread / pendingInteraction（单条、按领域优先级取胜）
```

> `legacy` 是 Chat 视图目标的兼容投影（`LegacyConversationSlice`），由 ui-chat 的
> `ChatViewBuilder` 逐节点增量维护，字段与 0.1.0-rc.6 的顶层 `nodes` / `partial` 完全一致；
> 隐藏节点（工具结果等）仍不出现在其中，正好符合「幕后隐藏」的演出需求。

### 3.3 等待交互（0.2.0-rc.2 的领域对象）
```ts
// pendingInteraction 可能是（kind 判别）：
// 1) PendingQuestion（dsh-client-ui-user-questions 发布）
kind: 'question' | 'plan-review'
questions: [{id, question, options?: [{label, description?}], multiSelect?, detail?, header?}]
answer({ answers: [{ id, selected: string[], custom?: string }] }): Promise<void>
dismiss(): Promise<void>          // 工具调用型卡片只收起；无 callId 的阻塞请求会结束请求

// 2) PendingApproval（dsh-client-ui-approval 发布）
kind: 'approval'
toolName: string; reason?: string; callId?: string; answerable: boolean
answer('allowed-once' | 'rejected'): Promise<void>
```

### 3.4 静态资源（Host 半边）
```ts
ctx.webServer.register({ kind: 'prefix', path: '/api/dsh-galgame/assets', handler })
// handler 从包内 assets/ 目录读文件返回（image/webp, image/png）
```

### 3.5 composer 接管（GalGame 模式激活期间）
```ts
// conversation.composer 是 chain：升序 priority 逐个跑 select，第一个非 null 者当选。
ctx.slots.register({
  name: 'conversation.composer',
  priority: -100,          // 最小 → 最先尝试
  select: () => ({}),      // 恒命中
}, function EmptyComposer() { return null })
```
- 默认输入卡、官方提问卡、官方审批卡全部让位给 GalGame 自己的输入条与浮层，避免双输入条/双提问框；
- 视图卸载（切回聊天）时注销，官方 composer 自动恢复。

### 3.6 与 0.1.0-rc.6 的迁移对照

| 用途 | 0.1.0-rc.6 | 0.2.0-rc.2 |
|---|---|---|
| 台词节点 | `useSession(s => s.nodes)` | `useChat(s => s.legacy.nodes)` |
| 流式片段 | `useSession(s => s.partial)` | `useChat(s => s.legacy.partial)` |
| 运行中 | `useSession(s => s.running)` | `useSession(s => s.running)`（仍在 SessionSnapshot） |
| 打开态 | `useSession(s => s.openState)` | 同上（取值集合不变） |
| 提问/审批 | `useSession(s => s.pending)` + `wait.respond(...)` | `useSessionStatus(map => map.get(id)?.pendingInteraction)` + `wait.answer(...)` / `dismiss()` |
| 提问答案 | `respond({ok:true, value:{sessionId, answer}})` | `answer({answers})`（wire 形状相同，去掉信封） |
| 发送 | `inputActions.setDraft + submit` | `session.prompt([{type:'text',text}], 'queue'\|'steer')` |
| 平台模块表 | react/cordis/slots/primitives/… + `dsh-client-runtime/client` 豁免 | react/cordis/**dsh-client-store**/slots/primitives/**ui-dockkit** |

## 4. 第一版范围（参考文档「第一阶段明确不做」）

**做**：背景层、立绘层（1 人）、差分切换（crossfade）、弹跳、对话框（名字牌+打字机+分句）、提问选项、历史抽屉、自动模式、隐藏工具/思维链。
**不做**：Live2D、BGM/SFX、镜头、多人站位、自动情绪分类、剧情分支编辑器、存读档、话题标签注入。

## 5. 视觉规范起始值（1920×1080 逻辑画布，窗口缩放用 clamp/百分比）

| 项 | 值 |
|---|---|
| 逻辑画布 | 1920×1080，容器 100% 缩放 |
| 对话区 | 底部，宽 76%～90%，高约 24%，2～4 行正文 |
| 正文 | 28px 起步（随窗口缩放 clamp(18px, 2vw, 32px)） |
| 名字牌 | 正文 0.9 倍字高，字重/颜色更明确 |
| 立绘 anchor | bottom-center；差分同画布同锚点 |
| 差分切换 | 120ms crossfade |
| 弹跳 | 150ms×2，幅度 12～20px |
| 非当前角色 | 第一版单角色，预留 brightness 规则 |
| 动效可关 | `prefers-reduced-motion: reduce` 全局关闭 |
| 对比度 | 正文 ≥ 4.5:1 |

## 6. 数据模型

```ts
// CharacterManifest（resources 规范）
interface CharacterManifest {
  id: string            // 'deepseek'
  displayName: string   // '鲸鱼娘'
  anchor: [number, number]   // [0.5, 1.0]
  baseScale: number
  portraits: Record<string, { src: string; type: 'image' }>
  // portraits: { neutral: {...}, smile: {...}, angry: {...}, thinking: {...} }
}

// 台词行（adapter 输出）
interface ScriptLine {
  key: string           // node key
  seq: number
  speaker: 'user' | 'assistant'
  name: string          // '你' / '鲸鱼娘'
  text: string          // 已过滤的纯文本
  portrait: string      // 差分 id（第一版 neutral）
  time: number
}

// 演出状态
interface PlaybackState {
  cursor: number            // 已消费到第几条台词
  sentenceIndex: number     // 当前句
  autoMode: boolean
  bounceNonce: number       // 触发弹跳
}
```

## 7. 分句规则（splitIntoSentences）

1. 先按换行/段落分块；
2. 块内按 `。！？!?…～` 断句（保留标点）；
3. 超过 40 字的句子按 `，,、；;：` 二次切分；
4. 单句 > 40 字则硬切。
5. 输出 `{ sentences: string[], perLine: number[] }` 或直接拍平为句数组 + 行边界。

## 8. 组件清单

| 文件 | 职责 |
|---|---|
| `src/client/index.ts` | `apply(ctx)`：locale 注册 + `conversation.view` 注册 + composer 链接管 + prompt 直发 |
| `src/client/types.ts` | 0.2.0-rc.2 窄契约类型（不深依赖官方类型包） |
| `src/client/manifest.ts` | 鲸鱼娘 CharacterManifest + 资源 URL 解析 |
| `src/client/adapter.ts` | 快照 → ScriptLine[]（过滤/分块） |
| `src/client/GalgameView.tsx` | 根：订阅 useChat/useSession/useSessionStatus、编排 Stage/Dialogue/Choice/Approval/Backlog |
| `src/client/Stage.tsx` | 立绘层：差分 crossfade + 弹跳 + 思考气泡 |
| `src/client/DialogueBox.tsx` | 名字牌+文本框+打字机+翻页指示 |
| `src/client/GalgameInput.tsx` | 常驻输入条（running → steer / 空闲 → queue） |
| `src/client/ChoicePanel.tsx` | 提问选项（PendingQuestion → answer/dismiss） |
| `src/client/ApprovalPanel.tsx` | 审批卡（PendingApproval → answer） |
| `src/client/SettingsPanel.tsx` | 设置面板（自动翻句/打字机/弹跳/气泡/调试） |
| `src/client/Backlog.tsx` | 历史抽屉 |
| `src/client/*.module.css` | 各组件样式（Design Tokens 集中） |
| `src/index.ts` | Host：`/api/dsh-galgame/assets/*` 静态路由 |
| `test/smoke.test.mjs` | 零依赖冒烟：bundle factory / 注册面 / inject / 无状态渲染 |
| `test/dom.test.mjs` | jsdom 交互：打字机翻页 / 作答 / 审批 / 输入条 |

## 9. 实施顺序（对应参考文档 Step 1～7）

1. ~~Step 1~~ 本文档（已完成）
2. Step 2 逻辑舞台：`Stage.tsx` + 背景/立绘层（先用 manifest 占位立绘）
3. Step 3 manifest：鲸鱼娘 3 差分（neutral/smile/thinking），同一画布同一锚点
4. Step 4 6 命令：`showCharacter / setPortrait / move / hide / showDialogue / clearDialogue`（adapter 内部封装）
5. Step 5 主题：DialogueBox 主题 token（对话框/名字牌/选项）
6. Step 6 30 秒人工演示：用真实会话数据走一遍「出场→说话→提问→历史」
7. Step 7 接 Agent：adapter 对 `s.nodes` + `s.partial` + `s.pending` 实时映射（本插件直接以真实会话为数据源，Step 6/7 合并）

## 10. 验收清单（第一版 DoD）

- [ ] 标签栏出现「galgame 模式」，位于轨迹右侧；点击切换无报错
- [ ] 切回「聊天」历史完整；再切回 galgame 状态可重放
- [ ] 鲸鱼娘立绘显示；差分切换无跳位
- [ ] 用户消息与回复以对话框呈现，工具调用/思维链不可见
- [ ] 长回复分句，点击/空格逐句；流式输出时自动推进不阻塞
- [ ] 提问工具触发时显示 GalGame 选择窗口，选择后 agent 正常继续
- [ ] 右上角历史按钮展开完整回放
- [ ] 说话时立绘弹跳；`prefers-reduced-motion` 下无动画
- [ ] 1280×720 ~ 2560×1440 缩放不崩、不漂移
- [ ] 插件停用后标签栏消失，无残留样式/报错
