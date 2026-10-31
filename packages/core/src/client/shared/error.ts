import { unrewriteUrl } from "@rewriters/url";
import { ScramjetClient } from "@client/index";

export const enabled = (client: ScramjetClient) =>
	client.flagEnabled("cleanErrors");

export default function (client: ScramjetClient, _self: Self) {
	// v8 only. all we need to do is clean the scramjet urls from stack traces
	const closure = (error, stack) => {
		let newstack = error.stack;

		for (let i = 0; i < stack.length; i++) {
			const url = stack[i].getFileName();

			try {
				if (client.config.maskedfiles.some((f) => url.endsWith(f))) {
					// strip stack frames including scramjet handlers from the trace
					const lines = newstack.split("\n");
					const frameIndex = lines.findIndex((l) => l.includes(url));
					if (frameIndex !== -1) lines.splice(frameIndex, 1);
					newstack = lines.join("\n");
					continue;
				}
			} catch {}

			try {
				newstack = newstack.replaceAll(url, unrewriteUrl(url, client.context));
			} catch {}
		}

		return newstack;
	};
	client.Trap("Error.prepareStackTrace", {
		get(_ctx) {
			// this is a funny js quirk. the getter is ran every time you type something in console
			return closure;
		},
		set(_value) {
			// just ignore it if a site tries setting their own. not much we can really do
		},
	});
}
