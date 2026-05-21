import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { getSession } from "#/server/auth";
import { createOrg, listOrgs } from "#/server/orgs";

export const Route = createFileRoute("/settings")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) throw redirect({ to: "/login" });
	},
	loader: async ({ context }) => {
		await context.queryClient.prefetchQuery({
			queryKey: ["orgs"],
			queryFn: () => listOrgs(),
		});
	},
	component: SettingsPage,
});

function SettingsPage() {
	return (
		<main className="mx-auto max-w-4xl px-4 py-10">
			<h1 className="mb-8 text-2xl font-bold">Settings</h1>
			<div className="flex gap-8">
				<aside className="w-48 shrink-0">
					<nav className="flex flex-col gap-1">
						<span className="rounded-md bg-muted px-3 py-2 text-sm font-medium">
							Organizations
						</span>
					</nav>
				</aside>
				<div className="min-w-0 flex-1">
					<OrgsSection />
				</div>
			</div>
		</main>
	);
}

function OrgsSection() {
	const { data: orgs, refetch } = useQuery({
		queryKey: ["orgs"],
		queryFn: () => listOrgs(),
	});

	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");

	const { mutate: handleCreate, isPending } = useMutation({
		mutationFn: () => createOrg({ data: { name, slug } }),
		onSuccess: () => {
			refetch();
			setName("");
			setSlug("");
		},
	});

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h2 className="mb-4 text-lg font-semibold">Organizations</h2>
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
							No organizations yet.
						</li>
					)}
				</ul>
			</div>

			<div className="border-t pt-6">
				<h3 className="mb-4 text-base font-medium">Create Organization</h3>
				<div className="flex max-w-sm flex-col gap-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="org-name">Name</Label>
						<Input
							id="org-name"
							type="text"
							placeholder="My Organization"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="org-slug">Slug</Label>
						<Input
							id="org-slug"
							type="text"
							placeholder="my-org"
							value={slug}
							onChange={(e) => setSlug(e.target.value)}
						/>
					</div>
					<Button
						type="button"
						disabled={!name.trim() || !slug.trim() || isPending}
						onClick={() => handleCreate()}
					>
						{isPending ? "Creating..." : "Create"}
					</Button>
				</div>
			</div>
		</div>
	);
}
