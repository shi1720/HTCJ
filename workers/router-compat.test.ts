import { describe, expect, it } from "vitest";
import Router from "find-my-way";

describe("Workers router closure compatibility", () => {
  it("matches static, parameter, wildcard and HTTP method routes without cross-routing", () => {
    const router = Router(),
      handler = () => {};
    router.on("GET", "/api/sites/:siteId", handler, { kind: "site" });
    router.on("POST", "/api/sites/:siteId/review", handler, { kind: "review" });
    router.on("GET", "/api/sites/archive", handler, { kind: "archive" });
    router.on("GET", "/assets/*", handler, { kind: "asset" });
    expect(router.find("GET", "/api/sites/a%20b")?.params).toEqual({
      siteId: "a b",
    });
    expect(router.find("GET", "/api/sites/archive")?.store.kind).toBe(
      "archive",
    );
    expect(router.find("POST", "/api/sites/a/review")?.store.kind).toBe(
      "review",
    );
    expect(router.find("GET", "/api/sites/a/review")).toBeNull();
    expect(router.find("GET", "/api/sitez/a")).toBeNull();
    expect(router.find("GET", "/assets/logo.svg")?.params["*"]).toBe(
      "logo.svg",
    );
    expect(router.find("GET", "/api/sites/%ZZ")).toBeNull();
  });
  it("preserves host and must-match version constraints", () => {
    const router = Router(),
      handler = () => {};
    router.on("GET", "/version", handler, { kind: "fallback" });
    router.on(
      "GET",
      "/version",
      { constraints: { version: "1.2.0" } },
      handler,
      { kind: "version" },
    );
    router.on("GET", "/host", handler, { kind: "fallback" });
    router.on(
      "GET",
      "/host",
      { constraints: { host: "example.com" } },
      handler,
      { kind: "host" },
    );
    expect(router.find("GET", "/version", { version: "1.x" })?.store.kind).toBe(
      "version",
    );
    expect(router.find("GET", "/version", { version: "2.x" })).toBeNull();
    expect(router.find("GET", "/version")?.store.kind).toBe("fallback");
    expect(
      router.find("GET", "/host", { host: "example.com" })?.store.kind,
    ).toBe("host");
    expect(router.find("GET", "/host", { host: "other.com" })?.store.kind).toBe(
      "fallback",
    );
  });
});
