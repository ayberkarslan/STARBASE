import fs from "node:fs";
import ts from "typescript";
import { z } from "zod";
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
      const auth =
        route.includes("/auth/") ||
        route.endsWith("/health") ||
        route.endsWith("/config");
      const op = {
        operationId: method + "_" + route.replace(/[^a-z0-9]/gi, "_"),
        tags: [f.replace(".ts", "")],
        security: auth ? [] : [{ bearer: [] }, { central: [] }],
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
      if (parameters.length) op.parameters = parameters;
      let schema;
      function findBody(v) {
        if (ts.isCallExpression(v) && v.expression.getText(ast) === "body") {
          const expression = v.arguments[1].getText(ast);
          try {
            schema = new Function(
              "z",
              "credentials",
              `return (${expression});`,
            )(z, credentials);
          } catch {}
        }
        ts.forEachChild(v, findBody);
      }
      findBody(n.arguments[n.arguments.length - 1]);
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
