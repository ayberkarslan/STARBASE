import { spawnSync } from "node:child_process";
const username = process.argv[2];
if (!username || !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username))
  throw new Error(
    "usage: node scripts/owner.mjs <verified-username> [--remote]",
  );
const remote = process.argv.includes("--remote");
const query = `UPDATE users SET owner=1 WHERE username='${username}' AND verified=1 AND NOT EXISTS(SELECT 1 FROM users WHERE owner=1); SELECT username,owner,verified FROM users WHERE username='${username}';`;
const result = spawnSync(
  "npx",
  [
    "wrangler",
    "d1",
    "execute",
    "starbase",
    remote ? "--remote" : "--local",
    "--command",
    query,
  ],
  { cwd: new URL("../apps/api", import.meta.url), stdio: "inherit" },
);
process.exit(result.status ?? 1);
