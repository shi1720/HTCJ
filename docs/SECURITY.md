# Security and trust model

GroundProof is an operational evidence tool. It does not make or approve flight decisions, predict safe weather, provide live airspace restrictions, validate legal permissions, or authenticate a public page's factual claims. Human operators retain those responsibilities.

## Implemented protections

- Scrypt password hashing with independent 24-byte random salts, N=16,384, r=8, p=1, 64-byte output; timing-safe comparison; identical unknown-account password work.
- Random 256-bit browser session secrets; only SHA-256 token digests are stored. HTTP-only, SameSite=Strict cookies; Secure cookies and HSTS in production; expiring sessions; login rotation; server-side logout revocation; startup/hourly cleanup of expired sessions and inactive demo accounts.
- Tenant-scoped database reads and writes. Every referenced source/site/job is checked inside the authenticated workspace. Registration starts empty; demo data is isolated for each visitor.
- Request-origin checks for mutations, cross-site Fetch Metadata rejection, no cross-origin API access, a restrictive production content security policy, and plain-text evidence rendering.
- A persistent identity-hash login budget of 10 attempts per 15 minutes complements IP throttles and survives restart; a successful sign-in clears its budget.
- Per-IP rate limits: 180 requests/minute overall, 12/minute registration/login, 10/minute demo creation, 30/minute capture. Public deployments behind a reverse proxy must account for proxy IP attribution as described in deployment notes.
- Validated payloads and bounded request/capture sizes; two simultaneous captures per workspace/eight per process; a 100 MiB or 10,000-snapshot archive threshold. Public HTTPS domain allowlist; redirect validation; public-address checks; DNS pinning; no user-controlled browser code or arbitrary endpoint proxies.
- SQLite foreign keys, WAL and transactional review/sign-off/mutation operations. Exact evidence hashes and required-source coverage are checked again at signature time. Any source change, outage, explicit block or refreshed expiry revokes dependent signatures and advances a persisted mission revision. Sign-off requires the opened revision as well as exact hashes; planning edits and A→B→A source restoration cannot reuse a stale dialog.
- Snapshot hash checks during assessment, review, sign-off and export. Audit events for workspace mutations, evidence decisions, signatures, scenario injection and exports. Exported SHA-256 manifests detect changes when compared against a trusted digest.
- Anakin attempted-call reservations are durable and atomic: 30/day across the deployment by default and 3/day per demo workspace. Exhaustion fails closed without hidden provider substitution.
- Operator-record text, reference and declared expiry share a hash-bound envelope. The original document and its authenticity remain the operator’s responsibility; no PDF/signature verification is claimed.
- API keys remain server-side; error responses exclude stack traces. Production logs should still be treated as sensitive operational data.

The automated integration suite covers tenant isolation, source/sign-off races, restore revocation, natural expiry, stale reviews, cached-source outages, session rotation/revocation, persistence, manifest verification and corrupted snapshot rejection. Provider and evidence-rule suites cover source parsing, address validation and fail-closed assessment. These tests are evidence of covered behaviors, not a certification or penetration test.

## Current boundaries

The SQLite audit log is an application audit trail, not a tamper-proof ledger. A database administrator can modify data; SHA-256 alone cannot establish independent provenance. There is no trusted timestamp service, external signature authority, encryption-at-rest key management, RBAC, shared organization membership, SSO, MFA, email verification, self-service password recovery, or external security audit in this release. Deploy as a limited pilot with designated accounts and controlled access. Do not store credentials, personal travel records, protected aircraft information or other sensitive operational material in source URLs or evidence text.

Public source capture is on demand unless an operator explicitly enables monitoring for that source. Monitoring uses persisted schedules, a minimum one-hour interval, bounded work per tick, and failure backoff. It is best effort; no real-time or live FAA feed is implied. Government pages can change, omit context, or fail to represent a specific operator's obligations. An accepted review is an operator record, not independent validation of its correctness. A planned job's value is user-entered context, not measured revenue or proven loss prevention.

Secrets belong in the deployment secret store or a local untracked `.env`. API users should not send secrets through source URL query strings. Backups need access controls and retention policies appropriate to the pilot. A real deployment should add identity lifecycle controls, verified recovery, service-health monitoring, backup restoration drills, and an external review before expanded access.

## Reporting an issue

Report security issues privately to the repository owner. Do not include live credentials or personal data in a public issue. Preserve a minimal reproducible case, affected version and expected vs. observed access boundary.
