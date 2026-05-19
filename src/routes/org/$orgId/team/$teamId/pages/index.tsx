import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/org/$orgId/team/$teamId/pages/")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/org/$orgId/team/$teamId",
			params,
		});
	},
});
