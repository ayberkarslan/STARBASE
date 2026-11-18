/** Content-free invalidations only; note reads/writes always pass through the authenticated API. */
export class BoardHub {
  constructor(private state: DurableObjectState) {}
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (
      url.pathname === "/connect" &&
      request.headers.get("Upgrade")?.toLowerCase() === "websocket"
    ) {
      if (this.state.getWebSockets().length >= 256)
        return new Response("Connection limit", { status: 429 });
      const expires = Number(url.searchParams.get("expires"));
      if (!Number.isFinite(expires) || expires <= Date.now() / 1000)
        return new Response("Session expired", { status: 403 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      const presence = url.searchParams.get("mode") === "presence";
      server.serializeAttachment({ expires, presence, lastSeenAt: 0 });
      return new Response(null, { status: 101, webSocket: client,
        headers: ["starbase-profile", "starbase-session"].includes(request.headers.get("Sec-WebSocket-Protocol") ?? "")
          ? { "Sec-WebSocket-Protocol": request.headers.get("Sec-WebSocket-Protocol")! } : undefined });
    }
    if (url.pathname === "/status") {
      const timestamp = Date.now() / 1000;
      let lastSeenAt = 0;
      for (const socket of this.state.getWebSockets()) {
        const state = socket.deserializeAttachment() as { expires: number; presence?: boolean; lastSeenAt?: number } | null;
        if (state?.presence && state.expires > timestamp)
          lastSeenAt = Math.max(lastSeenAt, state.lastSeenAt ?? 0);
      }
      const remembered = await this.state.storage.get<number>("lastSeenAt");
      return Response.json({ lastSeenAt: Math.max(lastSeenAt, remembered ?? 0) || null, live: lastSeenAt > timestamp - 60 });
    }
    if (url.pathname === "/notify" && request.method === "POST") {
      const type = url.searchParams.get("type") === "directory.changed"
        ? "directory.changed" : url.searchParams.get("type") === "profile.photo.changed"
          ? "profile.photo.changed" : url.searchParams.get("type") === "app.resources.changed"
            ? "app.resources.changed" : url.searchParams.get("type") === "session.revoked"
              ? "session.revoked" : url.searchParams.get("type") === "share.rooms.changed"
                ? "share.rooms.changed" : "board.changed";
      for (const socket of this.state.getWebSockets()) {
        try {
          const attachment = socket.deserializeAttachment() as {
            expires: number;
          };
          if (
            !attachment ||
            !Number.isFinite(attachment.expires) ||
            attachment.expires <= Date.now() / 1000
          ) {
            socket.close(1008, "Session expired");
            continue;
          }
          socket.send(JSON.stringify({ type }));
          if (type === "session.revoked") socket.close(1008, "Session revoked");
        } catch {
          try {
            socket.close(1011, "Reconnect required");
          } catch {}
        }
      }
      return new Response(null, { status: 204 });
    }
    return new Response("Not found", { status: 404 });
  }
  async webSocketMessage(socket: WebSocket, message?: string | ArrayBuffer) {
    const state = socket.deserializeAttachment() as { expires: number; presence?: boolean; lastSeenAt?: number } | null;
    if (state?.presence && message === "ping" && state.expires > Date.now() / 1000) {
      const timestamp = Date.now() / 1000;
      socket.serializeAttachment({ ...state, lastSeenAt: timestamp });
      await this.state.storage.put("lastSeenAt", timestamp);
      return;
    }
    socket.close(1008, "Unsupported message");
  }
  webSocketClose(socket: WebSocket, code: number, reason: string) {
    try {
      socket.close(code, reason);
    } catch {}
  }
  webSocketError(socket: WebSocket) {
    try {
      socket.close(1011, "Reconnect required");
    } catch {}
  }
}
