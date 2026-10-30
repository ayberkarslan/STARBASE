import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
const directory = mkdtempSync(join(tmpdir(), "starbase-sdk-"));
const pkg = join(directory, "node_modules/@starbase/sdk");
mkdirSync(pkg, { recursive: true });
const unpack = spawnSync(
  "tar",
  [
    "-xzf",
    resolve("apps/web/public/downloads/starbase-sdk.tgz"),
    "--strip-components=1",
    "-C",
    pkg,
  ],
  { stdio: "inherit" },
);
if (unpack.status !== 0) process.exit(unpack.status ?? 1);
const sdk = await import(pathToFileURL(join(pkg, "dist/index.js")).href);
if (!sdk.Starbase || !sdk.StarbaseError) throw new Error("SDK exports missing");
writeFileSync(
  join(directory, "consumer.ts"),
  `import {Starbase,StarbaseError,type Profile,type ApplicationHistory} from '@starbase/sdk';\nconst client=new Starbase({baseUrl:'https://starbase.example',clientId:'demo',redirectUri:'https://app.example/callback'});\nconst profile:Promise<Profile>=client.getProfile();\nconst history:Promise<ApplicationHistory>=client.getApplicationHistory();\n`,
);
const types = spawnSync(
  process.execPath,
  [
    resolve("node_modules/typescript/bin/tsc"),
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--target",
    "ES2022",
    "--module",
    "ESNext",
    "--moduleResolution",
    "Bundler",
    "--lib",
    "ES2022,DOM",
    "consumer.ts",
  ],
  { cwd: directory, stdio: "inherit" },
);
if (types.status !== 0) process.exit(types.status ?? 1);
console.log("standalone SDK JavaScript and declarations verified");
