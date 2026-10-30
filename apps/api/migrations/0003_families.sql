CREATE TABLE families(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),app_id TEXT REFERENCES apps(id),expires INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0);
CREATE INDEX families_user ON families(user_id);
INSERT INTO families(id,user_id,app_id,expires) SELECT family,user_id,app_id,MAX(expires) FROM sessions GROUP BY family;
