import { StateField, type Transaction } from "@codemirror/state";

/**
 * Tracks a single section's position within the merged document.
 */
export type SectionRange = {
	/** The section's ID in the database */
	id: string;
	/** Start position in the merged CodeMirror doc */
	from: number;
	/** End position in the merged CodeMirror doc */
	to: number;
};

/**
 * StateField that tracks section positions within the merged document.
 * Updates positions as the document is edited.
 */
export const sectionRangesField = StateField.define<SectionRange[]>({
	create: () => [],
	update(ranges, tr: Transaction) {
		if (!tr.docChanged) return ranges;
		return ranges.map((range) => ({
			...range,
			from: tr.changes.mapPos(range.from, -1),
			to: tr.changes.mapPos(range.to, 1),
		}));
	},
});

/** Separator string inserted between sections in the merged doc (two newlines) */
export const SECTION_SEPARATOR = "\n\n";

/**
 * Merge section bodies into a single document string and compute initial ranges.
 */
export function mergeSections(sections: { id: string; body: string }[]): {
	doc: string;
	ranges: SectionRange[];
} {
	if (sections.length === 0) return { doc: "", ranges: [] };

	const ranges: SectionRange[] = [];
	let offset = 0;
	const parts: string[] = [];

	for (const section of sections) {
		ranges.push({
			id: section.id,
			from: offset,
			to: offset + section.body.length,
		});
		parts.push(section.body);
		offset += section.body.length + SECTION_SEPARATOR.length;
	}

	return { doc: parts.join(SECTION_SEPARATOR), ranges };
}

/**
 * Split the merged document back into per-section bodies using tracked ranges.
 */
export function splitDoc(
	doc: string,
	ranges: SectionRange[],
): { id: string; body: string }[] {
	return ranges.map((range) => ({
		id: range.id,
		body: doc.slice(range.from, range.to),
	}));
}
