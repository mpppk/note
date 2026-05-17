import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import ReactMarkdown, { type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
	type AutoLinkOptions,
	remarkAutoLink,
	type TitleEntry,
} from "#/lib/remark-autolink";

type Plugins = NonNullable<Options["remarkPlugins"]>;

type Props = {
	body: string;
	titles: TitleEntry[];
	orgId: string;
	teamId: string;
	excludeRefIds?: string[];
};

export function Markdown({
	body,
	titles,
	orgId,
	teamId,
	excludeRefIds,
}: Props) {
	const plugins = useMemo<Plugins>(() => {
		const opts: AutoLinkOptions = {
			titles,
			orgId,
			teamId,
			excludeRefIds,
		};
		return [remarkGfm, [remarkAutoLink, opts]];
	}, [titles, orgId, teamId, excludeRefIds]);

	return (
		<div className="prose prose-sm dark:prose-invert max-w-none break-words">
			<ReactMarkdown
				remarkPlugins={plugins}
				components={{
					a({ href, children, ...rest }) {
						const url = href ?? "";
						if (url.startsWith("/")) {
							return (
								<Link to={url} className="text-primary underline">
									{children}
								</Link>
							);
						}
						return (
							<a
								href={url}
								target="_blank"
								rel="noreferrer noopener"
								className="text-primary underline"
								{...rest}
							>
								{children}
							</a>
						);
					},
				}}
			>
				{body}
			</ReactMarkdown>
		</div>
	);
}
