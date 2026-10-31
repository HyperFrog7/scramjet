// Benchmark the rewriters on a JS/HTML/CSS corpus.
//
// JS goes through the shipped wasm artifact (dist/scramjet.wasm), which is what
// the service worker runs. HTML and CSS are JS-side rewriters, so they are
// bundled for node into bench/.out and measured through the same code path the
// client uses (including inline <script> rewriting, which calls back into wasm).
//
//   pnpm --filter driftproxy bench
//   node bench/rewrite.mjs --iterations 100 --warmup 20
//   node bench/rewrite.mjs --json > bench.json
//   node bench/rewrite.mjs --no-sourcemaps --corpus ~/corpus
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rspack } from "@rspack/core";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const benchRoot = join(pkgRoot, "bench");
const bundleDir = join(benchRoot, ".out");
const bundlePath = join(bundleDir, "bench.mjs");
const jsGluePath = join(pkgRoot, "rewriter/wasm/out/wasm.js");

const KINDS = { ".js": "js", ".html": "html", ".css": "css" };

function parseArgs(argv) {
	const opts = {
		iterations: 50,
		warmup: 10,
		json: false,
		sourcemaps: true,
		corpus: null,
		wasm: join(pkgRoot, "dist/scramjet.wasm"),
		files: [],
		rebuild: false,
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = () => {
			const value = argv[++i];
			if (value === undefined) die(`${arg} needs a value`);
			return value;
		};

		switch (arg) {
			case "--iterations":
				opts.iterations = Number(next());
				break;
			case "--warmup":
				opts.warmup = Number(next());
				break;
			case "--corpus":
				opts.corpus = resolve(next());
				break;
			case "--wasm":
				opts.wasm = resolve(next());
				break;
			case "--json":
				opts.json = true;
				break;
			case "--no-sourcemaps":
				opts.sourcemaps = false;
				break;
			case "--rebuild":
				opts.rebuild = true;
				break;
			case "--":
				// pnpm forwards its own `--` separator to the script
				break;
			case "-h":
			case "--help":
				console.log(
					"usage: bench/rewrite.mjs [files...] [--iterations N] [--warmup N]\n" +
						"                       [--corpus DIR] [--wasm PATH] [--no-sourcemaps]\n" +
						"                       [--rebuild] [--json]",
				);
				process.exit(0);
				break;
			default:
				if (arg.startsWith("--")) die(`unknown flag ${arg}`);
				opts.files.push(resolve(arg));
		}
	}

	if (!Number.isFinite(opts.iterations) || opts.iterations < 1)
		die("--iterations must be >= 1");
	if (!Number.isFinite(opts.warmup) || opts.warmup < 0)
		die("--warmup must be >= 0");

	return opts;
}

function die(message) {
	console.error(`bench: ${message}`);
	process.exit(1);
}

function hrNow() {
	return Number(process.hrtime.bigint()) / 1e6;
}

function percentile(sorted, p) {
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
	);
	return sorted[index];
}

function fmtMs(ms) {
	return `${ms.toFixed(2)} ms`;
}

function fmtBytes(bytes) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function displayPath(path) {
	const rel = relative(process.cwd(), path);
	return rel.startsWith("..") ? path : rel;
}

function newestSourceMtime() {
	let newest = 0;
	const walk = (dir) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.name.endsWith(".ts")) {
				const mtime = statSync(full).mtimeMs;
				if (mtime > newest) newest = mtime;
			}
		}
	};
	walk(join(pkgRoot, "src"));
	walk(benchRoot);
	return newest;
}

function needsBundle(force) {
	if (force) return true;
	if (!existsSync(bundlePath)) return true;
	return statSync(bundlePath).mtimeMs < newestSourceMtime();
}

