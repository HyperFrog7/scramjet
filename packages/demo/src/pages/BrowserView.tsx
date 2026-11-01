import {
	css,
	type Delegate,
	type Component,
	createState,
} from "dreamland/core";
import { CatchEscapedLinksPlugin, UrlWatcherPlugin } from "driftproxy-utils";
import { versionInfo } from "driftproxy";
import { cachePlugin, controller } from "..";
import { demoSettingsStore, normalizeHomeUrl } from "../store";
import { pageMetaState } from "../pageMeta";
import homepage from "./homepage.html?raw";
import type { Frame } from "driftproxy-controller";
import { icon } from "../components/Lucide";

export const browserState = createState({
	url: demoSettingsStore.homeUrl,
	frame: null! as Frame,
});

const APP_NAME = "Drift Proxy";

let openNewTab: (() => void) | null = null;

/** Shows the demo's new tab page inside the browser frame. */
export const showNewTabPage = () => openNewTab?.();

const hostFromUrl = (value: string) => {
	try {
		return new URL(value).host;
	} catch {
		return "";
	}
};

export const Omnibox: Component = function (cx) {
	const navigate = () => {
		let url: string;
		try {
			url = normalizeHomeUrl(browserState.url);
		} catch (e) {
			console.error("navigate failed:", e);
			return;
		}
		browserState.url = url;
		demoSettingsStore.homeUrl = browserState.url;
		browserState.frame?.go(browserState.url);
	};
	return (
		<div class="browser-toolbar">
			<div class="omnibox-nav">
				<button
					type="button"
					class="nav-btn"
					title="Back"
					on:click={() => browserState.frame?.back()}
				>
					{icon("arrow-left")}
				</button>
				<button
					type="button"
					class="nav-btn"
					title="Forward"
					on:click={() => browserState.frame?.forward()}
				>
					{icon("arrow-right")}
				</button>
				<button
					type="button"
					class="nav-btn"
					title="Reload"
					on:click={() => browserState.frame?.reload()}
				>
					{icon("rotate-cw")}
				</button>
				<button
					type="button"
					class="nav-btn"
					title="Home"
					on:click={() => {
						browserState.url = demoSettingsStore.homeUrl;
						browserState.frame?.go(demoSettingsStore.homeUrl);
					}}
				>
					{icon("house")}
				</button>
			</div>
			<form
				class="omnibox-pill"
				on:submit={(e: SubmitEvent) => {
					e.preventDefault();
					navigate();
				}}
			>
				<span class="pill-icon">{icon("search")}</span>
				<input
					id="search"
					class="url-input"
					type="text"
					value={use(browserState.url)}
					spellcheck="false"
					placeholder="Enter a URL or search"
				/>
				<button type="submit" class="pill-go" title="Go">
					{icon("arrow-right")}
				</button>
			</form>
		</div>
	);
};
Omnibox.style = css`
	:scope {
		display: flex;
		align-items: center;
		gap: 0.4em;
		flex: 1 1 auto;
		min-width: 0;
		font-family:
			"Inter",
			system-ui,
			-apple-system,
			"Segoe UI",
			sans-serif;
	}
	.omnibox-nav {
		display: flex;
		align-items: center;
		gap: 0.1em;
		flex: 0 0 auto;
	}
	.nav-btn {
		border: 0;
		background: transparent;
		color: #a0a0a0;
		width: 1.9em;
		height: 1.9em;
		padding: 0;
		border-radius: 999px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.nav-btn:hover {
		background: #2a2a2a;
		color: #fff;
	}
	.omnibox-pill {
		display: flex;
		align-items: center;
		gap: 0.45em;
		flex: 1 1 auto;
		min-width: 0;
		margin: 0;
		padding: 0.16em 0.2em 0.16em 0.75em;
		background: #101010;
		border: 1px solid #2f2f2f;
		border-radius: 999px;
		transition:
			border-color 120ms ease,
			box-shadow 120ms ease;
	}
	.omnibox-pill:focus-within {
		border-color: #3f6fd8;
		box-shadow: 0 0 0 2px rgba(63, 111, 216, 0.22);
	}
	.pill-icon {
		color: #8f959c;
		flex: 0 0 auto;
	}
	.url-input {
		box-sizing: border-box;
		flex: 1 1 auto;
		min-width: 0;
		width: 100%;
		padding: 0.3em 0;
		font-size: 0.86em;
		border: 0;
		background: transparent;
		color: #e8eaed;
		outline: none;
	}
	.url-input::placeholder {
		color: #6f7680;
	}
	.pill-go {
		border: 0;
		background: transparent;
		color: #9aa0a6;
		width: 1.7em;
		height: 1.7em;
		padding: 0;
		border-radius: 999px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
	}
	.pill-go:hover {
		background: #242424;
		color: #fff;
	}
`;

