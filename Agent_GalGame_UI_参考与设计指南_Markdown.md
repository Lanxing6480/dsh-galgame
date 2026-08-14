# Agent × GalGame UI

## 参考项目、UI 设计规范与第一阶段实现指南

> 面向“想把 Agent 对话做成视觉小说式舞台”的开发者 / 设计者

目标很克制：先做一个可靠、好看、容易扩展的 VN/GalGame UI Runtime。支持人物差分切换、立绘移动、显示/隐藏、名字牌与聊天框；暂时不做自动导演、复杂镜头、Live2D 或剧情系统。

| **调研日期** | 2026-08-14                                                              |
|--------------|-------------------------------------------------------------------------|
| **资料范围** | 开源 VN 引擎 / UI 模板 / Godot & Web 方案 / 设计 Skill / 游戏 UI 参考库 |
| **适用场景** | Agent 聊天前端、角色陪伴应用、轻量视觉小说界面、对话式桌面工具          |

> 本文中的尺寸、透明度、动效时长等数值均作为**起始建议值**，不是行业强制标准。实际项目应根据人物素材、窗口比例、字体和目标设备进行调整。

**一句话结论**

如果现有 Agent 已经是 Web UI：优先做 DOM/CSS 的轻量 VN 舞台层；如果希望人物层以后承担更多 2D 特效，再把人物舞台替换为 PixiJS。架构上重点借鉴 Dialogic 的 Portrait / Layout / Style 分离，以及 Tsuzuru 的 Runtime / UI / Theme 分层。

# 如何使用这份文档

不是“选一个引擎照抄”。建议先看第 1～3 节确定边界，再从第 4 节选 3～5
个项目做源码阅读，最后按第 8 节做最小原型。

**01** 先明确：你现在要做的是什么

**02** 推荐的最小 UI 架构

**03** 技术路线怎么选

**04** 17 个值得参考的开源项目 / 文档

**05** 美术与 UI 设计经验

**06** 可直接采用的设计规范起始值

**07** 设计 Skill 与视觉参考库

**08** 第一阶段实施顺序

**09** 验收清单与常见坑

**10** 参考资料索引

> **阅读建议**  
> 如果你只想快速开工：先读「02 最小 UI 架构」「05 美术与 UI 设计经验」「08 第一阶段实施顺序」，然后把 Dialogic 2、EasyRenPyGui、Tsuzuru、Atrament Template 四个项目打开对照着看。

# 01 先明确：你现在要做的是什么

它不是完整 GalGame 引擎，也不是 Agent
自动演出系统。它更像一个“视觉小说舞台组件”：会话系统把当前说话者、文本与少量展示指令交给它，它只负责把这些状态稳定地画出来。

> **第一阶段边界**  
> 必须有：背景层、人物立绘层、差分切换、人物移动、显示/隐藏、对话框、名字牌、打字机/立即显示。可以留接口但先不做：屏幕震动、镜头、BGM/SFX、Live2D、自动表情分类、自动导演。

## 把“聊天数据”和“演出 UI”分开

最重要的工程边界，是让会话本身不知道你正在使用 GalGame
UI。对话记录仍然是普通消息；VN UI
只是这条消息的一种展示方式。这样以后可以在“普通聊天视图 / VN 视图 /
纯文本视图”之间切换，而不会破坏历史记录。

```text
Conversation / Agent
│
│ message + optional presentation state
▼
Presentation Adapter
│
├── VNStage (background / portraits)
└── DialogueLayer (name / text / controls)
```

## 第一版只需要 6 个动作

```text
showCharacter(characterId, portrait, position)
setPortrait(characterId, portrait)
moveCharacter(characterId, position, motion?)
hideCharacter(characterId)
showDialogue(speaker, text, options?)
clearDialogue()
```

这 6 个动作已经足够复现绝大多数“静态立绘 + 差分 + 简单位移 +
对话框”的视觉小说基本演出。之后增加 focus、shake、camera、audio
时，不需要推翻第一版。

# 02 推荐的最小 UI 架构

下面这套分层不是绑定 React、Godot 或 Ren'Py；它是一个可以直接移植到任意
UI 技术栈的结构。

