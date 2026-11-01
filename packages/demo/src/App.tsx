import { css, type Component } from "dreamland/core";
import FlagEditor from "./components/FlagEditor";
import BrowserView from "./pages/BrowserView";
import RequestViewer from "./pages/RequestViewer";
import PlaygroundView from "./pages/Playground";
import SettingsView from "./pages/SettingsPage";
import { Omnibox, showNewTabPage } from "./pages/BrowserView";
import { requestsState } from "./pages/RequestViewer";
import { pageMetaState } from "./pageMeta";
import { icon } from "./components/Lucide";

const truncate = (value: string, max = 26) =>
	value.length > max ? `${value.slice(0, max - 1)}…` : value;

const browserTabLabel = (title: string, host: string) =>
	truncate(title || host || "New Tab");

const newTab = () => showNewTabPage();

const toggleFullscreen = () => {
	if (document.fullscreenElement) {
		void document.exitFullscreen();
		return;
	}
	const request = document.documentElement.requestFullscreen?.();
	if (request) request.catch(() => {});
};

const App: Component<
	{},
	{},
	{
		activeTab: "browser" | "requests" | "playground" | "settings";
		chromeCollapsed: boolean;
	}
> = function (cx) {
	this.activeTab ??= "browser";
	this.chromeCollapsed ??= false;
	return (
		<div>
			<div
				class={use(this.chromeCollapsed).map(
					(collapsed) => `browser-chrome ${collapsed ? "collapsed" : ""}`,
				)}
			>
				<div class="tab-strip">
					<img class="brand-mark" src="/wordmark.svg" alt="Drift Proxy" />
					<div
						class={use(this.activeTab).map(
							(tab) => `page-tab ${tab === "browser" ? "active" : ""}`,
						)}
					>
						<button
							class="tab-select"
							on:click={() => {
								this.activeTab = "browser";
							}}
						>
							{use(pageMetaState.favicon).map((src) =>
								src ? (
									<img class="tab-favicon" src={src} alt="" />
								) : (
									<span class="tab-fallback">{icon("globe")}</span>
								),
							)}
							<span class="tab-label">
								{use(pageMetaState.title, pageMetaState.host).map(
									([title, host]) => browserTabLabel(title, host),
								)}
							</span>
						</button>
						<button class="tab-close" title="Close tab" on:click={newTab}>
							{icon("x")}
						</button>
					</div>
					<button class="new-tab" title="New tab" on:click={newTab}>
						{icon("plus")}
					</button>
					<div class="tab-strip-fill" />
					<div class="window-controls">
						<button
							class="window-btn"
							title="Collapse toolbar"
							on:click={() => {
								this.chromeCollapsed = !this.chromeCollapsed;
							}}
						>
							{icon("minus")}
						</button>
						<button
							class="window-btn"
							title="Toggle fullscreen"
							on:click={toggleFullscreen}
						>
							{icon("square")}
						</button>
						<button class="window-btn close" title="Close" on:click={newTab}>
							{icon("x")}
						</button>
					</div>
				</div>
				<div class="toolbar">
					<Omnibox />
					<div class="toolbar-tools">
						<button
							class={use(this.activeTab).map(
								(tab) => `icon-btn ${tab === "requests" ? "active" : ""}`,
							)}
							title="Requests"
							on:click={() => {
								this.activeTab = "requests";
							}}
						>
							{icon("receipt-text")}
							{use(requestsState.requests).map((requests) =>
								requests.length ? (
									<span class="badge">{requests.length}</span>
								) : null,
							)}
						</button>
						<button
							class={use(this.activeTab).map(
								(tab) => `icon-btn ${tab === "playground" ? "active" : ""}`,
							)}
							title="Playground"
							on:click={() => {
								this.activeTab = "playground";
							}}
						>
							{icon("code")}
						</button>
						<button
							class={use(this.activeTab).map(
								(tab) => `icon-btn ${tab === "settings" ? "active" : ""}`,
							)}
							title="Settings"
							on:click={() => {
								this.activeTab = "settings";
							}}
						>
							{icon("settings")}
						</button>
						<span class="toolbar-divider" />
						<FlagEditor inline={true} />
					</div>
				</div>
			</div>
			<div
				class={use(this.activeTab).map(
					(tab) =>
						`tab-panel browser-panel ${tab === "browser" ? "active" : ""}`,
				)}
			>
				<BrowserView
					active={use(this.activeTab).map((tab) => tab === "browser")}
				/>
			</div>
			<div
				class={use(this.activeTab).map(
					(tab) =>
						`tab-panel requests-panel ${tab === "requests" ? "active" : ""}`,
				)}
			>
				<RequestViewer
					active={use(this.activeTab).map((tab) => tab === "requests")}
				/>
			</div>
			<div
				class={use(this.activeTab).map(
					(tab) =>
						`tab-panel playground-panel ${tab === "playground" ? "active" : ""}`,
				)}
			>
				<PlaygroundView
					active={use(this.activeTab).map((tab) => tab === "playground")}
				/>
			</div>
			<div
				class={use(this.activeTab).map(
					(tab) =>
						`tab-panel settings-tab ${tab === "settings" ? "active" : ""}`,
				)}
			>
				<SettingsView />
			</div>
		</div>
	);
};

