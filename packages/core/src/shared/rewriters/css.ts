import { URLMeta, rewriteUrl, unrewriteUrl } from "@rewriters/url";
import { ScramjetContext } from "@/shared";
import { String } from "@/shared/snapshot";

// regex from vk6 (https://github.com/ading2210)
//
// hoisted out of handleCss: these run on every stylesheet, every inline style
// attribute and every CSSOM write, so compiling them per call is real overhead
const urlRegex =
	/(?i:url)\((?:\s*"((?:\\.|[^"])+)"\s*|\s*'((?:\\.|[^'])+)'\s*|((?!\s*['"])(?!\s*\))(?:\\.|[^)])+?))\)/gm;
const atRuleRegex =
	/@import\s+((?i:url)\s*?\(.{0,9999}?\)|['"].{0,9999}?['"]|.{0,9999}?)($|\s|;)/gm;
const atRuleTargetRegex = /^(url\(['"]?|['"]|)(.+?)(['"]|['"]?\)|)$/gm;

export function rewriteCss(
	css: string,
	context: ScramjetContext,
	meta: URLMeta,
) {
	return handleCss("rewrite", css, context, meta);
}

export function unrewriteCss(css: string, context: ScramjetContext) {
	return handleCss("unrewrite", css, context);
}

function handleCss(
	type: "rewrite" | "unrewrite",
	css: string,
	context: ScramjetContext,
	meta?: URLMeta,
) {
	css = String(css);
	css = css.replace(
		urlRegex,
		(
			match,
			doubleQuotedUrl: string | undefined,
			singleQuotedUrl: string | undefined,
			unquotedUrl: string | undefined,
		) => {
			const url = doubleQuotedUrl ?? singleQuotedUrl ?? unquotedUrl;
			const encodedUrl =
				type === "rewrite"
					? rewriteUrl(url.trim(), context, meta!)
					: unrewriteUrl(url.trim(), context);

			// function replacer: a string replacement would both rescan the match
			// and expand $&, $` and friends if the encoded url contains them
			return match.replace(url, () => encodedUrl);
		},
	);

	// the @import pass cannot match without a literal @import, and most
	// stylesheets have none, so its full-document scan is pure cost
	if (css.indexOf("@import") === -1) return css;

	return css.replace(atRuleRegex, (match, importStatement: string) => {
		return match.replace(importStatement, () =>
			importStatement.replace(
				atRuleTargetRegex,
				(target: string, firstQuote: string, url: string, endQuote: string) => {
					if (firstQuote.startsWith("url")) {
						return target;
					}
					const encodedUrl =
						type === "rewrite"
							? rewriteUrl(url.trim(), context, meta!)
							: unrewriteUrl(url.trim(), context);

					return `${firstQuote}${encodedUrl}${endQuote}`;
				},
			),
		);
	});
}
