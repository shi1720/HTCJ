# Cloudflare runtime verification

Observed on September 23, 2026. This records engineering tests, not customer or flight validation. The release-wide report may contain later test counts.

| Check | Observed result |
| --- | --- |
| Worker-specific typecheck | `wrangler types workers/env.d.ts` then `tsc --project workers/tsconfig.json` passed |
| Backend suites with Worker router adapter | `vitest run --config workers/vitest.config.ts`: 140 tests passed across 9 files |
| Actual local workerd HTTP requests | `node scripts/smoke-worker.mjs http://localhost:8787 --registration`: 34 assertions passed |
| Public HTTPS HTTP requests | `node scripts/smoke-worker.mjs https://groundproof.groundproof.workers.dev --registration`: 34 assertions passed |
| Password authentication | Registration, duplicate-email rejection, scrypt login, session rotation and logout passed in actual workerd |
| Access controls | Mutation-origin rejection, cross-tenant exports/reviews, malformed route parameters and private source URL rejection passed |
| Evidence workflow | Closure invalidation, stale sign-off rejection, review, explicit reapproval and packet export passed |
| Operator records | Create, review, mission sign-off, changed record invalidation, obsolete edit rejection and prohibition on web capture passed |
| Durable persistence | Stopped Wrangler, restarted against the same storage directory, and reused the same session. Mission ID and invalidated approval remained unchanged |
| Real authenticated Anakin capture | Local workerd returned 5,930 characters from Boston filming guidance in 2,249 ms, with the configured-key flag true |
| Real Direct capture | FAA UAS webpage returned 9,111 extracted characters |
| Real scheduled alarm | Opt-in monitor captured the FAA webpage at 2026-09-23T10:08:14.687Z and moved its next due time forward 12 hours. It required no browser activity at capture time. Disabled the monitor after the check |
| Bundle size | Dry-run compressed Worker bundle approximately 445 KiB, below the free plan's 3 MiB limit |

The Node HTTP bridge runs the actual Fastify routes. The SQL adapter uses Durable Object SQLite, including schema migration version 4 and synchronous rollback. These checks do not establish concurrency capacity, recovery from provider-wide outages, backup recoverability, or suitability for live dispatch.

The public deployment is `https://groundproof.groundproof.workers.dev`. The 34-check public HTTP smoke run passed on that address. This verifies the API and storage workflow over HTTPS. The final local/public browser regression and demo recording are separate release gates and were still pending at this document update. Retest after the final deployment and use the final browser report for its actual results.
