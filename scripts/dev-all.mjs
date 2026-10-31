import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const services = [];
let stopping = false;
let shutdownPromise;

async function shutdown(code = 0) {
  if (shutdownPromise) return shutdownPromise;
  stopping = true;
  process.exitCode = code;
  if (services.length)
    console.log("\nSTARBASE kapanıyor; Firebase kaydının bitmesi bekleniyor…");
  shutdownPromise = (async () => {
    // Stop writers before exporting Auth. Never force-kill an export.
    for (const service of services.filter((s) => s.name !== "Firebase"))
      service.child.kill("SIGINT");
    await Promise.all(
      services.filter((s) => s.name !== "Firebase").map((s) => s.done),
    );
    const auth = services.find((s) => s.name === "Firebase");
    if (auth) {
      auth.child.kill("SIGINT");
      await auth.done;
    }
  })();
  return shutdownPromise;
}

function start(name, entry, args, cwd) {
  if (stopping) return;
  const child = spawn(process.execPath, [entry, ...args], {
    cwd,
    stdio: "inherit",
    detached: process.platform !== "win32",
  });
  const done = new Promise((resolve) => {
    child.once("error", () => {
      console.error(`${name} başlatılamadı.`);
      resolve();
      void shutdown(1);
    });
    child.once("exit", (code) => {
      resolve();
      if (!stopping) {
        console.error(`${name} kapandı (${code ?? "signal"}).`);
        void shutdown(1);
      }
    });
  });
  services.push({ name, child, done });
}

async function checkPort(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        new Error(
          `${port} portu kullanımda. Önceden açtığın ilgili servisi kendi terminalinden kapatıp tekrar dene.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}

async function main() {
  const vars = readFileSync(join(root, "apps/api/.dev.vars"), "utf8");
  const read = (key) => {
    const m = vars.match(
      new RegExp(`^\\s*${key}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|([^\\s#]+))`, "m"),
    );
    return m?.[1] ?? m?.[2] ?? m?.[3];
  };
  const origin = new URL(read("PUBLIC_ORIGIN"));
  if (
    origin.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(origin.hostname) ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  )
    throw new Error(
      ".dev.vars içindeki PUBLIC_ORIGIN yerel bir http adresi olmalı.",
    );
  if (read("FIREBASE_AUTH_EMULATOR_HOST") !== "127.0.0.1:9099")
    throw new Error(
      "Bu script yerel Firebase için FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 gerektirir.",
    );
  const webPort = Number(origin.port || 80);
  const config = JSON.parse(
    readFileSync(join(root, "firebase.json"), "utf8"),
  ).emulators;
  if ((config.auth?.port ?? 9099) !== 9099)
    throw new Error("Firebase Auth portu 9099 olmalı.");
  const ports = [
    webPort,
    8787,
    9099,
    config.hub?.port ?? 4400,
    config.logging?.port ?? 4500,
  ];
  if (config.ui?.enabled !== false) ports.push(config.ui?.port ?? 4000);
  if (new Set(ports).size !== ports.length)
    throw new Error("Servis portları birbiriyle çakışıyor.");
  const results = await Promise.allSettled(ports.map(checkPort));
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length)
    throw new Error(failures.map((r) => r.reason.message).join("\n"));
  if (stopping) return;
  const webRequire = createRequire(join(root, "apps/web/package.json"));
  const vite = join(
    dirname(webRequire.resolve("vite/package.json")),
    "bin/vite.js",
  );
  start("Firebase", join(root, "scripts/emulators.mjs"), [], root);
  start(
    "API",
    join(root, "node_modules/wrangler/wrangler-dist/cli.js"),
    ["dev", "--ip", "127.0.0.1", "--port", "8787"],
    join(root, "apps/api"),
  );
  start(
    "Arayüz",
    vite,
    ["--host", origin.hostname, "--port", String(webPort), "--strictPort"],
    join(root, "apps/web"),
  );
  const endpoints = [
    "http://127.0.0.1:9099/",
    "http://127.0.0.1:8787/api/v1/health",
    origin.origin + "/api/v1/config",
  ];
  const deadline = Date.now() + 60000;
  while (!stopping && Date.now() < deadline) {
    const ready = await Promise.all(
      endpoints.map(async (url) => {
        try {
          return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok;
        } catch {
          return false;
        }
      }),
    );
    if (stopping) return;
    if (ready.every(Boolean)) {
      console.log(
        `\nSTARBASE hazır: ${origin.origin}\nKapatmak için Ctrl+C; hesapların kaydedilmesini bekle.`,
      );
      return;
    }
    await delay(300);
  }
  if (!stopping)
    throw new Error(
      "Servisler 60 saniyede hazır olmadı; yukarıdaki servis mesajlarını kontrol et.",
    );
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
main().catch(async (error) => {
  if (stopping) return;
  console.error(
    error.code === "ENOENT"
      ? "Yerel kurulum eksik. README'deki kurulum adımlarını tamamla (.dev.vars ve npm ci)."
      : error.message,
  );
  await shutdown(1);
});
