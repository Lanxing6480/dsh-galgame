呜哇——查完了，真的是三处同时断，而且都是「版本迭代把旧接缝改没了」造成的。逐条说结论：

## 三个根因（都有源码/日志证据）

**① 模式消失** — 0.2.0 的 `dsh-agent-preset-registry` **不再扫** `$DSH_HOME/.agent-presets/` 目录，官方 skill 原话是 *"Nothing reads that directory any more"*。你机器上 `~/.dsh/.agent-presets/roleplay/` 还在（说明插件跑过、也写了），但组装出来的 `cordis.yml` 里只有 `preset-standard/ptc/minimal/cordis`，**没有&#x20;****`preset-roleplay`** —— 所以选择器里没有它。顺带发现旧模板的 `dsh-persona` 用的是 0.1.x 的 `text:` 字段，新版的配置是 `prefix(必填)/complete`，就算目录被读也会激活失败。

**② 注入链路失效** — 插件检测 `dsh-agent-loop` 补丁，找不到就 `return next()`，结果**一行都不注入**（注释还写着"退化为只注入 user 段"，和代码不符）。而且 0.2.0 收紧了契约：`PreStepDecision.messages` 只能是 `UserMessage[]`；`assistant/message` 必须带 `stream` 结算数组。旧补丁那套写法在新版本身也不成立。

**③ 历史会话打不开** — 旧补丁切步之后，`turn()` 的 finally 仍用切步**前**的编号写 `step/end`，日志里留下 `step/start {turn:1,step:8}` → `step/end {turn:1,step:1}`。0.1.x 不校验所以当年能开；0.2.0 的 v0→v4 迁移逐事件校验，直接抛 `step/end does not match an open turn and step`。

## 我改了什么

- **DSH 本体补丁已打进你本机**（`scripts/patch-dsh-agent-loop.mjs`，三处手术：按角色分流写入 + `patchBreaks` 切步、`step` 改为可推进的 `let`、finally 用推进后的编号）。幂等、`--check`/`--revert`、语法自检、自动备份，`--revert` 能字节级还原（已验证）。升级 dsh 后双击 `scripts/repatch-after-update.bat` 重打。
- **模式改为静态声明**：`cordis.patch.yml` 里插入 `preset-roleplay`，`plugins` 逐行抄自同版本官方 standard（只把 persona 换成"中性外壳 + `complete: true`"）。真 Profile 组装已验证出现该行。旧的文件式安装代码（`ensurePresetMode`/`writePresetPersona`）删除。
- **注入引擎重写**：有补丁 → 全量拟造序列（一次请求、顺序完美、心声照旧是 reasoning 块）；没补丁 → **降级**为单块上下文而不是什么都不做。
- **新增三个运维脚本**：`check-preset-drift.mjs`（模式漂移检查）、`regenerate-preset-patch.mjs`（升级后重新抄）、`repair-roleplay-sessions.mjs`（旧会话修复，**默认 dry-run**）。
- 测试套件重写：`npm test` → **5 套 / 59 项全绿**；e2e 把产物日志交给 `Session.fromRestore()`（和"打开/迁移会话"同一个校验器），并覆盖降级路径与"别的模式一个字都不注入"。

## 你要做的两件事

1. **完全退出并重启 dsh**（补丁要重启才生效，模式会随之出现在选择器里）。
2. **修旧会话**（按你说的，我没代跑）：
```powershell
cd H:\Projects\DeepSeekHarnessPlugin\plugins\dsh-roleplay
node scripts/repair-roleplay-sessions.mjs            # 先看报告
node scripts/repair-roleplay-sessions.mjs --apply    # 确认后真修，自动备份
```

扫描结果：**11 个可修**（含全部 4 个 roleplay 会话 + 同批注入过的 standard/deepseek-girl 父会话与分叉），**14 个修不了**（0.1.x 其它历史形态：缺 `id`、`unclassified message source`、descriptor 版本等，脚本只报告不动）。

另外两件小事：`~/.dsh/.agent-presets/roleplay/` 现在没人读了，删不删都行（里面可能是你改过的组装）；`dsh --dump-config` 时还看到两条无关噪声——你的 profile patch 里 `ui-dsh-aionui-panel` 和 home patch 里的 `wsl` 都指向已不存在的行，要不要清我下次一起处理。

细节都在 [修复报告](H:\Projects\DeepSeekHarnessPlugin\docs\dsh-roleplay-0.2-修复报告.md) 和 [README](H:\Projects\DeepSeekHarnessPlugin\plugins\dsh-roleplay\README.md) 里；脚本在 [scripts/](H:\Projects\DeepSeekHarnessPlugin\plugins\dsh-roleplay\scripts\run-tests.mjs)。
