CREATE TABLE invites(hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires INTEGER NOT NULL,created_by TEXT REFERENCES users(id));
INSERT INTO roles VALUES('member','Takım üyesi');
