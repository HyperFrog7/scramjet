import { stderr, stdin, stdout } from "node:process";
import { spawn } from "node:child_process";
import chalk from "chalk";
import { stripAnsi } from "./devlib.ts";

type Tone = "busy" | "ok" | "error";

type WriteFn = (chunk: any, encoding?: any, callback?: any) => boolean;

export type DevTuiOptions = {
	/** pre-rendered banner block (may contain ANSI colors) */
	banner: string;
	/** right-aligned footer text, e.g. `[main] abc123 driftproxy/2.0.0` */
	meta: string;
	/** right-aligned status text, e.g. `demo :4141  wisp :4142` */
	ports: string;
	/** URL opened with `o` */
	openUrl: string;
	onQuit: () => Promise<void> | void;
};

const RESET = "\x1b[0m";
const ENTER = "\x1b[?1049h";
const LEAVE = "\x1b[?25h\x1b[?1049l";

const accent = (text: string) => chalk.hex("#f1855bff").bold(text);
const dim = (text: string) => chalk.hex("#8D99AE")(text);

function visibleWidth(s: string) {
	return stripAnsi(s).length;
}

function clipAnsi(s: string, max: number) {
	if (max <= 0) return "";
	if (visibleWidth(s) <= max) return s;
	let out = "";
	let visible = 0;
	let i = 0;
	while (i < s.length && visible < max) {
		if (s[i] === "\x1b") {
			const match = /^\x1b\[[0-9;]*m/.exec(s.slice(i));
			if (match) {
				out += match[0];
				i += match[0].length;
				continue;
			}
			i += 1;
			continue;
		}
		out += s[i];
		visible += 1;
		i += 1;
	}
	return out + RESET;
}

function colorizeLogLine(line: string) {
	if (/\b(error|failed|failure)\b/i.test(line)) return chalk.red(line);
	if (/\b(warn|warning)\b/i.test(line)) return chalk.yellow(line);
	return line;
}

export class DevTui {
	private readonly bannerLines: string[];
	private readonly logs: string[] = [];
	private readonly maxLogs = 500;
	private label = "starting";
	private tone: Tone = "busy";
	private dirty = true;
	private active = false;
	private leaving = false;
	private timer?: NodeJS.Timeout;
	private keyHandler?: (chunk: string) => void;
	private resizeHandler?: () => void;
	private writeRaw = stdout.write.bind(stdout) as unknown as WriteFn;
	private writeErrRaw = stderr.write.bind(stderr) as unknown as WriteFn;
	private streamsPatched = false;
	private crashHandler = () => this.stop();

	private readonly opts: DevTuiOptions;

	constructor(opts: DevTuiOptions) {
		this.opts = opts;
		this.bannerLines = opts.banner.replace(/\n+$/, "").split("\n");
	}

	start() {
		if (process.env.NO_TUI === "1" || !stdout.isTTY) {
			stdout.write(this.opts.banner);
			return;
		}

		this.active = true;
		this.writeRaw(ENTER + "\x1b[H\x1b[?25l");
		this.patchStreams();
		process.on("uncaughtExceptionMonitor", this.crashHandler);
		stdin.setRawMode?.(true);
		stdin.resume();
		stdin.setEncoding("utf8");

		this.keyHandler = (chunk) => this.onKey(chunk);
		stdin.on("data", this.keyHandler);

		this.resizeHandler = () => {
			this.dirty = true;
		};
		stdout.on("resize", this.resizeHandler);

		process.once("SIGTERM", () => void this.quit());
		process.once("SIGHUP", () => void this.quit());

		this.timer = setInterval(() => this.render(), 120);
		this.render();
	}

	/** anything printed by rspack/vite/child processes lands in the log pane */
	private patchStreams() {
		const out = this.writeRaw;
		const err = this.writeErrRaw;
		stdout.write = ((chunk: any, encoding?: any, callback?: any) => {
			if (!this.active) return out(chunk, encoding, callback);
			this.log(typeof chunk === "string" ? chunk : String(chunk));
			if (typeof encoding === "function") encoding();
			else if (typeof callback === "function") callback();
			return true;
		}) as typeof stdout.write;
		stderr.write = ((chunk: any, encoding?: any, callback?: any) => {
			if (!this.active) return err(chunk, encoding, callback);
			this.log(typeof chunk === "string" ? chunk : String(chunk));
			if (typeof encoding === "function") encoding();
			else if (typeof callback === "function") callback();
			return true;
		}) as typeof stderr.write;
		this.streamsPatched = true;
	}

	log(message: string) {
		if (!this.active) {
			this.writeRaw(message.endsWith("\n") ? message : `${message}\n`);
			return;
		}
		for (const line of stripAnsi(String(message))
			.replace(/\r/g, "")
			.split("\n")) {
			this.logs.push(line);
		}
		while (this.logs.length > this.maxLogs) this.logs.shift();
		this.dirty = true;
	}

	status(label: string, tone: Tone) {
		this.label = label;
		this.tone = tone;
		this.dirty = true;
	}

	/** print a fatal message, restore the terminal, and exit */
	fail(message: string): never {
		this.stop();
		process.stderr.write(`${chalk.red(message)}\n`);
		process.exit(1);
	}

	async quit() {
		if (this.leaving) return;
		this.leaving = true;
		this.stop();
		try {
			await this.opts.onQuit();
		} catch {
			// shutting down anyway
		}
		process.exit(0);
	}

	stop() {
		if (this.timer) clearInterval(this.timer);
		this.timer = undefined;

		if (this.keyHandler) stdin.off("data", this.keyHandler);
		if (this.resizeHandler) stdout.off("resize", this.resizeHandler);

		process.off("uncaughtExceptionMonitor", this.crashHandler);
		if (this.active) {
			this.active = false;
			if (this.streamsPatched) {
				stdout.write = this.writeRaw as typeof stdout.write;
				stderr.write = this.writeErrRaw as typeof stderr.write;
				this.streamsPatched = false;
			}
			stdin.setRawMode?.(false);
			stdin.pause();
			this.writeRaw(LEAVE + "\n");
		}
	}

	private onKey(chunk: string) {
		if (chunk.includes("\u0003") || chunk === "q" || chunk === "Q") {
			void this.quit();
			return;
		}
		if (chunk === "o" || chunk === "O") {
			this.open();
			return;
		}
		if (chunk === "c" || chunk === "C") {
			this.logs.length = 0;
			this.dirty = true;
		}
	}

	private open() {
		const url = this.opts.openUrl;
		const [cmd, args] =
			process.platform === "darwin"
				? ["open", [url]]
				: process.platform === "win32"
					? ["cmd", ["/c", "start", "", url]]
					: ["xdg-open", [url]];
		try {
			spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
			this.log(`opened ${url}`);
		} catch {
			this.log(`could not open a browser - visit ${url}`);
		}
	}

	private render() {
		if (!this.active || !this.dirty) return;
		this.dirty = false;
		try {
			this.writeRaw(this.frame());
		} catch {
			// never let a draw error take down the dev server
		}
	}

	private frame() {
		const width = Math.max(48, stdout.columns || 80);
		const height = Math.max(12, stdout.rows || 24);

		const banner =
			this.bannerLines.length + 8 <= height
				? this.bannerLines
				: [accent("driftproxy dev server"), ""];

		const logSpace = Math.max(1, height - banner.length - 6);
		const logs = this.logBlock(logSpace);

		const rules = dim("─".repeat(width));
		const lines = [
			"",
			...banner,
			"",
			this.statusLine(width),
			rules,
			...logs,
			rules,
			this.footerLine(width),
		];

		return `\x1b[H${lines.map((line) => clipAnsi(line, width)).join("\n")}\x1b[J`;
	}

	private logBlock(space: number) {
		const shown = this.logs.slice(-space);
		const colored = shown.map(colorizeLogLine);
		while (colored.length < space) colored.push("");
		return colored;
	}

	private statusLine(width: number) {
		const dot =
			this.tone === "ok"
				? chalk.hex("#7CE38B")("●")
				: this.tone === "error"
					? chalk.hex("#FF6B6B")("●")
					: chalk.hex("#fdd76c")("●");
		const left = `${dot} ${this.label}`;
		const right = dim(this.opts.ports);
		const pad = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
		return left + " ".repeat(pad) + right;
	}

	private footerLine(width: number) {
		const left = `${chalk.bold("o")} open  ${chalk.bold("c")} clear  ${chalk.bold("q")} quit`;
		const right = dim(this.opts.meta);
		const pad = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
		return left + " ".repeat(pad) + right;
	}
}
