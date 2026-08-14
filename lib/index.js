import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
//#region src/index.ts
/**
* dsh-galgame — Host 半边。
*
* 唯一职责：把包内 `assets/` 目录（角色立绘差分）经
* `/api/dsh-galgame/assets/*` 静态路由提供给浏览器。
* 纯静态：不碰会话、不干预 agent 循环。
*
* @module @lanxing/dsh-galgame
*/
const name = "galgame";
const inject = ["webServer"];
/** 路由前缀（与 client 侧 manifest.ts 的 ASSET_BASE 一致）。 */
const ROUTE_PREFIX = "/api/dsh-galgame/assets";
/** 打包后 lib/index.js → 包根 assets/。 */
const ASSETS_ROOT_RAW = fileURLToPath(new URL("../assets/", import.meta.url));
/** 规范化：去掉 fileURLToPath 对目录 URL 保留的尾分隔符（否则 +sep 拼出双斜杠，穿越判断误伤）。 */
const ASSETS_ROOT = ASSETS_ROOT_RAW.endsWith(sep) ? ASSETS_ROOT_RAW.slice(0, -1) : ASSETS_ROOT_RAW;
const MIME = {
	".webp": "image/webp",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".webm": "video/webm"
};
function mimeOf(path) {
	return MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
}
/**
* @param {object} ctx - host plugin context with `webServer` service.
*/
function apply(ctx) {
	ctx.effect(() => {
		return ctx.webServer.register({
			kind: "prefix",
			path: ROUTE_PREFIX,
			handler: async (req, res) => {
				try {
					let pathname = "/";
					try {
						pathname = new URL(req.url ?? "/", "http://localhost").pathname;
					} catch {}
					const rel = decodeURIComponent(pathname.slice(23)).replace(/^[/\\]+/, "");
					const target = resolve(ASSETS_ROOT, rel);
					if (!(target === ASSETS_ROOT || target.startsWith(ASSETS_ROOT + sep))) {
						res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
						res.end("forbidden");
						return;
					}
					const data = await readFile(target);
					res.writeHead(200, {
						"content-type": mimeOf(target),
						"cache-control": "public, max-age=3600",
						"x-content-type-options": "nosniff"
					});
					res.end(data);
				} catch (error) {
					res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
					res.end("not found");
				}
			}
		});
	}, "galgame: portrait assets");
}
//#endregion
export { apply, inject, name };
