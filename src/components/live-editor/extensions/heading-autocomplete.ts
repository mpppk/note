import {
type Completion,
type CompletionContext,
type CompletionResult,
autocompletion,
} from "@codemirror/autocomplete";
import {
Compartment,
type Extension,
type StateEffect,
} from "@codemirror/state";

export type HeadingAutocompleteTitleEntry = {
title: string;
refId: string;
};

/**
 * Build a completion source function for heading lines.
 */
function makeHeadingCompleteSource(titles: HeadingAutocompleteTitleEntry[]) {
const completions: Completion[] = titles.map((t) => ({
label: t.title,
type: "text",
detail: "page",
}));

return function headingComplete(
ctx: CompletionContext,
): CompletionResult | null {
const line = ctx.state.doc.lineAt(ctx.pos);
const lineText = line.text;

// Only activate on heading lines: # text, ## text, etc.
const headingMatch = lineText.match(/^(#{1,6}) (.*)/);
if (!headingMatch) return null;

const prefixLen = headingMatch[1].length + 1; // #'s + one space
const from = line.from + prefixLen;

// Only trigger when cursor is within the heading text
if (ctx.pos < from) return null;

const partialText = ctx.state.doc.sliceString(from, ctx.pos);

const filtered = completions.filter((c) =>
c.label.toLowerCase().startsWith(partialText.toLowerCase()),
);

if (filtered.length === 0) return null;

return {
from,
to: line.to,
options: filtered,
validFor: /^[^\n]*$/,
};
};
}

/**
 * Build the autocompletion extension with a given title list.
 */
function buildHeadingAutocomplete(
titles: HeadingAutocompleteTitleEntry[],
): Extension {
if (titles.length === 0) return [];
return autocompletion({
override: [makeHeadingCompleteSource(titles)],
icons: false,
activateOnTyping: true,
});
}

/**
 * Create a new Compartment for heading autocomplete (one per PageEditor instance).
 */
export function createHeadingAutocompleteCompartment() {
return new Compartment();
}

/**
 * Initial heading autocomplete extension wrapped in the given compartment.
 */
export function headingAutocompleteExtension(
compartment: Compartment,
titles: HeadingAutocompleteTitleEntry[],
): Extension {
return compartment.of(buildHeadingAutocomplete(titles));
}

/**
 * Reconfigure the compartment with an updated title list.
 * Returns a StateEffect suitable for dispatch({ effects: ... }).
 */
export function headingAutocompleteConfig(
compartment: Compartment,
titles: HeadingAutocompleteTitleEntry[],
): StateEffect<unknown> {
return compartment.reconfigure(buildHeadingAutocomplete(titles));
}
