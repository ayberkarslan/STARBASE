CREATE TABLE application_visits(
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
 signed_in_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,ended_at INTEGER,
 end_reason TEXT CHECK(end_reason IN ('logout','revoked','expired')),
 CHECK((ended_at IS NULL AND end_reason IS NULL) OR (ended_at IS NOT NULL AND end_reason IS NOT NULL))
);
CREATE INDEX visits_user_time ON application_visits(user_id,signed_in_at DESC,id);
CREATE INDEX visits_open_expiry ON application_visits(expires_at) WHERE ended_at IS NULL;
CREATE TABLE application_usage(
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
 last_sign_in_at INTEGER NOT NULL,last_sign_out_at INTEGER,last_end_at INTEGER,last_end_reason TEXT,
 PRIMARY KEY(user_id,app_id)
);
CREATE TRIGGER visit_started AFTER INSERT ON application_visits BEGIN
 INSERT INTO application_usage(user_id,app_id,last_sign_in_at) VALUES(NEW.user_id,NEW.app_id,NEW.signed_in_at)
 ON CONFLICT(user_id,app_id) DO UPDATE SET last_sign_in_at=MAX(last_sign_in_at,excluded.last_sign_in_at);
END;
CREATE TRIGGER visit_ended AFTER UPDATE OF ended_at ON application_visits
 WHEN OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL BEGIN
 UPDATE application_usage SET
 last_sign_out_at=CASE WHEN NEW.end_reason='logout' THEN MAX(COALESCE(last_sign_out_at,0),NEW.ended_at) ELSE last_sign_out_at END,
 last_end_reason=CASE WHEN NEW.ended_at>=COALESCE(last_end_at,0) THEN NEW.end_reason ELSE last_end_reason END,
 last_end_at=MAX(COALESCE(last_end_at,0),NEW.ended_at)
 WHERE user_id=NEW.user_id AND app_id=NEW.app_id;
END;
CREATE TRIGGER visit_revoked AFTER UPDATE OF revoked ON families
 WHEN OLD.revoked=0 AND NEW.revoked=1 BEGIN
 UPDATE application_visits SET ended_at=MIN(unixepoch(),expires_at),
 end_reason=CASE WHEN expires_at<=unixepoch() THEN 'expired' ELSE 'revoked' END
 WHERE id=NEW.id AND ended_at IS NULL;
END;
CREATE INDEX memberships_department ON memberships(department_id,user_id);
CREATE INDEX memberships_team ON memberships(team_id,user_id);
