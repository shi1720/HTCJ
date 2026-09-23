# Free durable deployment

GroundProof can run on Cloudflare Workers with SQLite-backed Durable Objects and static assets. The pilot uses one Durable Object database; every application query remains tenant-scoped. This is a deliberate small-pilot topology, not a claim of global database scale.

## Build and verify

```sh
npm ci
npm run build
npx wrangler types workers/env.d.ts
npx tsc --project workers/tsconfig.json
npx vitest run --config workers/vitest.config.ts
npx wrangler dev --local --port 8787 --persist-to .wrangler/local --var PUBLIC_ORIGIN:http://localhost:8787
# In another terminal:
node scripts/smoke-worker.mjs http://localhost:8787 --registration
```

The registration option leaves a synthetic test account. Without it, the smoke script uses isolated demo workspaces, which expire through normal maintenance. No credentials are printed. Stop and restart Wrangler with the same persistence directory to check storage continuity.

## Deploy

Use the existing Cloudflare account and its free Workers plan. Do not enable a paid subscription merely to deploy this app.

```sh
npx wrangler login
npx wrangler deploy --var PUBLIC_ORIGIN:https://groundproof.groundproof.workers.dev
# Optional server-only secret, entered interactively:
npx wrangler secret put ANAKIN_API_KEY
node scripts/smoke-worker.mjs https://groundproof.groundproof.workers.dev --registration
```

The deployed origin is `https://groundproof.groundproof.workers.dev`, also recorded in `wrangler.jsonc`. Set `PUBLIC_ORIGIN` to the exact public HTTPS origin if the hostname changes. The Worker refuses nonlocal requests if it is missing. The Fastify application checks browser mutation origins against that value and uses Secure, HttpOnly, SameSite=Strict session cookies. The edge overwrites the private client-IP header from Cloudflare's CF-Connecting-IP value before passing it to the app's rate limiter. Client-supplied private headers and X-Forwarded-For are not used for that purpose. The default Anakin supplier budget is 30 capture attempts per UTC day across the deployment, with an additional demo-workspace cap. `ANAKIN_DAILY_LIMIT` can raise that ceiling only after reviewing credit availability. The Anakin secret must never be placed in frontend variables, screenshots, repository files, or command arguments. Confirm Anakin usage separately; an absent key does not establish successful live integration.

## Runtime implementation

- The same `server/app.ts` routes and hooks run through Cloudflare's official `handleAsNodeRequest` bridge. No alternate business-logic API is maintained.
- `workers/sqlite.ts` adapts only the synchronous SQL methods the application uses. SQL values remain bound parameters. Transactions use Durable Object `transactionSync`; cursors are fully consumed before an await. Since Durable SQL does not expose `PRAGMA user_version`, schema version lives in `_groundproof_metadata` and retains the application's migration guard.
- `workers/router-compat.ts` replaces four runtime-code-generation optimizations in **find-my-way 9.9.0** with equivalent closures. It refuses another version until reviewed. Zod uses its supported jitless mode. The complete backend, evidence, monitoring, provider, and packet test suites also run with this adapter enabled, alongside route-constraint tests. This compatibility layer is a maintenance obligation.
- Public-source captures use Cloudflare fetch, a strict government-domain allowlist, HTTPS, redirect checks at every hop, a 2 MB response cap, and timeouts. The Worker does **not** use the Node deployment's DNS pinning. Anakin traffic goes to a fixed HTTPS API host; results retain explicit provider provenance.
- Opt-in source monitoring runs through Durable Object alarms. Each alarm captures at most three due sources and schedules the next alarm. Frequent requests cannot push an existing alarm later. Failures preserve the last snapshot, invalidate prior signatures, and retain manual review requirements. Monitoring is off by default; browser visits are not required for an enabled alarm.
- Demo/session maintenance runs at initialization and at most hourly on requests. Data remains on Durable Object storage across Worker restarts and redeploys. Browser cookies are sessions, not the database.

## Limits and operations

The official Durable Objects free plan currently includes 100,000 requests/day, 13,000 GB-seconds/day, 5 million SQLite rows read/day, 100,000 rows written/day, and 5 GB total SQLite storage. Free-limit exhaustion causes operations to fail until the limit resets; the application must not be used as the only operational record. Alarms and request traffic consume quotas. Check the Cloudflare dashboard during the pilot and keep exports outside the service.

One database is a bottleneck and a failure domain. Before wider deployment, add tenant sharding, tested backup/recovery, operational alerting, verified account recovery, organization roles, and capacity tests. The hosted pilot does not replace operator procedures or aviation approvals. Anakin usage has separate provider limits and possible costs. Do not call a successful deployment customer validation.

Official references: [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [SQLite API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [Node HTTP bridge](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/). Reviewed September 23, 2026; verify before increasing scope.
