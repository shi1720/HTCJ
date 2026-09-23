import { test } from "node:test";
import assert from "node:assert/strict";
import { createGateway, firebaseCookie, gatewaySignature } from "./server.mjs";
const secret = "test-only-32-character-gateway-secret",
  origin = "https://groundproof-flight.web.app",
  upstream = "https://groundproof.groundproof.workers.dev";
async function fixture(handler) {
  const app = createGateway({
    secret,
    upstreamOrigin: upstream,
    publicOrigins: [origin],
    fetchImpl: handler,
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${app.address().port}`,
    close: () => new Promise((resolve) => app.close(resolve)),
  };
}
test("session cookie adapter accepts one exact session token only", () => {
  assert.equal(
    firebaseCookie("__session=" + "a".repeat(64)),
    "groundproof_session=" + "a".repeat(64),
  );
  assert.equal(firebaseCookie("groundproof_session=" + "a".repeat(64)), "");
  assert.equal(firebaseCookie("__session=bad"), "");
  assert.equal(
    firebaseCookie(
      "__session=" + "a".repeat(64) + "; __session=" + "b".repeat(64),
    ),
    "",
  );
});
test("same-origin login forwards bounded body and translates secure cookies without caching", async () => {
  let received;
  const f = await fixture(async (url, options) => {
    received = { url, options };
    return new Response('{"user":{"id":"demo"}}', {
      status: 201,
      headers: {
        "content-type": "application/json",
        "set-cookie":
          "groundproof_session=" +
          "a".repeat(64) +
          "; Path=/; HttpOnly; Secure; SameSite=Strict",
        "cache-control": "public,max-age=3600",
      },
    });
  });
  try {
    const response = await fetch(f.url + "/api/auth/login", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        cookie: "__session=" + "b".repeat(64),
        "x-groundproof-gateway-network": "1.1.1.1",
      },
      body: '{"email":"test@example.invalid"}',
    });
    assert.equal(response.status, 201);
    assert.match(response.headers.get("set-cookie"), /^__session=/);
    assert.match(
      response.headers.get("set-cookie"),
      /HttpOnly; Secure; SameSite=Strict/,
    );
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(received.options.headers.get("origin"), upstream);
    assert.equal(
      received.options.headers.get("cookie"),
      "groundproof_session=" + "b".repeat(64),
    );
    assert.equal(
      received.options.headers.get("x-groundproof-gateway-network"),
      "127.0.0.1",
    );
    assert.equal(
      received.options.headers.get("x-groundproof-gateway-signature"),
      gatewaySignature(
        secret,
        received.options.headers.get("x-groundproof-gateway-time"),
        "POST",
        "/api/auth/login",
        "127.0.0.1",
      ),
    );
  } finally {
    await f.close();
  }
});
test("rejects forged origin, cross-site requests, oversized bodies and unexpected upstream redirects", async () => {
  let calls = 0;
  const f = await fixture(async () => {
    calls++;
    return new Response(null, {
      status: 302,
      headers: { location: "https://evil.example" },
    });
  });
  try {
    for (const headers of [
      { origin: "https://evil.example" },
      { origin, "sec-fetch-site": "cross-site" },
    ])
      assert.equal(
        (await fetch(f.url + "/api/demo/start", { method: "POST", headers }))
          .status,
        403,
      );
    assert.equal(
      (
        await fetch(f.url + "/api/sources", {
          method: "POST",
          headers: { origin },
          body: "x".repeat(256 * 1024 + 1),
        })
      ).status,
      413,
    );
    assert.equal(calls, 0);
    assert.equal((await fetch(f.url + "/api/health")).status, 502);
    assert.equal(calls, 1);
  } finally {
    await f.close();
  }
});
