# dsh-galgame · GalGame 模式界面插件

## 简介

在 DSH Web GUI 的聊天主界面新增一个与「聊天」「轨迹」并列的界面栏——「galgame 模式」。该模式下，DeepSeek 娘（鲸鱼娘）以 GalGame 女主角的形式与你对话：立绘 + 差分接口 + 思考气泡 + 打字机对话框 + 分块阅读 + 提问/审批选项 + 历史回顾 + 调试模式。**纯视觉层**：不写会话、不干预 agent 循环，随时可切回常规聊天。

## 能力清单（v1.0.0）

| 能力 | 说明 |
|---|---|
| 独立界面栏 | 注册进 `conversation.view`（id `galgame`、order 20），位于「轨迹」右侧，可随时切换 |
| 立绘舞台 | 鲸鱼娘立绘（透明底 WebP）+ 差分切换接口（crossfade 120ms），说话每句弹跳一次（弹跳后保持居中） |
| 思考气泡 | 流式输出思维链时在立绘旁显示（漫画气泡、可拖拽、自动滚动到底）；提问/审批/定稿后自动收起 |
| 隐藏幕后 | 对话框只显示文本输出，工具调用 / 思维链 / 图片块全部隐藏 |
| 分块阅读 | 按换行分块（表格/列表/代码/引用整块不拆），打字机逐字 + Markdown 渲染，点击/滚轮/◀▶ 翻页 |
| 自动模式 | 模型运行中默认自动推进（约 0.95s/块），点击即接管；滚轮切换跳过打字机 |
| 提问/审批 | 提问工具与权限申请 → GalGame 风格选项框（以立绘为原点绑定、位置固化、多选全量传递、自定义答案支持 Shift+Enter 换行） |
| 用户输入 | 常驻输入条（随内容扩展）；任务执行中默认「插话引导（steer）」发送；你的输入整段显示在对话框（名字牌「你」） |
| 历史抽屉 | 右上角「历史」按钮展开完整台词回放（含流式内容） |
| 设置面板 | 自动翻句 / 打字机速度 / 说话弹跳 / 思考气泡 / 调试模式（各图层彩色边框） |
| 立绘位移 | 提问/审批弹出时立绘自动右移给选项让位，恢复后回到居中 |

## 界面预览

配色主题化：跟随 DSH 当前主题/皮肤（默认浅色、默认深色、皮肤 mod 均自动适配）。

| 默认主题 · 浅色 | 默认主题 · 深色 |
|---|---|
| ![默认浅色](docs/screenshots/default-light.webp) | ![默认深色](docs/screenshots/default-dark.webp) |

