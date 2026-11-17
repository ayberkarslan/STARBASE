import { it, expect, vi } from "vitest";
import { BoardHub } from "./board-hub";
it("broadcasts only an invalidation and closes expired subscriptions", async () => {
  const active = {
      deserializeAttachment: () => ({ expires: Date.now() / 1000 + 100 }),
      send: vi.fn(),
      close: vi.fn(),
    },
    expired = {
      deserializeAttachment: () => ({ expires: 1 }),
      send: vi.fn(),
      close: vi.fn(),
    };
  const hub = new BoardHub({ getWebSockets: () => [active, expired] } as any);
  expect(
    (
      await hub.fetch(
        new Request("https://board.internal/notify", { method: "POST" }),
      )
    ).status,
  ).toBe(204);
  expect(active.send).toHaveBeenCalledWith('{"type":"board.changed"}');
  expect(expired.send).not.toHaveBeenCalled();
  expect(expired.close).toHaveBeenCalledWith(1008, "Session expired");
});
it("does not let clients broadcast websocket messages", async () => {
  const socket = { deserializeAttachment: () => ({ expires: Date.now() / 1000 + 100 }), send: vi.fn(), close: vi.fn() };
  await new BoardHub({} as any).webSocketMessage(socket as any, "private content");
  expect(socket.close).toHaveBeenCalledWith(
    1008,
    "Unsupported message",
  );
  expect(socket.send).not.toHaveBeenCalled();
});
it("accepts only authenticated presence pings and revocation invalidations", async () => {
  const socket = {
    deserializeAttachment: () => ({ expires: Date.now() / 1000 + 100, presence: true }),
    serializeAttachment: vi.fn(), send: vi.fn(), close: vi.fn(),
  };
  const storage = { put: vi.fn(), get: vi.fn().mockResolvedValue(null) };
  const hub = new BoardHub({ getWebSockets: () => [socket], storage } as any);
  await hub.webSocketMessage(socket as any, "ping");
  expect(socket.serializeAttachment).toHaveBeenCalledWith(expect.objectContaining({ presence: true, lastSeenAt: expect.any(Number) }));
  expect((await (await hub.fetch(new Request("https://board.internal/status"))).json() as any).live).toBe(false);
  await hub.fetch(new Request("https://board.internal/notify?type=session.revoked", { method: "POST" }));
  expect(socket.send).toHaveBeenCalledWith('{"type":"session.revoked"}');
  expect(socket.close).toHaveBeenCalledWith(1008, "Session revoked");
});
it("broadcasts a content-free directory invalidation", async () => {
  const socket = {
    deserializeAttachment: () => ({ expires: Date.now() / 1000 + 100 }),
    send: vi.fn(), close: vi.fn(),
  };
  const hub = new BoardHub({ getWebSockets: () => [socket] } as any);
  await hub.fetch(new Request("https://board.internal/notify?type=directory.changed", { method: "POST" }));
  expect(socket.send).toHaveBeenCalledWith('{"type":"directory.changed"}');
});
