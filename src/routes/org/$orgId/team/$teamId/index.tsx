import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { getSession } from "#/server/auth";
import { listMembers } from "#/server/orgs";

export const Route = createFileRoute("/org/$orgId/team/$teamId/")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/login" });
		}
	},
	loader: async ({ context, params }) => {
		await context.queryClient.prefetchQuery({
			queryKey: ["org-members", params.orgId],
			queryFn: () => listMembers({ data: { orgId: params.orgId } }),
		});
	},
	component: TeamHome,
});

function TeamHome() {
	const { orgId, teamId } = Route.useParams();
	const { data: org } = useQuery({
		queryKey: ["org-members", orgId],
		queryFn: () => listMembers({ data: { orgId } }),
	});

	return (
		<main className="mx-auto max-w-2xl px-4 py-10">
			<div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
				<Link to="/orgs" className="hover:text-foreground transition-colors">
					Organizations
				</Link>
				<span>/</span>
				<Link
					to="/org/$orgId"
					params={{ orgId }}
					className="hover:text-foreground transition-colors"
				>
					{org?.name ?? orgId}
				</Link>
				<span>/</span>
				<span className="font-medium text-foreground">Team</span>
			</div>

			<h1 className="mb-6 text-2xl font-bold">Team</h1>

			<div className="grid gap-4 sm:grid-cols-2">
				<Link
					to="/org/$orgId/team/$teamId/pages"
					params={{ orgId, teamId }}
					className="no-underline text-foreground"
				>
					<Card className="h-full transition-colors hover:bg-muted">
						<CardHeader>
							<CardTitle>Pages</CardTitle>
						</CardHeader>
						<CardContent className="text-sm text-muted-foreground">
							Blockを組み合わせたページ
						</CardContent>
					</Card>
				</Link>
				<Link
					to="/org/$orgId/team/$teamId/blocks"
					params={{ orgId, teamId }}
					className="no-underline text-foreground"
				>
					<Card className="h-full transition-colors hover:bg-muted">
						<CardHeader>
							<CardTitle>Blocks</CardTitle>
						</CardHeader>
						<CardContent className="text-sm text-muted-foreground">
							再利用可能なMarkdownブロック
						</CardContent>
					</Card>
				</Link>
			</div>
		</main>
	);
}
