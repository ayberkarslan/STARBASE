import { z } from "zod";
import { type App, body, fail, requireTeamMember } from "../common";
import { hash, now } from "../security";
import { createRoomInviteNotification } from "./notifications";

const memberSql = `(u.owner=1 OR EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id) OR EXISTS(SELECT 1 FROM memberships m JOIN departments d ON d.id=m.department_id LEFT JOIN teams t ON t.id=m.team_id WHERE m.user_id=u.id AND d.archived=0 AND (t.id IS NULL OR t.archived=0)))`;
const userIdInput = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const pinInput = z.string().regex(/^\d{6}$/);
const newPin = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
const roomInput = z.object({ name: z.string().trim().min(2).max(64), protected: z.boolean(), password: pinInput.optional(), profileTargetId: userIdInput.optional() });
const joinInput = z.object({ password: pinInput.optional() });
const editInput = z.object({ name: z.string().trim().min(2).max(64).optional(), protected: z.boolean().optional(), password: pinInput.optional(), generatePin: z.boolean().optional(), locked: z.boolean().optional() });
type Room = { id: string; name: string; ownerId: string; profileTargetId: string | null; passwordHash: string | null; locked: number; participantCount: number; createdAt: number };

async function room(c: any, id: string): Promise<Room> {
  if (!z.uuid().safeParse(id).success) fail(404, "room_not_found");
  const value = await c.env.DB.prepare("SELECT id,name,owner_id ownerId,profile_target_id profileTargetId,password_hash passwordHash,locked,participant_count participantCount,created_at createdAt FROM share_rooms WHERE id=?").bind(id).first() as Room | null;
  if (!value) fail(404, "room_not_found");
  return value!;
}
async function notify(c: any) {
  const hub = c.env.BOARD_HUB.get(c.env.BOARD_HUB.idFromName("team-directory"));
  await hub.fetch("https://board.internal/notify?type=share.rooms.changed", { method: "POST" });
}
async function invited(c: any, id: string) {
  return !!(await c.env.DB.prepare("SELECT 1 FROM share_room_invites WHERE room_id=? AND user_id=?").bind(id, c.get("user").id).first());
}
async function knownMember(c: any, id: string) {
  return !!(await c.env.DB.prepare(`SELECT 1 FROM users u WHERE u.id=? AND u.disabled=0 AND ${memberSql}`).bind(id).first());
}
const publicRoom = (value: Room, userId: string, isInvited: boolean) => ({
  id: value.id, name: value.name, ownerId: value.ownerId, profileTargetId: value.profileTargetId,
  protected: !!value.passwordHash, locked: !!value.locked, participantCount: value.participantCount,
  createdAt: value.createdAt, isOwner: value.ownerId === userId, isInvited,
});
async function wrongPassword(c: any, id: string) {
  const key = `share:${id}:${c.get("user").id}:${Math.floor(now() / 300)}`;
  const row = await c.env.DB.prepare("INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count").bind(key, now() + 600).first() as { count: number } | null;
  if ((row?.count ?? 0) >= 5) fail(429, "try_later");
  fail(403, "room_password_invalid");
}

