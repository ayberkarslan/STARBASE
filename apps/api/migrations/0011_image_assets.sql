CREATE TABLE image_assets (
  key TEXT PRIMARY KEY,
  content_type TEXT NOT NULL CHECK(content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  content BLOB NOT NULL CHECK(length(content) BETWEEN 1 AND 1048576)
);
