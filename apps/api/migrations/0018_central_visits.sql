CREATE TABLE central_visits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signed_in_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ended_at INTEGER,
  end_reason TEXT CHECK(end_reason IN ('logout','revoked','expired')),
  CHECK((ended_at IS NULL AND end_reason IS NULL) OR (ended_at IS NOT NULL AND end_reason IS NOT NULL))
);
CREATE INDEX central_visits_user_time ON central_visits(user_id,signed_in_at DESC,id);
CREATE INDEX central_visits_open_expiry ON central_visits(expires_at) WHERE ended_at IS NULL;
INSERT INTO central_visits(id,user_id,signed_in_at,last_seen_at,expires_at)
SELECT f.id,f.user_id,MIN(s.created_at),MIN(unixepoch(),f.expires),f.expires
FROM families f JOIN sessions s ON s.family=f.id AND s.kind='central'
WHERE f.app_id IS NULL AND f.revoked=0 AND f.expires>unixepoch()
GROUP BY f.id;
CREATE TRIGGER central_visit_revoked AFTER UPDATE OF revoked ON families
WHEN OLD.revoked=0 AND NEW.revoked=1 BEGIN
  UPDATE central_visits SET ended_at=MIN(unixepoch(),expires_at),
    end_reason=CASE WHEN expires_at<=unixepoch() THEN 'expired' ELSE 'revoked' END
  WHERE id=NEW.id AND ended_at IS NULL;
END;
