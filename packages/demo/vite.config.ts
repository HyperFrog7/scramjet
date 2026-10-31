import { viteStaticCopy } from "vite-plugin-static-copy";

export default {
	plugins: [
		viteStaticCopy({
			structured: false,
			targets: [
				{
					src: "node_modules/driftproxy/dist/*",
					dest: "scramjet",
				},
				{
					src: "node_modules/driftproxy-controller/dist/*",
					dest: "controller",
				},
			],
			watch: {
				reloadPageOnChange: true,
			},
		}),
	],
};
