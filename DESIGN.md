# dsh-galgame · DESIGN.md

> GalGame 模式界面插件 · 设计文档（阶段：第一版实现指南）
> 依据：`Agent_GalGame_UI_参考与设计指南_Markdown.md`（视觉小说 UI 参考）+ DSH 0.1.0-rc.6 实际源码契约

## 0. 一句话

在 DSH Web 聊天主界面新增第三个标签栏「galgame 模式」（位于「轨迹」右侧），把真实的 agent 会话渲染成 GalGame 演出：鲸鱼娘立绘 + 差分 + 对话框 + 打字机 + 分句点击 + 提问选项 + 历史回顾。**纯视觉层**：不写会话、不干预 agent 循环，随时可切回常规聊天。

## 1. 目标（12 条需求 → 实现落点）

| # | 需求 | 落点 |
|---|---|---|
| 1 | 差分图片读取人物立绘 | CharacterManifest（portrait 资源 ID）+ PortraitController，图片经 Host 静态路由 `/api/dsh-galgame/assets/*` 加载 |
| 2 | 「轨迹」右边新标签 | `conversation.view` keyed entry：`id: "galgame"`、`order: 20`（chat=0、trajectory=10） |
| 3 | 进入召唤鲸鱼娘立绘 | 默认角色 manifest `deepseek`（鲸鱼娘），Stage 立绘层 |
| 4 | 输入框正常输入 | `conversation.composer` 与 `conversation.view` 相互独立（ConversationRoot 固定渲染 composer），视图内无需自建输入框 |
| 5 | 隐藏工具调用/思维链 | adapter 只提取 `AssistantBlock` 中 `kind === 'text'` 的块；user 侧取 `content` 的 text 块 |
| 6 | 提问工具 → GalGame 选择窗口 | `useSession((s) => s.pending)` 过滤 `kind === 'question'`，ChoicePanel 渲染选项，`wait.respond(...)` 回答案 |
| 7 | 与常规对话不冲突随时切换 | 视图激活态由 conversation 的 store（`s.view`）管理，标签栏原生支持；本插件零状态写 |
| 8 | 说话蹦两下 | CSS keyframes（bounce），`prefers-reduced-motion` 时关闭 |
| 9 | 长输出分句点击 | `splitIntoSentences()` 分句器；DialogueBox 维护句索引，点击/空格推进 |
| 10 | 执行时长输出自动模式 | `s.running` 且流式输出时自动推进分句；用户点击即暂停自动 |
| 11 | 右上角展开历史 | Backlog 抽屉：完整台词回放（含已隐藏的工具信息摘要） |
| 12 | 纯视觉不阻塞 | 只订阅快照 + respond 交互；不发模型请求、不调用 session 写入 |

## 2. 架构（参考文档「聊天数据与演出 UI 分离」）

```
ConversationSnapshot (useSession 只读)
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
- **演出状态只存组件局部**；切换视图/会话后重放历史（由 snapshot 重建），不持久化演出位置。
- **不写 conversation 的任何数据**：不 publish 事件、不注册 conversationEvents。

## 3. 关键契约（来自 DSH 0.1.0-rc.6 源码，非猜测）

### 3.1 标签栏注册（仿 dsh-client-ui-trajectory）
```ts
ctx.slots.inject('conversation.view', () => ctx.slots.register({
  name: 'conversation.view',
  id: 'galgame',
  order: 20,                      // chat=0, trajectory=10 → 第三个
  locale: NS,
  label: () => t('view.galgame'),
  inject: (sessionId) => ({ hooks: { ... }, ... }),
}, GalgameView))
```
- 视图组件标准 props：`useSession, useSessions, useStore, renderSlot, sessionId, actions` + entry inject + `t`。
- 视图切换：`resolveActiveView(tabs, store.view)`，缺失回退 `chat`。✅

### 3.2 会话快照（useSession）
```
s.chat.order: string[]                    节点 key 顺序
s.chat.nodes.get(key) → ChatConversationViewNode
s.nodes: ConversationNode[]               （legacy 顶层，直接可用）
  - UserMessageNode    {kind:'user', seq, time, content: ContentBlock[]}
  - AssistantMessageNode{kind:'assistant', seq, time, turn, step,
                         blocks: AssistantBlock[]}
  - SteeringMessageNode{kind:'steering', ...}
  - ToolResultNode / CommandNode / Compaction / Context / ...
s.partial: {turn, step, blocks: AssistantBlock[]} | null  流式中
s.pending: PendingInteraction[]          提问/审批等待
s.running: boolean                       是否运行中
s.queue: QueuedMessage[]                 输入队列
```

### 3.3 提问交互（仿 dsh-client-ui-user-questions）
```ts
// pending 里 kind === 'question' 的 wait
wait.payload.questions: [{id, question, options?: [{label, description}], multiSelect?, detail?, header?}]
wait.respond({ ok: true, value: { sessionId, answer } })
  // answer: Array<{ questionId, selected: string[], custom?: string }>
wait.respond({ ok: false, error: { code: 'cancelled', message, details: {} } })
```

### 3.4 静态资源（Host 半边）
```ts
ctx.webServer.register({ kind: 'prefix', path: '/api/dsh-galgame/assets', handler })
// handler 从包内 assets/ 目录读文件返回（image/webp, image/png）
```

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
| `src/client/index.ts` | `apply(ctx)`：locale 注册 + `conversation.view` 注册 |
| `src/client/manifest.ts` | 鲸鱼娘 CharacterManifest + 资源 URL 解析 |
| `src/client/adapter.ts` | snapshot → ScriptLine[]（过滤/分句） |
| `src/client/GalgameView.tsx` | 根：订阅快照、编排 Stage/Dialogue/Choice/Backlog |
| `src/client/Stage.tsx` | 立绘层：差分 crossfade + 弹跳 |
| `src/client/DialogueBox.tsx` | 名字牌+文本框+打字机+继续指示 |
| `src/client/ChoicePanel.tsx` | 提问选项（pending question → respond） |
| `src/client/Backlog.tsx` | 历史抽屉 |
| `src/client/*.module.css` | 各组件样式（Design Tokens 集中） |
| `src/index.ts` | Host：`/api/dsh-galgame/assets/*` 静态路由 |

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
