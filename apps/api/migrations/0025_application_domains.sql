UPDATE apps SET
  redirects = CASE WHEN EXISTS (SELECT 1 FROM json_each(redirects) WHERE value='https://test.yildizroket.com/callback') THEN redirects ELSE json_insert(redirects,'$[#]','https://test.yildizroket.com/callback') END,
  origins = CASE WHEN EXISTS (SELECT 1 FROM json_each(origins) WHERE value='https://test.yildizroket.com') THEN origins ELSE json_insert(origins,'$[#]','https://test.yildizroket.com') END,
  launch_url = 'https://test.yildizroket.com/?starbase=1'
WHERE id='test-formu-web';

UPDATE apps SET
  redirects = CASE WHEN EXISTS (SELECT 1 FROM json_each(redirects) WHERE value='https://latex.yildizroket.com/callback') THEN redirects ELSE json_insert(redirects,'$[#]','https://latex.yildizroket.com/callback') END,
  origins = CASE WHEN EXISTS (SELECT 1 FROM json_each(origins) WHERE value='https://latex.yildizroket.com') THEN origins ELSE json_insert(origins,'$[#]','https://latex.yildizroket.com') END,
  launch_url = 'https://latex.yildizroket.com/?starbase=1'
WHERE id='yrt-latex-web';
