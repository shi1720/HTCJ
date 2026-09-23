# Backend integrity and security reassessment

Reviewed September 23, 2026 on the working tree following account recovery, password rotation and source-history implementation. This is a skeptical review by a contributing engineer, not an independent penetration test or a security certification. No live customer data was used.

## Fixes supported by regression evidence

- **Old-password login racing a reset:** login now rereads the current credential hash inside its session-creation transaction after asynchronous scrypt verification. A password verified against replaced credentials cannot create a new session. The regression suspends password verification, replaces credentials and revokes sessions, then confirms that the old login returns 401 and creates no session.
- **Concurrent recovery/password changes:** a saved recovery key is consumed transactionally. Credential mutations compare the current password/key version after asynchronous hashing. Competing resets cannot both succeed. Successful recovery or password change revokes all prior sessions and issues one current cookie. Keys have 256 random bits, are stored only as SHA-256 digests, and never appear in audit data.
- **Stale scheduled result overwriting a successful manual capture:** the scheduler previously interpreted a superseded capture's 409 as a new outage, marking the newer source unavailable and revoking its signature. It now records `monitor.superseded` and preserves the newer capture, schedule, review and approval. Two deferred-I/O regressions cover both a late successful result and a late failed request. This fixed a false-outage problem; it did not permit an unsafe approval.
- **History visibility and integrity:** authenticated operators can retrieve all retained source versions using source-scoped pagination. Cross-tenant sources and foreign cursors are denied; a changed archived payload without its matching digest fails closed. Existing envelopes remain verifiable without rewriting historical bytes for typography.

## Boundaries checked

SQL values remain parameterized and tenant-scoped. Source/site/job references are checked in the authenticated workspace. Review and sign-off are synchronous database transactions; sign-off requires exact evidence coverage, matching hashes and the current mission revision. Provider failures, declared expiry, natural freshness, explicit blocking and dependency changes cannot be bypassed using browser-supplied readiness. Government-source capture uses a hostname allowlist, bounded responses and explicit provider selection. Node additionally pins validated public DNS results; Workers relies on Cloudflare fetch egress and revalidates redirect URLs. Session cookies are HTTP-only and Secure in production, origin checks reject browser cross-site mutations, and authentication responses are not cached.

No unresolved authorization bypass was identified in the inspected paths. That statement is limited to this review and covered tests. It does not establish the absence of vulnerabilities.

## Concrete remaining risks and operating limits

| Risk or limit | Consequence and required operating practice |
| --- | --- |
| Public registration has no email ownership verification, invitation gate or CAPTCHA. Per-IP limits are process-local; durable identity budgets cover credential guessing, not account creation. | A distributed actor can create many accounts, grow audit/storage usage or exhaust the shared Anakin allowance. Keep a controlled pilot, monitor usage, and add edge abuse controls or invitation-based enrollment before broad public growth. Existing daily Anakin reservations bound supplier spend, but cannot promise fair availability. |
| One owner per workspace, with no organization membership, RBAC, MFA or SSO. | The product supports individual operator accountability. Do not market the current release as a shared enterprise team system or share one person's credentials among reviewers. |
| Recovery relies on a saved single-use key. | A stolen key grants account recovery; save it like a password. Losing both password and key leaves no self-service path. Recovery does not verify email ownership or personal identity. |
| Audit and packet digests are not externally signed or anchored. | A database administrator can rewrite records and recompute hashes. Packets establish internal integrity when compared with a trusted digest, not third-party authenticity, legal permission or flight authorization. Operators retain and verify original private documents. |
| History exists while its source is retained. Deleting an unreferenced source cascades to its snapshots. | Export needed evidence before deletion. The new history endpoint is not an indefinite regulatory archive; audit events remain, but deleted source content does not. |
| Archive limits are per workspace; account count and cumulative audit storage are not globally capped. Packet exports include relevant audit history without pagination. | Monitor total storage and unusually large exports. A long-lived high-volume workspace needs a documented archive/retention policy and eventually paginated audit export. The final in-flight capture may cross the approximate archive-byte threshold. |
| Full text is normalized for comparison and has no semantic relevance classifier. | Navigation, banners or formatting can trigger review, while a public page may omit an operator-specific obligation. Measure useful-alert rate and total review work in the pilot; human review and retained originals remain essential. |
| Monitoring and source availability are best effort. | Process/edge outages, provider delays and quota exhaustion can delay checks. Failed capture holds evidence rather than silently substituting a provider. Configure freshness windows with the operator and monitor service health independently. |
| A database backup includes credentials and session records. | Restrict backup access, test restoration separately, and revoke restored sessions after a security incident. Node SQLite is for a single instance; the published Worker uses one Durable Object database. No disaster-recovery SLA or independent restore certification is claimed. |
| The Firebase gateway adds a deployment boundary. | Its cookie translation, exact-origin validation, no-store policy, signed rate-limit metadata and actual public browser behavior require deployment acceptance. Local compatibility tests alone do not prove Firebase/Cloud Run or Cloudflare operational behavior. |

## Executed validation

- Native application TypeScript check passed.
- Worker TypeScript check passed.
- Native automated suite: **156 tests passed across 10 files**.
- Worker-inclusive compatibility suite: **162 tests passed across 13 files**. This includes the native tests; the counts are not additive. It exercises the adapter and gateway-signature rules in the repository test environment, not a substitute for a real workerd/public-host smoke test.
- The production frontend build passed before the final scheduler-only correction. Root/deployment acceptance owns the final build, public browser runs and release commit association.

Customer willingness to pay and the cost of maintaining private-record excerpts remain unvalidated. These backend improvements remove real workflow gaps; they do not raise the commercial evidence score by themselves. Retain the conservative internal rubric score until the revised public deployment and narration are accepted, then update only the criteria supported by that new evidence.
