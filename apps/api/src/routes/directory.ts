import { z } from "zod";
import type { Context } from "hono";
import {
  type App,
  type Env,
  type Session,
  fail,
  requireTeamMember,
} from "../common";
import { applicationHistory } from "../activity";
import { imageResponse } from "../image-assets";
type C = Context<{ Bindings: Env; Variables: { session: Session; user: any } }>;
const member = (alias: string) =>
  `(${alias}.owner=1 OR EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=${alias}.id))`;
const requireDirectory = requireTeamMember;
async function usedApplications(env: Env, userId: string) {
  const rows = await env.DB.prepare(
    "SELECT a.id applicationId,a.name applicationName,a.logo_url logoUrl FROM application_usage u JOIN apps a ON a.id=u.app_id WHERE u.user_id=? ORDER BY u.last_sign_in_at DESC",
  )
    .bind(userId)
    .all<{ applicationId: string; applicationName: string; logoUrl: string }>();
  return rows.results.map((row) => ({
    ...row,
    logoUrl: row.logoUrl ? `/api/v1/apps/${encodeURIComponent(row.applicationId)}/logo` : "",
  }));
}
async function target(c: C) {
  const u = await c.env.DB.prepare(
    `SELECT u.id,u.username,u.first_name firstName,u.last_name lastName FROM users u WHERE u.id=? AND u.disabled=0 AND ${member("u")}`,
  )
    .bind(c.req.param("id"))
    .first();
  if (!u) fail(404, "member_not_found");
  return u;
}
export function register(app: App) {
  app.get("/api/v1/directory/live", async (c) => {
    await requireDirectory(c);
    if (c.req.header("origin") !== new URL(c.req.url).origin) fail(403, "origin_rejected");
    if (c.req.header("upgrade")?.toLowerCase() !== "websocket") fail(400, "websocket_required");
    const hub = c.env.BOARD_HUB.get(c.env.BOARD_HUB.idFromName("team-directory"));
    return hub.fetch(new Request(
      `https://board.internal/connect?expires=${c.get("session").expires}`,
      c.req.raw,
    ));
  });
  app.get("/api/v1/directory/users", async (c) => {
    await requireDirectory(c);
    const parsed = z
      .object({
        q: z.string().trim().max(80).default(""),
        departmentId: z.string().max(100).optional(),
        teamId: z.string().max(100).optional(),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .safeParse(c.req.query());
    if (!parsed.success) return fail(400, "invalid_query");
    const b = parsed.data;
    const conditions = ["u.disabled=0", member("u")];
    const bindings: string[] = [];
    if (b.q) {
      const fold = b.q
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ı/g, "i")
        .toLowerCase();
      let column = "u.first_name||' '||u.last_name||' '||u.username";
      for (const [from, to] of [
        ["İ", "i"],
        ["ı", "i"],
        ["Ç", "c"],
        ["ç", "c"],
        ["Ğ", "g"],
        ["ğ", "g"],
        ["Ö", "o"],
        ["ö", "o"],
        ["Ş", "s"],
        ["ş", "s"],
        ["Ü", "u"],
        ["ü", "u"],
      ])
        column = `replace(${column},'${from}','${to}')`;
      conditions.push(`lower(${column}) LIKE ? ESCAPE '!'`);
      bindings.push("%" + fold.replace(/[!%_]/g, "!$&") + "%");
    }
    if (b.departmentId || b.teamId) {
      conditions.push(
        `EXISTS(SELECT 1 FROM memberships m JOIN departments d ON d.id=m.department_id LEFT JOIN teams t ON t.id=m.team_id WHERE m.user_id=u.id AND d.archived=0 AND (t.id IS NULL OR t.archived=0)${b.departmentId ? " AND m.department_id=?" : ""}${b.teamId ? " AND m.team_id=?" : ""})`,
      );
      if (b.departmentId) bindings.push(b.departmentId);
      if (b.teamId) bindings.push(b.teamId);
    }
    const where = conditions.join(" AND ");
    const total = await c.env.DB.prepare(
      `SELECT COUNT(*) total FROM users u WHERE ${where}`,
    )
      .bind(...bindings)
      .first<{ total: number }>();
    const users = (
      await c.env.DB.prepare(
        `SELECT u.id,u.username,u.first_name firstName,u.last_name lastName FROM users u WHERE ${where} ORDER BY u.first_name COLLATE NOCASE,u.last_name COLLATE NOCASE,u.username LIMIT 24 OFFSET ?`,
      )
        .bind(...bindings, (b.page - 1) * 24)
        .all()
    ).results;
    const ids = users.map((u) => u.id as string);
    const memberships = ids.length
      ? (
          await c.env.DB.prepare(
            `SELECT m.user_id userId,d.id departmentId,d.name department,t.id teamId,t.name team FROM memberships m JOIN departments d ON d.id=m.department_id LEFT JOIN teams t ON t.id=m.team_id WHERE m.user_id IN (${ids.map(() => "?").join(",")}) AND d.archived=0 AND (t.id IS NULL OR t.archived=0) ORDER BY d.name,t.name`,
          )
            .bind(...ids)
            .all()
        ).results
      : [];
    return c.json({
      users: users.map((u) => ({
        ...u,
        memberships: memberships
          .filter((m) => m.userId === u.id)
          .map(({ userId, ...m }) => m),
      })),
      page: b.page,
      pageSize: 24,
      total: total?.total ?? 0,
      hasMore: b.page * 24 < (total?.total ?? 0),
    });
  });
  app.get("/api/v1/directory/teams", async (c) => {
    await requireDirectory(c);
    const departments = (
      await c.env.DB.prepare(
        `SELECT d.id,d.name,d.logo_url logoUrl,COUNT(DISTINCT CASE WHEN u.disabled=0 AND (m.team_id IS NULL OR t.archived=0) AND ${member("u")} THEN u.id END) memberCount FROM departments d LEFT JOIN memberships m ON m.department_id=d.id LEFT JOIN teams t ON t.id=m.team_id LEFT JOIN users u ON u.id=m.user_id WHERE d.archived=0 GROUP BY d.id ORDER BY d.name`,
      ).all()
    ).results;
    const teams = (
      await c.env.DB.prepare(
        `SELECT t.id,t.name,t.logo_url logoUrl,t.department_id departmentId,COUNT(DISTINCT CASE WHEN u.disabled=0 AND ${member("u")} THEN u.id END) memberCount FROM teams t JOIN departments d ON d.id=t.department_id LEFT JOIN memberships m ON m.team_id=t.id LEFT JOIN users u ON u.id=m.user_id WHERE t.archived=0 AND d.archived=0 GROUP BY t.id ORDER BY d.name,t.name`,
      ).all()
    ).results;
    return c.json({
      departments: departments.map((department: any) => ({
        ...department,
        logoUrl: department.logoUrl
          ? `/api/v1/directory/departments/${encodeURIComponent(department.id)}/logo`
          : "",
      })),
      teams: teams.map((team: any) => ({
        ...team,
        logoUrl: team.logoUrl
          ? `/api/v1/directory/teams/${encodeURIComponent(team.id)}/logo`
          : "",
      })),
    });
  });
  app.get("/api/v1/directory/departments/:id/logo", async (c) => {
    await requireDirectory(c);
    const department = await c.env.DB.prepare(
      "SELECT id,logo_url FROM departments WHERE id=? AND archived=0",
    ).bind(c.req.param("id")).first<{ id: string; logo_url: string }>();
    if (!department?.logo_url) return fail(404, "department_logo_not_found");
    const image = await imageResponse(c.env.DB, "departments", department.id);
    if (!image) return fail(404, "department_logo_not_found");
    return image;
  });
  app.get("/api/v1/directory/teams/:id/logo", async (c) => {
    await requireDirectory(c);
    const team = await c.env.DB.prepare(
      "SELECT id,logo_url FROM teams WHERE id=? AND archived=0",
    )
      .bind(c.req.param("id"))
      .first<{ id: string; logo_url: string }>();
    if (!team?.logo_url) return fail(404, "team_logo_not_found");
    const image = await imageResponse(c.env.DB, "teams", team.id);
    if (!image) return fail(404, "team_logo_not_found");
    return image;
  });
  app.get("/api/v1/directory/users/:id", async (c) => {
    await requireDirectory(c);
    const user = await target(c);
    const memberships = (
      await c.env.DB.prepare(
        "SELECT d.id departmentId,d.name department,t.id teamId,t.name team FROM memberships m JOIN departments d ON d.id=m.department_id LEFT JOIN teams t ON t.id=m.team_id WHERE m.user_id=? AND d.archived=0 AND (t.id IS NULL OR t.archived=0) ORDER BY d.name,t.name",
      )
        .bind(c.req.param("id"))
        .all()
    ).results;
    return c.json({
      ...user,
      memberships,
      applications: await usedApplications(c.env, c.req.param("id")),
    });
  });
  app.get("/api/v1/directory/users/:id/activity", async (c) => {
    await requireDirectory(c);
    await target(c);
    if (c.get("user").id !== c.req.param("id")) fail(403, "permission_denied");
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .safeParse(c.req.query("page") ?? 1);
    if (!page.success) return fail(400, "invalid_query");
    return c.json(
      await applicationHistory(c.env, c.req.param("id"), page.data),
    );
  });
  app.get("/api/v1/me/applications", async (c) => {
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .safeParse(c.req.query("page") ?? 1);
    if (!page.success) return fail(400, "invalid_query");
    const s = c.get("session");
    return c.json(
      await applicationHistory(
        c.env,
        s.user_id,
        page.data,
        s.app_id ?? undefined,
      ),
    );
  });
}
