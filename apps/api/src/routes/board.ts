import { z } from "zod";
import { type App, type Env, body, fail } from "../common";
import { requireTeamMember } from "../common";
import { now } from "../security";
const itemKindSchema = z.enum([
  "note",
  "announcement",
  "shortcut",
  "text",
  "drawing",
  "checklist",
]);
const fields = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(2000),
  kind: z.enum(["note", "announcement"]),
  itemType: itemKindSchema.optional(),
  itemData: z.record(z.string(), z.unknown()).optional(),
  teamId: z.string().min(1).nullable(),
  dueAt: z.number().int().min(0).max(4102444800).nullable(),
});
function serializeItemData(value?: Record<string, unknown>) {
  if (!value) return "{}";
  const raw = JSON.stringify(value);
  if (raw.length > 8192) fail(400, "invalid_input");
  return raw;
}
function parseItemData(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
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
  if (r.count > 120) fail(429, "try_later");
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
async function access(c: any, scope: string) {
  if (c.get("session").kind !== "central")
    fail(403, "central_session_required");
  if (scope === "shared") await requireTeamMember(c);
}
async function existing(c: any) {
  const old = await c.env.DB.prepare("SELECT * FROM board_notes WHERE id=?")
    .bind(c.req.param("id"))
    .first();
  if (!old || (old.scope === "private" && old.author_id !== c.get("user").id))
    fail(404, "note_not_found");
  await access(c, old.scope);
  return old;
}
async function notify(env: Env, scope = "shared", authorId = "") {
  try {
    const hub = env.BOARD_HUB.get(
      env.BOARD_HUB.idFromName(
        scope === "private" ? "private:" + authorId : "team-board",
      ),
    );
    return (
      await hub.fetch("https://board.internal/notify", { method: "POST" })
    ).ok;
  } catch {
    return false;
  }
}
const select =
  "SELECT n.id,n.author_id authorId,u.first_name authorFirstName,u.last_name authorLastName,u.username authorUsername,n.title,n.content,n.kind,n.item_type itemType,n.item_data itemData,n.scope,n.x,n.y,n.layout_version layoutVersion,n.team_id teamId,t.name team,n.due_at dueAt,n.pinned,n.archived,n.version,n.created_at createdAt,n.updated_at updatedAt FROM board_notes n LEFT JOIN users u ON u.id=n.author_id LEFT JOIN teams t ON t.id=n.team_id";
export function register(app: App) {
  app.get("/api/v1/board/notes", async (c) => {
    const parsed = z
      .object({
        scope: z.enum(["private", "shared"]).default("private"),
        limit: z.coerce.number().int().min(1).max(200).default(24),
        page: z.coerce.number().int().min(1).max(10000).default(1),
        archived: z.enum(["0", "1"]).default("0"),
        kind: itemKindSchema.optional(),
        teamId: z.string().max(100).optional(),
      })
      .safeParse(c.req.query());
    if (!parsed.success) return fail(400, "invalid_query");
    const b = parsed.data;
    await access(c, b.scope);
    const where = ["n.archived=?", "n.scope=?"];
    const bindings: (number | string)[] = [Number(b.archived), b.scope];
    if (b.scope === "private") {
      where.push("n.author_id=?");
      bindings.push(c.get("user").id);
    }
    if (b.kind) {
      if (b.kind === "note" || b.kind === "announcement") {
        where.push("(n.item_type=? OR (n.item_type='note' AND n.kind=?))");
        bindings.push(b.kind, b.kind);
      } else {
        where.push("n.item_type=?");
        bindings.push(b.kind);
      }
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
    const rawNotes = (
      await c.env.DB.prepare(
        select +
          " WHERE " +
          where.join(" AND ") +
          " ORDER BY n.pinned DESC,n.updated_at DESC,n.id DESC LIMIT ? OFFSET ?",
      )
        .bind(...bindings, b.limit, (b.page - 1) * b.limit)
        .all<Record<string, unknown>>()
    ).results;
    const notes = rawNotes.map((row) => ({
      ...row,
      itemType:
        typeof row.itemType === "string" && row.itemType !== "note"
          ? row.itemType
          : row.kind === "announcement"
            ? "announcement"
            : "note",
      itemData: parseItemData(row.itemData),
    }));
    return c.json({
      notes,
      page: b.page,
      pageSize: b.limit,
      total: total?.total ?? 0,
      hasMore: b.page * b.limit < (total?.total ?? 0),
      canModerate: b.scope === "private" || (await moderate(c)),
    });
  });
  app.post("/api/v1/board/notes", async (c) => {
    await writeLimit(c);
    const b = await body(
      c,
      fields.extend({
        scope: z.enum(["private", "shared"]).default("private"),
        x: z.number().int().min(0).max(20000).default(40),
        y: z.number().int().min(0).max(20000).default(40),
        kind: z.enum(["note", "announcement"]).default("note"),
        itemType: itemKindSchema.optional(),
        itemData: z.record(z.string(), z.unknown()).optional(),
        teamId: z.string().min(1).nullable().default(null),
        dueAt: z.number().int().min(0).max(4102444800).nullable().default(null),
      }),
    );
    await access(c, b.scope);
    await team(c.env, b.teamId);
    const id = crypto.randomUUID();
    const timestamp = now();
    const effectiveType = b.itemType ?? b.kind;
    const effectiveKind =
      effectiveType === "announcement" ? "announcement" : "note";
    const serializedData = serializeItemData(b.itemData);
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO board_notes(id,author_id,title,content,kind,item_type,item_data,team_id,due_at,created_at,updated_at,scope,x,y) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ).bind(
        id,
        c.get("user").id,
        b.title,
        b.content,
        effectiveKind,
        effectiveType,
        serializedData,
        b.teamId,
        b.dueAt,
        timestamp,
        timestamp,
        b.scope,
        b.x,
        b.y,
      ),
      c.env.DB.prepare("INSERT INTO audit VALUES(?,?,?,?,?)").bind(
        crypto.randomUUID(),
        c.get("user").id,
        id,
        "board.create",
        timestamp,
      ),
    ]);
    return c.json(
      {
        id,
        version: 1,
        liveDelivered: await notify(c.env, b.scope, c.get("user").id),
      },
      201,
    );
  });
  app.patch("/api/v1/board/notes/:id", async (c) => {
    await writeLimit(c);
    const b = await body(
      c,
      fields.partial().extend({
        version: z.number().int().min(1),
        pinned: z.boolean().optional(),
        archived: z.boolean().optional(),
      }),
    );
    const old = await existing(c);
    const canModerate = old.scope === "private" || (await moderate(c));
    if (old.author_id !== c.get("user").id && !canModerate)
      fail(403, "permission_denied");
    if (b.pinned !== undefined && !canModerate) fail(403, "permission_denied");
    if (b.teamId !== undefined) await team(c.env, b.teamId);
    const nextItemType =
      b.itemType ??
      (b.kind !== undefined
        ? b.kind
        : (old.item_type as string) || (old.kind as string));
    const nextKind =
      nextItemType === "announcement" ? "announcement" : (b.kind ?? old.kind);
    const nextItemData =
      b.itemData !== undefined
        ? serializeItemData(b.itemData)
        : (old.item_data ?? "{}");
    const updated = await c.env.DB.prepare(
      "UPDATE board_notes SET title=?,content=?,kind=?,item_type=?,item_data=?,team_id=?,due_at=?,pinned=?,archived=?,version=version+1,updated_at=? WHERE id=? AND version=? RETURNING version",
    )
      .bind(
        b.title ?? old.title,
        b.content ?? old.content,
        nextKind,
        nextItemType,
        nextItemData,
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
      liveDelivered: await notify(c.env, old.scope, old.author_id),
    });
  });
  app.patch("/api/v1/board/notes/:id/position", async (c) => {
    await writeLimit(c);
    const b = await body(
      c,
      z.object({
        x: z.number().int().min(0).max(20000),
        y: z.number().int().min(0).max(20000),
        layoutVersion: z.number().int().min(1),
      }),
    );
    const old = await existing(c);
    if (old.author_id !== c.get("user").id && !(await moderate(c)))
      fail(403, "permission_denied");
    const updated = await c.env.DB.prepare(
      "UPDATE board_notes SET x=?,y=?,layout_version=layout_version+1 WHERE id=? AND layout_version=? RETURNING layout_version layoutVersion",
    )
      .bind(b.x, b.y, old.id, b.layoutVersion)
      .first();
    if (!updated) fail(409, "note_position_conflict");
    return c.json({
      ...updated,
      liveDelivered: await notify(c.env, old.scope, old.author_id),
    });
  });
  app.delete("/api/v1/board/notes/:id", async (c) => {
    await writeLimit(c);
    const b = await body(c, z.object({ version: z.number().int().min(1) }));
    const old = await existing(c);
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
    return c.json({
      ok: true,
      liveDelivered: await notify(c.env, old.scope, old.author_id),
    });
  });
  app.get("/api/v1/board/live", async (c) => {
    const scope = c.req.query("scope") ?? "private";
    if (!["private", "shared"].includes(scope)) fail(400, "invalid_query");
    await access(c, scope);
    if (c.req.header("origin") !== new URL(c.req.url).origin)
      fail(403, "origin_rejected");
    if (c.req.header("upgrade")?.toLowerCase() !== "websocket")
      return fail(400, "websocket_required");
    const hub = c.env.BOARD_HUB.get(
      c.env.BOARD_HUB.idFromName(
        scope === "private" ? "private:" + c.get("user").id : "team-board",
      ),
    );
    return hub.fetch(
      new Request(
        `https://board.internal/connect?expires=${c.get("session").expires}`,
        c.req.raw,
      ),
    );
  });
}
