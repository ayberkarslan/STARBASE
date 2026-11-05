-- Exact callback origins for the Test Formu web client.
INSERT OR IGNORE INTO apps(id,name,redirects,origins,scopes)
VALUES (
  'test-formu-web',
  'YRT Test Takvimi',
  '["https://yrt-test-takvimi.web.app/callback","https://yrt-test-takvimi.firebaseapp.com/callback","http://localhost:5173/callback","http://127.0.0.1:5173/callback"]',
  '["https://yrt-test-takvimi.web.app","https://yrt-test-takvimi.firebaseapp.com","http://localhost:5173","http://127.0.0.1:5173"]',
  '["profile","organization"]'
);
