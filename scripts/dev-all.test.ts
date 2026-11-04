import { EventEmitter } from "node:events";
import { beforeEach, afterEach, expect, it, vi } from "vitest";

let children: (EventEmitter & { kill: ReturnType<typeof vi.fn> })[];
let handlers: Map<string, () => void>;
let blocked: number[];
let spawn: ReturnType<typeof vi.fn>;
let log: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
let originalExitCode: typeof process.exitCode;

beforeEach(() => {
  vi.resetModules();
  originalExitCode = process.exitCode;
  children = [];
  handlers = new Map();
  blocked = [];
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
  const on = process.on.bind(process);
  vi.spyOn(process, "on").mockImplementation(((
    event: string,
    listener: () => void,
  ) => {
    if (event === "SIGINT" || event === "SIGTERM") {
      handlers.set(event, listener);
      return process;
    }
    return on(event as any, listener);
  }) as typeof process.on);
  spawn = vi.fn(() => {
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(() => true),
    });
    children.push(child);
    return child;
  });
  vi.doMock("node:child_process", () => ({ spawn, execFileSync: vi.fn() }));
  vi.doMock("node:fs", () => ({
    readFileSync: (path: string) =>
      path.endsWith(".dev.vars")
        ? 'PUBLIC_ORIGIN="http://127.0.0.1:5174"\nFIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099\n'
        : JSON.stringify({
            emulators: { auth: { port: 9099 }, ui: { enabled: true } },
          }),
  }));
  vi.doMock("node:net", () => ({
    createServer: () => {
      const server = new EventEmitter() as EventEmitter & {
        listen: Function;
        close: Function;
      };
      server.listen = (port: number, _host: string, ready: () => void) => {
        queueMicrotask(() =>
          blocked.includes(port)
            ? server.emit("error", new Error("occupied"))
            : ready(),
        );
      };
      server.close = (done: () => void) => done();
      return server;
    },
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true })),
  );
});

afterEach(() => {
  for (const child of children) child.emit("exit", 0);
  process.exitCode = originalExitCode;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.doUnmock("node:child_process");
  vi.doUnmock("node:fs");
  vi.doUnmock("node:net");
});

it("leaves existing services untouched when a required port is occupied", async () => {
  blocked = [5174, 9099];
  await import("./dev-all.mjs");
  await vi.waitFor(() => expect(error).toHaveBeenCalled());
  expect(spawn).not.toHaveBeenCalled();
  expect(String(error.mock.calls[0][0])).toContain("5174");
  expect(String(error.mock.calls[0][0])).toContain("9099");
  expect(process.exitCode).toBe(1);
});

it("uses the configured web port and waits for writers before auth export", async () => {
  await import("./dev-all.mjs");
  await vi.waitFor(() =>
    expect(
      log.mock.calls.some((c) => String(c[0]).includes("STARBASE hazır")),
    ).toBe(true),
  );
  expect(spawn).toHaveBeenCalledTimes(3);
  expect(spawn.mock.calls[2][1]).toEqual(
    expect.arrayContaining(["--port", "5174", "--strictPort"]),
  );
  handlers.get("SIGINT")!();
  handlers.get("SIGINT")!();
  expect(children[1].kill).toHaveBeenCalledTimes(1);
  expect(children[2].kill).toHaveBeenCalledTimes(1);
  expect(children[0].kill).not.toHaveBeenCalled();
  children[1].emit("exit", 0);
  await Promise.resolve();
  expect(children[0].kill).not.toHaveBeenCalled();
  children[2].emit("exit", 0);
  await vi.waitFor(() => expect(children[0].kill).toHaveBeenCalledTimes(1));
  children[0].emit("exit", 0);
  await Promise.resolve();
  expect(process.exitCode).toBe(0);
});

it("shuts down remaining services after an unexpected API exit", async () => {
  await import("./dev-all.mjs");
  await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(3));
  children[1].emit("exit", 1);
  expect(children[2].kill).toHaveBeenCalledWith("SIGINT");
  expect(children[0].kill).not.toHaveBeenCalled();
  children[2].emit("exit", 0);
  await vi.waitFor(() =>
    expect(children[0].kill).toHaveBeenCalledWith("SIGINT"),
  );
  children[0].emit("exit", 0);
  await Promise.resolve();
  expect(process.exitCode).toBe(1);
});
