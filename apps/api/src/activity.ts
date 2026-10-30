import { type Env, fail } from "./common";
import { now } from "./security";
export async function startVisit(env: Env, family: string) {
  const recorded = await env.DB.prepare(
    "INSERT INTO application_visits(id,user_id,app_id,signed_in_at,expires_at) SELECT id,user_id,app_id,?,expires FROM families WHERE id=? AND app_id IS NOT NULL AND revoked=0 RETURNING id",
  )
    .bind(now(), family)
    .first();
  if (!recorded) fail(401, "session_revoked");
}
export function logoutVisit(env: Env, userId: string, family?: string) {
  const timestamp = now();
  return env.DB.prepare(
    `UPDATE application_visits SET ended_at=MIN(?,expires_at),end_reason=CASE WHEN expires_at<=? THEN 'expired' ELSE 'logout' END WHERE user_id=? AND ended_at IS NULL${family ? " AND id=?" : ""}`,
  ).bind(timestamp, timestamp, userId, ...(family ? [family] : []));
}
export async function applicationHistory(
  env: Env,
  userId: string,
  page = 1,
  appId?: string,
) {
  const scope = appId ? " AND v.app_id=?" : "";
  const params = appId ? [userId, appId] : [userId];
  const applications = (
    await env.DB.prepare(
      `SELECT v.app_id applicationId,a.name applicationName,a.disabled applicationDisabled,v.last_sign_in_at lastSignInAt,v.last_sign_out_at lastSignOutAt,v.last_end_at lastEndAt,v.last_end_reason lastEndReason FROM application_usage v JOIN apps a ON a.id=v.app_id WHERE v.user_id=?${scope} ORDER BY v.last_sign_in_at DESC,v.app_id`,
    )
      .bind(...params)
      .all()
  ).results;
  const total = await env.DB.prepare(
    `SELECT COUNT(*) total FROM application_visits v WHERE v.user_id=?${scope}`,
  )
    .bind(...params)
    .first<{ total: number }>();
  const visits = (
    await env.DB.prepare(
      `SELECT v.id,v.app_id applicationId,a.name applicationName,v.signed_in_at signedInAt,CASE WHEN v.ended_at IS NULL AND v.expires_at<=? THEN v.expires_at ELSE v.ended_at END endedAt,CASE WHEN v.ended_at IS NULL AND v.expires_at<=? THEN 'expired' ELSE v.end_reason END endReason FROM application_visits v JOIN apps a ON a.id=v.app_id WHERE v.user_id=?${scope} ORDER BY v.signed_in_at DESC,v.id DESC LIMIT 20 OFFSET ?`,
    )
      .bind(now(), now(), ...params, (page - 1) * 20)
      .all()
  ).results;
  return {
    applications,
    visits,
    page,
    pageSize: 20,
    total: total?.total ?? 0,
    hasMore: page * 20 < (total?.total ?? 0),
  };
}
