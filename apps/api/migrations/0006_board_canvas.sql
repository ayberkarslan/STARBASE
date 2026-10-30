ALTER TABLE board_notes ADD COLUMN scope TEXT NOT NULL DEFAULT 'shared' CHECK(scope IN ('private','shared'));
ALTER TABLE board_notes ADD COLUMN x INTEGER NOT NULL DEFAULT 40;
ALTER TABLE board_notes ADD COLUMN y INTEGER NOT NULL DEFAULT 40;
ALTER TABLE board_notes ADD COLUMN layout_version INTEGER NOT NULL DEFAULT 1;
-- Keep existing shared notes and give them distinct starting positions.
WITH positions AS (SELECT id, row_number() OVER (ORDER BY created_at,id)-1 AS n FROM board_notes)
UPDATE board_notes SET x=40+340*((SELECT n FROM positions WHERE positions.id=board_notes.id)%4), y=40+420*CAST((SELECT n FROM positions WHERE positions.id=board_notes.id)/4 AS INTEGER);
CREATE INDEX board_notes_scope ON board_notes(scope,author_id,archived);
