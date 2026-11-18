import { type App, type Env, fail, requireTeamMember } from "../common";
import { now } from "../security";

export async function createRoomInviteNotification(env: Env, userId: string, actorId: string, roomId: string) {
  await env.DB.prepare("INSERT INTO notifications(id,user_id,actor_user_id,kind,resource_id,created_at) VALUES(?,?,?,'share.invite',?,?) ON CONFLICT(user_id,kind,resource_id) DO UPDATE SET actor_user_id=excluded.actor_user_id,created_at=excluded.created_at,read_at=NULL")
    .bind(crypto.randomUUID(), userId, actorId, roomId, now()).run();
}

export function register(app: App) {
  app.get("/api/v1/notifications", async (c) => {
    await requireTeamMember(c);
    const userId = c.get("user").id;
    const rows = await c.env.DB.prepare("SELECT n.id,n.kind,n.resource_id resourceId,n.created_at createdAt,n.read_at readAt,r.name roomName,a.first_name actorFirstName,a.last_name actorLastName FROM notifications n JOIN share_rooms r ON n.kind='share.invite' AND r.id=n.resource_id LEFT JOIN users a ON a.id=n.actor_user_id WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 50")
      .bind(userId).all<{ id: string; kind: string; resourceId: string; createdAt: number; readAt: number | null; roomName: string; actorFirstName: string | null; actorLastName: string | null }>();
    const count = await c.env.DB.prepare("SELECT COUNT(*) count FROM notifications n JOIN share_rooms r ON n.kind='share.invite' AND r.id=n.resource_id WHERE n.user_id=? AND n.read_at IS NULL").bind(userId).first<{ count: number }>();
    return c.json({ notifications: rows.results.map((row) => ({ ...row, actorName: [row.actorFirstName, row.actorLastName].filter(Boolean).join(" ") })), unreadCount: count?.count ?? 0 });
  });

  app.post("/api/v1/notifications/read-all", async (c) => {
    await requireTeamMember(c);
    await c.env.DB.prepare("UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL").bind(now(), c.get("user").id).run();
    return c.json({ ok: true });
  });

  app.post("/api/v1/notifications/:id/read", async (c) => {
    await requireTeamMember(c);
    const result = await c.env.DB.prepare("UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=? RETURNING id").bind(now(), c.req.param("id"), c.get("user").id).first();
    if (!result) fail(404, "notification_not_found");
    return c.json({ ok: true });
  });
}
