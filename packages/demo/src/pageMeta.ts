import { createState } from "dreamland/core";

/**
 * Metadata of the page currently loaded in the browser frame.
 * Written by BrowserView, read by the top bar so the tab and the document title
 * track the proxied page instead of staying on the demo's own title.
 */
export const pageMetaState = createState({
	title: "",
	host: "",
	favicon: "",
});
