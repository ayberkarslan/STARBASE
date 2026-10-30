import fs from "node:fs";
import ts from "typescript";
import { z } from "zod";
const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const credentials = z.object({
  username: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,31}$/),
  password: z.string().min(12).max(128),
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
      ["get", "post", "put", "delete"].includes(n.expression.name.text)
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
      ]);
      const centralOnly =
        route.startsWith("/api/v1/admin/") ||
        route.startsWith("/api/v1/directory/") ||
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
              `return (${expression});`,
            )(z, credentials, usernamePattern);
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
