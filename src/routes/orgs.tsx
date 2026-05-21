import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import { getSession } from "#/server/auth";
import { listOrgs } from "#/server/orgs";

export const Route = createFileRoute("/orgs")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/login" });
		}
	},
	loader: async ({ context }) => {
		await context.queryClient.prefetchQuery({
			queryKey: ["orgs"],
			queryFn: () => listOrgs(),
		});
	},
	component: OrgsPage,
});

function OrgsPage() {
	const { data: orgs } = useQuery({
		queryKey: ["orgs"],
		queryFn: () => listOrgs(),
	});

	return (
		<main className="mx-auto max-w-2xl px-4 py-10">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-2xl font-bold">Organizations</h1>
				<Button asChild variant="outline" size="sm">
					<Link to="/settings">Settings</Link>
				</Button>
			</div>

			<ul className="space-y-2">
				{orgs?.map((org) => (
					<li key={org.id}>
						<Link
							to="/org/$orgId"
							params={{ orgId: org.id }}
							className="block rounded-lg border border-border px-4 py-3 no-underline text-foreground transition-colors hover:bg-muted"
						>
							{org.name}
						</Link>
					</li>
				))}
				{orgs?.length === 0 && (
					<li className="text-sm text-muted-foreground">
						No organizations yet.{" "}
						<Link to="/settings" className="underline">
							Create one in Settings
						</Link>
						.
					</li>
				)}
			</ul>
		</main>
	);
}
