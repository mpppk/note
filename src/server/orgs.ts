import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { auth } from "#/lib/auth";
import { authMiddleware } from "#/server/middleware";

export const listOrgs = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async () => {
		const request = getRequest();
		return auth.api.listOrganizations({ headers: request.headers });
	});

export const createOrg = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({ name: z.string().min(1), slug: z.string().min(1) }),
	)
	.handler(async ({ data }) => {
		const request = getRequest();
		return auth.api.createOrganization({
			headers: request.headers,
			body: { name: data.name, slug: data.slug },
		});
	});

export const listTeams = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ orgId: z.string() }))
	.handler(async ({ data }) => {
		const request = getRequest();
		return auth.api.listOrganizationTeams({
			headers: request.headers,
			query: { organizationId: data.orgId },
		});
	});

export const createTeam = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ orgId: z.string(), name: z.string().min(1) }))
	.handler(async ({ data }) => {
		const request = getRequest();
		return auth.api.createTeam({
			headers: request.headers,
			body: { organizationId: data.orgId, name: data.name },
		});
	});

export const listMembers = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ orgId: z.string() }))
	.handler(async ({ data }) => {
		const request = getRequest();
		return auth.api.getFullOrganization({
			headers: request.headers,
			query: { organizationId: data.orgId },
		});
	});

export const inviteMember = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			orgId: z.string(),
			email: z.string().email(),
			role: z.enum(["member", "admin", "owner"]),
		}),
	)
	.handler(async ({ data }) => {
		const request = getRequest();
		return auth.api.createInvitation({
			headers: request.headers,
			body: {
				organizationId: data.orgId,
				email: data.email,
				role: data.role,
			},
		});
	});

export const getInvitation = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ invitationId: z.string() }))
	.handler(async ({ data }) => {
		const request = getRequest();
		return auth.api.getInvitation({
			headers: request.headers,
			query: { id: data.invitationId },
		});
	});

export const acceptInvitation = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ invitationId: z.string() }))
	.handler(async ({ data }) => {
		const request = getRequest();
		return auth.api.acceptInvitation({
			headers: request.headers,
			body: { invitationId: data.invitationId },
		});
	});

export const rejectInvitation = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ invitationId: z.string() }))
	.handler(async ({ data }) => {
		const request = getRequest();
		return auth.api.rejectInvitation({
			headers: request.headers,
			body: { invitationId: data.invitationId },
		});
	});

export const updateOrg = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ orgId: z.string(), name: z.string().min(1) }))
	.handler(async ({ data }) => {
		const request = getRequest();
		return auth.api.updateOrganization({
			headers: request.headers,
			body: { data: { name: data.name }, organizationId: data.orgId },
		});
	});

export const deleteOrg = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ orgId: z.string() }))
	.handler(async ({ data }) => {
		const request = getRequest();
		return auth.api.deleteOrganization({
			headers: request.headers,
			body: { organizationId: data.orgId },
		});
	});

export const updateTeam = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ teamId: z.string(), name: z.string().min(1) }))
	.handler(async ({ data }) => {
		const request = getRequest();
		return auth.api.updateTeam({
			headers: request.headers,
			body: { teamId: data.teamId, data: { name: data.name } },
		});
	});

export const deleteTeam = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ teamId: z.string(), orgId: z.string() }))
	.handler(async ({ data }) => {
		const request = getRequest();
		return auth.api.removeTeam({
			headers: request.headers,
			body: { teamId: data.teamId, organizationId: data.orgId },
		});
	});

export const removeOrgMember = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(z.object({ memberId: z.string(), orgId: z.string() }))
	.handler(async ({ data }) => {
		const request = getRequest();
		return auth.api.removeMember({
			headers: request.headers,
			body: { memberIdOrEmail: data.memberId, organizationId: data.orgId },
		});
	});

export const updateOrgMemberRole = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			memberId: z.string(),
			orgId: z.string(),
			role: z.enum(["member", "admin", "owner"]),
		}),
	)
	.handler(async ({ data }) => {
		const request = getRequest();
		return auth.api.updateMemberRole({
			headers: request.headers,
			body: {
				memberId: data.memberId,
				organizationId: data.orgId,
				role: data.role,
			},
		});
	});
