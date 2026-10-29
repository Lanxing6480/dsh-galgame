# 2026-10-30 完整插件组合隔离复测

> 本文记录发布前的验证过程，当时修复包仍使用 1.2.0 版本号；对应代码已纳入 [v1.2.1 补丁](releases/1.2.1.md)。下文的「未发布」描述测试时状态。

## 当前结论

原版 Galgame 1.2.0 在本次隔离环境中没有复现「普通聊天只剩思考、正文消失」。女仆/虎鲸皮肤、全部列举插件、重启、Galgame 与普通对话切换均已实际操作。不能把下面的修复称为原反馈症状的已验证修复，也不能断言反馈者的其他版本组合没有问题。

本地已修复两个有证据的问题：

1. **跨会话抢占输入区。** 原版注册全局 `conversation.composer`，selector 匹配所有会话，还共用一个 disposer。现在只匹配当前 `sessionId`，每次挂载独立释放，并跟随上游插槽重声明。真实 SlotCore 回归用原版运行会失败，修复版通过。composer 是输入区，不能直接解释普通助手正文消失。
2. **插件自动带入旧宿主依赖。** 原版的强制 peers 会让默认 pnpm 安装额外下载 0.2.0-rc.2 前端包。现在宿主提供的 Cordis、React、DSH 模块为 optional peers，并显式包含 `^0.2.1-rc.3`。全新 profile 默认安装修复包只增加 1 个包（Galgame 本身）。optional 不是说运行时不需要这些模块，而是避免 npm/pnpm 重复安装宿主提供的模块。

没有修改第三方插件源码、强制覆盖正文 CSS 或替换 DSH 的原生正文渲染器。版本暂保留 1.2.0，未发布 npm。

## 隔离方法与边界

- 独立根目录：`<实验根目录>/galgame-20261030`，以下相对路径均以此目录为基准。
- `runtime` 安装 npm 官方 `@deepseek-ai/dsh@0.2.1-rc.3`，没有替换系统 DSH。
- 子进程独立 `DSH_HOME`、`USERPROFILE`、`HOME`、`APPDATA`、`LOCALAPPDATA`、pnpm/npm 缓存及工作目录；启动器为 `run-isolated.mjs`。
- `compat` 是原版 Galgame + 管理器 + 两款皮肤；`full` 是完整组合与本地补丁；`full-original` 是原版完整组合，额外反转第三方 bundles 顺序。
- 这些 profile 使用与本机 desktop manifest 相同的 `dsh-base` + `dsh-web-app`。CLI 保留 `desktop` 名称供 Electron 专用，测试改用独立名称，通过内置浏览器访问 127.0.0.1:3098。
- **这是完整 DSH Web 运行验证，不是 Electron 桌面壳验收。** 本机安装的 Electron 版实际为 0.2.0-rc.2，未改动它。
- 初轮使用系统 Node 24.19.0；追加使用独立下载的 Node 24.21.0。Windows x64 node.exe 的 SHA-256 与 Node 官方发布清单一致：`ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32`。
- `mock-messages.mjs` 在 127.0.0.1:3099 提供固定 Messages SSE 响应：思考块、分批正文、Markdown、最终结束事件。真实请求经过 DSH 会话/agent、WebSocket、客户端状态和渲染器；没有使用真实模型账号。这验证渲染链，不覆盖所有模型输出形状。
- dsh-pet 保留网页显示、工作状态和碎碎念功能，只把 `display: both` 改成 `web`，防止测试启动额外桌面宠物窗口。

## 已安装的组合

反馈只给出插件简称，没有精确版本。以下是本次可复现清单；任务看板与宠物的同名分支身份仍不能保证一致。

| 包 | 版本 |
|---|---|
| `@lanxing/dsh-galgame` | npm 原版 1.2.0 / 本地修复包 |
| `@smalltailqwq/dsh-client-ui-skin-deep-whale-manager` | 0.1.8 |
| `@smalltailqwq/dsh-client-ui-skin-maid-atelier` | 0.1.9 |
| `@smalltailqwq/dsh-client-ui-skin-orca-link` | 0.1.9 |
| `dsh-better-sidebar` | 0.28.2 |
| `dsh-bili-scroll` | 2.3.0 |
| `dsh-claude-slider` | 2.11.0 |
| `dsh-pet` | 0.3.8 |
| `dsh-pilot` | 0.1.1 |
| `dsh-say` | 0.1.0 |
| `@firetruck666/dsh-task-board` | 1.3.21 |
| `@anionex/dsh-turn-rewind` | 0.3.11 |
| `dsh-whale-widget` | 0.4.2 |
| `misakanet` | 2.50.1 |

