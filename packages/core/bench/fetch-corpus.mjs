// Download a set of real-world pages and stylesheets for the bench.
//
// Synthetic documents make fixed per-document overhead look large and don't
// resemble real markup (nested inline scripts, style blocks, SVG, tables,
// comments, entity references). These files are fetched rather than committed
// so the repository doesn't carry third-party content, and so the corpus can be
// refreshed on demand.
//
//   node bench/fetch-corpus.mjs
//   node bench/fetch-corpus.mjs --force
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "corpus", "real");
const force = process.argv.includes("--force");

const SOURCES = [
	{
		name: "wikipedia",
		ext: "html",
		url: "https://en.wikipedia.org/wiki/Main_Page",
	},
	{
		name: "mdn",
		ext: "html",
		url: "https://developer.mozilla.org/en-US/docs/Web/HTML",
	},
	{ name: "hackernews", ext: "html", url: "https://news.ycombinator.com/" },
	{ name: "rust-lang", ext: "html", url: "https://www.rust-lang.org/" },
	{ name: "python-org", ext: "html", url: "https://www.python.org/" },
	{ name: "w3c-html", ext: "html", url: "https://www.w3.org/TR/html52/" },

	// Stylesheets: framework output and hand-written production CSS. Sizes and
	// url()/@import density differ a lot between these, which is the point.
	{
		name: "bootstrap",
		ext: "css",
		url: "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.css",
	},
	{
		name: "bootstrap-grid",
		ext: "css",
		url: "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap-grid.css",
	},
	{
		name: "bulma",
		ext: "css",
		url: "https://cdn.jsdelivr.net/npm/bulma@1.0.2/css/bulma.css",
	},
	{
		name: "pico",
		ext: "css",
		url: "https://cdn.jsdelivr.net/npm/@picocss/pico@2.0.6/css/pico.css",
	},
	{
		name: "normalize",
		ext: "css",
		url: "https://cdn.jsdelivr.net/npm/normalize.css@8.0.1/normalize.css",
	},
	// url()-heavy sheets: font/icon sprites referenced by relative path, which
	// is the case that actually rewrites output rather than just scanning it
	{
		name: "font-awesome",
		ext: "css",
		url: "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.2/css/all.css",
	},
	{
		name: "bootstrap-icons",
		ext: "css",
		url: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css",
	},
];

const USER_AGENT =
	"driftproxy-bench/1.0 (+https://github.com/MercuryWorkshop/scramjet)";

const ACCEPT = {
	html: "text/html,application/xhtml+xml",
	css: "text/css,*/*;q=0.1",
};

mkdirSync(outDir, { recursive: true });

let ok = 0;
let skipped = 0;
let failed = 0;

for (const { name, ext, url } of SOURCES) {
	const file = join(outDir, `${name}.${ext}`);
	if (!force && existsSync(file) && statSync(file).size > 0) {
		console.log(`skip  ${name} (already present)`);
		skipped += 1;
		continue;
	}

	try {
		const res = await fetch(url, {
			redirect: "follow",
			headers: { "user-agent": USER_AGENT, accept: ACCEPT[ext] },
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const body = await res.text();
		if (ext === "html" && !body.includes("<")) throw new Error("not html");
		if (ext === "css" && body.trimStart().startsWith("<"))
			throw new Error("got markup instead of css");
		writeFileSync(file, body);
		console.log(`ok    ${name} ${(body.length / 1024).toFixed(1)} KB`);
		ok += 1;
	} catch (err) {
		failed += 1;
		console.warn(`fail  ${name}: ${err.message}`);
	}
}

console.log(
	`\n${ok} downloaded, ${skipped} skipped, ${failed} failed -> ${outDir}`,
);
if (ok + skipped === 0) {
	console.error("bench: no corpus files; check network access");
	process.exit(1);
}
