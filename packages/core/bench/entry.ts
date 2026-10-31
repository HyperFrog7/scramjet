// Bench-only entry. Bundled for node by bench/rewrite.mjs so the html and css
// rewriters can be measured the way the service worker runs them, without
// pulling in the browser client.
import { rewriteHtml as rewriteHtmlImpl } from "@/shared/rewriters/html";
import {
	rewriteCss as rewriteCssImpl,
	unrewriteCss as unrewriteCssImpl,
} from "@/shared/rewriters/css";
import { setWasm } from "@/shared/rewriters/wasm";
import { rewriteJs as rewriteJsImpl } from "@/shared/rewriters/js";
import { Tap } from "@/Tap";
import type { HtmlRewriterHooks, ScramjetContext } from "@/shared";

export { setWasm };

/** mirrors ScramjetConfig.globals so output matches production shape */
const globals = {
	wrapfn: "$scramjet$wrap",
	wrappropertybase: "$scramjet__",
	wrappropertyfn: "$scramjet$prop",
	cleanrestfn: "$scramjet$clean",
	importfn: "$scramjet$import",
	rewritefn: "$scramjet$rewrite",
	wrappostmessagefn: "$scramjet$wrappostmessage",
	metafn: "$scramjet$meta",
	pushsourcemapfn: "$scramjet$pushsourcemap",
	trysetfn: "$scramjet$tryset",
	templocid: "$scramjet$temp",
	tempunusedid: "$scramjet$unused",
};

// every flag rewrite_js reads must be present: the wasm treats a missing one
// as an error rather than defaulting it
const flags = {
	scramitize: false,
	sourcemaps: true,
	captureErrors: false,
	cleanErrors: false,
	rewriterLogs: false,
	disableComputedWrap: false,
	destructureRewrites: false,
	allowInvalidJs: false,
	debugTrampolines: false,
	debugSourceURL: false,
	syncxhr: false,
};

export function createBenchContext(
	overrides: { sourcemaps?: boolean } = {},
): ScramjetContext {
	return {
		config: {
			globals,
			flags: { ...flags, ...overrides },
			siteFlags: {},
		} as any,
		prefix: new URL("https://proxy.test/"),
		interface: {
			codecEncode: (input: string) => input,
			codecDecode: (input: string) => input,
			// document rewrites in the bench never inject boot scripts
			getInjectScripts: () => [],
		},
		cookieJar: null as any,
		hooks: {
			rewriter: {
				html: Tap.create<HtmlRewriterHooks>(),
			},
		},
	};
}

export function rewriteHtml(
	html: string,
	context: ScramjetContext,
	meta: Parameters<typeof rewriteHtmlImpl>[2],
	htmlcontext: Parameters<typeof rewriteHtmlImpl>[3],
) {
	return rewriteHtmlImpl(html, context, meta, htmlcontext);
}

export function rewriteCss(
	css: string,
	context: ScramjetContext,
	meta: Parameters<typeof rewriteCssImpl>[2],
) {
	return rewriteCssImpl(css, context, meta);
}

export function unrewriteCss(css: string, context: ScramjetContext) {
	return unrewriteCssImpl(css, context);
}

// goes through the client's own path (wasm init, rewriter pool, flag lookup,
// sourcemap push) instead of calling the bindings directly, so the benchmark
// charges js for the same work the service worker does
const jsMeta: Parameters<typeof rewriteJsImpl>[3] = {
	origin: new URL("https://example.com/"),
	base: new URL("https://example.com/assets/app.js"),
};

export function rewriteJs(
	js: string,
	source: string,
	context: ScramjetContext,
	isModule = false,
) {
	return rewriteJsImpl(js, source, context, jsMeta, isModule);
}
