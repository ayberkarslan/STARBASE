CREATE TABLE app_access_blocks(
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  blocked_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, app_id)
);