| 皮肤 mod（深海女仆工坊 maid-atelier，[Small-tailqwq/dsh-deep-whale](https://github.com/Small-tailqwq/dsh-deep-whale)）· 浅色 |
|---|
| ![皮肤浅色](docs/screenshots/maid-atelier-light.webp) |

> 致谢：本插件的女仆鲸鱼娘立绘素材取自 [dsh-deep-whale](https://github.com/Small-tailqwq/dsh-deep-whale) 皮肤（作者 Small-tailqwq），完整署名链见下方「素材来源与许可」。

## 形态与架构

- 形态：`树外 npm 包`（`@lanxing/dsh-galgame`，link 安装到 web profile）
- 平台：`Host`（立绘静态资源路由）+ `Client`（conversation.view 注册 + GalGame UI）
- 架构（详见 `DESIGN.md`）：

```
ConversationSnapshot (useSession 只读)
  → GalgameAdapter（纯函数：过滤工具/思维链、按换行分块）
  → 演出状态（分块/打字机/自动模式/翻页）
  → Stage（立绘+气泡+浮层插槽）/ DialogueBox / ChoicePanel / ApprovalPanel / Backlog
```

- 关键契约：`conversation.view` keyed slot（id/order/label/inject）、`s.pending`（question/approval 交互）、`ctx.webServer` prefix 路由、`session.prompt(..., 'steer')` 插话引导

## 使用方式

1. 构建：`pnpm install && pnpm build`（在 `plugins/dsh-galgame/` 目录）。
2. 安装（本地 link）：`dsh plugin --profile web add link:H:/Projects/DEEPSE~1/plugins/dsh-galgame`；或从 npm：`dsh plugin --profile web add @lanxing/dsh-galgame`。
3. 重启 DSH Web（`dsh web`）后刷新浏览器。
4. 用户操作入口：聊天主界面顶部标签栏 →「galgame 模式」。

## 立绘资源约定

```
assets/characters/deepseek/
├── portraits/           # 差分图（同画布、同锚点、同基准线，避免切换跳位）
│   └── neutral.webp     # 当前唯一差分（透明底）
└── raw/                 # 原图/素材留档（不参与渲染）
```

- 补差分：把 `smile.webp` / `thinking.webp` / `angry.webp` 等放入 `portraits/`，并在 `src/client/manifest.ts` 的 `portraits` 表里增加条目（组件全链路已按 portrait ID 解析，接口已预留；表情规则引擎规划中，见 DESIGN.md）。
- 差分切换动画与「说话弹跳」在 `src/client/galgame.module.css`（`ggPortraitFade` / `ggBounce`），`prefers-reduced-motion` 下自动关闭。

## 源码与版本

| 版本 | pluginId | 变更说明 | 状态 |
|---|---|---|---|
| 1.0.0 | galgame | 稳定版：全功能验收通过（立绘居中修复/思考气泡流式/选项框位置固化/多选传递/用户输入显示/调试模式） | 已发布 |

- Client 入口：`src/client/index.ts`（locale + conversation.view 注册 + steer 发送）
- Host 入口：`src/index.ts`（`/api/dsh-galgame/assets/*` 静态路由）

## 限制与注意事项

- 差分自动情绪分类未做（规划中，见 DESIGN.md 表情方案）：台词当前固定 `neutral`，差分接口已预留。
- 播放状态只存组件局部：切换会话/视图后从快照重建，不持久化演出位置。
- 立绘为透明底 WebP；原图（白底 JPG）仅留档于 `raw/`。
- 纯前端渲染 + `pending.respond`，不发模型请求、不阻塞 agent 循环。
- 选项框/审批框位置已固化为默认值，仅调试模式可拖拽调整。

## 素材来源与许可

本插件**代码**（`src/`、`build/`）以 **MIT** 许可发布；**立绘素材**（`assets/`）为衍生创作，以 **CC BY-NC-SA 4.0**（署名-非商业性使用-相同方式共享）发布，**禁止任何商业性使用**。

立绘素材为衍生创作，署名链（详见 `NOTICE`）：

1. **一创 上善**（[Pixiv](https://www.pixiv.net/users/62155430) · [Bilibili：上善无形](https://b23.tv/8h5L4xz)）—— 鲸鱼娘角色形象原作者
2. **二创 zipzip**（[Pixiv](https://www.pixiv.net/users/18604994) · [Bilibili：ZipZipPipe](https://b23.tv/Pnw6nG8)）—— 在其形象上加入 DeepSeek 元素的女仆鲸鱼娘二次设计（生成模型 GPT Image 2）
3. **三创 Small-tailqwq**（[dsh-deep-whale / maid-atelier](https://github.com/Small-tailqwq/dsh-deep-whale)）—— 本插件使用的女仆鲸鱼娘立绘素材即来自该皮肤（DeepSeek 元素再设计）

素材源文件在 `assets/characters/deepseek/`（`portraits/neutral.webp` 为透明底成品，`raw/` 为原图留档）。完整许可文本见 `LICENSE` 与 `NOTICE`。

## 维护位置

- 本项目 `plugins/dsh-galgame/`

## 变更日志

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-08-15 | 0.0.0 | 创建目录骨架：README + src/client + src/host（规划中） |
| 2026-08-15 | 0.1.0 | 第一版实现：DESIGN.md、adapter/Stage/DialogueBox/ChoicePanel/Backlog、Host 资源路由、鲸鱼娘立绘接入（neutral） |
| 2026-08-15 | 1.0.0 | 稳定版：立绘居中（弹跳动画 keyframes 修复）、思考气泡（漫画风/流式滚动/拖拽/以立绘为原点）、选项框（位置固化/多选传递/输入框 textarea 换行/调试模式可拖）、用户输入显示、按换行分块、审批接入、滚轮翻页/跳过打字机、调试模式边框 |
