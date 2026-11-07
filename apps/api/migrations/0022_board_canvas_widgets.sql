ALTER TABLE board_notes ADD COLUMN item_type TEXT NOT NULL DEFAULT 'note' CHECK(item_type IN ('note','announcement','shortcut','text','drawing','checklist'));
ALTER TABLE board_notes ADD COLUMN item_data TEXT NOT NULL DEFAULT '{}';
UPDATE board_notes SET item_type = kind WHERE kind = 'announcement';
