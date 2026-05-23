import startEntry from "@tanstack/react-start/server-entry";
import { auth } from "#/lib/auth";
import { CollabRoom } from "./do/collab-room";

export { CollabRoom };

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// Intercept WebSocket upgrade requests for the collab endpoint
		if (
			request.headers.get("Upgrade") === "websocket" &&
			url.pathname.startsWith("/api/collab/")
		) {
			const pageId = url.pathname.slice("/api/collab/".length);
			if (!pageId || pageId.includes("/")) {
				return new Response("Bad Request", { status: 400 });
			}

			// Verify session via Better Auth before forwarding to DO
			const session = await auth.api.getSession({ headers: request.headers });
			if (!session) {
				return new Response("Unauthorized", { status: 401 });
			}

			// Attach user info to the request for the DO
			const newHeaders = new Headers(request.headers);
			newHeaders.set("X-User-Id", session.user.id);
			newHeaders.set("X-User-Name", session.user.name ?? "");

			const id = env.COLLAB_ROOM.idFromName(pageId);
			const stub = env.COLLAB_ROOM.get(id);
			return stub.fetch(new Request(request, { headers: newHeaders }));
		}

		// All other requests go to TanStack Start
		// env is accessed via cloudflare:workers module inside TanStack Start
		return startEntry.fetch(request);
	},
};
