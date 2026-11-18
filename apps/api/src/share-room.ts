import type { Env } from "./common";

type Participant = { connectionId: string; userId: string; name: string; expires: number; roomId: string; sessionHash: string };

export class ShareRoom {
  constructor(private readonly state: DurableObjectState, private readonly env: Env) {}

  private participants() {
    return this.state.getWebSockets().map((socket) => ({ socket, info: socket.deserializeAttachment() as Participant | null }))
      .filter((entry): entry is { socket: WebSocket; info: Participant } => !!entry.info && entry.info.expires > Date.now() / 1000);
  }

  private async publish(roomId: string) {
    const participants = this.participants();
    const members = participants.map(({ info }) => ({ connectionId: info.connectionId, userId: info.userId, name: info.name }));
    for (const { socket } of participants) socket.send(JSON.stringify({ type: "members", members }));
    await this.env.DB.prepare("UPDATE share_rooms SET participant_count=? WHERE id=?").bind(new Set(members.map((member) => member.userId)).size, roomId).run();
    const hub = this.env.BOARD_HUB.get(this.env.BOARD_HUB.idFromName("team-directory"));
    await hub.fetch("https://board.internal/notify?type=share.rooms.changed", { method: "POST" });
    if (!participants.length) await this.state.storage.setAlarm(Date.now() + 30_000);
  }

  async fetch(request: Request): Promise<Response> {
    const route = new URL(request.url).pathname;
    const roomId = request.headers.get("x-room-id") ?? "";
    if (!roomId) return new Response("Invalid room", { status: 400 });
    if (route === "/init" && request.method === "POST") {
      await this.state.storage.put("roomId", roomId);
      await this.state.storage.setAlarm(Date.now() + 5 * 60_000);
      return new Response(null, { status: 204 });
    }
    if (route === "/close" && request.method === "POST") {
      for (const { socket } of this.participants()) {
        socket.send(JSON.stringify({ type: "closed" }));
        socket.close(1000, "Room closed");
      }
      await this.state.storage.deleteAll();
      return new Response(null, { status: 204 });
    }
    if (route === "/kick" && request.method === "POST") {
      const targetId = request.headers.get("x-target-id");
      for (const { socket, info } of this.participants()) {
        if (info.userId !== targetId) continue;
        socket.send(JSON.stringify({ type: "kicked" }));
        socket.close(1008, "Removed by room owner");
      }
      await this.publish(roomId);
      return new Response(null, { status: 204 });
    }
    if (route !== "/connect" || request.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("Not found", { status: 404 });
    const userId = request.headers.get("x-user-id") ?? "";
    const name = decodeURIComponent(request.headers.get("x-user-name") ?? "");
    const expires = Number(request.headers.get("x-session-expires"));
    const sessionHash = request.headers.get("x-session-hash") ?? "";
    if (!userId || !name || !sessionHash || !Number.isFinite(expires) || expires <= Date.now() / 1000) return new Response("Unauthorized", { status: 403 });
    const room = await this.env.DB.prepare("SELECT id,owner_id ownerId,locked FROM share_rooms WHERE id=?").bind(roomId).first<{ id: string; ownerId: string; locked: number }>();
    if (!room) return new Response("Room missing", { status: 404 });
    if (await this.env.DB.prepare("SELECT 1 FROM share_room_bans WHERE room_id=? AND user_id=?").bind(roomId, userId).first()) return new Response("Removed from room", { status: 403 });
    if (room.locked && room.ownerId !== userId && !(await this.env.DB.prepare("SELECT 1 FROM share_room_invites WHERE room_id=? AND user_id=?").bind(roomId, userId).first())) return new Response("Room closed to new members", { status: 403 });
    const admission = await this.env.DB.prepare("SELECT 1 FROM share_room_admissions WHERE room_id=? AND user_id=? AND expires_at>?").bind(roomId, userId, Date.now() / 1000).first();
    if (!admission) return new Response("Join required", { status: 403 });
    if (this.state.getWebSockets().length >= 24) return new Response("Room full", { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    const connectionId = crypto.randomUUID();
    server.serializeAttachment({ roomId, userId, name, expires, connectionId, sessionHash } satisfies Participant);
    server.send(JSON.stringify({ type: "welcome", connectionId }));
    await this.state.storage.deleteAlarm();
    await this.publish(roomId);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    const source = socket.deserializeAttachment() as Participant | null;
    if (!source || source.expires <= Date.now() / 1000) { socket.close(1008, "Session expired"); return; }
    if (!(await this.env.DB.prepare("SELECT 1 FROM sessions s JOIN families f ON f.id=s.family WHERE s.hash=? AND s.user_id=? AND s.expires>? AND s.used=0 AND f.revoked=0").bind(source.sessionHash, source.userId, Date.now() / 1000).first())) { socket.close(1008, "Session revoked"); return; }
    if (typeof raw !== "string" || raw.length > 16_384) { socket.close(1008, "Only signaling is allowed"); return; }
    let message: { type?: string; to?: string; signal?: { type?: string } };
    try { message = JSON.parse(raw); } catch { socket.close(1008, "Invalid signaling"); return; }
    if (message.type === "ping") return;
    if (message.type !== "signal" || !message.to || !message.signal || !["offer", "answer", "candidate"].includes(message.signal.type ?? "")) {
      socket.close(1008, "Only signaling is allowed"); return;
    }
    const target = this.participants().find(({ info }) => info.connectionId === message.to);
    if (target) target.socket.send(JSON.stringify({ type: "signal", from: source.connectionId, signal: message.signal }));
  }

  async webSocketClose(socket: WebSocket) {
    const info = socket.deserializeAttachment() as Participant | null;
    if (info) await this.publish(info.roomId);
  }
  async webSocketError(socket: WebSocket) {
    const info = socket.deserializeAttachment() as Participant | null;
    if (info) await this.publish(info.roomId);
  }
  async alarm() {
    if (this.state.getWebSockets().length) return;
    const roomId = await this.state.storage.get<string>("roomId");
    if (!roomId) return;
    await this.env.DB.prepare("DELETE FROM share_rooms WHERE id=?").bind(roomId).run();
    await this.state.storage.deleteAll();
    const hub = this.env.BOARD_HUB.get(this.env.BOARD_HUB.idFromName("team-directory"));
    await hub.fetch("https://board.internal/notify?type=share.rooms.changed", { method: "POST" });
  }
}
