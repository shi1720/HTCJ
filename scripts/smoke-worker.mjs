/** Real HTTP checks: node scripts/smoke-worker.mjs http://localhost:8787
 * Demo accounts expire automatically. --registration additionally leaves one
 * uniquely named test workspace, to verify scrypt/password persistence.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
const base = (process.argv[2] || "http://localhost:8787").replace(/\/$/, "");
let cookie = "",
  passed = 0;
async function request(
  path,
  { method = "GET", body, session = cookie, origin = base, status = 200 } = {},
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(session ? { cookie: session } : {}),
      ...(method === "GET" ? {} : { origin }),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await response.text();
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${text.slice(0, 500)}`,
  );
  passed++;
  return {
    response,
    data: response.headers.get("content-type")?.includes("json")
      ? JSON.parse(text)
      : text,
  };
}
const health = await request("/api/health");
assert.equal(health.data.status, "ok");
await request("/api/state", { status: 401 });
await request("/api/demo/start", {
  method: "POST",
  origin: "https://attacker.example",
  status: 403,
});
const demo = await request("/api/demo/start", { method: "POST", status: 201 });
cookie = demo.response.headers.get("set-cookie").split(";")[0];
assert.match(demo.response.headers.get("set-cookie"), /HttpOnly/);
assert.match(demo.response.headers.get("set-cookie"), /SameSite=Strict/);
if (base.startsWith("https:"))
  assert.match(demo.response.headers.get("set-cookie"), /Secure/);
const initial = (await request("/api/state")).data;
assert.equal(initial.missions.length, 6);
assert(initial.missions.every((m) => m.assessment.status === "ready"));
const oldHashes = Object.fromEntries(
  initial.missions[0].sourceIds.map((id) => [
    id,
    initial.sources.find((s) => s.id === id).latest.hash,
  ]),
);
const changed = (
  await request("/api/demo/drill", {
    method: "POST",
    body: { scenario: "closure" },
  })
).data;
assert.equal(
  changed.missions
    .filter((m) => m.assessment.status === "review")
    .reduce((s, m) => s + m.value, 0),
  4800,
);
await request(`/api/missions/${initial.missions[0].id}/approve`, {
  method: "POST",
  body: {
    expectedRevision: initial.missions[0].revision ?? 0,
    expectedHashes: oldHashes,
    note: "Stale approval must fail.",
  },
  status: 409,
});
const source = changed.sources[0];
await request(`/api/sources/${source.id}/review`, {
  method: "POST",
  body: {
    expectedHash: source.latest.hash,
    decision: "accepted",
    note: "Synthetic smoke review of changed notice.",
  },
});
const reviewed = (await request("/api/state")).data;
assert.equal(reviewed.missions[0].approval, null);
const hashes = Object.fromEntries(
  reviewed.missions[0].sourceIds.map((id) => [
    id,
    reviewed.sources.find((s) => s.id === id).latest.hash,
  ]),
);
await request(`/api/missions/${reviewed.missions[0].id}/approve`, {
  method: "POST",
  body: {
    expectedRevision: reviewed.missions[0].revision ?? 0,
    expectedHashes: hashes,
    note: "Synthetic smoke internal evidence sign-off.",
  },
});
const packet = await request(`/api/missions/${reviewed.missions[0].id}/export`);
assert.match(packet.data.manifest.hash, /^[a-f0-9]{64}$/);
const other = await request("/api/demo/start", {
  method: "POST",
  status: 201,
  session: "",
});
const otherCookie = other.response.headers.get("set-cookie").split(";")[0];
await request(`/api/missions/${reviewed.missions[0].id}/export`, {
  session: otherCookie,
  status: 404,
});
await request(`/api/sources/${source.id}/review`, {
  method: "POST",
  session: otherCookie,
  body: {
    expectedHash: source.latest.hash,
    decision: "accepted",
    note: "Tenant isolation check.",
  },
  status: 404,
});
const lab = (await request("/api/lab/run", { method: "POST", body: {} })).data;
assert.equal(lab.passed, lab.total);
await request("/api/sources", {
  method: "POST",
  body: {
    title: "Blocked URL",
    url: "https://127.0.0.1/",
    category: "airspace",
    siteId: null,
    freshnessHours: 24,
  },
  status: 400,
});
await request("/api/missions/%ZZ/export", { status: 400 });
await request("/api/not-a-route", { status: 404 });
const supplied = {
  content:
    "Synthetic operator permission record for deployment verification. Access conditions must be reviewed by the responsible operator.",
  reference: "SMOKE-TEST-RECORD",
  validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
};
const record = (
  await request("/api/sources/record", {
    method: "POST",
    body: {
      ...supplied,
      title: "Synthetic operator evidence",
      category: "site-access",
      siteId: initial.sites[0].id,
      freshnessHours: 24,
    },
    status: 201,
  })
).data;
assert.equal(record.latest.provider, "manual");
await request(`/api/sources/${record.id}/review`, {
  method: "POST",
  body: {
    expectedHash: record.latest.hash,
    decision: "accepted",
    note: "Synthetic record review for smoke verification.",
  },
});
const recordMission = (
  await request("/api/missions", {
    method: "POST",
    body: {
      name: "Synthetic record-dependent job",
      client: "Smoke test",
      siteId: initial.sites[0].id,
      scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      value: 0,
      sourceIds: [record.id],
    },
    status: 201,
  })
).data;
await request(`/api/missions/${recordMission.id}/approve`, {
  method: "POST",
  body: {
    expectedRevision: recordMission.revision ?? 0,
    expectedHashes: { [record.id]: record.latest.hash },
    note: "Synthetic current record sign-off for test.",
  },
});
await request(`/api/sources/${record.id}/record`, {
  method: "POST",
  body: {
    ...supplied,
    expectedHash: record.latest.hash,
    content: supplied.content + " Revised access requires a new human review.",
  },
});
const afterRecord = (await request("/api/state")).data;
assert.equal(
  afterRecord.missions.find((m) => m.id === recordMission.id).approval,
  null,
);
await request(`/api/sources/${record.id}/capture`, {
  method: "POST",
  body: { provider: "direct" },
  status: 400,
});
await request(`/api/sources/${record.id}/record`, {
  method: "POST",
  body: { ...supplied, expectedHash: record.latest.hash },
  status: 409,
});
await request("/api/auth/logout", { method: "POST", body: {} });
await request("/api/state", { status: 401 });
if (process.argv.includes("--registration")) {
  cookie = "";
  const suffix = randomBytes(6).toString("hex"),
    email = `smoke-${suffix}@example.invalid`,
    password = `Smoke ${randomBytes(24).toString("base64url")}!`;
  const registered = await request("/api/auth/register", {
    method: "POST",
    body: {
      name: "Deployment smoke test",
      workspace: "Synthetic deployment verification",
      email,
      password,
    },
    status: 201,
  });
  cookie = registered.response.headers.get("set-cookie").split(";")[0];
  assert.equal((await request("/api/state")).data.missions.length, 0);
  await request("/api/auth/register", {
    method: "POST",
    session: "",
    body: { name: "Duplicate", workspace: "Duplicate", email, password },
    status: 409,
  });
  const old = cookie;
  const login = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  cookie = login.response.headers.get("set-cookie").split(";")[0];
  assert.notEqual(cookie, old);
  await request("/api/state", { session: old, status: 401 });
  await request("/api/auth/logout", { method: "POST", body: {} });
}
console.log(
  JSON.stringify(
    {
      base,
      passed,
      registration: process.argv.includes("--registration"),
      verified: [
        "real Fastify HTTP bridge",
        "Durable SQL workflow",
        "cookie flags",
        "origin enforcement",
        "hash-bound approval",
        "tenant isolation",
        "JSON export",
        "rule lab",
        "operator-record revisions",
        "session revocation",
      ],
    },
    null,
    2,
  ),
);
