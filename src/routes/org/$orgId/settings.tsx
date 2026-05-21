import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { getSession } from "#/server/auth";
import {
	createTeam,
	deleteOrg,
	inviteMember,
	listMembers,
	listTeams,
	removeOrgMember,
	updateOrg,
	updateOrgMemberRole,
} from "#/server/orgs";

type Section = "general" | "members" | "teams";

export const Route = createFileRoute("/org/$orgId/settings")({
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
				queryKey: ["org-members", params.orgId],
				queryFn: () => listMembers({ data: { orgId: params.orgId } }),
			}),
			context.queryClient.prefetchQuery({
				queryKey: ["teams", params.orgId],
				queryFn: () => listTeams({ data: { orgId: params.orgId } }),
			}),
		]);
	},
	component: OrgSettingsPage,
});

function OrgSettingsPage() {
	const { orgId } = Route.useParams();
	const [section, setSection] = useState<Section>("general");

	const { data: session } = useQuery({
		queryKey: ["session"],
		queryFn: () => getSession(),
	});

	const { data: org, refetch: refetchOrg } = useQuery({
		queryKey: ["org-members", orgId],
		queryFn: () => listMembers({ data: { orgId } }),
	});

	const { data: teams, refetch: refetchTeams } = useQuery({
		queryKey: ["teams", orgId],
		queryFn: () => listTeams({ data: { orgId } }),
	});

	const currentUserId = session?.user.id;
	const currentMember = org?.members?.find((m) => m.userId === currentUserId);
	const isAdminOrOwner =
		currentMember?.role === "admin" || currentMember?.role === "owner";

	const sections: { key: Section; label: string }[] = [
		{ key: "general", label: "General" },
		{ key: "members", label: "Members" },
		{ key: "teams", label: "Teams" },
	];

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
				<span className="font-medium text-foreground">Settings</span>
			</div>

			<div className="flex gap-8">
				<aside className="w-48 shrink-0">
					<nav className="flex flex-col gap-1">
						{sections.map((s) => (
							<button
								key={s.key}
								type="button"
								onClick={() => setSection(s.key)}
								className={`rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
									section === s.key
										? "bg-muted font-medium"
										: "text-muted-foreground"
								}`}
							>
								{s.label}
							</button>
						))}
					</nav>
				</aside>

				<div className="min-w-0 flex-1">
					{section === "general" && (
						<GeneralSection
							key={org?.name}
							orgId={orgId}
							orgName={org?.name ?? ""}
							isAdminOrOwner={isAdminOrOwner}
						/>
					)}
					{section === "members" && (
						<MembersSection
							orgId={orgId}
							members={org?.members ?? []}
							isAdminOrOwner={isAdminOrOwner}
							currentUserId={currentUserId}
							refetchMembers={refetchOrg}
						/>
					)}
					{section === "teams" && (
						<TeamsSection
							orgId={orgId}
							teams={teams ?? []}
							refetchTeams={refetchTeams}
							isAdminOrOwner={isAdminOrOwner}
						/>
					)}
				</div>
			</div>
		</main>
	);
}

