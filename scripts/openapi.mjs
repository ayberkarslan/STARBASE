import fs from "node:fs";
import ts from "typescript";
import { z } from "zod";
const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const credentials = z.object({
  username: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,31}$/),
  password: z.string().min(12).max(128),
});
const fields = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(2000),
  kind: z.enum(["note", "announcement"]),
  teamId: z.string().min(1).nullable(),
  dueAt: z.number().int().min(0).max(4102444800).nullable(),
});
const spec = {
  openapi: "3.1.0",
  info: {
    title: "STARBASE API",
    version: "0.1.0",
    description: "STARBASE SDK protocol; not an OIDC provider.",
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: {
      bearer: { type: "http", scheme: "bearer" },
      central: { type: "apiKey", in: "cookie", name: "starbase" },
    },
  },
  paths: {},
};
for (const f of fs
  .readdirSync("apps/api/src/routes")
  .filter((f) => f.endsWith(".ts"))) {
  const source = fs.readFileSync("apps/api/src/routes/" + f, "utf8");
  const ast = ts.createSourceFile(f, source, ts.ScriptTarget.Latest, true);
  function visit(n) {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.expression.getText(ast) === "app" &&
      ["get", "post", "put", "patch", "delete"].includes(n.expression.name.text)
    ) {
      const method = n.expression.name.text;
      const route = n.arguments[0].text;
      if (!route) return;
      const path = route.replace(/:([\w]+)/g, "{$1}");
      const publicRoutes = new Set([
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/auth/recover",
        "/api/v1/auth/resend",
        "/api/v1/auth/verify",
        "/api/v1/auth/reset",
        "/api/v1/auth/exchange",
        "/api/v1/auth/refresh",
        "/api/v1/health",
        "/api/v1/config",
        "/api/v1/apps/:id/branding",
      ]);
      const centralOnly =
        (route === "/api/v1/me/photo" && method !== "get") ||
        route.startsWith("/api/v1/admin/") ||
        route.startsWith("/api/v1/directory/") ||
        route.startsWith("/api/v1/board/") ||
        [
          "/api/v1/authorize",
          "/api/v1/connections",
          "/api/v1/sessions",
          "/api/v1/auth/password",
          "/api/v1/auth/logout-all",
        ].some((prefix) => route === prefix || route.startsWith(prefix + "/"));
      const op = {
        operationId: method + "_" + route.replace(/[^a-z0-9]/gi, "_"),
        tags: [f.replace(".ts", "")],
        security: publicRoutes.has(route)
          ? []
          : route === "/api/v1/me/live"
            ? [{ bearer: [] }]
          : centralOnly
            ? [{ central: [] }]
            : [{ bearer: [] }, { central: [] }],
        responses: {
          200: { description: "Successful operation" },
          400: { description: "Invalid input" },
          401: { description: "Invalid or expired session" },
          403: { description: "Permission denied" },
          429: { description: "Rate limited" },
          503: { description: "Dependency or quota unavailable" },
        },
      };
      if (route.startsWith("/api/v1/board/notes/")) {
        op.responses[404] = {
          description:
            "Note not found or private note owned by another account",
        };
        op.responses[409] = {
          description: "Stale content version or layoutVersion",
        };
      }
      const parameters = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
        name: m[1],
        in: "path",
        required: true,
        schema: { type: "string" },
      }));
      if (route === "/api/v1/directory/users")
        for (const name of ["q", "departmentId", "teamId"])
          parameters.push({
            name,
            in: "query",
            required: false,
            schema: {
              type: "string",
              ...(name === "q" ? { maxLength: 80 } : {}),
            },
          });
      if (route === "/api/v1/admin/activity") {
        for (const [name, schema] of [
          ["page", { type: "integer", minimum: 1, maximum: 10000, default: 1 }],
          ["q", { type: "string", maxLength: 80 }],
          ["source", { type: "string", enum: ["all", "starbase", "application"] }],
          ["userId", { type: "string", maxLength: 100 }],
        ]) parameters.push({ name, in: "query", required: false, schema });
      }
      if (
        route === "/api/v1/directory/users" ||
        route.endsWith("/activity") ||
        route === "/api/v1/me/applications"
      )
        parameters.push({
          name: "page",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 10000, default: 1 },
        });
      if (
        method === "get" &&
        (route === "/api/v1/board/notes" || route === "/api/v1/board/live")
      ) {
        parameters.push({
          name: "scope",
          in: "query",
          required: false,
          schema: {
            type: "string",
            enum: ["private", "shared"],
            default: "private",
          },
        });
      }
      if (method === "get" && route === "/api/v1/board/notes") {
        parameters.push({
          name: "page",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, default: 1 },
        });
        parameters.push({
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer", minimum: 1, maximum: 200, default: 24 },
        });
        for (const name of ["kind", "teamId", "archived"])
          parameters.push({
            name,
            in: "query",
            required: false,
            schema: { type: "string" },
          });
      }
      if (route === "/api/v1/board/live") {
        delete op.responses[200];
        op.responses[101] = {
          description: "WebSocket subscription; invalidation-only frames",
        };
        parameters.push({
          name: "Upgrade",
          in: "header",
          required: true,
          schema: { type: "string", enum: ["websocket"] },
        });
      }
      if (parameters.length) op.parameters = parameters;
      let schema;
      let created = false;
      function findBody(v) {
        if (
          ts.isCallExpression(v) &&
          ts.isPropertyAccessExpression(v.expression) &&
          v.expression.name.text === "json" &&
          v.arguments[1]?.getText(ast) === "201"
        )
          created = true;
        if (ts.isCallExpression(v) && v.expression.getText(ast) === "body") {
          const expression = v.arguments[1].getText(ast);
          try {
            schema = new Function(
              "z",
              "credentials",
              "usernamePattern",
              "fields",
              `return (${expression});`,
            )(z, credentials, usernamePattern, fields);
          } catch {}
        }
        ts.forEachChild(v, findBody);
      }
      findBody(n.arguments[n.arguments.length - 1]);
      if (created) {
        delete op.responses[200];
        op.responses[201] = { description: "Resource created" };
      }
      if (schema)
        op.requestBody = {
          required: true,
          content: {
            "application/json": {
              schema: z.toJSONSchema(schema, {
                io: "input",
                unrepresentable: "any",
              }),
            },
          },
        };
      (spec.paths[path] ??= {})[method] = op;
    }
    ts.forEachChild(n, visit);
  }
  visit(ast);
}
fs.writeFileSync(
  "apps/api/src/openapi.json",
  JSON.stringify(spec, null, 2) + "\n",
);
