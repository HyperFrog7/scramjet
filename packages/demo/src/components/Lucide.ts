import {
	ArrowLeft,
	ArrowRight,
	Code,
	FilePlus,
	Globe,
	House,
	Minus,
	Pencil,
	Plus,
	ReceiptText,
	RotateCw,
	Search,
	Settings,
	Square,
	Trash2,
	X,
} from "lucide";

type IconNode = ReadonlyArray<
	readonly [string, Record<string, string | number>]
>;

const ICONS: Record<string, IconNode> = {
	"arrow-left": ArrowLeft,
	"arrow-right": ArrowRight,
	code: Code,
	"file-plus": FilePlus,
	globe: Globe,
	house: House,
	minus: Minus,
	pencil: Pencil,
	plus: Plus,
	"receipt-text": ReceiptText,
	"rotate-cw": RotateCw,
	search: Search,
	settings: Settings,
	square: Square,
	trash: Trash2,
	x: X,
};

export type LucideName = keyof typeof ICONS;

const SVG_NS = "http://www.w3.org/2000/svg";

/** Builds a Lucide icon as a standalone SVG element. */
export function icon(name: LucideName, size = 16): SVGSVGElement {
	const node = ICONS[name];
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("class", "lucide");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("width", String(size));
	svg.setAttribute("height", String(size));
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "2");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.setAttribute("aria-hidden", "true");
	svg.setAttribute("focusable", "false");

	for (const [tag, attrs] of node) {
		const child = document.createElementNS(SVG_NS, tag);
		for (const [key, value] of Object.entries(attrs)) {
			child.setAttribute(key, String(value));
		}
		svg.appendChild(child);
	}

	return svg;
}
