DROP INDEX IF EXISTS app_resources_user;
CREATE TABLE app_resources_next(
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(app_id,user_id,resource_id)
);
INSERT INTO app_resources_next(app_id,user_id,resource_id,title,date,status,url,created_at,updated_at)
SELECT app_id,user_id,resource_id,title,date,status,'',created_at,updated_at FROM app_resources;
DROP TABLE app_resources;
ALTER TABLE app_resources_next RENAME TO app_resources;
CREATE INDEX app_resources_user ON app_resources(user_id,app_id,updated_at DESC,created_at DESC);
