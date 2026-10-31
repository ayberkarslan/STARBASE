import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Starbase } from "./index";
import { StarbaseAuthProvider, useStarbase, useStarbaseAuth } from "./react";

const client = new Starbase({
  baseUrl: "https://starbase.test",
  clientId: "example-web",
  redirectUri: "https://example.test/callback",
});

function AuthProbe() {
  const auth = useStarbaseAuth();
  const starbase = useStarbase();
  return React.createElement(
    "span",
    null,
    `${auth.snapshot.status}:${starbase === auth.client}`,
  );
}

describe("StarbaseAuthProvider", () => {
  it("provides initial state and the shared SDK client to app components", () => {
    const html = renderToString(
      React.createElement(
        StarbaseAuthProvider,
        { client, scopes: ["profile"] },
        React.createElement(AuthProbe),
      ),
    );

    expect(html).toContain("checking:true");
  });

  it("requires the provider when reading auth state", () => {
    function MissingProvider() {
      useStarbaseAuth();
      return null;
    }

    expect(() => renderToString(React.createElement(MissingProvider))).toThrow(
      "StarbaseAuthProvider required",
    );
  });
});