export function register(app: App) {
  app.get("/api/v1/share/rooms", async (c) => {
    await requireTeamMember(c);
    const rows = await c.env.DB.prepare("SELECT r.id,r.name,r.owner_id ownerId,r.profile_target_id profileTargetId,r.password_hash passwordHash,r.locked,r.participant_count participantCount,r.created_at createdAt,u.first_name ownerFirstName,u.last_name ownerLastName FROM share_rooms r JOIN users u ON u.id=r.owner_id ORDER BY r.created_at DESC LIMIT 100").all<Room & { ownerFirstName: string; ownerLastName: string }>();
    const invites = await c.env.DB.prepare("SELECT room_id roomId FROM share_room_invites WHERE user_id=?").bind(c.get("user").id).all<{ roomId: string }>();
    const invitedIds = new Set(invites.results.map((invite) => invite.roomId));
    return c.json({ rooms: rows.results.map((value) => ({ ...publicRoom(value, c.get("user").id, invitedIds.has(value.id)), ownerName: `${value.ownerFirstName} ${value.ownerLastName}` })) });
  });

  app.post("/api/v1/share/rooms", async (c) => {
    await requireTeamMember(c);
    const input = await body(c, roomInput);
    if (input.profileTargetId && (input.profileTargetId === c.get("user").id || !(await knownMember(c, input.profileTargetId)))) fail(400, "invalid_member");
    const id = crypto.randomUUID();
    const password = input.protected ? input.password ?? newPin() : undefined;
    const passwordHash = password ? await hash(`${id}:${password}`) : null;
    await c.env.DB.prepare("INSERT INTO share_rooms(id,name,owner_id,profile_target_id,password_hash,created_at) VALUES(?,?,?,?,?,?)").bind(id, input.name, c.get("user").id, input.profileTargetId ?? null, passwordHash, now()).run();
    if (input.profileTargetId) {
      await c.env.DB.prepare("INSERT INTO share_room_invites(room_id,user_id) VALUES(?,?)").bind(id, input.profileTargetId).run();
      await createRoomInviteNotification(c.env, input.profileTargetId, c.get("user").id, id);
    }
    const stub = c.env.SHARE_ROOM.get(c.env.SHARE_ROOM.idFromName(id));
    await stub.fetch("https://share.internal/init", { method: "POST", headers: { "x-room-id": id } });
    await notify(c);
    return c.json({ room: publicRoom(await room(c, id), c.get("user").id, false), ...(input.protected && !input.password ? { generatedPassword: password } : {}) }, 201);
  });

  app.post("/api/v1/share/rooms/:id/join", async (c) => {
    await requireTeamMember(c);
    const value = await room(c, c.req.param("id"));
    const owner = value.ownerId === c.get("user").id;
    const hasInvite = await invited(c, value.id);
    if (await c.env.DB.prepare("SELECT 1 FROM share_room_bans WHERE room_id=? AND user_id=?").bind(value.id, c.get("user").id).first()) fail(403, "room_access_denied");
    if (value.locked && !owner && !hasInvite) fail(403, "room_locked");
    if (value.passwordHash && !owner && !hasInvite) {
      const input = await body(c, joinInput);
      if (!input.password || await hash(`${value.id}:${input.password}`) !== value.passwordHash) await wrongPassword(c, value.id);
    }
    await c.env.DB.prepare("INSERT INTO share_room_admissions(room_id,user_id,expires_at) VALUES(?,?,?) ON CONFLICT(room_id,user_id) DO UPDATE SET expires_at=excluded.expires_at").bind(value.id, c.get("user").id, Math.min(c.get("session").expires, now() + 900)).run();
    return c.json({ room: publicRoom(value, c.get("user").id, hasInvite) });
  });

  app.get("/api/v1/share/rooms/:id/live", async (c) => {
    await requireTeamMember(c);
    if (c.req.header("origin") !== new URL(c.req.url).origin) fail(403, "origin_rejected");
    if (c.req.header("upgrade")?.toLowerCase() !== "websocket") fail(400, "websocket_required");
    const value = await room(c, c.req.param("id"));
    const stub = c.env.SHARE_ROOM.get(c.env.SHARE_ROOM.idFromName(value.id));
    return stub.fetch(new Request("https://share.internal/connect", {
      headers: {
        Upgrade: "websocket", "x-room-id": value.id,
        "x-user-id": c.get("user").id,
        "x-user-name": encodeURIComponent(`${c.get("user").first_name} ${c.get("user").last_name}`),
        "x-session-expires": String(c.get("session").expires),
        "x-session-hash": c.get("session").hash,
      },
    }));
  });

  app.patch("/api/v1/share/rooms/:id", async (c) => {
    await requireTeamMember(c);
    const value = await room(c, c.req.param("id"));
    if (value.ownerId !== c.get("user").id) fail(403, "permission_denied");
    const input = await body(c, editInput);
    const generatedPassword = input.protected !== false && (input.generatePin || (input.protected && !value.passwordHash && !input.password)) ? newPin() : undefined;
    const password = input.password ?? generatedPassword;
    const passwordHash = input.protected === false ? null : password ? await hash(`${value.id}:${password}`) : value.passwordHash;
    await c.env.DB.prepare("UPDATE share_rooms SET name=?,password_hash=?,locked=? WHERE id=?").bind(input.name ?? value.name, passwordHash, input.locked == null ? value.locked : Number(input.locked), value.id).run();
    if (password || input.protected === false) await c.env.DB.prepare("DELETE FROM share_room_admissions WHERE room_id=? AND user_id<>?").bind(value.id, value.ownerId).run();
    await notify(c);
    return c.json({ room: publicRoom(await room(c, value.id), c.get("user").id, false), ...(generatedPassword ? { generatedPassword } : {}) });
  });

  app.post("/api/v1/share/rooms/:id/invites", async (c) => {
    await requireTeamMember(c);
    const value = await room(c, c.req.param("id"));
    if (value.ownerId !== c.get("user").id) fail(403, "permission_denied");
    const input = await body(c, z.object({ userId: userIdInput }));
    if (input.userId === value.ownerId || !(await knownMember(c, input.userId))) fail(400, "invalid_member");
    await c.env.DB.prepare("INSERT OR IGNORE INTO share_room_invites(room_id,user_id) VALUES(?,?)").bind(value.id, input.userId).run();
    await createRoomInviteNotification(c.env, input.userId, c.get("user").id, value.id);
    await notify(c);
    return c.json({ ok: true });
  });

  app.post("/api/v1/share/rooms/:id/kick", async (c) => {
    await requireTeamMember(c);
    const value = await room(c, c.req.param("id"));
    if (value.ownerId !== c.get("user").id) fail(403, "permission_denied");
    const input = await body(c, z.object({ userId: userIdInput }));
    if (input.userId === value.ownerId) fail(400, "invalid_member");
    await c.env.DB.prepare("DELETE FROM share_room_admissions WHERE room_id=? AND user_id=?").bind(value.id, input.userId).run();
    await c.env.DB.prepare("DELETE FROM share_room_invites WHERE room_id=? AND user_id=?").bind(value.id, input.userId).run();
    await c.env.DB.prepare("DELETE FROM notifications WHERE user_id=? AND kind='share.invite' AND resource_id=?").bind(input.userId, value.id).run();
    const stub = c.env.SHARE_ROOM.get(c.env.SHARE_ROOM.idFromName(value.id));
    await stub.fetch("https://share.internal/kick", { method: "POST", headers: { "x-room-id": value.id, "x-target-id": input.userId } });
    await notify(c);
    return c.json({ ok: true });
  });

  app.post("/api/v1/share/rooms/:id/bans", async (c) => {
    await requireTeamMember(c);
    const value = await room(c, c.req.param("id"));
    if (value.ownerId !== c.get("user").id) fail(403, "permission_denied");
    const input = await body(c, z.object({ userId: userIdInput }));
    if (input.userId === value.ownerId) fail(400, "invalid_member");
    await c.env.DB.prepare("INSERT OR IGNORE INTO share_room_bans(room_id,user_id) VALUES(?,?)").bind(value.id, input.userId).run();
    await c.env.DB.prepare("DELETE FROM share_room_admissions WHERE room_id=? AND user_id=?").bind(value.id, input.userId).run();
    await c.env.DB.prepare("DELETE FROM share_room_invites WHERE room_id=? AND user_id=?").bind(value.id, input.userId).run();
    await c.env.DB.prepare("DELETE FROM notifications WHERE user_id=? AND kind='share.invite' AND resource_id=?").bind(input.userId, value.id).run();
    const stub = c.env.SHARE_ROOM.get(c.env.SHARE_ROOM.idFromName(value.id));
    await stub.fetch("https://share.internal/kick", { method: "POST", headers: { "x-room-id": value.id, "x-target-id": input.userId, "x-ban": "1" } });
    await notify(c);
    return c.json({ ok: true });
  });

  app.get("/api/v1/share/rooms/:id/bans", async (c) => {
    await requireTeamMember(c);
    const value = await room(c, c.req.param("id"));
    if (value.ownerId !== c.get("user").id) fail(403, "permission_denied");
    const rows = await c.env.DB.prepare("SELECT b.user_id userId,u.first_name firstName,u.last_name lastName FROM share_room_bans b JOIN users u ON u.id=b.user_id WHERE b.room_id=? ORDER BY u.first_name,u.last_name").bind(value.id).all<{ userId: string; firstName: string; lastName: string }>();
    return c.json({ users: rows.results });
  });

  app.delete("/api/v1/share/rooms/:id/bans/:userId", async (c) => {
    await requireTeamMember(c);
    const value = await room(c, c.req.param("id"));
    if (value.ownerId !== c.get("user").id) fail(403, "permission_denied");
    await c.env.DB.prepare("DELETE FROM share_room_bans WHERE room_id=? AND user_id=?").bind(value.id, c.req.param("userId")).run();
    return c.json({ ok: true });
  });

  app.delete("/api/v1/share/rooms/:id", async (c) => {
    await requireTeamMember(c);
    const value = await room(c, c.req.param("id"));
    if (value.ownerId !== c.get("user").id) fail(403, "permission_denied");
    await c.env.DB.prepare("DELETE FROM share_rooms WHERE id=?").bind(value.id).run();
    await c.env.DB.prepare("DELETE FROM notifications WHERE kind='share.invite' AND resource_id=?").bind(value.id).run();
    const stub = c.env.SHARE_ROOM.get(c.env.SHARE_ROOM.idFromName(value.id));
    await stub.fetch("https://share.internal/close", { method: "POST", headers: { "x-room-id": value.id } });
    await notify(c);
    return c.json({ ok: true });
  });
}
