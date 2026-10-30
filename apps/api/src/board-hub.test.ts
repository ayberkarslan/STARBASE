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
it("does not let clients broadcast websocket messages", () => {
  const socket = { send: vi.fn(), close: vi.fn() };
  new BoardHub({} as any).webSocketMessage(socket as any);
  expect(socket.close).toHaveBeenCalledWith(
    1008,
    "Use the notes API for changes",
  );
  expect(socket.send).not.toHaveBeenCalled();
});