| **层 / 模块**      | **职责**             | **第一阶段内容**                         |
|--------------------|----------------------|------------------------------------------|
| BackgroundLayer    | 背景显示与切换       | 单背景；淡入淡出可选                     |
| CharacterLayer     | 人物实例、位置、层级 | 1～3 人；bottom anchor；x/y/scale/z      |
| PortraitController | 差分与资源选择       | neutral / smile / angry…；crossfade      |
| MotionController   | 人物位移             | left / center / right / custom；ease-out |
| DialogueLayer      | 名字与文本           | NamePlate、TextBox、ContinueIndicator    |
| Theme / Tokens     | 外观参数             | 颜色、字体、间距、圆角、透明度、动效时长 |

## 人物资源不要写死成“某张 PNG”

第一版可以真的只用整张 PNG/WebP
差分，但数据模型最好从一开始就把“portrait”当成资源
ID，而不是文件路径。这样未来换成分层差分、Spine 或 Live2D 时，上层 API
不变。Dialogic 的 Portrait 资源、Ren'Py 的 layeredimage
都体现了这个思路。

```text
CharacterManifest
id: "alice"
displayName: "Alice"
anchor: [0.5, 1.0]
baseScale: 1.0
portraits:
neutral: { type: "image", src: "neutral.webp" }
smile: { type: "image", src: "smile.webp" }
angry: { type: "image", src: "angry.webp" }
```

