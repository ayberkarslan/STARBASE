import { z } from "zod";
import { type App, type Env, body, fail } from "../common";
import { requireTeamMember } from "../common";
import { now } from "../security";
const fields = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(2000),
  kind: z.enum(["note", "announcement"]),
  teamId: z.string().min(1).nullable(),
  dueAt: z.number().int().min(0).max(4102444800).nullable(),
});
async function moderate(c: any) {
  if (c.get("user").owner) return true;
  return !!(await c.env.DB.prepare(
    "SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id=ur.role_id WHERE ur.user_id=? AND rp.permission_id='board.manage'",
  )
    .bind(c.get("user").id)
    .first());
}
async function writeLimit(c: any) {
  const key = `board:${c.get("user").id}:${Math.floor(now() / 60)}`;
  const r = await c.env.DB.prepare(
    "INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(key, now() + 120)
    .first();
  if (r.count > 30) fail(429, "try_later");
}
async function team(env: Env, id: string | null) {
  if (
    id &&
    !(await env.DB.prepare(
      "SELECT t.id FROM teams t JOIN departments d ON d.id=t.department_id WHERE t.id=? AND t.archived=0 AND d.archived=0",
    )
      .bind(id)
      .first())
  )
    fail(400, "invalid_team");
}
async function notify(env: Env) {
  try {
    const hub = env.BOARD_HUB.get(env.BOARD_HUB.idFromName("team-board"));
    return (
      await hub.fetch("https://board.internal/notify", { method: "POST" })
    ).ok;
  } catch {
    return false;
  }
}
const select =
  "SELECT n.id,n.author_id authorId,u.first_name authorFirstName,u.last_name authorLastName,u.username authorUsername,n.title,n.content,n.kind,n.team_id teamId,t.name team,n.due_at dueAt,n.pinned,n.archived,n.version,n.created_at createdAt,n.updated_at updatedAt FROM board_notes n LEFT JOIN users u ON u.id=n.author_id LEFT JOIN teams t ON t.id=n.team_id";
export function register(app: App) {
  app.get("/api/v1/board/notes", async (c) => {
    await requireTeamMember(c);
    const parsed = z
      .object({
        page: z.coerce.number().int().min(1).max(10000).default(1),
        archived: z.enum(["0", "1"]).default("0"),
        kind: z.enum(["note", "announcement"]).optional(),
        teamId: z.string().max(100).optional(),
      })
      .safeParse(c.req.query());
    if (!parsed.success) return fail(400, "invalid_query");
    const b = parsed.data;
    const where = ["n.archived=?"];
    const bindings: (number | string)[] = [Number(b.archived)];
    if (b.kind) {
      where.push("n.kind=?");
      bindings.push(b.kind);
    }
    if (b.teamId) {
      where.push("n.team_id=?");
      bindings.push(b.teamId);
    }
    const total = await c.env.DB.prepare(
      "SELECT COUNT(*) total FROM board_notes n WHERE " + where.join(" AND "),
    )
      .bind(...bindings)
      .first<{ total: number }>();
    const notes = (
      await c.env.DB.prepare(
        select +
          " WHERE " +
          where.join(" AND ") +
          " ORDER BY n.pinned DESC,n.updated_at DESC,n.id DESC LIMIT 24 OFFSET ?",
      )
        .bind(...bindings, (b.page - 1) * 24)
        .all()
    ).results;
    return c.json({
      notes,
      page: b.page,
      pageSize: 24,
      total: total?.total ?? 0,
      hasMore: b.page * 24 < (total?.total ?? 0),
      canModerate: await moderate(c),
    });
  });
  app.post("/api/v1/board/notes", async (c) => {
    await requireTeamMember(c);
    await writeLimit(c);
    const b = await body(
      c,
      fields.extend({
        kind: z.enum(["note", "announcement"]).default("note"),
        teamId: z.string().min(1).nullable().default(null),
        dueAt: z.number().int().min(0).max(4102444800).nullable().default(null),
      }),
    );
    await team(c.env, b.teamId);
    const id = crypto.randomUUID();
    const timestamp = now();
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO board_notes(id,author_id,title,content,kind,team_id,due_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      ).bind(
        id,
        c.get("user").id,
        b.title,
        b.content,
        b.kind,
        b.teamId,
        b.dueAt,
        timestamp,
        timestamp,
      ),
      c.env.DB.prepare("INSERT INTO audit VALUES(?,?,?,?,?)").bind(
        crypto.randomUUID(),
        c.get("user").id,
        id,
        "board.create",
        timestamp,
      ),
    ]);
    return c.json({ id, version: 1, liveDelivered: await notify(c.env) }, 201);
  });
  app.patch("/api/v1/board/notes/:id", async (c) => {
    await requireTeamMember(c);
    await writeLimit(c);
    const b = await body(
      c,
      fields.partial().extend({
        version: z.number().int().min(1),
        pinned: z.boolean().optional(),
        archived: z.boolean().optional(),
      }),
    );
    const old = await c.env.DB.prepare("SELECT * FROM board_notes WHERE id=?")
      .bind(c.req.param("id"))
      .first<any>();
    if (!old) fail(404, "note_not_found");
    const canModerate = await moderate(c);
    if (old.author_id !== c.get("user").id && !canModerate)
      fail(403, "permission_denied");
    if (b.pinned !== undefined && !canModerate) fail(403, "permission_denied");
    if (b.teamId !== undefined) await team(c.env, b.teamId);
    const updated = await c.env.DB.prepare(
      "UPDATE board_notes SET title=?,content=?,kind=?,team_id=?,due_at=?,pinned=?,archived=?,version=version+1,updated_at=? WHERE id=? AND version=? RETURNING version",
    )
      .bind(
        b.title ?? old.title,
        b.content ?? old.content,
        b.kind ?? old.kind,
        b.teamId === undefined ? old.team_id : b.teamId,
        b.dueAt === undefined ? old.due_at : b.dueAt,
        b.pinned === undefined ? old.pinned : Number(b.pinned),
        b.archived === undefined ? old.archived : Number(b.archived),
        now(),
        old.id,
        b.version,
      )
      .first<{ version: number }>();
    if (!updated) fail(409, "note_conflict");
    await c.env.DB.prepare("INSERT INTO audit VALUES(?,?,?,?,?)")
      .bind(
        crypto.randomUUID(),
        c.get("user").id,
        old.id,
        "board.update",
        now(),
      )
      .run();
    return c.json({
      id: old.id,
      version: updated!.version,
      liveDelivered: await notify(c.env),
    });
  });
  app.delete("/api/v1/board/notes/:id", async (c) => {
    await requireTeamMember(c);
    await writeLimit(c);
    const b = await body(c, z.object({ version: z.number().int().min(1) }));
    const old = await c.env.DB.prepare(
      "SELECT author_id,version FROM board_notes WHERE id=?",
    )
      .bind(c.req.param("id"))
      .first<any>();
    if (!old) fail(404, "note_not_found");
    if (old.author_id !== c.get("user").id && !(await moderate(c)))
      fail(403, "permission_denied");
    const deleted = await c.env.DB.prepare(
      "DELETE FROM board_notes WHERE id=? AND version=? RETURNING id",
    )
      .bind(c.req.param("id"), b.version)
      .first();
    if (!deleted) fail(409, "note_conflict");
    await c.env.DB.prepare("INSERT INTO audit VALUES(?,?,?,?,?)")
      .bind(
        crypto.randomUUID(),
        c.get("user").id,
        c.req.param("id"),
        "board.delete",
        now(),
      )
      .run();
    return c.json({ ok: true, liveDelivered: await notify(c.env) });
  });
  app.get("/api/v1/board/live", async (c) => {
    await requireTeamMember(c);
    if (c.req.header("origin") !== c.env.PUBLIC_ORIGIN)
      fail(403, "origin_rejected");
    if (c.req.header("upgrade")?.toLowerCase() !== "websocket")
      return fail(400, "websocket_required");
    const hub = c.env.BOARD_HUB.get(c.env.BOARD_HUB.idFromName("team-board"));
    return hub.fetch(
      new Request(
        `https://board.internal/connect?expires=${c.get("session").expires}`,
        c.req.raw,
      ),
    );
  });
}