function buildBundle() {
	return new Promise((resolveBuild, reject) => {
		rspack(
			{
				mode: "development",
				target: "node",
				devtool: false,
				context: pkgRoot,
				entry: { bench: join(benchRoot, "entry.ts") },
				output: {
					path: bundleDir,
					filename: "bench.mjs",
					module: true,
					libraryTarget: "module",
					chunkFormat: "module",
					clean: true,
				},
				experiments: { outputModule: true },
				optimization: { minimize: false },
				resolve: {
					extensions: [".ts", ".js", ".json"],
					alias: {
						"@rewriters": join(pkgRoot, "src/shared/rewriters"),
						"@client": join(pkgRoot, "src/client"),
						"@": join(pkgRoot, "src"),
					},
				},
				module: {
					rules: [
						{
							test: /\.ts$/,
							loader: "builtin:swc-loader",
							exclude: [/node_modules/],
							options: {
								jsc: {
									parser: { syntax: "typescript" },
									target: "es2022",
								},
								module: { type: "es6" },
							},
							type: "javascript/auto",
						},
					],
				},
				plugins: [
					new rspack.ProvidePlugin({
						dbg: [join(pkgRoot, "src/log.ts"), "default"],
					}),
				],
			},
			(err, stats) => {
				if (err) return reject(err);
				if (stats?.hasErrors()) {
					return reject(
						new Error(
							stats.toString({ colors: false, errors: true, modules: false }),
						),
					);
				}
				resolveBuild();
			},
		);
	});
}

let enginePromise;
let bundleBuildMs = 0;

async function ensureEngine() {
	if (!enginePromise) {
		enginePromise = (async () => {
			const needsBuild = needsBundle(opts.rebuild);
			if (needsBuild) {
				const started = hrNow();
				await buildBundle();
				bundleBuildMs = hrNow() - started;
			}
			const mod = await import(pathToFileURL(bundlePath).href);
			mod.setWasm(readFileSync(opts.wasm));
			return mod;
		})();
	}
	return enginePromise;
}

function collectCorpus() {
	if (opts.files.length) return opts.files;

	const dirs = opts.corpus
		? [opts.corpus]
		: [
				join(pkgRoot, "rewriter/native/sample"),
				join(benchRoot, "corpus"),
				join(benchRoot, "corpus/real"),
			];

	const files = [];
	for (const dir of dirs) {
		if (!existsSync(dir)) {
			if (opts.corpus) die(`corpus not found: ${dir}`);
			continue;
		}
		for (const name of readdirSync(dir)) {
			if (!KINDS[extname(name)]) continue;
			const full = join(dir, name);
			if (statSync(full).isFile()) files.push(full);
		}
	}

	if (!files.length) die("no .js/.html/.css files found");

	if (!opts.corpus && !files.some((file) => KINDS[extname(file)] === "html")) {
		console.warn(
			"bench: no real-world html in the corpus yet - run: node bench/fetch-corpus.mjs",
		);
	}

	return files.sort((a, b) => statSync(a).size - statSync(b).size);
}

const opts = parseArgs(process.argv.slice(2));

if (!existsSync(opts.wasm)) {
	die(
		`missing ${displayPath(opts.wasm)}\n` +
			`  it is produced by the Rust build: pnpm --filter driftproxy rewriter:build`,
	);
}
if (!existsSync(jsGluePath)) {
	die(
		`missing ${displayPath(jsGluePath)}\n` +
			`  generated by wasm-bindgen during the same build: pnpm --filter driftproxy rewriter:build`,
	);
}

const wasmBytes = readFileSync(opts.wasm);
const jsGlue = await import(pathToFileURL(jsGluePath).href);

const initStart = hrNow();
try {
	jsGlue.initSync({ module: wasmBytes });
} catch {
	jsGlue.initSync(wasmBytes);
}
const initMs = hrNow() - initStart;

