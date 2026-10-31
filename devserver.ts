import fs from "node:fs/promises";
import { execSync } from "node:child_process";
import http from "node:http";
import chalk from "chalk";
import { createLogger, createServer } from "vite";
//@ts-expect-error no typedefs
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import {
	normalizeWebsocketUrl,
	warnOnUrlEscape,
	runRspack,
	black,
	renderBanner,
} from "./devlib.ts";
import { DevTui } from "./tui.ts";
import rspackConfig from "./rspack.config.ts";

const image = await fs.readFile("./assets/driftproxy-mini-noalpha.png");

const commit = execSync("git rev-parse --short HEAD", {
	encoding: "utf-8",
}).replace(/\r?\n|\r/g, "");
const branch = execSync("git rev-parse --abbrev-ref HEAD", {
	encoding: "utf-8",
}).replace(/\r?\n|\r/g, "");
const packagejson = JSON.parse(await fs.readFile("./package.json", "utf-8"));
const version = packagejson.version;

const DEMO_PORT = process.env.DEMO_PORT || 4141;
const WISP_PORT = process.env.WISP_PORT || 4142;

if (process.env.VITE_WISP_URL) {
	process.env.VITE_WISP_URL = normalizeWebsocketUrl(process.env.VITE_WISP_URL);
} else {
	process.env.VITE_WISP_URL = `ws://localhost:${WISP_PORT}/`;
}

const accent = (text: string) => chalk.hex("#f1855bff").bold(text);
const highlight = (text: string) => chalk.hex("#fdd76cff").bold(text);
const urlColor = (text: string) => chalk.hex("#64DFDF").underline(text);
const connector = chalk.hex("#8D99AE").dim("@");

const bannerLines = [
	black()(`${highlight("SCRAMJET DEV SERVER")}`),
	black()(
		`${accent("demo")} ${connector} ${urlColor(`http://localhost:${DEMO_PORT}/`)}`,
	),
	black()(
		`${accent("wisp")} ${connector} ${urlColor(process.env.VITE_WISP_URL ?? "")}`,
	),
	black()(chalk.dim(`[${branch}] ${commit} driftproxy/${version}`)),
];

const tui = new DevTui({
	banner: await renderBanner(image, bannerLines),
	meta: `[${branch}] ${commit} driftproxy/${version}`,
	ports: `demo :${DEMO_PORT}  wisp :${WISP_PORT}`,
	openUrl: `http://localhost:${DEMO_PORT}/`,
	onQuit: async () => {
		await watcher?.close();
		await server?.close();
		await new Promise<void>((resolve) => wispserver.close(() => resolve()));
	},
});
tui.start();

const wispserver = http.createServer((req, res) => {
	res.writeHead(200, { "Content-Type": "text/plain" });
	res.end("wisp server js rewrite");
});
wisp.options.allow_private_ips = true;
wisp.options.allow_loopback_ips = true;

wispserver.on("upgrade", (req, socket, head) => {
	wisp.routeRequest(req, socket, head);
});

wispserver.on("error", (err: NodeJS.ErrnoException) => {
	if (err.code === "EADDRINUSE") {
		tui.fail(
			`wisp port ${WISP_PORT} is already in use.\n` +
				`  another dev server is probably still running. find and stop it with:\n` +
				`    lsof -i :${WISP_PORT}\n` +
				`  or use different ports:\n` +
				`    WISP_PORT=4143 DEMO_PORT=4144 pnpm dev`,
		);
	}
	tui.fail(err.stack ?? String(err));
});

wispserver.listen(Number(WISP_PORT));

const logger = createLogger("info");
logger.info = (msg) => tui.log(msg);
logger.warn = (msg) => tui.log(chalk.yellow(msg));
logger.error = (msg) => tui.log(chalk.red(msg));
logger.warnOnce = (msg) => tui.log(chalk.yellow(msg));
logger.clearScreen = () => {};

const server = await createServer({
	configFile: "./packages/demo/vite.config.ts",
	root: "./packages/demo",
	customLogger: logger,
	server: {
		port: Number(DEMO_PORT),
		strictPort: true,
	},
});

warnOnUrlEscape(server);

try {
	await server.listen();
} catch (err) {
	const code = (err as NodeJS.ErrnoException).code;
	if (code === "EADDRINUSE") {
		tui.fail(
			`demo port ${DEMO_PORT} is already in use.\n` +
				`  another dev server is probably still running. find and stop it with:\n` +
				`    lsof -i :${DEMO_PORT}\n` +
				`  or use different ports:\n` +
				`    WISP_PORT=4143 DEMO_PORT=4144 pnpm dev`,
		);
	}
	tui.fail((err as Error).stack ?? String(err));
}

const watcher = runRspack(rspackConfig, {
	onBuild: ({ ok, successCount, text }) => {
		if (ok) {
			tui.status(
				`compiled successfully${successCount > 1 ? ` (x${successCount})` : ""}`,
				"ok",
			);
			if (text && /\bwarning\b/i.test(text)) tui.log(text);
			return;
		}
		tui.status("build failed", "error");
		if (text) tui.log(text);
	},
});

tui.status("building...", "busy");
