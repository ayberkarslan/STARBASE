CREATE TABLE board_notes(
 id TEXT PRIMARY KEY,author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 title TEXT NOT NULL,content TEXT NOT NULL,
 kind TEXT NOT NULL DEFAULT 'note' CHECK(kind IN ('note','announcement')),
 team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
 due_at INTEGER,pinned INTEGER NOT NULL DEFAULT 0,archived INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
);
CREATE INDEX board_notes_feed ON board_notes(archived,pinned DESC,updated_at DESC,id);
CREATE INDEX board_notes_author ON board_notes(author_id);
INSERT INTO permissions(id,description) VALUES('board.manage','Pano notlarını yönetme ve sabitleme');