**参考：**[Dialogic 2 · Character &
Portraits](https://docs.dialogic.pro/characters-and-portraits.html)

**参考：**[Ren'Py · Layered
Images](https://www.renpy.org/doc/html/layeredimage.html)

## 推荐的数据流

```text
Agent / Conversation state
↓
PresentationState
activeSpeaker
dialogueText
characters[]
↓
VN Runtime
↓
Renderer / Components
```

PresentationState
应该是可序列化、可调试的。不要让“当前立绘在哪、用哪个表情、是否显示”散落在组件内部的临时状态里；否则一旦切换会话、恢复窗口或重绘，就很容易出现立绘状态错乱。

# 03 技术路线怎么选

| **场景**                     | **推荐路线**                            | **为什么**                                                            | **优先参考**                   |
|------------------------------|-----------------------------------------|-----------------------------------------------------------------------|--------------------------------|
| 现有 Agent 是 Web UI         | DOM/CSS + TypeScript；必要时再加 PixiJS | 当前需求只涉及图片、transform、文本；DOM 足够简单，CSS 设计自由度最高 | Tsuzuru / webTaleKit / Pixi'VN |
| 想做成“游戏感”更强的独立前端 | Godot + Dialogic 2                      | 人物、动画、Control UI、资源管理都在同一编辑器里                      | Dialogic 2 / gd_dialog         |
| 本身就是传统 VN 项目         | Ren'Py                                  | 抽象成熟，资料最多，差分/Transform/Screen 都是现成范式                | Ren'Py / EasyRenPyGui          |
| 追求极轻、跨平台 runtime     | Suika3 / Web runtime                    | 结构薄，适合学习“最小 VN 引擎”如何组织                                | Suika3 / Tuesday JS            |

> **对 Agent 前端的默认建议**  
> 不要为了“像 GalGame”就先塞一个完整 VN 引擎。若原应用已经使用 Web 前端，第一版用普通 DOM/CSS 就能把人物差分、位移、名字牌和对话框做好；等需要大量粒子、复杂遮罩、2D 骨骼动画时，再把人物舞台迁到 PixiJS。

> **插图说明：** 原 DOCX 中此处包含参考截图。Markdown 版不内嵌本地二进制图片；请通过下方对应参考链接查看原始项目/文档。

图 1｜Ren'Py 官方 GUI
定制示例：它最值得学的是“舞台、人物、文本框、快捷操作”之间的结构边界，而不是默认皮肤本身。

**参考：**[Ren'Py GUI Customization
Guide](https://www.renpy.org/doc/html/gui.html)

# 04 17 个值得参考的开源项目 / 技术文档

不建议全都读。标记为 ★★★ 的项目最值得先开仓库；★★ 是补充视角；★
只在对应技术路线下阅读。

## 1. Dialogic 2

**★★★ Godot / MIT**

当前最值得抄“结构”的项目：Character、Portrait、Character Event、Layout
Scene、Style 分开；支持 portrait 的 scale / offset / mirror，且可以用
Layered Portrait
组合身体、头、嘴等层。对你而言，最重要的是它证明“人物资源”“舞台行为”“UI
样式”应该是不同层。

**怎么读：**重点读：Character & Portraits、Styles & Layouts、Layered
Portraits。

**参考：**[项目 / 文档入口](https://github.com/dialogic-godot/dialogic)

## 2. Ren'Py

**★★★ Python / VN Engine**

视觉小说领域最成熟的抽象教材。Screen/Style 负责 UI，Transform/ATL
负责显示对象的位置与运动，layeredimage 负责分层差分，Side Image
负责跟随说话角色自动选头像。即便不使用
Ren'Py，也值得把这些概念抄成自己的 API。

**怎么读：**重点读：GUI、Displaying Images、Transforms、Layered
Images、Side Images。

**参考：**[项目 / 文档入口](https://github.com/renpy/renpy)

## 3. Tsuzuru

**★★★ TypeScript + Preact / MIT**

非常适合 Web Agent 前端参考。它明确把 scenario、core runtime、Preact
adapter、standard UI、theme-\*、visual/effect/camera plugins
分开；官方主题甚至是独立 CSS variable package。这个结构和“Agent
逻辑与演出 UI 解耦”高度一致。

**怎么读：**重点扒：packages/standard-ui-preact、theme-\*、plugin-std-visual。

**参考：**[项目 / 文档入口](https://github.com/tsuzuru-engine/tsuzuru)

## 4. Pixi'VN + React Template

**★★★ TypeScript + PixiJS + React / LGPL-2.1**

Pixi'VN 本身故意不提供内置 UI，而是让 React/Vue
等外部框架负责界面，PixiJS 负责 2D canvas。这种“人物舞台 =
游戏渲染层、对话框 = 普通前端组件”的组合很适合未来需要更强 2D 特效的
Agent。

**怎么读：**配套模板：pixi-vn-react-template；第一版若不需要复杂特效，可先不引入
PixiJS。

**参考：**[项目 /
文档入口](https://github.com/DRincs-Productions/pixi-vn)

## 5. webTaleKit

**★★★ TypeScript / MIT**

Web-first VN engine，明确强调 HTML/CSS/JavaScript 自由定制
UI，并有自动缩放与图像处理能力。特别适合作为“用普通 Web 技术做 VN
界面”的证据和参考。

**怎么读：**重点看 UI 自定义、自动 scaling、场景/角色脚本与 UI 的边界。

**参考：**[项目 / 文档入口](https://github.com/EndoHizumi/webTaleKit)

## 6. EasyRenPyGui

**★★★ Ren'Py Template**

不是为了漂亮，而是为了“把复杂默认 GUI 拆干净”。它把 screens
分到独立文件，并简化 style
依赖；对第一次设计自己的对话框、名字牌、历史记录、选择框，非常适合学习一个最小可维护
UI 工程应该长什么样。

**怎么读：**重点扒：game/dialogue_screens.rpy、styles.rpy、choice_screen.rpy。

**参考：**[项目 / 文档入口](https://github.com/shawna-p/EasyRenPyGui)

## 7. Atrament Visual Novel Template

**★★★ Web + Preact + Ink / MIT**

一个非常对题的轻量模板：人物 emotion swaps、侧边锚定对话框、name
plate、choice button、click-to-continue、timer bar，并用一个 CSS token
文件统一主题。非常适合学习“数据不动，只换 token 就换一套皮肤”。

**怎么读：**适合直接看 CSS tokens、portrait slot、dialogue component
的关系。

**参考：**[项目 /
文档入口](https://github.com/maziminds/atrament-visual-novel-template)

## 8. RuolinZheng Ren'Py Template

**★★ Ren'Py**

演出效果样例库：眨眼、表情组合、昼/暮/夜/暗/sepia、视差、眼睛开合转场、additive
blend。第一阶段不必实现，但可以提前观察这些效果如何在“人物组件”之上叠加。

**怎么读：**把它当效果 cookbook，而不是整体架构。

**参考：**[项目 /
文档入口](https://github.com/RuolinZheng08/renpy-template)

## 9. Monogatari

**★★ TypeScript / MIT**

现代 Web VN 引擎。价值在于它天然把 VN 当网站：HTML/CSS
的生态可以直接用于 UI，适合研究 Web component、响应式和浏览器部署。

**怎么读：**如果你确定走 Web-only，可与 webTaleKit 对照。

**参考：**[项目 / 文档入口](https://github.com/Monogatari/Monogatari)

## 10. RenJS V2

**★★ TypeScript + Phaser**

典型“传统 VN action → Phaser 2D”的实现：show/hide
character、background、dialog、audio、special effects
都是脚本动作；并提供 GUI Builder。适合研究动作 API 应该怎么命名和组织。

**怎么读：**重点不是脚本语言，而是 action vocabulary。

**参考：**[项目 / 文档入口](https://github.com/lunafromthemoon/RenJS-V2)

## 11. Tuesday JS

**★★ Pure JavaScript / DOM**

几乎不靠第三方库，直接用 HTML div/img + CSS 做
VN；还做了根据窗口尺寸调整的 Dynamic display
mode。它很适合验证：你的第一版真的不需要重型引擎。

**怎么读：**适合看 DOM 版人物和文本框如何最小化实现。

**参考：**[项目 / 文档入口](https://github.com/Kirilllive/tuesday-js)

## 12. Suika3

**★★ C / Zlib**

轻量、可移植的 VN middleware，GUI 与 Anime
都是专门的一等能力。若你想理解“一个小型 VN runtime
最终必须保留什么”，它比通用游戏引擎更有参考意义。

**怎么读：**适合做底层架构对照，不适合直接嵌入 Web Agent。

**参考：**[项目 / 文档入口](https://github.com/awemorris/suika3)

## 13. VisualNovelKit

**★★ Godot**

Godot 方向的组合式模板，文档明确指出 UI scenes 与代码都在 scenes
目录，可直接改。适合观察“UI scene 作为可替换模块”这一做法。

**怎么读：**如果选 Godot，和 Dialogic 一起看。

**参考：**[项目 /
文档入口](https://github.com/rakugoteam/VisualNovelKit)

## 14. gd_dialog

**★★ Godot / MIT**

比 Dialogic 更小、更容易读。README 直接说明：想做 VN-style portrait
transition，就给头像挂 AnimationPlayer；想换 panel，就换 PanelContainer
/ NinePatchRect。非常适合学习“先用最朴素节点搭出来，再逐步增强”。

**怎么读：**第一版 Godot 原型的学习成本很低。

**参考：**[项目 / 文档入口](https://github.com/QueenChristina/gd_dialog)

## 15. SillyTavern Visual Novel Mode

**★★★ Web / Agent UI**

它最有价值的地方不是美术，而是“现有聊天系统如何加一层角色立绘舞台”。VN
Mode 会为角色 sprite 改变聊天布局，多角色时会展开排列。对 Agent
项目而言，这是最贴近真实产品边界的参考。

**怎么读：**重点观察：聊天数据未因 VN Mode 而变成脚本。

**参考：**[项目 /
文档入口](https://docs.sillytavern.app/usage/user-settings/visual-novel/)

## 16. Within Parameters Visual Novel

**★★ TypeScript / MIT code + CC-BY docs**

难得把工程和设计文档都公开：仓库有 game-design、Art Direction
Bible、storyboard、engine spec、asset
pipeline。它更适合学习“设计语言如何写成可交付文档”，而不是直接抄 UI。

**怎么读：**重点看 game-design/art-direction-bible.md 与 spec。

**参考：**[项目 /
文档入口](https://github.com/vintagedon/within-parameters-visual-novel/)

## 17. Java Vector Nexus

**★★ Java / MIT**

它的 dialogue-layout 文档把 textbox geometry、name box、dialogue
text、choice buttons、fonts、colors、character framing
变成配置项。非常适合拿来检查自己的 UI 配置是否漏项。

**怎么读：**重点文档：docs/scripting/ui/layout/components/dialogue-layout.md。

**参考：**[项目 /
文档入口](https://github.com/S1mplector/Java-Vector-Nexus)

> **插图说明：** 原 DOCX 中此处包含参考截图。Markdown 版不内嵌本地二进制图片；请通过下方对应参考链接查看原始项目/文档。

图 2｜Godot Visual Novel Dialogue
Example：即使视觉很朴素，也能清楚看出“背景 / 人物 /
底部文本层”的最小结构。

**参考：**[Visual Novel Example Project (Nathan
Hoad)](https://nathanhoad.itch.io/godot-dialogue-example-project-visual-novel)

# 05 美术与 UI 设计经验：先让它“像一个作品”，再让它“像 GalGame”

视觉小说 UI
最常见的问题不是“不会画对话框”，而是所有元素都各自漂亮，却没有统一视觉语法。第一阶段应该先确定画面层级、角色权重、排版规则和材质语言。

## 5.1 角色优先：对话框不应该和人物抢主视觉

- 角色立绘通常是主视觉；文本框是“阅读工具”，除非你的美术方向本身就是强平面设计。

- 对话框背景优先使用稳定的明暗块、半透明材质或低细节纹理；避免在正文背后放高频图案。

- 名字牌应比正文更有身份感，但面积要小。让“谁在说话”一眼可辨，不要比角色脸还抢。

## 5.2 先选择一种视觉语法，不要混搭

| **方向**           | **典型特征**                                 | **适合怎么做**                                              |
|--------------------|----------------------------------------------|-------------------------------------------------------------|
| 角色优先 / 轻量    | 大立绘、低 UI chrome、亮色或透明材质、控件少 | 更接近《蔚蓝档案》式的“人物是画面中心”体验；适合 Agent 陪伴 |
| 编辑设计 / 强排版  | 网格、强字体层级、几何切片、信息条、留白     | 更接近《明日方舟》式平面设计；适合世界观、组织感强的 Agent  |
| 传统 VN / 舒适阅读 | 底部大文本框、名字牌、清晰选择框、稳定布局   | 最省认知成本，适合长文本与剧情型对话                        |

> **不要“像某个游戏”到像素级复刻**  
> 可以学习构图、层级、材质、动效节奏和排版逻辑，但应重新定义自己的色彩、图形符号、字体与装饰语言。这样更容易形成可长期维护的主题系统，也避免把项目锁死在单一作品的视觉外观上。

## 5.3 建立 Design Tokens，而不是散落 CSS / Theme 值

至少把下列值集中管理：

- 颜色：surface、text-primary、text-secondary、accent、speaker-accent、overlay。

- 字体：speaker、dialogue、ui-small；中文正文与英文/数字最好都做实际混排测试。

- 几何：dialogue width/height、name plate、padding、radius、portrait
  safe area。

- 动效：expression crossfade、move、enter/leave、text reveal。

- 人物状态：active / inactive 的 brightness、saturation、scale 或 blur。

```text
theme.dialogue.surface = rgba(...)
theme.dialogue.padding = ...
theme.typography.dialogue = ...
theme.motion.expression = ...
theme.character.inactiveBrightness = ...
```

**参考：**[Dialogic 2 · Styles &
Layouts](https://docs.dialogic.pro/styles-and-layouts.html)

**参考：**[Tsuzuru · theme
packages](https://github.com/tsuzuru-engine/tsuzuru)

## 5.4 人物舞台应该用“锚点 + 槽位”，不要手写像素

人物图片统一以 bottom-center 为主要锚点，位置使用逻辑坐标或 slot
名称。即使最终允许 custom x/y，也不要让剧情/Agent 层直接写 CSS left:
473px。

```text
position: "left" | "center" | "right" | { x: 0.42, y: 1.0 }
anchor: { x: 0.5, y: 1.0 }
```

好处是窗口缩放、换分辨率、换立绘尺寸时不会整体崩掉。Dialogic 的 portrait
position + scale/offset/mirror、Ren'Py transform 都是成熟先例。

## 5.5 差分切换要“看不见技术痕迹”

- 同一角色的不同差分必须使用一致画布尺寸、人物基准线和锚点。否则切换时会“跳脸”。

- 尽量让差分文件只改变真正需要变的部分；若整张导出，也必须保持边界盒一致。

- 默认用短 crossfade；不要每次换表情都带明显缩放、弹跳或闪白。

- 大幅姿势变化可以被当成 portrait
  切换，但最好使用独立过渡规则，避免和轻微表情一视同仁。

## 5.6 对话文本是核心体验，不要把 Agent 输出当网页文章塞进去

- 长回复应分页/分段呈现，或者允许文本框临时扩展；不要让底部框一次堆
  8～12 行。

- 优先保证正文行距、字重、断行和标点可读性；装饰字体只用在名字牌或标题。

- 打字机效果应允许“一次点击立即显示全部文本”，第二次点击再继续。

- 历史记录 / 原始消息应由聊天系统保存，VN UI 不要成为唯一文本载体。

# 06 可直接采用的设计规范起始值

这些不是行业硬标准，而是一套适合 1920×1080
逻辑画布的“可用起点”。做出第一版后应根据实际立绘、字体和目标窗口大小校正。

| **项目**        | **建议起始值**                                                           |
|-----------------|--------------------------------------------------------------------------|
| **逻辑画布**    | 1920×1080；所有人物位置用归一化坐标或 slot，渲染层再映射到真实窗口。     |
| **对话区高度**  | 约 20%～28% 画面高度；长文本优先分页，而不是无限向上长。                 |
| **对话区宽度**  | 约 76%～90% 画面宽度；轻量风可更窄，传统 VN 可接近全宽。                 |
| **正文大小**    | 1080p 起步约 28～34 px；根据字体 x-height 与观看距离调整。               |
| **名字牌**      | 正文的 0.85～1.0 倍字高，但字重/颜色更明确；避免巨大标题化。             |
| **正文行数**    | 常态 2～4 行；超过时分页、滚动或临时扩展。                               |
| **人物 anchor** | 默认 bottom-center；角色脚底/身体基线统一。                              |
| **差分切换**    | 90～160 ms crossfade 起步；普通表情切换避免夸张位移。                    |
| **人物位移**    | 180～320 ms ease-out 起步；进退场可 260～450 ms。                        |
| **非当前人物**  | 优先降低亮度/饱和度 10%～25%，不要直接 opacity 降到“幽灵”。              |
| **小幅位移**    | 1080p 约 12～40 px 作为轻微反应的量级；显著走位使用屏宽百分比。          |
| **正文对比度**  | 若使用 Web 前端，建议按 WCAG 2.2 正常文字至少 4.5:1 作为最低可读性目标。 |
| **减少动效**    | Web 版应支持 prefers-reduced-motion；至少能关闭非必要人物抖动/位移动画。 |

**参考：**[W3C WCAG 2.2 · Contrast
(Minimum)](https://www.w3.org/TR/WCAG22/)

**参考：**[W3C · prefers-reduced-motion
technique](https://www.w3.org/WAI/WCAG22/Techniques/css/C39)

## 资源规范建议

- 同角色全部差分使用同一画布尺寸、同一人物锚点、同一裁切规则。

- 透明立绘优先 PNG/WebP；Web 场景可评估无损 WebP 以降低内存和下载量。

- 每个角色写 manifest，别靠文件名正则猜角色状态。

- 提前定义“safe crop”：头顶、手部、裙摆等是否允许被窗口边界裁切。

- UI 图形尽量使用 9-slice / SVG / CSS
  shape，避免每个分辨率出一套整张对话框图片。

```text
assets/
characters/
alice/
manifest.json
portraits/neutral.webp
portraits/smile.webp
portraits/angry.webp
backgrounds/
ui/
fonts/
themes/
```

# 07 设计 Skill 与视觉参考库

代码项目告诉你“怎么实现”；这些资源更适合告诉 AI
或设计者“怎么避免做成默认模板味”。

## Anthropic frontend-design

**★★★**
负责视觉方向、字体、构图和“不要做成模板默认值”的设计判断。适合在写 UI
代码前先建立清晰 aesthetic direction。

**参考：**[Skill /
Repository](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)

## UI/UX Pro Max

**★★★** 可搜索的 UI/UX 知识库，覆盖 style、palette、font pairing、UX
guideline、motion preset 和不同技术栈。更适合做 Design System
与检查清单。

**参考：**[Skill /
Repository](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)

## Open Design Game UI Skills

**★★★** 最值得学的是流程：visual concept → handoff contract →
interactive lab → acceptance gate → engine
takeover。作者明确强调“输入工程质量 \>
模型差异”，而且把正交视觉规则、截图证据、性能预算写进交付。

**参考：**[Skill /
Repository](https://github.com/joeeeeey/open-design-skill)

## awesome-gamedev-agent-skills · visual-novel

**★★** 可移植 SKILL.md，覆盖 visual novel
的角色/背景显示、textbox、choice、backlog
等功能性知识。它偏功能，不是高级美术指导。

**参考：**[Skill /
Repository](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/main/skills/genres/visual-novel/SKILL.md)

## GD Agentic Skills

**★** 如果最终选 Godot，可补充 godot-dialogue-system / visual-novel
类工程模式，作为 AI 编码时的长期知识库。

**参考：**[Skill /
Repository](https://github.com/thedivergentai/gd-agentic-skills)

## 视觉参考库：不要只搜“visual novel UI”

最有效的方法是按“组件问题”搜参考，而不是只按游戏类型搜。例如：Dialogue、Choice、Nameplate、Character
HUD、Subtitle、History、Pause、Settings。这样能看到不同类型游戏解决同一
UI 问题的方式。

- Game UI Database：大量游戏 UI 截图与筛选，是做 moodboard / competitor
  audit 的高效率工具。

- Interface In Game：按 UI 类型浏览截图与视频，Dialogue
  类尤其适合找对话排版和角色信息呈现。

**参考：**[Game UI Database](https://gameuidatabase.com)

**参考：**[Interface In Game](https://interfaceingame.com/)

> **推荐的参考板做法**  
> 不要收 50 张“好看图”。只收 8～12 张，并分成 3 组：①对话框与名字牌；②人物在屏幕里的尺寸/站位；③按钮、转场、状态反馈。每张图写一句“我到底要学它什么”。

# 08 第一阶段实施顺序：先做什么

建议把第一阶段做成一个可独立运行的“单场景 UI Lab”，而不是直接嵌进完整
Agent。这样视觉问题、资源问题、运行时问题能分开查。

## Step 1｜先写一页 DESIGN.md

只定义视觉方向、目标分辨率、角色比例、对话框位置、字体、颜色、材质、动效强弱。不要先写组件。

## Step 2｜建立 1920×1080 逻辑舞台

BackgroundLayer + CharacterLayer + DialogueLayer
三层。窗口缩放时只缩放/重排，不改语义位置。

## Step 3｜做一个角色 manifest

准备 3 个差分：neutral / smile / angry；保证三张图同画布、同 anchor。

## Step 4｜实现 6 个 Runtime 命令

show / hide / setPortrait / move / showDialogue /
clearDialogue。不要再加功能。

## Step 5｜做两个 Theme

一个“角色优先亮色”、一个“编辑设计明亮工业感”。验证 Style/Theme
是否真的与 Runtime 解耦。

## Step 6｜做 30 秒人工演示脚本

固定顺序触发：出场 → 说话 → 换表情 → 移动 → 第二人加入 → 当前角色高亮 →
退场。用它做视觉验收。

## Step 7｜再接 Agent

Adapter 只把当前消息与人物状态转换成 runtime
命令。此时仍然不做自动导演。

## 建议的第一阶段 Definition of Done

- 窗口从 1280×720 到 2560×1440 缩放时，人物不漂移、文本不溢出。

- 同角色 3 个差分连续切换时，头部与身体基准线不跳。

- 两名角色能在 left / center / right 间移动，不互相遮挡到无法阅读。

- 对话框 2～4 行文本稳定，长文本有明确的分页/展开策略。

- Theme 切换不修改 runtime / character controller 代码。

- 关闭动画时，所有操作依然可用；快速连续触发不会把人物卡在中间状态。

- 普通聊天记录仍然完整存在，VN UI 关闭后不会丢消息。

> **第一阶段明确不做**  
> 自动情绪分类、LLM Director、镜头系统、BGM/SFX 编排、Live2D、Spine、分层嘴型、复杂粒子、剧情分支编辑器、存读档系统。现在做这些只会让“一个对话框到底好不好看”变得更难判断。

# 09 验收清单与常见坑

| **检查项**     | **通过标准**                                                          |
|----------------|-----------------------------------------------------------------------|
| **视觉层级**   | 第一眼先看到人物脸与当前说话者，而不是边框、按钮和阴影。              |
| **排版**       | 正文在最亮/最花背景下仍可读；中英文、数字、标点混排没有明显跳字。     |
| **差分**       | 切换表情不发生人物整体跳动、缩放、左右漂移。                          |
| **站位**       | 不同身高/画布尺寸角色进入同一 slot 后仍有一致的“脚底基线”或视觉基准。 |
| **响应式**     | 宽屏和较窄窗口都不会把角色脸裁掉或让文本框遮住整个角色。              |
| **状态**       | 切换会话、最小化恢复、重新渲染后，人物/差分/站位状态能恢复。          |
| **动效**       | 快速点击时动画可打断或合并，不会叠成越来越远的 transform。            |
| **主题**       | 颜色/字体/边距/材质不散落在几十个组件里。                             |
| **可访问性**   | 正文高对比；可关闭非必要动画；按钮不能只靠颜色区分状态。              |
| **Agent 边界** | LLM 输出不直接带 CSS/坐标；展示命令由 Adapter 产生。                  |

## 几个非常常见的坑

- “每个差分尺寸差不多就行” → 不行。差几像素都可能在 crossfade
  时产生明显抖动。

- “先把人物 position 写成 CSS 像素值” → 后面做缩放和多角色站位时会很痛。

- “对话框做得越华丽越有 GalGame 感” → 大多数时候会抢角色和文本。

- “用 opacity 区分非当前角色” → 很容易变成半透明鬼影；先试
  brightness/saturation。

- “Agent 每次输出时顺便决定 x/y 和动画” → 现在先不要；UI Runtime
  先稳定。

- “Web 前端必须上 Canvas” → 你的第一阶段需求全部可由 DOM/CSS 完成。

# 10 参考资料索引

以下均为本次调研实际使用或建议继续阅读的项目 /
官方文档。版本和项目状态会变化，真正集成前应再次确认许可证与当前 API。

**01.** [**Dialogic 2
repository**](https://github.com/dialogic-godot/dialogic)

**02.** [**Dialogic · Character &
Portraits**](https://docs.dialogic.pro/characters-and-portraits.html)

**03.** [**Dialogic · Styles &
Layouts**](https://docs.dialogic.pro/styles-and-layouts.html)

**04.** [**Dialogic · Layered
Portraits**](https://docs.dialogic.pro/layered-portraits.html)

**05.** [**Ren'Py repository**](https://github.com/renpy/renpy)

**06.** [**Ren'Py · GUI
Customization**](https://www.renpy.org/doc/html/gui.html)

**07.** [**Ren'Py · Layered
Images**](https://www.renpy.org/doc/html/layeredimage.html)

**08.** [**Ren'Py ·
Transforms**](https://www.renpy.org/doc/html/transforms.html)

**09.** [**Tsuzuru**](https://github.com/tsuzuru-engine/tsuzuru)

**10.** [**Pixi'VN**](https://github.com/DRincs-Productions/pixi-vn)

**11.** [**Pixi'VN React
Template**](https://github.com/DRincs-Productions/pixi-vn-react-template)

**12.** [**webTaleKit**](https://github.com/EndoHizumi/webTaleKit)

**13.** [**Monogatari**](https://github.com/Monogatari/Monogatari)

**14.** [**RenJS V2**](https://github.com/lunafromthemoon/RenJS-V2)

**15.** [**Tuesday JS**](https://github.com/Kirilllive/tuesday-js)

**16.** [**Suika3**](https://github.com/awemorris/suika3)

**17.** [**EasyRenPyGui**](https://github.com/shawna-p/EasyRenPyGui)

**18.** [**RuolinZheng Ren'Py
Template**](https://github.com/RuolinZheng08/renpy-template)

**19.** [**Atrament Visual Novel
Template**](https://github.com/maziminds/atrament-visual-novel-template)

**20.**
[**VisualNovelKit**](https://github.com/rakugoteam/VisualNovelKit)

**21.** [**gd_dialog**](https://github.com/QueenChristina/gd_dialog)

**22.** [**SillyTavern Visual Novel
Mode**](https://docs.sillytavern.app/usage/user-settings/visual-novel/)

**23.** [**Within Parameters Visual
Novel**](https://github.com/vintagedon/within-parameters-visual-novel/)

**24.** [**Java Vector
Nexus**](https://github.com/S1mplector/Java-Vector-Nexus)

**25.** [**Anthropic frontend-design
skill**](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)

**26.** [**UI/UX Pro
Max**](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)

**27.** [**Open Design Game UI
Skills**](https://github.com/joeeeeey/open-design-skill)

**28.** [**awesome-gamedev-agent-skills ·
visual-novel**](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/main/skills/genres/visual-novel/SKILL.md)

**29.** [**Game UI Database**](https://gameuidatabase.com)

**30.** [**Interface In Game**](https://interfaceingame.com/)

**31.** [**W3C WCAG 2.2**](https://www.w3.org/TR/WCAG22/)

**32.** [**W3C prefers-reduced-motion
technique**](https://www.w3.org/WAI/WCAG22/Techniques/css/C39)

# 最后：一个足够好的第一版应该是什么样

它不需要“会演”。它只需要让一个角色站在屏幕上时显得自然、换表情时不跳、移动时不廉价、文字读起来舒服、窗口缩放时不崩，并且能轻松换一整套视觉主题。做到这些，再开始自动演出，地基就已经很稳了。
