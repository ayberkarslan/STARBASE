ALTER TABLE apps ADD COLUMN auto_authorize INTEGER NOT NULL DEFAULT 0;
UPDATE apps SET auto_authorize=1 WHERE id='test-formu-web';
