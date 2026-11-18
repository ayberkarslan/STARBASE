CREATE TABLE calendar_tests (
  id TEXT PRIMARY KEY,
  team_project TEXT NOT NULL,
  test_type_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  report_code TEXT NOT NULL DEFAULT '',
  report_revision INTEGER,
  test_number INTEGER,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  url TEXT NOT NULL,
  pre_report_ready INTEGER NOT NULL DEFAULT 0,
  test_report_ready INTEGER NOT NULL DEFAULT 0,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  image_count INTEGER NOT NULL DEFAULT 0,
  video_count INTEGER NOT NULL DEFAULT 0,
  data_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX calendar_tests_date_idx ON calendar_tests(date,id);
