# 2026-10-29 插件共存排查

> 历史记录：下文描述首次离线排查时的状态。浏览器访问问题随后已修复，完整隔离运行与当前结论见 [2026-10-30 复测记录](compatibility-2026-10-30.md)。

## 结论与修复边界

已复现并修复 GalGame 的默认输入区接管跨会话泄漏。**尚未复现反馈中的普通聊天正文消失，不能把本补丁称为该现象的已验证修复。** 改动留在本地，版本仍为 1.2.0，未发布 npm。

反馈环境为 DSH 0.2.1-rc.3、desktop、Windows 11、Node 24.21.0、GalGame 1.2.0。其他插件只提供了名称，未提供版本；「任务看板」还有多个同名 npm 包。检查使用下表所列可获取版本，不能视为反馈者 profile 的精确复刻。本地 Node 为 24.19.0，已安装 DSH 为 0.2.0-rc.2；另从 npm 隔离解包 0.2.1-rc.3 官方组件进行检查，没有替换本机 profile。

## 已确认的缺陷

1. `conversation.composer` 是 root 作用域的全局 chain。原版在任意 GalGame 视图挂载后注册 `select: () => ({})`，因此会匹配其他会话，抢走其默认输入区，也可能遮掉位于输入区的提问/审批卡。
2. 原版所有视图共用一个 `composerBlocker`。同时挂载两个视图后，任意一个卸载都会移除另一个仍需要的接管项。
3. 原版直接注册 composer，未跟随其上游声明的生命周期；上游撤销再声明插槽后，仍挂载的 GalGame 无法恢复接管。

修复位置：`src/client/index.ts`、`src/client/GalgameView.tsx`。每次挂载通过 `slots.inject('conversation.composer', ...)` 获得自己的释放函数，selector 仅在 `input.sessionId === sessionId` 时命中，其余情况明确返回 `null`。视图卸载释放本次注册；上游插槽重声明时重新注册。

这修复了多会话、分屏和第三方界面共存时的输入区隔离问题。composer 是输入区，并不是助手回复正文的渲染槽，所以不能直接解释反馈中的正文故障。

## 正文链路检查

- npm 已发布 1.2.0 的 `lib/client.js` 与修改前本地构建产物一致，排除了检查错发布内容的情况。
- `dsh.client.inject` 中的 session/conversation/chat 是加载依赖。GalGame 实际新增 `conversation.view` 下的 `galgame` 条目；仅挂入 bundles、尚未挂载视图时，不注册 composer 接管，也未替换官方 chat 正文渲染器。
- GalGame 样式为 CSS Modules；本次未找到直接隐藏官方正文的全局选择器。未修改主题 CSS 来强制覆盖正文可见性。
- 官方 0.2.1-rc.3 仍提供 `useChat().legacy`。检查了节点投影、正文组件和模块加载路径，没有确认一个能导致本反馈的 API 变更。
- DSH 的兼容性检查会包含预发布版本；不能仅凭 `^0.2.0-rc.2` 就断定 0.2.1-rc.3 会跳过插件。实际 profile 的依赖解析和前端启动清单尚未取得，未将“版本混用”定为根因。

## 第三方检查范围

以下为源码/构建产物检查，不代表全部插件一起运行的验收结果。

| 包 | 检查版本 | 重点 |
|---|---|---|
| `@smalltailqwq/dsh-client-ui-skin-deep-whale-manager` | 0.1.8 | 皮肤管理、面板切换、设置插槽；它是管理器，不是第三个独立视觉主题 |
| `@smalltailqwq/dsh-client-ui-skin-maid-atelier` | 0.1.9 | 全局主题样式、正文选择器、DOM 修饰 |
| `@smalltailqwq/dsh-client-ui-skin-orca-link` | 0.1.9 | 全局主题样式、正文选择器、DOM 修饰 |
| `dsh-better-sidebar` | 0.28.2 | 侧栏、独立 side chat、官方插槽与布局样式 |
| `misakanet` | 2.50.1 | 会话视图注册；与 GalGame 同为 order 20，但 id 不同 |
| `dsh-bili-scroll` | 2.3.0 | 会话视图注册；同 order 不等于替换同一个视图 |
| `@anionex/dsh-turn-rewind` | 0.3.11 | 会话操作入口与回退相关集成 |
| `dsh-claude-slider` | 2.11.0 | 设置和模型控制入口 |
| `dsh-whale-widget` | 0.4.2 | 独立挂件 DOM 与样式 |
| `dsh-pet` | 0.3.8 | `shell.overlay` / 设置注册，宠物样式范围；同名分支身份未确认 |
| `dsh-say` | 0.1.0 | Host 插件，无独立 client 正文替换 |
| `dsh-pilot` | 0.1.1 | Host 插件，无独立 client 正文替换 |
| `@firetruck666/dsh-task-board` | 1.3.21 | 中央看板界面和局部 DOM 操作；不确定是否是反馈者使用的包 |

未找到可以确定指认某一个上述插件与 GalGame 导致正文消失的证据。

## 验证

- 构建：`node node_modules/tsdown/dist/run.mjs`。
- 冒烟 13 项、GalGame DOM 交互 26 项、表情规则/试演 51 项。
- 新增 `node --test test/compatibility.test.mjs`，5 项覆盖：仅加载不影响默认界面、跨会话隔离、同会话多次挂载、不同会话/第三方 composer 共存、插槽重声明与卸载。
- 共存测试使用真实 `SlotCore`，上下文的 effect/inject 生命周期为测试夹具；分别使用本机 0.2.0-rc.2 和解包的 0.2.1-rc.3 运行。可设置 `DSH_SLOT_CORE_PATH` 为另一版本 `lib/index.js` 的绝对路径。
- 可设置 `DSH_GALGAME_BUNDLE_PATH` 指向已发布原版 `lib/client.js`，只运行 `--test-name-pattern="another session"`。原版会选中 `EmptyComposer` 而不是其他会话的默认 composer；本地修复后通过。
- 隔离离线探针使用 0.2.1-rc.3 官方前端共享模块与 `AssistantMarkdown`，加载上述管理器和两款皮肤的实际脚本。每个 GalGame 版本检查 40 个组合（加载前/后 × 默认/管理器/女仆/虎鲸/三包同时加载 × 普通文本/Markdown × 流式/定稿），另检查原生正文与 GalGame 同时挂载。原版与修复版各 41 个观察点都保留正文 DOM，未记录 jsdom 运行错误。

离线探针使用合成会话和简化服务，没有执行真实模型请求、完整 DSH 启动或全部第三方插件。jsdom 不提供真实布局，部分现代 CSS 无法解析；正文存在于 DOM **不等于用户看得见**。本机浏览器工具因管理员安全策略校验未通过而无法打开测试页，因此未完成截图、遮挡、动画和 desktop WebView2 验证。

## 原环境复测重点

在保持原插件组合的情况下更新本地补丁并重启，再检查普通聊天正文、GalGame 流式转定稿和切回聊天；若有多会话界面，同时检查其他会话的输入与提问/审批卡。

若正文仍消失，最有区分度的证据是故障时控制台第一条异常，以及正文元素是否还在 DOM、其自身和祖先的 display/visibility/opacity/高度。配合实际依赖版本与前端加载清单，才能区分渲染异常、CSS/布局隐藏、依赖混用或其他插件修改节点。无需提供聊天正文或模型密钥。
