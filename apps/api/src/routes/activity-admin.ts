import { z } from "zod";
import { type App, fail, permit } from "../common";
import { now } from "../security";

const visits = `WITH visits AS (
  SELECT id,user_id,NULL applicationId,'STARBASE' applicationName,'starbase' source,signed_in_at,last_seen_at,expires_at,ended_at,end_reason,ip_address,user_agent FROM central_visits
  UNION ALL
  SELECT v.id,v.user_id,v.app_id,a.name,'application',v.signed_in_at,NULL,v.expires_at,v.ended_at,v.end_reason,v.ip_address,v.user_agent FROM application_visits v JOIN apps a ON a.id=v.app_id
)`;

export function register(app: App) {
  app.get("/api/v1/admin/activity", async (c) => {
    await permit(c, "users.manage");
    const parsed = z.object({
      page: z.coerce.number().int().min(1).max(10000).default(1),
      q: z.string().trim().max(80).default(""),
      source: z.enum(["all", "starbase", "application"]).default("all"),
      userId: z.string().max(100).optional(),
    }).safeParse(c.req.query());
    if (!parsed.success) return fail(400, "invalid_query");
    const { page, q, source, userId } = parsed.data;
    if (userId && !(await c.env.DB.prepare("SELECT 1 FROM users WHERE id=?").bind(userId).first()))
      return fail(404, "not_found");
    const filters: string[] = [];
    const params: string[] = [];
    if (userId) { filters.push("v.user_id=?"); params.push(userId); }
    if (source !== "all") { filters.push("v.source=?"); params.push(source); }
    if (q) {
      const pattern = `%${q.replace(/[!%_]/g, "!$&")}%`;
      filters.push("(u.username LIKE ? ESCAPE '!' OR u.first_name LIKE ? ESCAPE '!' OR u.last_name LIKE ? ESCAPE '!' OR v.applicationName LIKE ? ESCAPE '!')");
      params.push(pattern, pattern, pattern, pattern);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const total = await c.env.DB.prepare(`${visits} SELECT COUNT(*) total FROM visits v JOIN users u ON u.id=v.user_id ${where}`)
      .bind(...params).first<{ total: number }>();
    const timestamp = now();
    const events = await c.env.DB.prepare(`${visits}
      SELECT v.id,v.user_id userId,u.username,u.first_name firstName,u.last_name lastName,
        v.applicationId,v.applicationName,v.source,v.signed_in_at signedInAt,v.last_seen_at lastSeenAt,
        v.ip_address ipAddress,v.user_agent userAgent,
        CASE WHEN v.ended_at IS NULL AND v.expires_at<=? THEN v.expires_at ELSE v.ended_at END endedAt,
        CASE WHEN v.ended_at IS NULL AND v.expires_at<=? THEN 'expired' ELSE v.end_reason END endReason,
        v.expires_at expiresAt
      FROM visits v JOIN users u ON u.id=v.user_id ${where}
      ORDER BY COALESCE(v.ended_at,CASE WHEN v.expires_at<=? THEN v.expires_at END,v.signed_in_at) DESC,v.id DESC
      LIMIT 30 OFFSET ?`)
      .bind(timestamp, timestamp, ...params, timestamp, (page - 1) * 30).all();
    const platforms = userId ? (
      await c.env.DB.prepare(`
        SELECT 'starbase' source,NULL applicationId,'STARBASE' applicationName,
          MAX(signed_in_at) lastSignInAt,
          MAX(CASE WHEN end_reason='logout' THEN ended_at END) lastSignOutAt,
          MAX(ended_at) lastEndAt,MAX(last_seen_at) lastSeenAt
        FROM central_visits WHERE user_id=?
        UNION ALL
        SELECT 'application',a.id,a.name,v.last_sign_in_at,v.last_sign_out_at,v.last_end_at,NULL
        FROM application_usage v JOIN apps a ON a.id=v.app_id WHERE v.user_id=?
        ORDER BY lastSignInAt DESC`)
        .bind(userId, userId).all()
    ).results : [];
    return c.json({
      events: events.results,
      platforms,
      page,
      pageSize: 30,
      total: total?.total ?? 0,
      hasMore: page * 30 < (total?.total ?? 0),
    });
  });
}
