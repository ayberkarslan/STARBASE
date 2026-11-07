INSERT OR IGNORE INTO roles(id, name) VALUES('admin', 'Yönetici');
INSERT OR IGNORE INTO roles(id, name) VALUES('member', 'Takım üyesi');

INSERT OR IGNORE INTO role_permissions(role_id, permission_id) VALUES
('admin', 'users.manage'),
('admin', 'organization.manage'),
('admin', 'apps.manage'),
('admin', 'roles.manage'),
('admin', 'board.manage');

ALTER TABLE users ADD COLUMN custom_title TEXT;
UPDATE users SET custom_title = 'Geliştirici Hesabı' WHERE username = 'ayberkarslan';

CREATE TABLE IF NOT EXISTS badges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tier INTEGER NOT NULL DEFAULT 1 CHECK(tier BETWEEN 1 AND 6),
  color TEXT NOT NULL DEFAULT '#ffffff',
  icon TEXT NOT NULL DEFAULT 'shield',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_badges (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  assigned_at INTEGER NOT NULL,
  assigned_by TEXT REFERENCES users(id),
  PRIMARY KEY(user_id, badge_id)
);

INSERT OR IGNORE INTO badges(id, name, description, tier, color, icon, created_at) VALUES
('developer', 'Geliştirici Hesabı', 'Sistem Baş Mimarı ve Geliştiricisi', 6, '#0bde0e', 'code', 1700000000),
('lead-avionics', 'Aviyonik Departman Lideri', 'Aviyonik Departmanı Liderliği', 4, '#38bdf8', 'crown', 1700000000),
('lead-propulsion', 'İtki Departman Lideri', 'İtki Departmanı Liderliği', 4, '#f97316', 'crown', 1700000000),
('lead-structures', 'Yapısal Departman Lideri', 'Yapısal Departmanı Liderliği', 4, '#a855f7', 'crown', 1700000000),
('lead-organization', 'Organizasyon Departman Lideri', 'Organizasyon Departmanı Liderliği', 4, '#ec4899', 'crown', 1700000000),
('lead-software', 'Aviyonik Yazılım Ekip Lideri', 'Aviyonik Yazılım Ekip Liderliği', 3, '#eab308', 'star', 1700000000),
('member-avionics-software', 'Aviyonik Yazılım Ekip Üyesi', 'Aviyonik Yazılım Ekibi', 1, '#ffffff', 'shield', 1700000000),
('member-avionics-hardware', 'Aviyonik Donanım Ekip Üyesi', 'Aviyonik Donanım Ekibi', 1, '#ffffff', 'shield', 1700000000),
('member-avionics-comms', 'Aviyonik Haberleşme Ekip Üyesi', 'Aviyonik Haberleşme Ekibi', 1, '#ffffff', 'shield', 1700000000),
('member-avionics-control', 'Aviyonik Kontrol Ekip Üyesi', 'Aviyonik Kontrol Ekibi', 1, '#ffffff', 'shield', 1700000000),
('member-structures-materials', 'Yapısal Malzeme Ekip Üyesi', 'Yapısal Malzeme Ekibi', 1, '#ffffff', 'shield', 1700000000),
('member-structures-recovery', 'Yapısal Kurtarma Ekip Üyesi', 'Yapısal Kurtarma Ekibi', 1, '#ffffff', 'shield', 1700000000),
('member-structures-aero', 'Yapısal Aerodinamik Ekip Üyesi', 'Yapısal Aerodinamik Ekibi', 1, '#ffffff', 'shield', 1700000000);

INSERT OR IGNORE INTO user_badges(user_id, badge_id, assigned_at)
SELECT id, 'developer', 1700000000 FROM users WHERE username = 'ayberkarslan';