deep-whale-manager 是管理器。它启动时默认把两款视觉皮肤关闭；本次通过其设置页分别真正启用皮肤，并核对 `data-dsh-maid-atelier` / `data-dsh-orca-link`，没有把「装了皮肤」当成「皮肤已生效」。

## 浏览器结果

| Galgame / 环境 | 操作 | 观察 |
|---|---|---|
| 原版，皮肤最小组合，Node 24.19.0 | 重启、普通对话、女仆/虎鲸切换 | 新回复和历史正文保留 |
| 原版，女仆皮肤，Node 24.19.0 | Galgame 发送、切回对话 | 台词和完整原生正文均保留 |
| 原版，完整插件组合，Node 24.19.0 | 虎鲸与女仆普通回复、Galgame 视图 | 流式和定稿正文保留，已目视截图检查 |
| 修复版，完整插件组合，Node 24.19.0 | Galgame 发送、返回对话再发送 | 输入区恢复、正文保留 |
| 原版，完整组合倒序，Node 24.21.0 | 女仆皮肤普通回复 | 流式正文可见，结束后四段正文保留 |
| 修复版，完整组合，Node 24.21.0 | 女仆皮肤普通回复 | 结束后四段正文保留，正文末段有可见布局矩形 |

检查了正文 DOM、尺寸、计算样式和截图，原生正文并非只有 DOM 存在。完整组合中能看到回退按钮、侧栏扩展、额外会话视图、模型控件、桌宠和鲸鱼挂件；客户端启动清单包含对应的客户端模块。

### 无关日志与操作记录

- task-board 有 live question stream 不可用及转为轮询的日志；未引发正文丢失。
- 宠物/鲸鱼挂件使用测试密钥查询真实余额接口时收到 401，这是隔离环境没有真实账号所致；不代表聊天响应失败。

## 包管理器对照

普通 `dsh plugin ... add` 同时安装全部包，会在自动补装宿主 peers 时遇到不存在的稳定版本范围，例如 `@deepseek-ai/dsh-client-locale@>=0.2.1 <0.3.0`。

做了三个独立安装对照：原版 Galgame + 全组合、本地补丁 + 全组合、**完全没有 Galgame 的其他插件组合**。三者都能遇到这种预发布 peer 范围冲突，涉及的宿主包不同。因此它是另一项组合安装限制，不能作为 Galgame 导致正文消失的证据，也不声称本补丁解决其他插件的 peer 声明。

运行全组合时使用 `dsh plugin --profile full add --config.auto-install-peers=false ...`，让宿主提供平台模块。该安装差异必须保留在复现边界中。原版最小组合则使用默认安装，锁文件确实记录了 0.2.0-rc.2 peers，但浏览器普通正文仍正常。

## 自动化检查与交付

- 构建通过。
- 95 项本地测试通过：冒烟 13、DOM 26、表情/试演 51、共存 5。
- 共存测试额外使用官方 0.2.1-rc.3 SlotCore，5 项通过；原版对照在「另一个会话」断言选中 EmptyComposer，按预期失败。
- DOM 测试中的 `intentional render failure` 是错误边界用例主动触发，最终 26 项通过。
- `pnpm-lock.yaml` 已同步；初次离线锁文件检查缺少缓存元数据，联网校验后通过。

代码修改集中在 `src/client/index.ts`、`src/client/GalgameView.tsx`、`package.json` 及构建产物；回归位于 `test/compatibility.test.mjs`。修复版客户端 SHA-256 为 `0e4c9b61507e615cea7d8b9ccba8f7fc054738b08714f21f9967bbc25f405ee7`，与运行 profile 内的文件一致；浏览器启动清单的 Galgame rev 为 `8cd4678d01a3`（原版 `507982b08a51`）。

原有 DSH home patch、web/desktop manifest 与测试前哈希一致；原本不存在的两份配置仍未创建。记录位于隔离目录 `artifacts/original-config-verification.json`。测试完成后停止实验进程，保留目录以便复查。最终本地包为 `artifacts/final/lanxing-dsh-galgame-1.2.0-compat-local.tgz`，没有发布或修改原 profile 的依赖清单。

要把原反馈进一步定位为某个渲染问题，仍需故障现场的第一条前端异常或原 profile 的精确依赖/皮肤配置；不能只根据插件名推断哪个插件竞争成功。不要提供密钥或私人聊天正文。
