import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { pageSections, pages } from "#/db/schema";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_QUERY_AWARENESS = 3;

export class CollabRoom implements DurableObject {
	private ydoc: Y.Doc;
	private awareness: awarenessProtocol.Awareness;
	private clients = new Set<WebSocket>();
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private pageId: string;

	constructor(
		state: DurableObjectState,
		private readonly env: Env,
	) {
		this.pageId = state.id.name ?? "unknown";
		this.ydoc = new Y.Doc();
		this.awareness = new awarenessProtocol.Awareness(this.ydoc);

		// Broadcast Yjs document updates to all connected clients
		this.ydoc.on("update", (update: Uint8Array, origin: unknown) => {
			const encoder = encoding.createEncoder();
			encoding.writeVarUint(encoder, MESSAGE_SYNC);
			syncProtocol.writeUpdate(encoder, update);
			const msg = encoding.toUint8Array(encoder);
			for (const ws of this.clients) {
				if (ws !== origin) {
					try {
						ws.send(msg);
					} catch {
						// Client disconnected mid-send
					}
				}
			}
			this.scheduleSave();
		});

		// Broadcast awareness updates to all connected clients
		this.awareness.on(
			"update",
			({
				added,
				updated,
				removed,
			}: {
				added: number[];
				updated: number[];
				removed: number[];
			}) => {
				const changed = [...added, ...updated, ...removed];
				const encoder = encoding.createEncoder();
				encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
				encoding.writeVarUint8Array(
					encoder,
					awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed),
				);
				const msg = encoding.toUint8Array(encoder);
				for (const ws of this.clients) {
					try {
						ws.send(msg);
					} catch {
						// Client disconnected
					}
				}
			},
		);

		// Load Yjs state from D1 before handling any connections
		state.blockConcurrencyWhile(async () => {
			await this.loadState();
		});
	}

	private async loadState() {
		const db = drizzle(this.env.DB);
		const result = await db
			.select({ yjsState: pages.yjsState })
			.from(pages)
			.where(sql`${pages.id} = ${this.pageId}`)
			.limit(1);

		const stored = result[0]?.yjsState;
		if (stored) {
			Y.applyUpdate(this.ydoc, new Uint8Array(stored as ArrayBuffer));
		} else {
			// Bootstrap from existing page_sections text
			const sections = await db
				.select({ body: pageSections.body, type: pageSections.type })
				.from(pageSections)
				.where(sql`${pageSections.pageId} = ${this.pageId}`)
				.orderBy(pageSections.order);

			const markdown = sections
				.filter((s) => s.type === "text")
				.map((s) => s.body)
				.join("\n\n");

			if (markdown) {
				this.ydoc.getText("markdown").insert(0, markdown);
			}
		}
	}

	private scheduleSave() {
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => {
			this.saveState().catch(console.error);
		}, 5_000);
	}

	private async saveState() {
		const db = drizzle(this.env.DB);
		const markdown = this.ydoc.getText("markdown").toString();
		const yjsState = Buffer.from(Y.encodeStateAsUpdate(this.ydoc));

		// Save Yjs binary state to pages.yjs_state
		await db
			.update(pages)
			.set({ yjsState, updatedAt: new Date() })
			.where(sql`${pages.id} = ${this.pageId}`);

		// Also update the first text section body so search / embeds stay current
		if (markdown) {
			const firstSection = await db
				.select({ id: pageSections.id })
				.from(pageSections)
				.where(
					sql`${pageSections.pageId} = ${this.pageId} AND ${pageSections.type} = 'text'`,
				)
				.orderBy(pageSections.order)
				.limit(1);
			if (firstSection[0]) {
				await db
					.update(pageSections)
					.set({ body: markdown, updatedAt: new Date() })
					.where(sql`${pageSections.id} = ${firstSection[0].id}`);
			}
		}
	}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("Expected WebSocket", { status: 426 });
		}

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

		this.handleConnection(server, request);

		return new Response(null, { status: 101, webSocket: client });
	}

	private handleConnection(ws: WebSocket, _request: Request) {
		ws.accept();
		this.clients.add(ws);

		// Send sync step 1: server's state vector so client can send missing updates
		{
			const encoder = encoding.createEncoder();
			encoding.writeVarUint(encoder, MESSAGE_SYNC);
			syncProtocol.writeSyncStep1(encoder, this.ydoc);
			ws.send(encoding.toUint8Array(encoder));
		}

		// Send current awareness states to the new client
		const awarenessStates = this.awareness.getStates();
		if (awarenessStates.size > 0) {
			const encoder = encoding.createEncoder();
			encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
			encoding.writeVarUint8Array(
				encoder,
				awarenessProtocol.encodeAwarenessUpdate(
					this.awareness,
					Array.from(awarenessStates.keys()),
				),
			);
			ws.send(encoding.toUint8Array(encoder));
		}

		ws.addEventListener("message", async (event) => {
			let data: ArrayBuffer;
			if (event.data instanceof ArrayBuffer) {
				data = event.data;
			} else if (event.data instanceof Blob) {
				data = await event.data.arrayBuffer();
			} else {
				return;
			}

			const message = new Uint8Array(data);
			const decoder = decoding.createDecoder(message);
			const messageType = decoding.readVarUint(decoder);

			switch (messageType) {
				case MESSAGE_SYNC: {
					const encoder = encoding.createEncoder();
					encoding.writeVarUint(encoder, MESSAGE_SYNC);
					// readSyncMessage applies the update to ydoc and writes a response if needed
					syncProtocol.readSyncMessage(decoder, encoder, this.ydoc, ws);
					if (encoding.length(encoder) > 1) {
						ws.send(encoding.toUint8Array(encoder));
					}
					break;
				}
				case MESSAGE_AWARENESS: {
					awarenessProtocol.applyAwarenessUpdate(
						this.awareness,
						decoding.readVarUint8Array(decoder),
						ws,
					);
					break;
				}
				case MESSAGE_QUERY_AWARENESS: {
					const encoder = encoding.createEncoder();
					encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
					encoding.writeVarUint8Array(
						encoder,
						awarenessProtocol.encodeAwarenessUpdate(
							this.awareness,
							Array.from(this.awareness.getStates().keys()),
						),
					);
					ws.send(encoding.toUint8Array(encoder));
					break;
				}
			}
		});

		ws.addEventListener("close", () => {
			this.clients.delete(ws);
			awarenessProtocol.removeAwarenessStates(
				this.awareness,
				[this.ydoc.clientID],
				"connection closed",
			);
		});

		ws.addEventListener("error", () => {
			this.clients.delete(ws);
		});
	}
}
