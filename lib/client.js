window.__ModuleLoader__.load({
	id: "@lanxing/dsh-galgame",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region src/client/adapter.ts
		/** 把 assistant blocks 里的可见文本拼出来（隐藏工具调用/思维链）。 */
		function visibleTextOfBlocks(blocks) {
			if (blocks === void 0 || blocks.length === 0) return "";
			const parts = [];
			for (const block of blocks) {
				if (block.kind !== "text") continue;
				const text = block.text ?? "";
				if (text.trim() !== "") parts.push(text);
			}
			return parts.join("\n");
		}
		/** 提取 assistant blocks 里的思维链文本（reasoning 块，用于思考气泡）。 */
		function reasoningTextOfBlocks(blocks) {
			if (blocks === void 0 || blocks.length === 0) return "";
			const parts = [];
			for (const block of blocks) {
				if (block.kind !== "reasoning") continue;
				const text = block.text ?? "";
				if (text.trim() !== "") parts.push(text);
			}
			return parts.join("\n");
		}
		/** 把 user content 里的文本拼出来（ContentBlock 兼容多种形态）。 */
		function visibleTextOfContent(content) {
			if (content === void 0 || content.length === 0) return "";
			const parts = [];
			for (const block of content) {
				const text = block.text;
				if (typeof text === "string" && text.trim() !== "") parts.push(text);
			}
			return parts.join("\n");
		}
		/**
		* 分段器（按换行块拆分，用户建议）：
		* 输出「显示单元」列表，每个单元 = 一个换行块（空行分隔的段落）。
		*  - 表格 / 列表 / 引用 / 标题 / 代码块都在各自的块内，整块不切；
		*  - 不再按句子标点切分 —— 任何标点（表格里的 ！？… 等）都不会拆碎内容；
		*  - 代码块（``` / ~~~ 包裹）内的空行不分割。
		* 每个单元交给 MarkdownText 渲染；长块由对话框滚动显示。
		*/
		function splitIntoSentences(text) {
			const normalized = text.replace(/\r\n/g, "\n").trim();
			if (normalized === "") return [];
			const blocks = [];
			let current = "";
			let inCodeFence = false;
			for (const line of normalized.split("\n")) {
				if (/^\s*(```|~~~)/.test(line)) inCodeFence = !inCodeFence;
				if (line.trim() === "" && !inCodeFence) {
					if (current.trim() !== "") {
						blocks.push(current.trim());
						current = "";
					}
				} else current += (current === "" ? "" : "\n") + line;
			}
			if (current.trim() !== "") blocks.push(current.trim());
			return mergeLeadingListGuides(blocks);
		}
		/** 列表项单元判定。 */
		function isListUnit(text) {
			return /^\s*([-*+]|\d+[.)])\s+/.test(text);
		}
		/** 是否以句末标点收尾（完整句子的标志）。 */
		function endsWithSentenceEnd(text) {
			return /[。！？!?…～~]$/.test(text);
		}
		/**
		* 合并「列表引导句」：若一个单元不以句末标点收尾（标题行、冒号结尾的
		* 引导句，如「已完成的修复」「实现步骤：」），且下一单元是列表块，
		* 就把两者合并为一个单元 —— 避免标题/排头与列表被拆开显示（问题 5）。
		*/
		function mergeLeadingListGuides(units) {
			const merged = [];
			for (const unit of units) {
				const last = merged[merged.length - 1];
				if (last !== void 0 && isListUnit(unit) && !endsWithSentenceEnd(last) && !isListUnit(last)) merged[merged.length - 1] = `${last}\n${unit}`;
				else merged.push(unit);
			}
			return merged;
		}
		/** 单个节点 → 台词行（无可见文本则返回 null）。 */
		function lineFromNode(node) {
			if (node.kind === "user") {
				const text = visibleTextOfContent(node.content);
				if (text === "") return null;
				return {
					key: `user-${node.seq}`,
					seq: node.seq,
					speaker: "user",
					name: "你",
					text,
					portrait: "neutral",
					time: node.time ?? 0,
					sentences: [text]
				};
			}
			if (node.kind === "assistant") {
				const text = visibleTextOfBlocks(node.blocks);
				if (text === "") return null;
				const reasoning = reasoningTextOfBlocks(node.blocks);
				return {
					key: `assistant-${node.seq}`,
					seq: node.seq,
					speaker: "assistant",
					name: "鲸鱼娘",
					text,
					portrait: "neutral",
					time: node.time ?? 0,
					sentences: splitIntoSentences(text),
					...reasoning === "" ? {} : { reasoning }
				};
			}
			return null;
		}
		/** 全量节点 → 台词脚本。 */
		function buildScript(nodes) {
			const lines = [];
			for (const node of nodes) {
				const line = lineFromNode(node);
				if (line !== null) lines.push(line);
			}
			return lines;
		}
		/**
		* 流式 partial → 「进行中的台词」行。
		* 无任何输出（text 与 reasoning 皆空）返回 null；
		* 只有思维链（text 空、reasoning 有）也返回行 —— 流式早期模型先思考后
		* 输出正文时，思考气泡能实时显示流式思维过程（问题 2 修复）。
		*/
		function partialLine(partial) {
			if (partial === null) return null;
			const text = visibleTextOfBlocks(partial.blocks);
			const reasoning = reasoningTextOfBlocks(partial.blocks);
			if (text === "" && reasoning === "") return null;
			return {
				key: `partial-${partial.turn}-${partial.step}`,
				seq: Number.MAX_SAFE_INTEGER - partial.turn,
				speaker: "assistant",
				name: "鲸鱼娘",
				text,
				portrait: "neutral",
				time: Date.now(),
				sentences: splitIntoSentences(text),
				...reasoning === "" ? {} : { reasoning }
			};
		}
		/** 快照字段 → { 已定稿台词, 流式台词 }。 */
		function snapshotToScript(nodes, partial) {
			return {
				settled: buildScript(nodes),
				streaming: partialLine(partial)
			};
		}
		//#endregion
		//#region src/client/manifest.ts
		/** 资源路由前缀（与 Host 半边注册一致）。 */
		const ASSET_BASE = "/api/dsh-galgame/assets";
		/** 默认角色：鲸鱼娘（DeepSeek 深海少女）。 */
		const DEEPSEEK_MANIFEST = {
			id: "deepseek",
			displayName: "鲸鱼娘",
			anchor: [.5, 1],
			baseScale: 1,
			portraits: { neutral: {
				src: "characters/deepseek/portraits/neutral.webp",
				type: "image"
			} }
		};
		DEEPSEEK_MANIFEST.id;
		/** 解析 portrait 差分资源 URL；未注册的差分 ID 回退到 neutral。 */
		function portraitUrl(portraitId) {
			const fallback = DEEPSEEK_MANIFEST.portraits.neutral;
			return `${ASSET_BASE}/${DEEPSEEK_MANIFEST.portraits[portraitId]?.src ?? fallback.src}`;
		}
		//#endregion
		//#region src/client/settings.ts
		const DEFAULT_SETTINGS = {
			autoMode: true,
			typeSpeed: 28,
			bounce: true,
			bubble: true,
			debug: false
		};
		const STORAGE_KEY = "dsh.galgame.settings";
		/** 从 localStorage 读取配置（损坏/缺失回退默认值）。 */
		function loadSettings() {
			try {
				const raw = localStorage.getItem(STORAGE_KEY);
				if (raw === null) return { ...DEFAULT_SETTINGS };
				const parsed = JSON.parse(raw);
				return {
					autoMode: typeof parsed.autoMode === "boolean" ? parsed.autoMode : DEFAULT_SETTINGS.autoMode,
					typeSpeed: typeof parsed.typeSpeed === "number" ? parsed.typeSpeed : DEFAULT_SETTINGS.typeSpeed,
					bounce: typeof parsed.bounce === "boolean" ? parsed.bounce : DEFAULT_SETTINGS.bounce,
					bubble: typeof parsed.bubble === "boolean" ? parsed.bubble : DEFAULT_SETTINGS.bubble,
					debug: typeof parsed.debug === "boolean" ? parsed.debug : DEFAULT_SETTINGS.debug
				};
			} catch {
				return { ...DEFAULT_SETTINGS };
			}
		}
		/** 持久化配置。 */
		function saveSettings(settings) {
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
			} catch {}
		}
		//#endregion
		//#region src/client/useHostDrag.ts
		/**
		* dsh-galgame — 浮层拖拽 hook：以立绘容器为坐标系，位置持久化。
		* 思考气泡与选项框共用（以立绘为原点绑定，立绘移位时浮层跟随）。
		*/
		function loadPos(storageKey) {
			try {
				const raw = localStorage.getItem(storageKey);
				if (raw === null) return null;
				const parsed = JSON.parse(raw);
				if (typeof parsed.left === "number" && typeof parsed.top === "number") return {
					left: parsed.left,
					top: parsed.top
				};
				return null;
			} catch {
				return null;
			}
		}
		function savePos(storageKey, pos) {
			try {
				localStorage.setItem(storageKey, JSON.stringify(pos));
			} catch {}
		}
		/**
		* 拖拽定位：以宿主容器（立绘）为坐标系。
		* @param storageKey - 位置持久化键。
		* @param clampTop - top 是否限制不低于 0（防止拖出舞台顶部）。
		* @param defaultPos - 默认位置（localStorage 无值时使用；固化调好的排版）。
		* @param enabled - 是否允许拖拽（关闭后仅显示位置，不响应拖拽；调试模式可开）。
		* @returns 位置样式、拖拽启动处理器。
		*/
		function useHostDrag(storageKey, clampTop = true, defaultPos, enabled = true) {
			const [pos, setPos] = (0, react.useState)(() => loadPos(storageKey) ?? defaultPos ?? null);
			const dragRef = (0, react.useRef)(null);
			const startDrag = (event) => {
				if (!enabled) return;
				const clicked = event.target;
				if (clicked !== null && typeof clicked.closest === "function") {
					if (clicked.closest("button, a, input, textarea, select, [role=\"button\"], [role=\"radio\"], [role=\"checkbox\"], [role=\"switch\"]") !== null) return;
				}
				event.preventDefault();
				event.stopPropagation();
				const target = event.currentTarget;
				const host = target.parentElement;
				if (host === null) return;
				const hostRect = host.getBoundingClientRect();
				const targetRect = target.getBoundingClientRect();
				const origin = {
					left: targetRect.left - hostRect.left,
					top: targetRect.top - hostRect.top
				};
				dragRef.current = {
					startX: event.clientX,
					startY: event.clientY,
					latest: origin
				};
				const onMove = (ev) => {
					const drag = dragRef.current;
					if (drag === null) return;
					const next = {
						left: origin.left + (ev.clientX - drag.startX),
						top: clampTop ? Math.max(0, origin.top + (ev.clientY - drag.startY)) : origin.top + (ev.clientY - drag.startY)
					};
					drag.latest = next;
					setPos(next);
				};
				const onUp = () => {
					const drag = dragRef.current;
					dragRef.current = null;
					window.removeEventListener("mousemove", onMove);
					window.removeEventListener("mouseup", onUp);
					if (drag !== null) savePos(storageKey, drag.latest);
				};
				window.addEventListener("mousemove", onMove);
				window.addEventListener("mouseup", onUp);
			};
			return {
				style: pos !== null ? {
					left: pos.left,
					top: pos.top,
					right: "auto"
				} : void 0,
				onMouseDown: startDrag
			};
		}
		//#endregion
		//#region \0dsh-css:src/client/galgame.module.css.mjs
		const css = "._3_wOgW_root{--gg-surface:var(--dsw-alias-bg-layer-1,#0a162ab8);--gg-surface-strong:var(--dsw-alias-bg-layer-2,#081224eb);--gg-text-primary:var(--dsw-alias-label-primary,#f2f6fc);--gg-text-secondary:var(--dsw-alias-label-secondary,#b7c6db);--gg-accent:var(--dsw-alias-state-business-primary,#4f9df0);--gg-accent-deep:var(--dsw-alias-state-business-tertiary,#1e4f8e);--gg-border:var(--dsw-alias-border-l2,#ffffff29);--gg-interactive:var(--dsw-alias-interactive-bg-hover,#ffffff0f);--gg-name-bg:var(--dsw-alias-brand-primary,#1e4f8e);--gg-name-text:var(--dsw-alias-label-primary-inverted,#eaf2fc);--gg-on-accent:var(--dsw-alias-label-primary-inverted,#051124);--gg-radius:18px;--gg-font-dialogue:clamp(16px, 1.5vw, 26px);--gg-font-name:clamp(13px, 1.2vw, 20px);--gg-font-ui:clamp(12px, 1vw, 15px);--gg-motion-fade:.14s;--gg-motion-move:.24s;box-sizing:border-box;width:100%;height:100%;min-height:0;color:var(--gg-text-primary);font-family:var(--dsw-font-family,system-ui, \"PingFang SC\", \"Microsoft YaHei\", sans-serif);caret-color:#0000;isolation:isolate;background:0 0;flex-direction:column;display:flex;position:relative;overflow:hidden}._3_wOgW_root *,._3_wOgW_root :before,._3_wOgW_root :after{box-sizing:border-box}._3_wOgW_topBar{z-index:3;border-bottom:1px solid var(--gg-border);background:linear-gradient(180deg, var(--dsw-alias-bg-base,#0814288c), transparent);flex:none;justify-content:space-between;align-items:center;gap:12px;padding:8px 16px;display:flex}._3_wOgW_topTitle{font-size:var(--gg-font-ui);letter-spacing:.08em;color:var(--gg-text-secondary);-webkit-user-select:none;user-select:none;align-items:center;gap:10px;font-weight:600;display:flex}._3_wOgW_topTitle:before{content:\"\";background:var(--gg-accent);width:8px;height:8px;box-shadow:0 0 10px var(--gg-accent);border-radius:50%}._3_wOgW_topActions{align-items:center;gap:8px;display:flex}._3_wOgW_iconButton{border:1px solid var(--gg-border);background:var(--gg-interactive);height:30px;color:var(--gg-text-secondary);font-size:var(--gg-font-ui);cursor:pointer;-webkit-user-select:none;user-select:none;transition:background var(--gg-motion-fade) ease, color var(--gg-motion-fade) ease;border-radius:999px;justify-content:center;align-items:center;padding:0 12px;display:inline-flex}._3_wOgW_iconButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid,#ffffff24);color:var(--gg-text-primary)}._3_wOgW_iconButton:focus-visible{outline:2px solid var(--gg-accent);outline-offset:2px}._3_wOgW_stage{cursor:pointer;-webkit-user-select:none;user-select:none;caret-color:#0000;flex:1;min-height:0;position:relative;overflow:hidden}._3_wOgW_stage *{-webkit-user-select:none;user-select:none}._3_wOgW_stageOverlay{z-index:3;flex-direction:column;gap:8px;width:min(88%,1180px);display:flex;position:absolute;bottom:14px;left:50%;transform:translate(-50%)}._3_wOgW_stageWatermark{color:#a0c8f547;font-size:var(--gg-font-ui);letter-spacing:.12em;pointer-events:none;user-select:none;position:absolute;bottom:20px;right:26px}._3_wOgW_portraitShift,._3_wOgW_portraitShifted{pointer-events:none;transition:transform .32s;position:absolute;inset:0}._3_wOgW_portraitShift{transform:translate(0)}._3_wOgW_portraitShifted{transform:translate(16%)}._3_wOgW_portraitWrap{pointer-events:none;align-items:flex-end;height:100%;display:flex;position:absolute;bottom:0;left:50%;transform:translate(-50%)}._3_wOgW_portrait{object-fit:contain;object-position:bottom center;filter:drop-shadow(0 10px 28px #00000059);max-width:78vw;height:96%;animation:_3_wOgW_ggPortraitFade var(--gg-motion-fade) ease-out both;transform-origin:50% 100%;user-select:none;-webkit-user-drag:none;pointer-events:none}@keyframes _3_wOgW_ggPortraitFade{0%{opacity:0;transform:translateY(6px)scale(.995)}to{opacity:1;transform:translateY(0)scale(1)}}@keyframes _3_wOgW_ggBounce{0%{transform:translate(-50%)translateY(0)}28%{transform:translate(-50%)translateY(-16px)}52%{transform:translate(-50%)translateY(0)}74%{transform:translate(-50%)translateY(-9px)}to{transform:translate(-50%)translateY(0)}}._3_wOgW_bouncing{transform-origin:50% 100%;animation:.52s ease-in-out both _3_wOgW_ggBounce}._3_wOgW_thinkingBadge{border:1px solid var(--gg-border);background:var(--dsw-alias-bg-overlay,#0a1a34b8);color:var(--gg-text-secondary);font-size:var(--gg-font-ui);z-index:2;border-radius:999px;align-items:center;gap:8px;padding:6px 14px;display:inline-flex;position:absolute;top:18px;left:50%;transform:translate(-50%)}._3_wOgW_thinkingDot{background:var(--gg-accent);border-radius:50%;width:6px;height:6px;animation:1.2s ease-in-out infinite _3_wOgW_ggThinkingDot}._3_wOgW_thinkingDot:nth-child(2){animation-delay:.2s}._3_wOgW_thinkingDot:nth-child(3){animation-delay:.4s}@keyframes _3_wOgW_ggThinkingDot{0%,to{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}._3_wOgW_thinkingBubble{z-index:2;border:1px solid var(--dsw-alias-border-l2,#8cbef052);background:var(--gg-surface-strong);backdrop-filter:blur(8px);width:264px;max-width:30vw;color:var(--gg-text-secondary);pointer-events:auto;cursor:grab;touch-action:none;border-radius:26px 26px 26px 8px;padding:14px 16px 12px;animation:.22s ease-out both _3_wOgW_ggBubbleIn;position:absolute;top:24%;right:calc(100% + 14px);box-shadow:0 10px 30px #00000061}._3_wOgW_thinkingBubble:before{content:\"\";background:#ffffff29;border-radius:50%;width:26px;height:11px;position:absolute;top:9px;left:12px;transform:rotate(-10deg)}._3_wOgW_thinkingBubble:after{content:\"\";border:11px solid #0000;border-left-color:var(--gg-surface-strong);position:absolute;top:28px;right:-11px}._3_wOgW_thinkingBubbleTitle{color:var(--gg-accent);font-size:var(--gg-font-ui);letter-spacing:.05em;-webkit-user-select:none;user-select:none;margin-bottom:5px;font-weight:600}._3_wOgW_thinkingBubbleText{scrollbar-width:thin;scrollbar-color:#8cbef059 transparent;max-height:170px;font-size:var(--gg-font-ui);white-space:pre-wrap;word-break:break-word;line-height:1.6;overflow-y:auto}@keyframes _3_wOgW_ggBubbleIn{0%{opacity:0;transform:translateY(8px)scale(.97)}to{opacity:1;transform:translateY(0)scale(1)}}._3_wOgW_dialogueArea{flex-direction:column;flex:none;gap:6px;width:100%;display:flex}._3_wOgW_namePlate{background:var(--gg-name-bg);min-width:96px;color:var(--gg-name-text);font-size:var(--gg-font-name);letter-spacing:.06em;-webkit-user-select:none;user-select:none;border-radius:10px 10px 10px 4px;align-self:flex-start;padding:5px 16px 6px;font-weight:700;box-shadow:0 6px 16px #0000004d}._3_wOgW_namePlateUser{color:#eaf2fc;background:#3a5478}._3_wOgW_dialogueBox{border:1px solid var(--gg-border);border-radius:var(--gg-radius);background:var(--gg-surface);min-height:64px;max-height:40vh;box-shadow:0 12px 34px #00000059, inset 0 1px 0 var(--dsw-alias-border-l1,#ffffff0f);backdrop-filter:blur(10px);cursor:pointer;-webkit-user-select:text;user-select:text;caret-color:#0000;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2,#fff3);padding:16px 18px 34px;position:relative;overflow-y:auto}._3_wOgW_dialogueTyping{min-height:1.4em;position:relative}._3_wOgW_dialogueTyping:after{content:\"▍\";color:var(--gg-accent);margin-left:1px;animation:.9s step-end infinite _3_wOgW_ggCaret}@keyframes _3_wOgW_ggCaret{0%,60%{opacity:1}61%,to{opacity:0}}._3_wOgW_dialogueBody{animation:.2s ease-out both _3_wOgW_ggUnitIn}._3_wOgW_dialogueBody p{margin:0 0 .5em}._3_wOgW_dialogueBody p:last-child{margin-bottom:0}._3_wOgW_dialogueBody ul,._3_wOgW_dialogueBody ol{margin:.3em 0;padding-left:1.6em}._3_wOgW_dialogueBody li{margin:.15em 0}._3_wOgW_dialogueBody pre{border-radius:10px;margin:.4em 0}._3_wOgW_dialogueBody code{font-size:.92em}@keyframes _3_wOgW_ggUnitIn{0%{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}._3_wOgW_dialoguePlaceholder{color:var(--gg-text-secondary)}._3_wOgW_dialogueControls{align-items:center;gap:8px;display:flex;position:absolute;bottom:6px;right:12px}._3_wOgW_pageButton{border:1px solid var(--gg-border);background:var(--gg-interactive);width:26px;height:26px;color:var(--gg-text-secondary);cursor:pointer;-webkit-user-select:none;user-select:none;transition:background var(--gg-motion-fade) ease, color var(--gg-motion-fade) ease;border-radius:8px;justify-content:center;align-items:center;font-size:11px;display:inline-flex}._3_wOgW_pageButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid,#ffffff24);color:var(--gg-text-primary)}._3_wOgW_pageButton:disabled{opacity:.35;cursor:default}._3_wOgW_pageProgress{color:var(--gg-text-secondary);font-size:var(--gg-font-ui);font-variant-numeric:tabular-nums}._3_wOgW_autoHint{color:var(--gg-accent);font-size:var(--gg-font-ui);letter-spacing:.04em;align-items:center;gap:6px;display:inline-flex}._3_wOgW_autoHint:before{content:\"\";background:var(--gg-accent);border-radius:50%;width:7px;height:7px;animation:1s ease-in-out infinite _3_wOgW_ggAutoPulse}@keyframes _3_wOgW_ggAutoPulse{0%,to{opacity:.3}50%{opacity:1}}._3_wOgW_inputArea{cursor:default;flex-direction:column;flex:none;gap:5px;width:100%;display:flex}._3_wOgW_inputBox{border:1px solid var(--gg-border);background:var(--gg-surface);backdrop-filter:blur(10px);border-radius:16px;align-items:flex-end;gap:8px;padding:8px 8px 8px 14px;display:flex;box-shadow:0 10px 28px #0000004d}._3_wOgW_inputField{resize:none;min-height:24px;max-height:120px;color:var(--gg-text-primary);caret-color:var(--gg-text-primary);font-size:var(--gg-font-ui);background:0 0;border:none;outline:none;flex:1;font-family:inherit;line-height:1.5;overflow-y:auto}._3_wOgW_inputField::placeholder{color:var(--gg-text-secondary)}._3_wOgW_inputSend{background:var(--gg-accent);width:34px;height:34px;color:var(--gg-on-accent);cursor:pointer;transition:filter var(--gg-motion-fade) ease, transform var(--gg-motion-move) ease;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;font-size:15px;display:inline-flex}._3_wOgW_inputSend:hover:not(:disabled){filter:brightness(1.12);transform:translateY(-1px)}._3_wOgW_inputSend:disabled{opacity:.4;cursor:default}._3_wOgW_inputHint{color:var(--gg-text-secondary);font-size:var(--gg-font-ui);text-align:right;opacity:.85;-webkit-user-select:none;user-select:none}._3_wOgW_emptyState{color:var(--gg-text-secondary);text-align:center;pointer-events:none;flex-direction:column;justify-content:center;align-items:center;gap:14px;padding:24px;display:flex;position:absolute;inset:0}._3_wOgW_emptyStateTitle{color:var(--gg-text-primary);font-size:clamp(18px,2vw,26px);font-weight:600}._3_wOgW_emptyStateBody{max-width:460px;font-size:var(--gg-font-ui);line-height:1.7}._3_wOgW_choiceHost{z-index:4;pointer-events:auto;cursor:grab;touch-action:none;width:min(620px,60vw);animation:.22s ease-out both _3_wOgW_ggCardIn;position:absolute;top:24%;right:calc(100% + 16px)}@keyframes _3_wOgW_ggFadeIn{0%{opacity:0}to{opacity:1}}._3_wOgW_choiceCard{border:1px solid var(--gg-border);background:var(--gg-surface-strong);border-radius:20px;flex-direction:column;width:100%;max-height:60vh;animation:.22s ease-out both _3_wOgW_ggCardIn;display:flex;overflow:hidden;box-shadow:0 24px 70px #0000008c}._3_wOgW_approvalCard{border:1px solid var(--gg-border);background:var(--gg-surface-strong);border-radius:20px;flex-direction:column;width:100%;animation:.22s ease-out both _3_wOgW_ggCardIn;display:flex;overflow:hidden;box-shadow:0 24px 70px #0000008c}._3_wOgW_approvalStrip{background:var(--dsw-alias-state-warn-tertiary,#ffaa5024);color:var(--dsw-alias-state-warn-primary,#ffc98a);font-size:var(--gg-font-ui);letter-spacing:.04em;align-items:center;gap:8px;padding:10px 18px;display:flex}._3_wOgW_approvalDot{background:var(--dsw-alias-state-warn-primary,#ffb057);width:8px;height:8px;box-shadow:0 0 8px var(--dsw-alias-state-warn-primary,#ffb057);border-radius:50%}._3_wOgW_approvalBody{flex-direction:column;gap:8px;padding:14px 18px 6px;display:flex}._3_wOgW_approvalHeadline{color:var(--gg-text-primary);word-break:break-word;font-size:clamp(15px,1.4vw,20px);font-weight:600;line-height:1.6}._3_wOgW_approvalCommand{background:var(--gg-interactive);color:var(--gg-text-secondary);font-family:var(--ds-font-family-code,ui-monospace, monospace);word-break:break-all;-webkit-user-select:text;user-select:text;border-radius:10px;padding:8px 12px;font-size:.9em}._3_wOgW_approvalActions{justify-content:flex-end;align-items:center;gap:10px;padding:12px 18px 16px;display:flex}@keyframes _3_wOgW_ggCardIn{0%{opacity:0;transform:translateY(16px)scale(.98)}to{opacity:1;transform:translateY(0)scale(1)}}._3_wOgW_choiceHeader{border-bottom:1px solid var(--gg-border);justify-content:space-between;align-items:center;gap:12px;padding:16px 20px 10px;display:flex}._3_wOgW_choiceEyebrow{color:var(--gg-accent);font-size:var(--gg-font-ui);letter-spacing:.1em;text-transform:uppercase}._3_wOgW_choiceTitle{color:var(--gg-text-primary);margin:4px 0 0;font-size:clamp(16px,1.6vw,22px);font-weight:600;line-height:1.5}._3_wOgW_choiceBody{padding:16px 20px;overflow-y:auto}._3_wOgW_choiceDetail{color:var(--gg-text-secondary);font-size:var(--gg-font-ui);white-space:pre-wrap;margin:0 0 14px;line-height:1.7}._3_wOgW_choiceOptions{flex-direction:column;gap:10px;display:flex}._3_wOgW_choiceOption{border:1px solid var(--gg-border);background:var(--gg-interactive);color:var(--gg-text-primary);font-size:var(--gg-font-ui);text-align:left;cursor:pointer;transition:border-color var(--gg-motion-fade) ease, background var(--gg-motion-fade) ease, transform var(--gg-motion-move) ease;border-radius:12px;flex-direction:column;gap:3px;padding:12px 16px;display:flex}._3_wOgW_choiceOption:hover:not(:disabled){border-color:var(--gg-accent);background:var(--dsw-alias-interactive-bg-hover,#4f9df024);transform:translate(4px)}._3_wOgW_choiceOption:disabled{opacity:.55;cursor:default}._3_wOgW_choiceOptionLabel{font-weight:600}._3_wOgW_choiceOptionDesc{color:var(--gg-text-secondary);font-size:.92em}._3_wOgW_choiceCustomRow{gap:8px;margin-top:12px;display:flex}._3_wOgW_choiceCustomInput{border:1px solid var(--gg-border);background:var(--gg-interactive);color:var(--gg-text-primary);font-size:var(--gg-font-ui);caret-color:var(--gg-text-primary);border-radius:10px;outline:none;flex:1;padding:10px 14px}._3_wOgW_choiceCustomInput:focus{border-color:var(--gg-accent)}._3_wOgW_choiceFooter{border-top:1px solid var(--gg-border);justify-content:flex-end;align-items:center;gap:10px;padding:12px 20px 16px;display:flex}._3_wOgW_choiceButton{border:1px solid var(--gg-accent);background:var(--gg-accent);color:var(--gg-on-accent);font-size:var(--gg-font-ui);cursor:pointer;transition:filter var(--gg-motion-fade) ease;border-radius:999px;padding:8px 18px;font-weight:600}._3_wOgW_choiceButton:hover:not(:disabled){filter:brightness(1.12)}._3_wOgW_choiceButton:disabled{opacity:.5;cursor:default}._3_wOgW_choiceCancel{border:1px solid var(--gg-border);color:var(--gg-text-secondary);font-size:var(--gg-font-ui);cursor:pointer;background:0 0;border-radius:999px;padding:8px 14px}._3_wOgW_choiceCancel:hover{color:var(--gg-text-primary)}._3_wOgW_choiceError{color:#ff9d9d;font-size:var(--gg-font-ui);margin:0 20px 4px}._3_wOgW_backlogMask{z-index:6;background:var(--dsw-alias-bg-overlay,#02061080);justify-content:flex-end;animation:.16s ease-out both _3_wOgW_ggFadeIn;display:flex;position:absolute;inset:0}._3_wOgW_backlogPanel{border-left:1px solid var(--gg-border);background:var(--gg-surface-strong);flex-direction:column;width:min(560px,92%);height:100%;animation:.22s ease-out both _3_wOgW_ggPanelIn;display:flex;box-shadow:-18px 0 50px #00000080}@keyframes _3_wOgW_ggPanelIn{0%{opacity:0;transform:translate(40px)}to{opacity:1;transform:translate(0)}}._3_wOgW_backlogHeader{border-bottom:1px solid var(--gg-border);flex:none;justify-content:space-between;align-items:center;padding:16px 20px;display:flex}._3_wOgW_backlogTitle{font-size:var(--gg-font-ui);letter-spacing:.08em;color:var(--gg-text-primary);font-weight:700}._3_wOgW_backlogList{flex-direction:column;flex:1;gap:16px;min-height:0;padding:14px 18px;display:flex;overflow-y:auto}._3_wOgW_backlogRow{flex-direction:column;gap:4px;display:flex}._3_wOgW_backlogName{font-size:var(--gg-font-ui);color:var(--gg-accent);font-weight:700}._3_wOgW_backlogNameUser{color:var(--gg-text-secondary)}._3_wOgW_backlogText{color:var(--gg-text-primary);font-size:var(--gg-font-ui);white-space:pre-wrap;word-break:break-word;line-height:1.7}._3_wOgW_backlogStreaming{color:var(--gg-accent)}._3_wOgW_backlogEmpty{color:var(--gg-text-secondary);font-size:var(--gg-font-ui);text-align:center;padding:40px 0}._3_wOgW_settingsMask{z-index:7;background:var(--dsw-alias-bg-overlay,#02061073);justify-content:flex-end;animation:.16s ease-out both _3_wOgW_ggFadeIn;display:flex;position:absolute;inset:0}._3_wOgW_settingsCard{border-left:1px solid var(--gg-border);background:var(--gg-surface-strong);flex-direction:column;width:min(420px,92%);height:100%;animation:.22s ease-out both _3_wOgW_ggPanelIn;display:flex;box-shadow:-18px 0 50px #00000080}._3_wOgW_settingsHeader{border-bottom:1px solid var(--gg-border);flex:none;justify-content:space-between;align-items:center;padding:16px 20px;display:flex}._3_wOgW_settingsTitle{font-size:var(--gg-font-ui);letter-spacing:.08em;color:var(--gg-text-primary);font-weight:700}._3_wOgW_settingsBody{flex-direction:column;flex:1;gap:4px;min-height:0;padding:12px 18px;display:flex;overflow-y:auto}._3_wOgW_settingRow{border-bottom:1px solid var(--dsw-alias-border-l1,#ffffff0f);cursor:pointer;justify-content:space-between;align-items:center;gap:12px;padding:10px 4px;display:flex}._3_wOgW_settingLabel{color:var(--gg-text-primary);font-size:var(--gg-font-ui)}._3_wOgW_settingValue{color:var(--gg-text-secondary);font-size:var(--gg-font-ui);text-align:right;flex:none;min-width:28px}._3_wOgW_settingSwitchOn,._3_wOgW_settingSwitchOff{border:1px solid var(--gg-border);background:var(--gg-accent-deep);cursor:pointer;width:40px;height:22px;transition:background var(--gg-motion-fade) ease;border-radius:999px;flex:none;position:relative}._3_wOgW_settingSwitchOff{background:var(--gg-interactive)}._3_wOgW_settingKnob{width:16px;height:16px;transition:transform var(--gg-motion-move) ease;background:#fff;border-radius:50%;position:absolute;top:2px;left:2px}._3_wOgW_settingSwitchOn ._3_wOgW_settingKnob{transform:translate(18px)}._3_wOgW_settingRange{min-width:0;accent-color:var(--gg-accent);cursor:pointer;flex:1}._3_wOgW_root[data-gg-debug=true] ._3_wOgW_stage{outline-offset:-2px;outline:2px solid #ff5d5d}._3_wOgW_root[data-gg-debug=true] ._3_wOgW_portraitWrap{outline:2px solid #ffe14d}._3_wOgW_root[data-gg-debug=true] ._3_wOgW_portrait{outline:1px dashed #ffd7a1}._3_wOgW_root[data-gg-debug=true] ._3_wOgW_thinkingBubble{outline:2px solid #c77dff}._3_wOgW_root[data-gg-debug=true] ._3_wOgW_thinkingBubbleText{outline:1px dashed #e0b3ff}._3_wOgW_root[data-gg-debug=true] ._3_wOgW_topBar{outline:1px solid #8a9bb8}._3_wOgW_root[data-gg-debug=true] ._3_wOgW_stageOverlay{outline:2px dashed #4dd0ff}._3_wOgW_root[data-gg-debug=true] ._3_wOgW_dialogueArea{outline:1px solid #4dffb8}._3_wOgW_root[data-gg-debug=true] ._3_wOgW_dialogueBox{outline:2px solid #4dff88}._3_wOgW_root[data-gg-debug=true] ._3_wOgW_inputArea{outline:2px solid #4dffd2}._3_wOgW_root[data-gg-debug=true] ._3_wOgW_choiceCard,._3_wOgW_root[data-gg-debug=true] ._3_wOgW_approvalCard{outline:2px solid #ff6bd6}._3_wOgW_root[data-gg-debug=true] ._3_wOgW_backlogPanel,._3_wOgW_root[data-gg-debug=true] ._3_wOgW_settingsCard{outline:2px solid #ff9d5c}@media (prefers-reduced-motion:reduce){._3_wOgW_root *,._3_wOgW_root :before,._3_wOgW_root :after{transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}}";
		const tagId = "@lanxing/dsh-galgame/galgame.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@lanxing/dsh-galgame";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var galgame_module_css_default = {
			"approvalActions": "_3_wOgW_approvalActions",
			"approvalBody": "_3_wOgW_approvalBody",
			"approvalCard": "_3_wOgW_approvalCard",
			"approvalCommand": "_3_wOgW_approvalCommand",
			"approvalDot": "_3_wOgW_approvalDot",
			"approvalHeadline": "_3_wOgW_approvalHeadline",
			"approvalStrip": "_3_wOgW_approvalStrip",
			"autoHint": "_3_wOgW_autoHint",
			"backlogEmpty": "_3_wOgW_backlogEmpty",
			"backlogHeader": "_3_wOgW_backlogHeader",
			"backlogList": "_3_wOgW_backlogList",
			"backlogMask": "_3_wOgW_backlogMask",
			"backlogName": "_3_wOgW_backlogName",
			"backlogNameUser": "_3_wOgW_backlogNameUser",
			"backlogPanel": "_3_wOgW_backlogPanel",
			"backlogRow": "_3_wOgW_backlogRow",
			"backlogStreaming": "_3_wOgW_backlogStreaming",
			"backlogText": "_3_wOgW_backlogText",
			"backlogTitle": "_3_wOgW_backlogTitle",
			"bouncing": "_3_wOgW_bouncing",
			"choiceBody": "_3_wOgW_choiceBody",
			"choiceButton": "_3_wOgW_choiceButton",
			"choiceCancel": "_3_wOgW_choiceCancel",
			"choiceCard": "_3_wOgW_choiceCard",
			"choiceCustomInput": "_3_wOgW_choiceCustomInput",
			"choiceCustomRow": "_3_wOgW_choiceCustomRow",
			"choiceDetail": "_3_wOgW_choiceDetail",
			"choiceError": "_3_wOgW_choiceError",
			"choiceEyebrow": "_3_wOgW_choiceEyebrow",
			"choiceFooter": "_3_wOgW_choiceFooter",
			"choiceHeader": "_3_wOgW_choiceHeader",
			"choiceHost": "_3_wOgW_choiceHost",
			"choiceOption": "_3_wOgW_choiceOption",
			"choiceOptionDesc": "_3_wOgW_choiceOptionDesc",
			"choiceOptionLabel": "_3_wOgW_choiceOptionLabel",
			"choiceOptions": "_3_wOgW_choiceOptions",
			"choiceTitle": "_3_wOgW_choiceTitle",
			"dialogueArea": "_3_wOgW_dialogueArea",
			"dialogueBody": "_3_wOgW_dialogueBody",
			"dialogueBox": "_3_wOgW_dialogueBox",
			"dialogueControls": "_3_wOgW_dialogueControls",
			"dialoguePlaceholder": "_3_wOgW_dialoguePlaceholder",
			"dialogueTyping": "_3_wOgW_dialogueTyping",
			"emptyState": "_3_wOgW_emptyState",
			"emptyStateBody": "_3_wOgW_emptyStateBody",
			"emptyStateTitle": "_3_wOgW_emptyStateTitle",
			"ggAutoPulse": "_3_wOgW_ggAutoPulse",
			"ggBounce": "_3_wOgW_ggBounce",
			"ggBubbleIn": "_3_wOgW_ggBubbleIn",
			"ggCardIn": "_3_wOgW_ggCardIn",
			"ggCaret": "_3_wOgW_ggCaret",
			"ggFadeIn": "_3_wOgW_ggFadeIn",
			"ggPanelIn": "_3_wOgW_ggPanelIn",
			"ggPortraitFade": "_3_wOgW_ggPortraitFade",
			"ggThinkingDot": "_3_wOgW_ggThinkingDot",
			"ggUnitIn": "_3_wOgW_ggUnitIn",
			"iconButton": "_3_wOgW_iconButton",
			"inputArea": "_3_wOgW_inputArea",
			"inputBox": "_3_wOgW_inputBox",
			"inputField": "_3_wOgW_inputField",
			"inputHint": "_3_wOgW_inputHint",
			"inputSend": "_3_wOgW_inputSend",
			"namePlate": "_3_wOgW_namePlate",
			"namePlateUser": "_3_wOgW_namePlateUser",
			"pageButton": "_3_wOgW_pageButton",
			"pageProgress": "_3_wOgW_pageProgress",
			"portrait": "_3_wOgW_portrait",
			"portraitShift": "_3_wOgW_portraitShift",
			"portraitShifted": "_3_wOgW_portraitShifted",
			"portraitWrap": "_3_wOgW_portraitWrap",
			"root": "_3_wOgW_root",
			"settingKnob": "_3_wOgW_settingKnob",
			"settingLabel": "_3_wOgW_settingLabel",
			"settingRange": "_3_wOgW_settingRange",
			"settingRow": "_3_wOgW_settingRow",
			"settingSwitchOff": "_3_wOgW_settingSwitchOff",
			"settingSwitchOn": "_3_wOgW_settingSwitchOn",
			"settingValue": "_3_wOgW_settingValue",
			"settingsBody": "_3_wOgW_settingsBody",
			"settingsCard": "_3_wOgW_settingsCard",
			"settingsHeader": "_3_wOgW_settingsHeader",
			"settingsMask": "_3_wOgW_settingsMask",
			"settingsTitle": "_3_wOgW_settingsTitle",
			"stage": "_3_wOgW_stage",
			"stageOverlay": "_3_wOgW_stageOverlay",
			"stageWatermark": "_3_wOgW_stageWatermark",
			"thinkingBadge": "_3_wOgW_thinkingBadge",
			"thinkingBubble": "_3_wOgW_thinkingBubble",
			"thinkingBubbleText": "_3_wOgW_thinkingBubbleText",
			"thinkingBubbleTitle": "_3_wOgW_thinkingBubbleTitle",
			"thinkingDot": "_3_wOgW_thinkingDot",
			"topActions": "_3_wOgW_topActions",
			"topBar": "_3_wOgW_topBar",
			"topTitle": "_3_wOgW_topTitle"
		};
		//#endregion
		//#region src/client/Stage.tsx
		/**
		* dsh-galgame — CharacterLayer：立绘渲染（差分切换 + 说话弹跳 + 思考气泡 + 浮层插槽）。
		*
		* 参考文档：人物 anchor bottom-center，差分切换 120ms crossfade。
		* 弹跳：bounceKey 变化时用 ref 强制重触发 wrapper 的弹跳动画，绝不重挂 img；
		* keyframes 保留 translateX(-50%)（弹跳后立绘保持居中）。
		* 思考气泡与选项浮层（children）：以立绘为原点偏移，支持拖拽 + 位置持久化，
		* 立绘移位（shift）时浮层跟随。
		*/
		function Stage({ character, portrait, bounceKey, reasoning, thinking, shift = false, onClick, children }) {
			const src = portraitUrl(portrait);
			const showBubble = reasoning !== void 0 && reasoning.trim() !== "";
			const bounceRef = (0, react.useRef)(null);
			const bubbleRef = (0, react.useRef)(null);
			const bubbleDrag = useHostDrag("dsh.galgame.bubblePos");
			(0, react.useEffect)(() => {
				const el = bounceRef.current;
				if (el === null || bounceKey === null) return;
				el.classList.remove(galgame_module_css_default.bouncing);
				el.offsetWidth;
				el.classList.add(galgame_module_css_default.bouncing);
			}, [bounceKey]);
			(0, react.useEffect)(() => {
				const el = bubbleRef.current;
				if (el === null) return;
				el.scrollTop = el.scrollHeight;
			}, [reasoning]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: galgame_module_css_default.stage,
				onClick,
				children: [
					thinking && !showBubble ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: galgame_module_css_default.thinkingBadge,
						role: "status",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: galgame_module_css_default.thinkingDot }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: galgame_module_css_default.thinkingDot }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: galgame_module_css_default.thinkingDot }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: { marginLeft: 6 },
								children: "说话中…"
							})
						]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: shift ? galgame_module_css_default.portraitShifted : galgame_module_css_default.portraitShift,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							ref: bounceRef,
							className: galgame_module_css_default.portraitWrap,
							children: [
								showBubble ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: galgame_module_css_default.thinkingBubble,
									role: "note",
									style: bubbleDrag.style,
									onMouseDown: bubbleDrag.onMouseDown,
									onClick: (event) => event.stopPropagation(),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: galgame_module_css_default.thinkingBubbleTitle,
										children: "鲸鱼娘在想…"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										ref: bubbleRef,
										className: galgame_module_css_default.thinkingBubbleText,
										"data-gg-scroll": "",
										children: reasoning
									})]
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
									className: galgame_module_css_default.portrait,
									src,
									alt: `${character.displayName}（${portrait}）`,
									draggable: false
								}, portrait),
								children
							]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: galgame_module_css_default.stageWatermark,
						"aria-hidden": "true",
						children: [character.displayName, " · GalGame"]
					})
				]
			});
		}
		//#endregion
		//#region src/client/DialogueBox.tsx
		/**
		* dsh-galgame — DialogueLayer：名字牌 + 打字机对话框 + 翻页推进。
		*
		* 播放模型（问题 2 改造）：
		*  - 显示「当前句」（unit），打字机逐字显示；打满后切 MarkdownText 渲染
		*    （列表/代码/加粗等格式正确呈现）；
		*  - 流式期间（streaming=true）：内容实时增量即是打字机效果，整句直接显示；
		*  - 手动模式打字机逐字；自动模式整句显示（由上层定时推进）；
		*  - ◀ ▶ 前后翻页（含跨行回退），文本框半透明自适应长度。
		*/
		/** 打字机每帧追加字符数。 */
		const TYPE_STEP = 2;
		function DialogueBox({ name, isUser, unit, lineKey, autoMode, streaming, typeSpeed, instant = false, onNext, onPrev, canPrev, position }) {
			const [shown, setShown] = (0, react.useState)(0);
			const timerRef = (0, react.useRef)(null);
			const prevUnitRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				const previous = prevUnitRef.current;
				prevUnitRef.current = unit;
				if (previous !== null && unit.startsWith(previous) && unit.length > previous.length) return;
				setShown(instant ? unit.length : 0);
			}, [unit]);
			(0, react.useEffect)(() => {
				if (autoMode || streaming) return;
				if (timerRef.current !== null) clearInterval(timerRef.current);
				timerRef.current = setInterval(() => {
					setShown((current) => {
						if (current >= unit.length) {
							if (timerRef.current !== null) clearInterval(timerRef.current);
							return current;
						}
						return Math.min(current + TYPE_STEP, unit.length);
					});
				}, Math.max(8, typeSpeed));
				return () => {
					if (timerRef.current !== null) clearInterval(timerRef.current);
				};
			}, [
				autoMode,
				streaming,
				lineKey,
				unit
			]);
			const effectiveShown = autoMode || streaming || isUser ? unit.length : shown;
			const finished = effectiveShown >= unit.length;
			const hasText = unit.length > 0;
			const partialText = unit.slice(0, effectiveShown);
			const typing = !finished && !streaming;
			const handleClick = (event) => {
				const target = event.target;
				if (target !== null && typeof target.closest === "function") {
					if (target.closest("button, a, input, textarea, select, [role=\"button\"], [contenteditable=\"true\"]") !== null) return;
				}
				onNext();
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: galgame_module_css_default.dialogueArea,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: isUser ? `${galgame_module_css_default.namePlate} ${galgame_module_css_default.namePlateUser}` : galgame_module_css_default.namePlate,
					children: name
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: galgame_module_css_default.dialogueBox,
					onClick: handleClick,
					role: "button",
					tabIndex: 0,
					"aria-label": "点击继续",
					"data-gg-scroll": "",
					children: [hasText ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: typing ? galgame_module_css_default.dialogueTyping : galgame_module_css_default.dialogueBody,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
							text: partialText,
							streaming: typing || streaming
						})
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: galgame_module_css_default.dialoguePlaceholder,
						children: "\xA0"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: galgame_module_css_default.dialogueControls,
						onClick: (event) => event.stopPropagation(),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: galgame_module_css_default.pageButton,
								onClick: onPrev,
								disabled: !canPrev || streaming,
								"aria-label": "上一句",
								title: "上一句",
								children: "◀"
							}),
							position !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: galgame_module_css_default.pageProgress,
								children: position.total > 1 ? `${position.index + 1} / ${position.total}` : ""
							}) : null,
							streaming ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: galgame_module_css_default.autoHint,
								children: "说话中"
							}) : autoMode ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: galgame_module_css_default.autoHint,
								children: "自动"
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: galgame_module_css_default.pageButton,
								onClick: onNext,
								disabled: streaming,
								"aria-label": "下一句",
								title: "下一句",
								children: "▶"
							})
						]
					})]
				})]
			});
		}
		//#endregion
		//#region src/client/ChoicePanel.tsx
		/**
		* dsh-galgame — ChoiceLayer：提问工具（ask_user_question）→ GalGame 选择窗口（需求 6）。
		*
		* 数据来自会话快照的 pending（kind === 'question'）：
		* 选项按钮直接 respond 答案，agent 循环不被阻塞（纯前端交互）。
		*/
		/** 组装答案 wire 格式（与 dsh-client-ui-user-questions 一致）。 */
		function buildAnswers(questions, values) {
			return { answers: questions.map((item, index) => {
				const value = values[index];
				const custom = value.custom.trim();
				return {
					id: item.id,
					selected: custom === "" || item.multiSelect === true ? value.selected : [],
					...custom === "" ? {} : { custom }
				};
			}) };
		}
		function ChoicePanel({ wait, draggable = false, t }) {
			const questions = wait.payload.questions;
			const drag = useHostDrag("dsh.galgame.choicePos", true, {
				left: -627,
				top: 80
			}, draggable);
			const [index, setIndex] = (0, react.useState)(0);
			const [drafts, setDrafts] = (0, react.useState)(() => questions.map(() => ({
				selected: [],
				custom: ""
			})));
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const question = questions[index];
			if (question === void 0) return null;
			const multi = question.multiSelect === true;
			const options = question.options ?? [];
			const hasOptions = options.length > 0;
			const draft = drafts[index];
			const patchDraft = (patch) => {
				setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? {
					...item,
					...patch
				} : item));
			};
			const toggleOption = (label) => {
				if (busy) return;
				if (multi) {
					const next = draft.selected.includes(label) ? draft.selected.filter((item) => item !== label) : [...draft.selected, label];
					patchDraft({ selected: next });
				} else patchDraft({ selected: [label] });
			};
			const submit = () => {
				if (busy) return;
				if (draft.selected.length === 0 && draft.custom.trim() === "") {
					setError(t("galgame.choice.required"));
					return;
				}
				setError(null);
				if (index < questions.length - 1) {
					setIndex(index + 1);
					return;
				}
				setBusy(true);
				const answer = buildAnswers(questions, drafts);
				wait.respond({
					ok: true,
					value: {
						sessionId: wait.sessionId,
						answer
					}
				}).then(() => {}).catch((cause) => {
					setBusy(false);
					setError(String(cause instanceof Error ? cause.message : cause));
				});
			};
			const cancel = () => {
				if (busy) return;
				wait.respond({
					ok: false,
					error: {
						code: "cancelled",
						message: "the user closed this question request",
						details: {}
					}
				}).catch(() => {});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: galgame_module_css_default.choiceHost,
				style: {
					...drag.style,
					cursor: draggable ? "grab" : "default"
				},
				onMouseDown: drag.onMouseDown,
				onClick: (event) => event.stopPropagation(),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: galgame_module_css_default.choiceCard,
					role: "dialog",
					"aria-modal": "true",
					"aria-label": question.question,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: galgame_module_css_default.choiceHeader,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [question.header !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: galgame_module_css_default.choiceEyebrow,
								children: question.header
							}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								className: galgame_module_css_default.choiceTitle,
								children: question.question
							})] })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: galgame_module_css_default.choiceBody,
							children: [
								question.detail !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: galgame_module_css_default.choiceDetail,
									children: question.detail
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: galgame_module_css_default.choiceOptions,
									role: multi ? "group" : "radiogroup",
									children: options.map((option) => {
										const isSelected = draft.selected.includes(option.label);
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: galgame_module_css_default.choiceOption,
											role: multi ? "checkbox" : "radio",
											"aria-checked": isSelected,
											disabled: busy,
											onClick: () => toggleOption(option.label),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: galgame_module_css_default.choiceOptionLabel,
												children: [multi ? isSelected ? "☑ " : "☐ " : isSelected ? "● " : "○ ", option.label]
											}), option.description !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: galgame_module_css_default.choiceOptionDesc,
												children: option.description
											}) : null]
										}, option.label);
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									className: galgame_module_css_default.choiceCustomInput,
									value: draft.custom,
									disabled: busy,
									rows: hasOptions ? 1 : 3,
									placeholder: t("galgame.choice.customPlaceholder"),
									onChange: (event) => {
										patchDraft({ custom: event.target.value });
										if (multi) patchDraft({ selected: [] });
									},
									onKeyDown: (event) => {
										if (event.key === "Enter" && !event.shiftKey) {
											event.preventDefault();
											submit();
										}
									}
								})
							]
						}),
						error !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: galgame_module_css_default.choiceError,
							role: "status",
							children: error
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: galgame_module_css_default.choiceFooter,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: galgame_module_css_default.choiceCancel,
								disabled: busy,
								onClick: cancel,
								children: t("galgame.choice.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: galgame_module_css_default.choiceButton,
								disabled: busy || draft.selected.length === 0 && draft.custom.trim() === "",
								onClick: submit,
								children: busy ? t("galgame.choice.submitting") : index < questions.length - 1 ? t("galgame.choice.next") : t("galgame.choice.submit")
							})]
						})
					]
				})
			});
		}
		//#endregion
		//#region src/client/ApprovalPanel.tsx
		/**
		* dsh-galgame — ApprovalLayer：Agent 权限申请 → GalGame 风格审批框（bug 修复 1）。
		*
		* 数据来自会话快照的 pending（kind === 'approval'），与 question 同通道：
		* 非全屏卡片，浮在立绘前、对话框上方，answer('allowed-once' | 'rejected')。
		*/
		function ApprovalPanel({ wait, command, draggable = false, t }) {
			const drag = useHostDrag("dsh.galgame.approvalPos", true, null, draggable);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const respond = (outcome) => {
				if (busy) return;
				setBusy(true);
				setError(null);
				wait.respond({
					ok: true,
					value: {
						sessionId: wait.sessionId,
						approvalId: wait.payload.approvalId,
						outcome
					}
				}).then(() => {}).catch((cause) => {
					setBusy(false);
					setError(String(cause instanceof Error ? cause.message : cause));
				});
			};
			const title = wait.payload.reason ?? t("galgame.approval.escalation", { toolName: wait.payload.toolName ?? "未知工具" });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: galgame_module_css_default.choiceHost,
				style: {
					...drag.style,
					cursor: draggable ? "grab" : "default"
				},
				onMouseDown: drag.onMouseDown,
				onClick: (event) => event.stopPropagation(),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: galgame_module_css_default.approvalCard,
					role: "alertdialog",
					"aria-modal": "true",
					"aria-label": title,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: galgame_module_css_default.approvalStrip,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: galgame_module_css_default.approvalDot }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("galgame.approval.waiting") })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: galgame_module_css_default.approvalBody,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: galgame_module_css_default.approvalHeadline,
								children: title
							}), command !== null && command !== void 0 && command !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
								className: galgame_module_css_default.approvalCommand,
								children: command
							}) : null]
						}),
						error !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: galgame_module_css_default.choiceError,
							role: "status",
							children: error
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: galgame_module_css_default.approvalActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: galgame_module_css_default.choiceCancel,
								disabled: busy,
								onClick: () => respond("rejected"),
								children: t("galgame.approval.reject")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: galgame_module_css_default.choiceButton,
								disabled: busy,
								onClick: () => respond("allowed-once"),
								children: busy ? t("galgame.choice.submitting") : t("galgame.approval.allowOnce")
							})]
						})
					]
				})
			});
		}
		//#endregion
		//#region src/client/Backlog.tsx
		/**
		* dsh-galgame — BacklogLayer：右上角「历史」抽屉（需求 11）。
		* 回放完整台词（用户 + 鲸鱼娘），流式中的内容以高亮追加。
		*/
		function Backlog({ lines, streaming, onClose }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: galgame_module_css_default.backlogMask,
				onClick: onClose,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: galgame_module_css_default.backlogPanel,
					role: "dialog",
					"aria-modal": "true",
					"aria-label": "对话历史",
					onClick: (event) => event.stopPropagation(),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: galgame_module_css_default.backlogHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: galgame_module_css_default.backlogTitle,
							children: "对话历史"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: galgame_module_css_default.iconButton,
							onClick: onClose,
							"aria-label": "关闭历史",
							children: "✕"
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: galgame_module_css_default.backlogList,
						children: lines.length === 0 && streaming === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: galgame_module_css_default.backlogEmpty,
							children: "还没有对话记录"
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [lines.map((line) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: galgame_module_css_default.backlogRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: line.speaker === "user" ? galgame_module_css_default.backlogNameUser : void 0,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: galgame_module_css_default.backlogName,
									children: line.name
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: galgame_module_css_default.backlogText,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, { text: line.text })
							})]
						}, line.key)), streaming !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: galgame_module_css_default.backlogRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: galgame_module_css_default.backlogName,
								children: streaming.name
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: galgame_module_css_default.backlogStreaming,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, { text: streaming.text })
							})]
						}) : null] })
					})]
				})
			});
		}
		//#endregion
		//#region src/client/GalgameInput.tsx
		/**
		* dsh-galgame — 输入条（GalGame 风格，独立于舞台对话框）。
		*
		* 设计（用户反馈第 4 点）：
		*  - 常驻对话框下方，半透明圆角条；
		*  - 发送策略（问题 2）：任务执行（running）时默认「引导/插话发送」（steer，
		*    经 session.prompt 直达运行中的 agent），而非排队发送；空闲时走标准
		*    inputActions 发送；
		*  - 发送后内容只进历史（Backlog），不占用舞台对话框；
		*  - 随输入自动扩展高度（最高 120px，超出内部滚动）。
		*/
		/** 输入区最大高度 px（超出滚动）。 */
		const MAX_HEIGHT = 120;
		function GalgameInput({ useInput, inputActions, sendSteer, running, t }) {
			const [draft, setDraft] = (0, react.useState)("");
			const [sending, setSending] = (0, react.useState)(false);
			const fieldRef = (0, react.useRef)(null);
			const busy = useInput((state) => state.phase === "submitting" || state.phase === "adjudicating");
			const resize = () => {
				const el = fieldRef.current;
				if (el === null) return;
				el.style.height = "auto";
				el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
			};
			(0, react.useEffect)(resize, [draft]);
			const send = async () => {
				const text = draft.trim();
				if (text === "" || busy || sending) return;
				if (running) {
					setSending(true);
					try {
						if (await sendSteer(text)) setDraft("");
					} finally {
						setSending(false);
					}
					return;
				}
				inputActions.setDraft(text);
				inputActions.submit();
				setDraft("");
			};
			const canSend = !busy && !sending && draft.trim() !== "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: galgame_module_css_default.inputArea,
				onClick: (event) => event.stopPropagation(),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: galgame_module_css_default.inputBox,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						ref: fieldRef,
						className: galgame_module_css_default.inputField,
						"data-gg-scroll": "",
						value: draft,
						rows: 1,
						placeholder: running ? t("galgame.input.placeholderRunning") : t("galgame.input.placeholder"),
						onChange: (event) => setDraft(event.target.value),
						onKeyDown: (event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								send();
							}
						}
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: galgame_module_css_default.inputSend,
						disabled: !canSend,
						onClick: () => void send(),
						"aria-label": t("galgame.input.send"),
						title: t("galgame.input.send"),
						children: "➤"
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: galgame_module_css_default.inputHint,
					children: running ? t("galgame.input.hintRunning") : t("galgame.input.hint")
				})]
			});
		}
		//#endregion
		//#region src/client/SettingsPanel.tsx
		function ToggleRow({ label, checked, onChange }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: galgame_module_css_default.settingRow,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: galgame_module_css_default.settingLabel,
					children: label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					role: "switch",
					"aria-checked": checked,
					className: checked ? galgame_module_css_default.settingSwitchOn : galgame_module_css_default.settingSwitchOff,
					onClick: () => onChange(!checked),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: galgame_module_css_default.settingKnob })
				})]
			});
		}
		function SettingsPanel({ settings, onChange, onClose, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: galgame_module_css_default.settingsMask,
				onClick: onClose,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: galgame_module_css_default.settingsCard,
					role: "dialog",
					"aria-modal": "true",
					"aria-label": t("galgame.settings.title"),
					onClick: (event) => event.stopPropagation(),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: galgame_module_css_default.settingsHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: galgame_module_css_default.settingsTitle,
							children: t("galgame.settings.title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: galgame_module_css_default.iconButton,
							onClick: onClose,
							"aria-label": "关闭设置",
							children: "✕"
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: galgame_module_css_default.settingsBody,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
								label: t("galgame.settings.autoMode"),
								checked: settings.autoMode,
								onChange: (value) => onChange({ autoMode: value })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
								label: t("galgame.settings.bounce"),
								checked: settings.bounce,
								onChange: (value) => onChange({ bounce: value })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
								label: t("galgame.settings.bubble"),
								checked: settings.bubble,
								onChange: (value) => onChange({ bubble: value })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToggleRow, {
								label: t("galgame.settings.debug"),
								checked: settings.debug,
								onChange: (value) => onChange({ debug: value })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: galgame_module_css_default.settingRow,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: galgame_module_css_default.settingLabel,
										children: t("galgame.settings.typeSpeed")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "range",
										className: galgame_module_css_default.settingRange,
										min: 8,
										max: 80,
										step: 2,
										value: settings.typeSpeed,
										onChange: (event) => onChange({ typeSpeed: Number(event.target.value) })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: galgame_module_css_default.settingValue,
										children: settings.typeSpeed <= 14 ? t("galgame.settings.speed.fast") : settings.typeSpeed <= 34 ? t("galgame.settings.speed.normal") : t("galgame.settings.speed.slow")
									})
								]
							})
						]
					})]
				})
			});
		}
		//#endregion
		//#region src/client/GalgameView.tsx
		/**
		* dsh-galgame — GalgameView：conversation.view 的「galgame」标签视图根组件。
		*
		* 编排（纯展示层，零会话写入）：
		*  快照 → adapter → 播放位置（分句/打字机/自动模式/配置）→ 各层
		*
		* 播放模型（问题 2 改造）：
		*  - 显示文本 = 流式文本 ?? 当前行文本；分句实时计算；
		*  - 流式期间内容增量即打字机，句子按节奏自动推进；
		*  - 流式结束转定稿行（同源文本）不重置句位置；
		*  - 手动模式打字机逐字，点击/◀▶ 翻页；配置面板（问题 3）控制各项开关。
		*/
		/** 自动模式每单元停留 ms（需求 10）。 */
		const AUTO_ADVANCE_MS = 950;
		/** 流式输出时句推进节奏 ms。 */
		const STREAM_ADVANCE_MS = 900;
		function GalgameView({ sessionId, useSession, useInput, inputActions, sendSteer, setGalgameMode, t }) {
			const nodes = useSession((snapshot) => snapshot.nodes);
			const partial = useSession((snapshot) => snapshot.partial);
			const pending = useSession((snapshot) => snapshot.pending);
			const running = useSession((snapshot) => snapshot.running);
			const openState = useSession((snapshot) => snapshot.openState);
			(0, react.useEffect)(() => {
				setGalgameMode(true);
				return () => setGalgameMode(false);
			}, [setGalgameMode]);
			const [settings, setSettings] = (0, react.useState)(() => loadSettings());
			const updateSettings = (patch) => {
				setSettings((current) => {
					const next = {
						...current,
						...patch
					};
					saveSettings(next);
					return next;
				});
			};
			const { settled, streaming } = (0, react.useMemo)(() => snapshotToScript(nodes, partial), [nodes, partial]);
			const settledLines = settled;
			const [lineIdx, setLineIdx] = (0, react.useState)(-1);
			const [unitIdx, setUnitIdx] = (0, react.useState)(0);
			const [mode, setMode] = (0, react.useState)("manual");
			const [backlogOpen, setBacklogOpen] = (0, react.useState)(false);
			const [settingsOpen, setSettingsOpen] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (settledLines.length === 0) {
					setLineIdx(-1);
					return;
				}
				setLineIdx(settledLines.length - 1);
			}, [settledLines.length]);
			const line = lineIdx >= 0 && lineIdx < settledLines.length ? settledLines[lineIdx] : null;
			const isAssistantLine = line?.speaker === "assistant";
			const displayText = streaming !== null ? streaming.text : line?.text ?? "";
			const sentences = (0, react.useMemo)(() => splitIntoSentences(displayText), [displayText]);
			const lineKey = streaming !== null ? streaming.key : line?.key ?? null;
			const lastStreamingRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (streaming !== null) lastStreamingRef.current = streaming.text;
			}, [streaming]);
			(0, react.useEffect)(() => {
				if (streaming !== null) return;
				const sameSource = line !== null && lastStreamingRef.current !== null && line.text === lastStreamingRef.current;
				lastStreamingRef.current = null;
				if (!sameSource) setUnitIdx(0);
			}, [lineKey]);
			const PLAYBACK_KEY = "dsh.galgame.playback";
			const restoredRef = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (restoredRef.current || settledLines.length === 0) return;
				restoredRef.current = true;
				try {
					const raw = localStorage.getItem(PLAYBACK_KEY);
					if (raw === null) return;
					const saved = JSON.parse(raw);
					if (saved && typeof saved.lineKey === "string" && typeof saved.unitIdx === "number") {
						const index = settledLines.findIndex((item) => item.key === saved.lineKey);
						if (index >= 0) {
							setLineIdx(index);
							setUnitIdx(saved.unitIdx);
						}
					}
				} catch {}
			}, [settledLines]);
			(0, react.useEffect)(() => {
				if (streaming !== null || lineKey === null) return;
				try {
					localStorage.setItem(PLAYBACK_KEY, JSON.stringify({
						lineKey,
						unitIdx
					}));
				} catch {}
			}, [
				lineKey,
				unitIdx,
				streaming
			]);
			const questionWait = pending.find((item) => item.kind === "question");
			const approvalWait = pending.find((item) => item.kind === "approval");
			(0, react.useEffect)(() => {
				if (!settings.autoMode) {
					setMode("manual");
					return;
				}
				if (streaming !== null) {
					setMode("auto");
					return;
				}
				if (running && isAssistantLine && lineIdx === settledLines.length - 1) {
					setMode("auto");
					return;
				}
				if (!running) setMode("manual");
			}, [
				running,
				streaming !== null,
				lineIdx,
				settledLines.length,
				settings.autoMode,
				isAssistantLine
			]);
			(0, react.useEffect)(() => {
				if (streaming === null || mode !== "auto") return;
				if (questionWait !== void 0 || approvalWait !== void 0) return;
				if (unitIdx >= sentences.length - 1) return;
				const timer = setTimeout(() => {
					setUnitIdx((index) => Math.min(index + 1, sentences.length - 1));
				}, STREAM_ADVANCE_MS);
				return () => clearTimeout(timer);
			}, [
				streaming,
				mode,
				unitIdx,
				sentences.length,
				questionWait,
				approvalWait
			]);
			(0, react.useEffect)(() => {
				if (mode !== "auto" || streaming !== null || !isAssistantLine || sentences.length === 0) return;
				if (questionWait !== void 0 || approvalWait !== void 0) return;
				if (unitIdx >= sentences.length - 1) return;
				const timer = setTimeout(() => {
					setUnitIdx((index) => Math.min(index + 1, sentences.length - 1));
				}, AUTO_ADVANCE_MS);
				return () => clearTimeout(timer);
			}, [
				mode,
				streaming,
				unitIdx,
				sentences.length,
				isAssistantLine,
				questionWait,
				approvalWait
			]);
			(0, react.useEffect)(() => {
				if (questionWait !== void 0 || approvalWait !== void 0) setMode("manual");
			}, [questionWait, approvalWait]);
			/** 下一段：自动中点击 = 接管并推进一段（流式时「出一个翻一个」）；手动 = 前进；行尾则下一行。 */
			const next = () => {
				if (mode === "auto") setMode("manual");
				if (sentences.length === 0) return;
				if (unitIdx < sentences.length - 1) {
					setUnitIdx((index) => index + 1);
					return;
				}
				if (streaming === null && lineIdx < settledLines.length - 1) {
					setLineIdx((index) => index + 1);
					setUnitIdx(0);
				}
			};
			/** 上一句：行内回退；行首则上一行末尾。 */
			const prev = () => {
				setMode("manual");
				if (unitIdx > 0) {
					setUnitIdx((index) => index - 1);
					return;
				}
				if (streaming === null && lineIdx > 0) {
					const previous = settledLines[lineIdx - 1];
					setLineIdx((index) => index - 1);
					setUnitIdx(previous !== void 0 ? previous.sentences.length - 1 : 0);
				}
			};
			const canPrev = (lineIdx > 0 || unitIdx > 0) && streaming === null;
			const position = sentences.length > 0 ? {
				index: unitIdx,
				total: sentences.length
			} : null;
			const [instantJump, setInstantJump] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (instantJump) setInstantJump(false);
			}, [instantJump]);
			const bounceKey = settings.bounce ? streaming !== null ? `${streaming.key}-stream` : isAssistantLine && line !== null ? `${line.key}-${unitIdx}` : null : null;
			const reasoning = settings.bubble && streaming !== null ? streaming.reasoning : void 0;
			const displayUnit = sentences[unitIdx] ?? "";
			const displayName = streaming !== null ? streaming.name : line?.name ?? "";
			const displayIsUser = streaming === null && line?.speaker === "user";
			const rootRef = (0, react.useRef)(null);
			const nextRef = (0, react.useRef)(next);
			nextRef.current = next;
			const prevRef = (0, react.useRef)(prev);
			prevRef.current = prev;
			(0, react.useEffect)(() => {
				const root = rootRef.current;
				if (root === null) return;
				const onWheel = (event) => {
					const scroller = event.target?.closest?.("[data-gg-scroll]");
					if (scroller !== null && scroller.scrollHeight > scroller.clientHeight) return;
					event.preventDefault();
					if (event.deltaY > 0) {
						setInstantJump(true);
						nextRef.current();
					} else if (event.deltaY < 0) {
						setInstantJump(true);
						prevRef.current();
					}
				};
				root.addEventListener("wheel", onWheel, { passive: false });
				return () => root.removeEventListener("wheel", onWheel);
			}, []);
			if (openState === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: galgame_module_css_default.root,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: galgame_module_css_default.emptyState,
					children: t("galgame.loading")
				})
			});
			const empty = settledLines.length === 0 && streaming === null && questionWait === void 0 && approvalWait === void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: galgame_module_css_default.root,
				ref: rootRef,
				"data-gg-debug": settings.debug ? "true" : "false",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: galgame_module_css_default.topBar,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: galgame_module_css_default.topTitle,
							children: t("view.galgame")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: galgame_module_css_default.topActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: galgame_module_css_default.iconButton,
								onClick: () => setSettingsOpen(true),
								"aria-label": t("galgame.settings.title"),
								title: t("galgame.settings.title"),
								children: "⚙"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: galgame_module_css_default.iconButton,
								onClick: () => setBacklogOpen(true),
								"aria-label": t("galgame.backlog"),
								title: t("galgame.backlog"),
								children: t("galgame.backlog")
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Stage, {
						character: DEEPSEEK_MANIFEST,
						portrait: line?.portrait ?? "neutral",
						bounceKey,
						reasoning,
						thinking: streaming !== null,
						shift: questionWait !== void 0 || approvalWait !== void 0,
						onClick: next,
						children: [questionWait !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChoicePanel, {
							wait: questionWait,
							draggable: settings.debug,
							t
						}) : null, approvalWait !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ApprovalPanel, {
							wait: approvalWait,
							draggable: settings.debug,
							t
						}) : null]
					}),
					empty ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: galgame_module_css_default.emptyState,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: galgame_module_css_default.emptyStateTitle,
							children: t("galgame.empty.title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: galgame_module_css_default.emptyStateBody,
							children: t("galgame.empty.body")
						})]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: galgame_module_css_default.stageOverlay,
						children: [empty ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DialogueBox, {
							name: displayName,
							isUser: displayIsUser,
							unit: displayUnit,
							lineKey,
							autoMode: mode === "auto" && streaming === null,
							streaming: streaming !== null,
							typeSpeed: settings.typeSpeed,
							instant: instantJump,
							onNext: next,
							onPrev: prev,
							canPrev,
							position
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GalgameInput, {
							useInput,
							inputActions,
							sendSteer,
							running,
							t
						})]
					}),
					backlogOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Backlog, {
						lines: settled,
						streaming,
						onClose: () => setBacklogOpen(false)
					}) : null,
					settingsOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsPanel, {
						settings,
						onChange: updateSettings,
						onClose: () => setSettingsOpen(false),
						t
					}) : null
				]
			});
		}
		//#endregion
		//#region src/client/index.ts
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
		/** 字典命名空间（轨迹插件同款做法）。 */
		const NS = "galgame";
		/** 简体中文（键集为基准）。 */
		const zh = {
			"view.galgame": "galgame 模式",
			"galgame.loading": "正在潜入深海，加载对话…",
			"galgame.empty.title": "欢迎来到 GalGame 模式",
			"galgame.empty.body": "DeepSeek 娘（鲸鱼娘）正在深海等你。在下方的输入框里发一句话，她就会以 GalGame 的方式回应你。工具调用与思考过程都会藏在幕后。",
			"galgame.backlog": "历史",
			"galgame.input.placeholder": "对鲸鱼娘说…",
			"galgame.input.placeholderRunning": "插话引导鲸鱼娘…",
			"galgame.input.send": "发送",
			"galgame.input.hint": "Enter 发送 · Shift+Enter 换行",
			"galgame.input.hintRunning": "任务执行中 · Enter 以插话引导（steer）",
			"galgame.approval.waiting": "权限申请 · 等待你的决定",
			"galgame.approval.escalation": "智能体想执行「{toolName}」，需要你的批准",
			"galgame.approval.reject": "拒绝",
			"galgame.approval.allowOnce": "允许一次",
			"galgame.choice.required": "请选择一个选项或输入你的答案。",
			"galgame.choice.customPlaceholder": "输入你的答案…",
			"galgame.choice.cancel": "放弃",
			"galgame.choice.next": "下一题",
			"galgame.choice.submit": "确定",
			"galgame.choice.submitting": "提交中…",
			"galgame.settings.title": "设置",
			"galgame.settings.autoMode": "自动翻句",
			"galgame.settings.bounce": "说话弹跳",
			"galgame.settings.bubble": "思考气泡",
			"galgame.settings.debug": "调试模式",
			"galgame.settings.typeSpeed": "打字机速度",
			"galgame.settings.speed.fast": "快",
			"galgame.settings.speed.normal": "中",
			"galgame.settings.speed.slow": "慢"
		};
		/** English dictionary。 */
		const en = {
			"view.galgame": "GalGame",
			"galgame.loading": "Diving into the deep sea, loading the conversation…",
			"galgame.empty.title": "Welcome to GalGame Mode",
			"galgame.empty.body": "DeepSeek girl (the whale girl) is waiting in the deep sea. Send a message in the input box below and she will reply GalGame-style. Tool calls and thinking stay behind the scenes.",
			"galgame.backlog": "History",
			"galgame.input.placeholder": "Say something to the whale girl…",
			"galgame.input.placeholderRunning": "Interrupt to guide the whale girl…",
			"galgame.input.send": "Send",
			"galgame.input.hint": "Enter to send · Shift+Enter for newline",
			"galgame.input.hintRunning": "Task running · Enter steers the agent",
			"galgame.approval.waiting": "Permission request · awaiting your decision",
			"galgame.approval.escalation": "The agent wants to run \"{toolName}\" and needs your approval",
			"galgame.approval.reject": "Reject",
			"galgame.approval.allowOnce": "Allow once",
			"galgame.choice.required": "Please pick an option or type your answer.",
			"galgame.choice.customPlaceholder": "Type your answer…",
			"galgame.choice.cancel": "Dismiss",
			"galgame.choice.next": "Next",
			"galgame.choice.submit": "Confirm",
			"galgame.choice.submitting": "Submitting…",
			"galgame.settings.title": "Settings",
			"galgame.settings.autoMode": "Auto advance",
			"galgame.settings.bounce": "Talk bounce",
			"galgame.settings.bubble": "Thinking bubble",
			"galgame.settings.debug": "Debug mode",
			"galgame.settings.typeSpeed": "Typewriter speed",
			"galgame.settings.speed.fast": "Fast",
			"galgame.settings.speed.normal": "Normal",
			"galgame.settings.speed.slow": "Slow"
		};
		/** 宽松 ctx（构造期仅需 slots / locale / sessions 服务；运行时由 DSH loader 提供）。 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "galgame: dictionaries");
			const t = ctx.locale.bind(NS);
			let composerBlocker = null;
			const setGalgameMode = (active) => {
				if (active && composerBlocker === null) try {
					composerBlocker = ctx.slots.register({
						name: "conversation.composer",
						priority: -100,
						select: () => ({})
					}, function EmptyComposer() {
						return null;
					});
				} catch {
					composerBlocker = null;
				}
				else if (!active && composerBlocker !== null) {
					composerBlocker();
					composerBlocker = null;
				}
			};
			ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "galgame",
				order: 20,
				locale: NS,
				label: () => t("view.galgame"),
				inject: (sessionId) => ({
					sendSteer: async (text) => {
						const session = (ctx.get("sessions")?.binding?.(sessionId))?.session;
						if (session === void 0) return false;
						try {
							return (await session.prompt([{
								type: "text",
								text
							}], "steer")).ok === true;
						} catch {
							return false;
						}
					},
					setGalgameMode
				})
			}, GalgameView));
		}
		/** Cordis 服务级注入声明：locale（字典注册/翻译）、slots（视图标签注册）、
		*  sessions（引导/插话发送 steer）。
		*  缺了它，cordis 会拒绝访问 ctx.locale / ctx.slots / ctx.sessions。 */
		const inject = [
			"locale",
			"slots",
			"sessions"
		];
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map