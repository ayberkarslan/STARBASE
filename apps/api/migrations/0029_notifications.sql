-- Earlier "remove" actions also banned members. Those bans were unintended.
DELETE FROM share_room_bans;

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  UNIQUE(user_id, kind, resource_id)
);
CREATE INDEX notifications_user_created_idx ON notifications(user_id, created_at DESC);
