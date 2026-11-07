INSERT OR IGNORE INTO apps(id,name,redirects,origins,scopes,launch_url,auto_authorize) VALUES(
  'yrt-latex-web',
  'YRT LaTeX',
  '["https://yrt-latex.web.app/callback","https://yrt-latex.firebaseapp.com/callback","https://latex.yildizroket.com/callback","http://127.0.0.1:5173/callback","http://localhost:5173/callback","http://127.0.0.1:4173/callback","http://localhost:4173/callback"]',
  '["https://yrt-latex.web.app","https://yrt-latex.firebaseapp.com","https://latex.yildizroket.com","http://127.0.0.1:5173","http://localhost:5173","http://127.0.0.1:4173","http://localhost:4173"]',
  '["profile","organization"]',
  'https://yrt-latex.web.app/?starbase=1',
  1
);
INSERT OR IGNORE INTO permissions(id,description) VALUES('yrt-latex-web.admin','YRT LaTeX yönetim ve şablon yetkisi');
