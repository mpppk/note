import { StateEffect, StateField, type Transaction } from "@codemirror/state";

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
 * StateEffect to explicitly overwrite section ranges (e.g., after reorder).
 */
export const setSectionRangesEffect = StateEffect.define<SectionRange[]>();

/**
 * StateEffect to request moving a section from one index to another.
 * Handled by PageEditor's updateListener to perform the actual doc swap.
 */
export const moveSectionEffect = StateEffect.define<{
	fromIndex: number;
	toIndex: number;
}>();

/**
 * StateField that tracks section positions within the merged document.
 * Updates positions as the document is edited.
 */
export const sectionRangesField = StateField.define<SectionRange[]>({
	create: () => [],
	update(ranges, tr: Transaction) {
		// Explicit override (e.g. after a section reorder)
		for (const effect of tr.effects) {
			if (effect.is(setSectionRangesEffect)) return effect.value;
		}
		if (!tr.docChanged) return ranges;
		const docLen = tr.startState.doc.length;
		return ranges.map((range) => ({
			...range,
			from: tr.changes.mapPos(Math.min(range.from, docLen), -1),
			to: tr.changes.mapPos(Math.min(range.to, docLen), 1),
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

const H1H2_PREFIX_RE = /^#{1,2}(?:[ \t]|\n|$)/;
const EMBEDDED_H1H2_RE = /\n#{1,2}(?:[ \t]|\n|$)/;

/** Returns true if body starts with an H1 or H2 heading. */
export function startsWithH1H2(body: string): boolean {
	return H1H2_PREFIX_RE.test(body);
}

/**
 * Returns the index of the '#' character of the first H1/H2 heading embedded
 * inside the body (preceded by '\n', not at position 0). Returns -1 if none.
 */
export function findFirstEmbeddedH1H2(body: string): number {
	const match = EMBEDDED_H1H2_RE.exec(body);
	return match ? match.index + 1 : -1;
}

/**
 * Recomputes section ranges from the actual document content and section body lengths.
 * Used after the initial Yjs sync populates the CodeMirror doc from an empty state,
 * which causes mapPos to collapse all section ranges to {from:0, to:totalLen}.
 */
export function recomputeSectionRanges(
	doc: string,
	sections: { id: string; body: string }[],
): SectionRange[] {
	if (sections.length === 0) return [];
	const ranges: SectionRange[] = [];
	let offset = 0;
	for (let i = 0; i < sections.length; i++) {
		const isLast = i === sections.length - 1;
		if (isLast) {
			ranges.push({ id: sections[i].id, from: offset, to: doc.length });
		} else {
			const sectionEnd = Math.min(offset + sections[i].body.length, doc.length);
			ranges.push({ id: sections[i].id, from: offset, to: sectionEnd });
			offset = Math.min(sectionEnd + SECTION_SEPARATOR.length, doc.length);
		}
	}
	return ranges;
}

/**
 * Splits body at every embedded H1/H2 boundary.
 * Returns [contentBeforeFirstHeading, headingSection1, headingSection2, ...].
 * Returns [body] unchanged if no embedded headings exist.
 */
export function splitBodyAtAllH1H2(body: string): string[] {
	const results: string[] = [];
	let remaining = body;
	while (true) {
		const hashPos = findFirstEmbeddedH1H2(remaining);
		if (hashPos === -1) break;
		results.push(remaining.slice(0, hashPos - 1).trimEnd());
		remaining = remaining.slice(hashPos);
	}
	results.push(remaining);
	return results;
}
