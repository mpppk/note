import { findAndReplace } from "mdast-util-find-and-replace";
import type { Plugin } from "unified";

export type TitleEntry = {
	title: string;
	kind: "block" | "page";
	refId: string;
};

export type AutoLinkOptions = {
	titles: TitleEntry[];
	orgId: string;
	teamId: string;
	excludeRefIds?: string[];
};

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const remarkAutoLink: Plugin<[AutoLinkOptions]> = (options) => {
	const exclude = new Set(options.excludeRefIds ?? []);
	const entries = options.titles
		.filter((e) => !exclude.has(e.refId))
		.slice()
		.sort((a, b) => b.title.length - a.title.length);

	const lookup = new Map<string, TitleEntry>();
	for (const e of entries) {
		const lower = e.title.toLowerCase();
		if (!lookup.has(lower)) lookup.set(lower, e);
	}

	return (tree) => {
		if (entries.length === 0) return;
		const pattern = new RegExp(
			entries.map((e) => escapeRegExp(e.title)).join("|"),
			"gi",
		);
		findAndReplace(tree as never, [
			[
				pattern,
				(match: string) => {
					const entry = lookup.get(match.toLowerCase());
					if (!entry) return false;
					const path = entry.kind === "block" ? "blocks" : "pages";
					return {
						type: "link",
						url: `/org/${options.orgId}/team/${options.teamId}/${path}/${entry.refId}`,
						children: [{ type: "text", value: match }],
					};
				},
			],
		]);
	};
};