function GeneralSection({
	orgId,
	orgName,
	isAdminOrOwner,
}: {
	orgId: string;
	orgName: string;
	isAdminOrOwner: boolean | undefined;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [name, setName] = useState(orgName);
	const [deleteOpen, setDeleteOpen] = useState(false);

	const { mutate: handleUpdate, isPending: saving } = useMutation({
		mutationFn: () => updateOrg({ data: { orgId, name } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["org-members", orgId] });
			queryClient.invalidateQueries({ queryKey: ["orgs"] });
		},
	});

	const { mutate: handleDelete, isPending: deleting } = useMutation({
		mutationFn: () => deleteOrg({ data: { orgId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["orgs"] });
			navigate({ to: "/orgs" });
		},
	});

	return (
		<div className="flex flex-col gap-8">
			<div>
				<h2 className="mb-4 text-lg font-semibold">General</h2>
				<div className="flex max-w-sm flex-col gap-3">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="org-name">Organization Name</Label>
						<Input
							id="org-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							disabled={!isAdminOrOwner}
						/>
					</div>
					{isAdminOrOwner && (
						<Button
							type="button"
							disabled={!name.trim() || saving || name === orgName}
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
						Deleting this organization is permanent and cannot be undone.
					</p>
					<Button
						type="button"
						variant="destructive"
						onClick={() => setDeleteOpen(true)}
					>
						Delete Organization
					</Button>

					<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Delete Organization</DialogTitle>
							</DialogHeader>
							<p className="text-sm text-muted-foreground">
								Are you sure you want to delete this organization? This action
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
	);
}

type Member = {
	id: string;
	userId: string;
	role: string;
	user: { id: string; name: string; email: string };
};

function MembersSection({
	orgId,
	members,
	isAdminOrOwner,
	currentUserId,
	refetchMembers,
}: {
	orgId: string;
	members: Member[];
	isAdminOrOwner: boolean | undefined;
	currentUserId: string | undefined;
	refetchMembers: () => void;
}) {
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState<"member" | "admin" | "owner">(
		"member",
	);
	const [inviteLink, setInviteLink] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const { mutate: handleRemove } = useMutation({
		mutationFn: (memberId: string) =>
			removeOrgMember({ data: { memberId, orgId } }),
		onSuccess: () => refetchMembers(),
	});

	const { mutate: handleRoleChange } = useMutation({
		mutationFn: ({
			memberId,
			role,
		}: { memberId: string; role: "member" | "admin" | "owner" }) =>
			updateOrgMemberRole({ data: { memberId, orgId, role } }),
		onSuccess: () => refetchMembers(),
	});

	const { mutate: handleInvite, isPending: inviting } = useMutation({
		mutationFn: () =>
			inviteMember({ data: { orgId, email: inviteEmail, role: inviteRole } }),
		onSuccess: (data) => {
			refetchMembers();
			setInviteEmail("");
			if (data?.id) {
				setInviteLink(
					`${window.location.origin}/accept-invitation?id=${data.id}`,
				);
			}
		},
	});

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h2 className="mb-4 text-lg font-semibold">Members</h2>
				<ul className="space-y-2">
					{members.map((m) => (
						<li
							key={m.id}
							className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3"
						>
							<div className="min-w-0">
								<p className="truncate text-sm font-medium">{m.user.name}</p>
								<p className="truncate text-xs text-muted-foreground">
									{m.user.email}
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								{isAdminOrOwner && m.userId !== currentUserId ? (
									<>
										<Select
											value={m.role}
											onValueChange={(v) =>
												handleRoleChange({
													memberId: m.id,
													role: v as "member" | "admin" | "owner",
												})
											}
										>
											<SelectTrigger className="h-8 w-28 text-xs">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="member">Member</SelectItem>
												<SelectItem value="admin">Admin</SelectItem>
												<SelectItem value="owner">Owner</SelectItem>
											</SelectContent>
										</Select>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => handleRemove(m.id)}
										>
											Remove
										</Button>
									</>
								) : (
									<span className="px-2 text-xs text-muted-foreground">
										{m.role}
									</span>
								)}
							</div>
						</li>
					))}
				</ul>
			</div>

			{isAdminOrOwner && (
				<div className="border-t pt-6">
					<h3 className="mb-4 text-base font-medium">Invite Member</h3>
					<div className="flex max-w-sm flex-col gap-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="invite-email">Email</Label>
							<Input
								id="invite-email"
								type="email"
								placeholder="colleague@example.com"
								value={inviteEmail}
								onChange={(e) => setInviteEmail(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="invite-role">Role</Label>
							<Select
								value={inviteRole}
								onValueChange={(v) =>
									setInviteRole(v as "member" | "admin" | "owner")
								}
							>
								<SelectTrigger id="invite-role">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="member">Member</SelectItem>
									<SelectItem value="admin">Admin</SelectItem>
									<SelectItem value="owner">Owner</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<Button
							type="button"
							disabled={!inviteEmail.trim() || inviting}
							onClick={() => {
								setInviteLink(null);
								handleInvite();
							}}
						>
							{inviting ? "Sending..." : "Send Invite"}
						</Button>
						{inviteLink && (
							<div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm dark:border-green-800 dark:bg-green-950">
								<p className="mb-1 font-medium text-green-700 dark:text-green-300">
									Invitation created!
								</p>
								<p className="mb-2 text-muted-foreground">
									Share this link with the invitee:
								</p>
								<div className="flex items-center gap-2">
									<Input
										readOnly
										value={inviteLink}
										className="flex-1 font-mono text-xs"
										onFocus={(e) => e.currentTarget.select()}
									/>
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={() => {
											navigator.clipboard.writeText(inviteLink);
											setCopied(true);
											setTimeout(() => setCopied(false), 2000);
										}}
									>
										{copied ? "Copied!" : "Copy"}
									</Button>
								</div>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

type Team = { id: string; name: string; organizationId: string };

function TeamsSection({
	orgId,
	teams,
	refetchTeams,
	isAdminOrOwner,
}: {
	orgId: string;
	teams: Team[];
	refetchTeams: () => void;
	isAdminOrOwner: boolean | undefined;
}) {
	const [teamName, setTeamName] = useState("");

	const { mutate: handleCreate, isPending: creating } = useMutation({
		mutationFn: () => createTeam({ data: { orgId, name: teamName } }),
		onSuccess: () => {
			refetchTeams();
			setTeamName("");
		},
	});

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h2 className="mb-4 text-lg font-semibold">Teams</h2>
				<ul className="space-y-2">
					{teams.map((team) => (
						<li
							key={team.id}
							className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3"
						>
							<span className="text-sm font-medium">{team.name}</span>
							<Link
								to="/org/$orgId/team/$teamId/settings"
								params={{ orgId, teamId: team.id }}
								className="text-xs text-muted-foreground no-underline transition-colors hover:text-foreground"
							>
								Settings
							</Link>
						</li>
					))}
					{teams.length === 0 && (
						<li className="text-sm text-muted-foreground">No teams yet.</li>
					)}
				</ul>
			</div>

			{isAdminOrOwner && (
				<div className="border-t pt-6">
					<h3 className="mb-4 text-base font-medium">Create Team</h3>
					<div className="flex max-w-sm gap-2">
						<Input
							type="text"
							placeholder="Team name"
							value={teamName}
							onChange={(e) => setTeamName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && teamName.trim()) handleCreate();
							}}
							className="flex-1"
						/>
						<Button
							type="button"
							disabled={!teamName.trim() || creating}
							onClick={() => handleCreate()}
						>
							Create
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
