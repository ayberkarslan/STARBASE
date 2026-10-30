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
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      server.serializeAttachment({
        expires: Number(url.searchParams.get("expires")),
      });
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === "/notify" && request.method === "POST") {
      for (const socket of this.state.getWebSockets()) {
        try {
          const attachment = socket.deserializeAttachment() as {
            expires: number;
          };
          if (!attachment || attachment.expires <= Date.now() / 1000) {
            socket.close(1008, "Session expired");
            continue;
          }
          socket.send('{"type":"board.changed"}');
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
  webSocketMessage(socket: WebSocket) {
    socket.close(1008, "Use the notes API for changes");
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
