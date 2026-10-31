import { ScramjetConfig, ScramjetFlags, ScramjetVersionInfo } from "@/types";
import DomHandler, { Element } from "domhandler";
import { URLMeta } from "@rewriters/url";
import { CookieJar } from "./cookie";
import { TapInstance } from "@/Tap";
import { HtmlContext } from "@/shared/rewriters/html";
import { _Map, _RegExp } from "./snapshot";

export * from "./cookie";
export * from "./headers";
export * from "./htmlRules";
export * from "./mime";
export * from "./rewriters";

// site flags are regex sources supplied by the integrator. flagEnabled runs for
// every rewritten file (and once per flag inside each of those), so compiling
// each source once instead of per query removes a regex compile from the hot
// path of every script and stylesheet on a page.
const compiledSiteFlags = new _Map() as unknown as Map<string, RegExp>;

function siteFlagRegex(source: string) {
	let compiled = compiledSiteFlags.get(source);
	if (compiled === undefined) {
		compiled = new _RegExp(source);
		compiledSiteFlags.set(source, compiled);
	}
	return compiled;
}

export function flagEnabled(
	flag: keyof ScramjetFlags,
	context: ScramjetContext,
	url: URL,
): boolean {
	const value = context.config.flags[flag];
	const siteFlags = context.config.siteFlags;

	if (siteFlags === undefined) return value;

	const href = url.href;
	for (const regex in siteFlags) {
		const partialflags = siteFlags[regex];
		if (siteFlagRegex(regex).test(href) && flag in partialflags) {
			return partialflags[flag];
		}
	}

	return value;
}
export type ScramjetInterface = {
	codecEncode: (input: string) => string;
	codecDecode: (input: string) => string;

	getInjectScripts(
		meta: URLMeta,
		handler: DomHandler,
		htmlcontext: HtmlContext,
		script: (src: string) => Element,
	): Element[];
	getWorkerInjectScripts?(
		meta: URLMeta,
		isModule: boolean,
		script: (src: string) => string,
	): string;
};

export type ScramjetContext = {
	config: ScramjetConfig;
	prefix: URL;
	interface: ScramjetInterface;
	cookieJar: CookieJar;
	hooks?: {
		rewriter: {
			html: TapInstance<HtmlRewriterHooks>;
		};
	};
};

export type HtmlRewriterHooks = {
	pre: {
		context: {
			handler: DomHandler;
			meta: URLMeta;
			origHtml: string;
			htmlcontext: HtmlContext;
		};
	};
	post: {
		context: {
			handler: DomHandler;
			meta: URLMeta;
			origHtml: string;
			htmlcontext: HtmlContext;
		};
		props: {
			setRawHtml?: string;
		};
	};
};
