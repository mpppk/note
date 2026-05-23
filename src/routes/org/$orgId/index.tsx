import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { getSession } from "#/server/auth";
import { listMembers, listTeams } from "#/server/orgs";

export const Route = createFileRoute("/org/$orgId/")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/login" });
		}
	},
	loader: async ({ context, params }) => {
		await Promise.all([
			context.queryClient.prefetchQuery({
				queryKey: ["teams", params.orgId],
				queryFn: () => listTeams({ data: { orgId: params.orgId } }),
			}),
			context.queryClient.prefetchQuery({
				queryKey: ["org-members", params.orgId],
				queryFn: () => listMembers({ data: { orgId: params.orgId } }),
			}),
		]);
	},
	component: OrgPage,
});

function OrgPage() {
	const { orgId } = Route.useParams();

	const { data: teams } = useQuery({
		queryKey: ["teams", orgId],
		queryFn: () => listTeams({ data: { orgId } }),
	});

	const { data: org } = useQuery({
		queryKey: ["org-members", orgId],
		queryFn: () => listMembers({ data: { orgId } }),
	});

	return (
		<main className="mx-auto max-w-2xl px-4 py-10">
			<div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
				<Link to="/orgs" className="transition-colors hover:text-foreground">
					Organizations
				</Link>
				<span>/</span>
				<span className="font-medium text-foreground">
					{org?.name ?? orgId}
				</span>
			</div>

			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-2xl font-bold">Teams</h1>
				<Button asChild variant="outline" size="sm">
					<Link to="/org/$orgId/settings" params={{ orgId }}>
						Settings
					</Link>
				</Button>
			</div>

			<ul className="space-y-2">
				{teams?.map((team) => (
					<li key={team.id}>
						<Link
							to="/org/$orgId/team/$teamId"
							params={{ orgId, teamId: team.id }}
							className="block rounded-lg border border-border px-4 py-3 no-underline text-foreground transition-colors hover:bg-muted"
						>
							{team.name}
						</Link>
					</li>
				))}
				{teams?.length === 0 && (
					<li className="text-sm text-muted-foreground">No teams yet.</li>
				)}
			</ul>
		</main>
	);
}
