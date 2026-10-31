import type { Controller } from "driftproxy-controller";
declare global {
	function initBootstrap(): Promise<Controller>;
}

export * from "./server";
