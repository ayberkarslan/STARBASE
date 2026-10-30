import { mkdirSync, copyFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
mkdirSync("artifacts", { recursive: true });
const result = spawnSync(
  "npm",
  ["pack", "-w", "@starbase/sdk", "--pack-destination", "artifacts"],
  { stdio: "inherit", timeout: 60000 },
);
if (result.status !== 0) process.exit(result.status ?? 1);
const pkg = JSON.parse(readFileSync("packages/sdk/package.json", "utf8"));
mkdirSync("apps/web/public/downloads", { recursive: true });
copyFileSync(
  `artifacts/starbase-sdk-${pkg.version}.tgz`,
  "apps/web/public/downloads/starbase-sdk.tgz",
);
