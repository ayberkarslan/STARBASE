import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const data = join(root, ".firebase-data");
mkdirSync(data, { recursive: true, mode: 0o700 });
chmodSync(data, 0o700);
const metadata = join(data, "firebase-export-metadata.json");
if (!existsSync(metadata) && readdirSync(data).length) {
  throw new Error(
    "Incomplete Firebase export in .firebase-data; restore its metadata before starting.",
  );
}
const args = [
  join(root, "node_modules/firebase-tools/lib/bin/firebase.js"),
  "emulators:start",
  "--only",
  "auth",
  "--project",
  "demo-starbase",
  "--export-on-exit",
  data,
];
if (existsSync(metadata)) args.push("--import", data);
const child = spawn(process.execPath, args, {
  cwd: root,
  stdio: "inherit",
  detached: process.platform !== "win32",
});
// Keep Firebase in its own process group so Ctrl+C is forwarded only once.
const interrupt = () => child.kill("SIGINT");
const terminate = () => child.kill("SIGTERM");
process.on("SIGINT", interrupt);
process.on("SIGTERM", terminate);
child.on("error", () => {
  console.error("Could not start Firebase Auth Emulator.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", terminate);
  process.exitCode = code ?? 1;
});
