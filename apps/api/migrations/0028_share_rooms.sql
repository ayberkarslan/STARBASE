CREATE TABLE share_rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_target_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  password_hash TEXT,
  locked INTEGER NOT NULL DEFAULT 0,
  participant_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX share_rooms_created_idx ON share_rooms(created_at DESC);
CREATE TABLE share_room_invites (
  room_id TEXT NOT NULL REFERENCES share_rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY(room_id,user_id)
);
CREATE TABLE share_room_admissions (
  room_id TEXT NOT NULL REFERENCES share_rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(room_id,user_id)
);
