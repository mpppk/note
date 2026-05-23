import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { getSession } from "#/server/auth";
import { deleteTeam, listMembers, listTeams, updateTeam } from "#/server/orgs";

export const Route = createFileRoute("/org/$orgId/team/$teamId/settings")({
	beforeLoad: async () => {
		const session = await getSession();
		if (!session) throw redirect({ to: "/login" });
	},
	loader: async ({ context, params }) => {
		await Promise.all([
			context.queryClient.prefetchQuery({
				queryKey: ["session"],
				queryFn: () => getSession(),
			}),
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
	component: TeamSettingsPage,
});

function TeamSettingsPage() {
	const { orgId, teamId } = Route.useParams();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const { data: session } = useQuery({
		queryKey: ["session"],
		queryFn: () => getSession(),
	});

	const { data: org } = useQuery({
		queryKey: ["org-members", orgId],
		queryFn: () => listMembers({ data: { orgId } }),
	});

	const { data: teams } = useQuery({
		queryKey: ["teams", orgId],
		queryFn: () => listTeams({ data: { orgId } }),
	});

	const team = teams?.find((t) => t.id === teamId);
	const currentUserId = session?.user.id;
	const currentMember = org?.members?.find((m) => m.userId === currentUserId);
	const isAdminOrOwner =
		currentMember?.role === "admin" || currentMember?.role === "owner";

	const [name, setName] = useState("");
	const [deleteOpen, setDeleteOpen] = useState(false);

	useEffect(() => {
		if (team?.name) setName(team.name);
	}, [team?.name]);

	const { mutate: handleUpdate, isPending: saving } = useMutation({
		mutationFn: () => updateTeam({ data: { teamId, name } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["teams", orgId] });
		},
	});

	const { mutate: handleDelete, isPending: deleting } = useMutation({
		mutationFn: () => deleteTeam({ data: { teamId, orgId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["teams", orgId] });
			navigate({ to: "/org/$orgId", params: { orgId } });
		},
	});

	return (
		<main className="mx-auto max-w-4xl px-4 py-10">
			<div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
				<Link to="/orgs" className="transition-colors hover:text-foreground">
					Organizations
				</Link>
				<span>/</span>
				<Link
					to="/org/$orgId"
					params={{ orgId }}
					className="transition-colors hover:text-foreground"
				>
					{org?.name ?? orgId}
				</Link>
				<span>/</span>
				<Link
					to="/org/$orgId/team/$teamId"
					params={{ orgId, teamId }}
					className="transition-colors hover:text-foreground"
				>
					{team?.name ?? teamId}
				</Link>
				<span>/</span>
				<span className="font-medium text-foreground">Settings</span>
			</div>

			<div className="flex gap-8">
				<aside className="w-48 shrink-0">
					<nav className="flex flex-col gap-1">
						<span className="rounded-md bg-muted px-3 py-2 text-sm font-medium">
							General
						</span>
					</nav>
				</aside>

				<div className="min-w-0 flex-1">
					<div className="flex flex-col gap-8">
						<div>
							<h2 className="mb-4 text-lg font-semibold">General</h2>
							<div className="flex max-w-sm flex-col gap-3">
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="team-name">Team Name</Label>
									<Input
										id="team-name"
										value={name}
										onChange={(e) => setName(e.target.value)}
										disabled={!isAdminOrOwner}
									/>
								</div>
								{isAdminOrOwner && (
									<Button
										type="button"
										disabled={
											!name.trim() || saving || name === (team?.name ?? "")
										}
										onClick={() => handleUpdate()}
									>
										{saving ? "Saving..." : "Save"}
									</Button>
								)}
							</div>
						</div>

						{isAdminOrOwner && (
							<div className="border-t pt-6">
								<h3 className="mb-2 text-base font-medium">Danger Zone</h3>
								<p className="mb-4 text-sm text-muted-foreground">
									Deleting this team is permanent and cannot be undone.
								</p>
								<Button
									type="button"
									variant="destructive"
									onClick={() => setDeleteOpen(true)}
								>
									Delete Team
								</Button>

								<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
									<DialogContent>
										<DialogHeader>
											<DialogTitle>Delete Team</DialogTitle>
										</DialogHeader>
										<p className="text-sm text-muted-foreground">
											Are you sure you want to delete this team? This action
											cannot be undone.
										</p>
										<div className="mt-4 flex justify-end gap-2">
											<Button
												variant="outline"
												onClick={() => setDeleteOpen(false)}
												disabled={deleting}
											>
												Cancel
											</Button>
											<Button
												variant="destructive"
												disabled={deleting}
												onClick={() => handleDelete()}
											>
												{deleting ? "Deleting..." : "Delete"}
											</Button>
										</div>
									</DialogContent>
								</Dialog>
							</div>
						)}
					</div>
				</div>
			</div>
		</main>
	);
}