// mirrors ScramjetConfig.globals so rewritten output matches production shape
const config = {
	prefix: "/proxy/",
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

const flags = {
	sourcemaps: opts.sourcemaps,
	captureErrors: false,
	scramitize: false,
	disableComputedWrap: false,
	destructureRewrites: false,
};

const encodeUrl = (url) => `https://proxy.invalid/${encodeURIComponent(url)}`;

const files = collectCorpus();
const kinds = files.map((file) => KINDS[extname(file)]);
const needsEngine = kinds.some((kind) => kind !== "js");
const engine = needsEngine ? await ensureEngine() : null;
const benchContext = engine?.createBenchContext?.({
	sourcemaps: opts.sourcemaps,
});
const meta = {
	origin: new URL("https://example.com/"),
	base: new URL("https://example.com/assets/app.js"),
};
const htmlContext = {
	loadScripts: false,
	inline: true,
	source: meta.base.href,
};

const rewriter = new jsGlue.Rewriter();

let firstRewriteMs = 0;
const results = [];

for (const [index, file] of files.entries()) {
	const kind = kinds[index];
	const source = readFileSync(file, "utf8");

	let run;
	if (kind === "js") {
		run = () =>
			engine
				? engine.rewriteJs(source, "bench.js", benchContext, false)
				: rewriter.rewrite_js(
						config,
						flags,
						encodeUrl,
						source,
						meta.base.href,
						"bench.js",
						false,
					);
	} else if (kind === "html") {
		run = () => engine.rewriteHtml(source, benchContext, meta, htmlContext);
	} else {
		run = () => engine.rewriteCss(source, benchContext, meta);
	}

	const beforeFirst = hrNow();
	let out = run();
	const elapsed = hrNow() - beforeFirst;
	if (index === 0) firstRewriteMs = elapsed;

	for (let i = 0; i < opts.warmup; i++) run();

	const samples = [];
	for (let i = 0; i < opts.iterations; i++) {
		const start = hrNow();
		out = run();
		samples.push(hrNow() - start);
	}

	samples.sort((a, b) => a - b);

	const size = Buffer.byteLength(source);
	const p50 = percentile(samples, 50);
	const rewrittenBytes =
		typeof out === "string" ? Buffer.byteLength(out) : (out?.js?.length ?? 0);
	results.push({
		file: displayPath(file),
		kind,
		bytes: size,
		iterations: opts.iterations,
		min: samples[0],
		p50,
		p95: percentile(samples, 95),
		p99: percentile(samples, 99),
		max: samples[samples.length - 1],
		mbPerSecond: size / (p50 / 1000) / 1e6,
		rewrittenBytes,
		errors: typeof out === "string" ? 0 : (out.errors?.length ?? 0),
	});
}

const report = {
	timestamp: new Date().toISOString(),
	node: process.version,
	platform: `${platform()} ${release()}`,
	cpu: cpus()[0]?.model?.trim() ?? "unknown",
	artifact: {
		path: displayPath(opts.wasm),
		bytes: wasmBytes.length,
		sha256: createHash("sha256").update(wasmBytes).digest("hex").slice(0, 16),
	},
	flags,
	cold: {
		// module instantiation is paid once per page/service-worker boot
		initMs,
		firstRewriteMs,
		engineBuildMs: bundleBuildMs,
	},
	results,
};

if (opts.json) {
	console.log(JSON.stringify(report, null, 2));
	process.exit(0);
}

console.log("driftproxy rewriter benchmark");
console.log(
	`  artifact  ${report.artifact.path} (${fmtBytes(report.artifact.bytes)}, sha256 ${report.artifact.sha256})`,
);
console.log(`  runtime   node ${report.node}  ${report.platform}`);
console.log(`  cpu       ${report.cpu}`);
console.log(
	`  flags     sourcemaps=${flags.sourcemaps ? "on" : "off"}  iterations=${opts.iterations}  warmup=${opts.warmup}`,
);
console.log(
	`  cold       init ${fmtMs(initMs)}  first rewrite ${fmtMs(firstRewriteMs)}` +
		(bundleBuildMs
			? `  (html/css bundle built in ${fmtMs(bundleBuildMs)})`
			: ""),
);
console.log("");

const nameWidth = Math.max(4, ...results.map((r) => r.file.length));
const header = [
	"file".padEnd(nameWidth),
	"kind".padStart(5),
	"input".padStart(9),
	"min".padStart(10),
	"p50".padStart(10),
	"p95".padStart(10),
	"p99".padStart(10),
	"MB/s".padStart(7),
	"out/in".padStart(7),
].join("  ");
console.log(header);
console.log("-".repeat(header.length));

for (const r of results) {
	console.log(
		[
			r.file.padEnd(nameWidth),
			r.kind.padStart(5),
			fmtBytes(r.bytes).padStart(9),
			fmtMs(r.min).padStart(10),
			fmtMs(r.p50).padStart(10),
			fmtMs(r.p95).padStart(10),
			fmtMs(r.p99).padStart(10),
			r.mbPerSecond.toFixed(1).padStart(7),
			`${(r.rewrittenBytes / r.bytes).toFixed(2)}x`.padStart(7),
		].join("  "),
	);
}

const totalBytes = results.reduce((sum, r) => sum + r.bytes, 0);
const totalP50 = results.reduce((sum, r) => sum + r.p50, 0);
console.log("");
console.log(
	`${results.length} file(s), ${fmtBytes(totalBytes)}, ${(totalBytes / (totalP50 / 1000) / 1e6).toFixed(1)} MB/s at p50`,
);
