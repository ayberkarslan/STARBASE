import type { Env } from "./common";

/** A content-free hint. Clients must refetch through authenticated directory endpoints. */
export async function notifyDirectory(env: Env) {
  try {
    const hub = env.BOARD_HUB.get(env.BOARD_HUB.idFromName("team-directory"));
    await hub.fetch("https://board.internal/notify?type=directory.changed", { method: "POST" });
  } catch {
    // A failed hint must never turn a committed user change into an API error.
  }
}