const BrowserView: Component<
	{
		active: boolean;
	},
	{},
	{
		frameel: HTMLIFrameElement;
	}
> = function (cx) {
	cx.mount = async () => {
		await controller.wait();

		// The frame is same-origin with the demo, so its document is readable. Mirror
		// the page's title and icon into the top bar and the window title.
		let titleObserver: MutationObserver | null = null;
		let metaTimer: ReturnType<typeof setTimeout> | undefined;

		const readFrameDocument = () => {
			try {
				return this.frameel?.contentDocument ?? null;
			} catch {
				return null;
			}
		};

		const syncPageMeta = () => {
			const doc = readFrameDocument();
			const title = (doc?.title || "").trim();
			const favicon =
				doc
					?.querySelector<HTMLLinkElement>('link[rel~="icon" i]')
					?.href?.trim() || "";

			pageMetaState.title = title;
			pageMetaState.host = hostFromUrl(browserState.url);
			pageMetaState.favicon = favicon;
			document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;

			if (doc) observeTitle(doc);
		};

		const observeTitle = (doc: Document) => {
			titleObserver?.disconnect();
			const root = doc.head ?? doc.documentElement;
			if (!root) return;
			titleObserver = new MutationObserver(() => {
				const current = readFrameDocument();
				if (!current) return;
				if ((current.title || "").trim() !== pageMetaState.title)
					syncPageMeta();
			});
			titleObserver.observe(root, {
				childList: true,
				subtree: true,
				characterData: true,
			});
		};

		const queuePageMetaSync = () => {
			clearTimeout(metaTimer);
			metaTimer = setTimeout(syncPageMeta, 60);
		};

		let urlWatcher = new UrlWatcherPlugin((url) => {
			browserState.url = url;
			queuePageMetaSync();
		});
		let catchEscapedLinks = new CatchEscapedLinksPlugin(
			(url) =>
				new URL(`/?goto=${encodeURIComponent(url.href)}`, location.origin),
		);
		browserState.frame = controller.createFrame(this.frameel, {
			plugins: [cachePlugin, urlWatcher, catchEscapedLinks],
		});
		const newTabPageUrl = () => {
			const html = homepage
				.replaceAll("{{SCRAMJET_VERSION}}", String(versionInfo.version))
				.replaceAll("{{SCRAMJET_BUILD}}", String(versionInfo.build))
				.replaceAll(
					"{{SCRAMJET_DATE_PRETTY}}",
					new Date(versionInfo.date).toLocaleString(undefined, {
						dateStyle: "short",
						timeStyle: "short",
					}),
				);
			return `data:text/html;base64,${btoa(html)}`;
		};

		const openNewTabPage = () => {
			browserState.url = "";
			pageMetaState.title = "";
			pageMetaState.host = "";
			pageMetaState.favicon = "";
			document.title = APP_NAME;
			this.frameel.src = newTabPageUrl();
		};

		openNewTab = openNewTabPage;
		this.frameel.addEventListener("load", queuePageMetaSync);
		openNewTabPage();

		let goto = new URL(location.href).searchParams.get("goto");
		if (goto) {
			browserState.frame?.go(goto);
			history.replaceState(null, "", location.href.split("?")[0]);
		}
	};

	return (
		<div
			class={use(this.active).map(
				(active) => `tab-panel browser-view ${active ? "active" : ""}`,
			)}
		>
			<iframe this={use(this.frameel)}></iframe>
		</div>
	);
};

BrowserView.style = css`
	:scope {
		flex: 1;
		width: 100%;
		min-width: 0;
		min-height: 0;
		display: none;
		flex-direction: column;
	}
	:scope.active {
		display: flex;
	}

	iframe {
		background: white;
		flex: 1;
		border: none;
	}
`;

export default BrowserView;