App.style = css`
	@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap");

	:scope {
		font-family:
			"Inter",
			system-ui,
			-apple-system,
			"Segoe UI",
			sans-serif;
		width: 100vw;
		height: 100vh;
		display: flex;
		flex-direction: column;
		margin: 0;
		overflow: hidden;
		position: absolute;
		top: 0;
		left: 0;

		padding: 0;
		background: black;
		box-sizing: border-box;
	}
	.browser-chrome {
		flex: 0 0 auto;
		background: #0d0d0d;
		border-bottom: 1px solid #262626;
	}
	.browser-chrome.collapsed .toolbar {
		display: none;
	}
	.tab-strip {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 8px;
		min-width: 0;
	}
	.brand-mark {
		height: 15px;
		width: auto;
		flex: 0 0 auto;
		margin: 0 0.35em 0 0.2em;
	}
	.page-tab {
		display: inline-flex;
		align-items: center;
		gap: 0.25em;
		max-width: 20em;
		min-width: 10em;
		height: 30px;
		padding: 0 0.3em 0 0.7em;
		border: 1px solid #292a2e;
		border-radius: 9px;
		background: #1a1b1e;
		color: #b9bcc2;
		font-size: 0.8em;
		line-height: 1.2;
		transition:
			background 120ms ease,
			color 120ms ease,
			border-color 120ms ease;
	}
	.page-tab:hover {
		background: #232428;
		color: #e9ebef;
	}
	.page-tab.active {
		background: #26282d;
		border-color: #3a3d44;
		color: #fff;
		box-shadow: inset 0 -2px 0 #3f6fd8;
	}
	.tab-select {
		display: inline-flex;
		align-items: center;
		gap: 0.5em;
		min-width: 0;
		flex: 1 1 auto;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	.tab-favicon {
		width: 14px;
		height: 14px;
		flex: 0 0 auto;
		border-radius: 2px;
		object-fit: contain;
	}
	.tab-fallback {
		display: inline-flex;
		align-items: center;
		flex: 0 0 auto;
	}
	.tab-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tab-close,
	.new-tab,
	.window-btn {
		border: 0;
		background: transparent;
		color: #a2a2a2;
		border-radius: 999px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0;
		flex: 0 0 auto;
	}
	.tab-close {
		width: 1.6em;
		height: 1.6em;
		opacity: 0;
		transition: opacity 120ms ease;
	}
	.page-tab:hover .tab-close,
	.page-tab:focus-within .tab-close,
	.page-tab.active .tab-close {
		opacity: 1;
	}
	.tab-close:hover,
	.new-tab:hover,
	.window-btn:hover {
		background: #2c2c2c;
		color: #fff;
	}
	.new-tab {
		width: 30px;
		height: 30px;
		border-radius: 9px;
	}
	.tab-strip-fill {
		flex: 1 1 auto;
	}
	.window-controls {
		display: flex;
		align-items: center;
		gap: 1px;
		margin-bottom: 3px;
	}
	.window-btn {
		width: 2.1em;
		height: 30px;
		border-radius: 9px;
	}
	.window-btn.close:hover {
		background: #c42b1c;
		color: #fff;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.35em;
		padding: 0.25em 0.5em 0.45em;
		background: #1e1e1e;
		min-width: 0;
	}
	.toolbar-tools {
		display: flex;
		align-items: center;
		gap: 0.15em;
		flex: 0 0 auto;
	}
	.icon-btn {
		position: relative;
		width: 2em;
		height: 2em;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: #a0a0a0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0;
	}
	.icon-btn:hover {
		background: #2a2a2a;
		color: #fff;
	}
	.icon-btn.active {
		background: #333;
		color: #fff;
	}
	.badge {
		position: absolute;
		top: -1px;
		right: -2px;
		min-width: 1.1em;
		padding: 0 0.24em;
		border-radius: 999px;
		background: #3f6fd8;
		color: #fff;
		font-size: 0.62em;
		line-height: 1.5;
		text-align: center;
	}
	.toolbar-divider {
		width: 1px;
		height: 1.2em;
		background: #303030;
		margin: 0 0.15em;
	}
	.tab-panel {
		flex: 1;
		width: 100%;
		min-width: 0;
		min-height: 0;
		display: none;
	}
	.tab-panel.active {
		display: flex;
	}
	.requests-panel {
		flex-direction: column;
	}
	.playground-panel {
		width: 100%;
		min-width: 0;
		min-height: 0;
	}
	.settings-tab {
		width: 100%;
		min-width: 0;
		min-height: 0;
	}
	@media (max-width: 720px) {
		.brand-mark {
			display: none;
		}
		.page-tab {
			min-width: 0;
		}
		.window-controls {
			display: none;
		}
	}
`;
export default App;
