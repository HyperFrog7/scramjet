import type * as ScramjetController from "driftproxy-controller";

declare global {
	const $scramjet: typeof import("driftproxy");
	const $scramjetController: typeof ScramjetController;
}

export {};
