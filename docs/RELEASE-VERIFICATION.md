# GroundProof release verification

Observed September 23, 2026. This is a software release record, not customer validation or aviation certification.

- **Product:** https://groundproof.groundproof.workers.dev
- **Repository:** https://github.com/shi1720/HTCJ
- **Application code commit:** `e1501cba47daecb96bcd31859427b84fc3779a02`
- **Cloudflare deployment version:** `490276e8-1e56-409e-a0f1-589e94dfad66`
- **Build:** TypeScript and Vite production build passed.
- **Native backend and rules:** 139 tests passed across eight files.
- **Cloudflare compatibility:** 143 tests passed across ten files. This includes the same native cases plus adapter cases; the counts are not additive.
- **Worker typecheck:** generated runtime types and strict TypeScript check passed.
- **Dependency audit:** zero reported vulnerabilities at the time of the check.
- **Public HTTP acceptance:** 34 assertions passed against the real HTTPS deployment, covering registration, authentication, tenant isolation, stale approvals, operator-record changes and exports.
- **Local browser acceptance:** eight desktop/mobile workflows passed against the built application, including live FAA retrieval and record-expiry behavior.

- **Public browser acceptance:** all eight workflows passed against the final HTTPS deployment in 2.6 minutes.
- **Accessibility:** zero serious or critical Axe findings on nine tested surfaces; WCAG2 A/AA and WCAG2.1 A/AA rule tags.
- **Clean Linux CI:** all steps passed, including build, both backend suites, Worker typecheck, audit and eight browser workflows. [GitHub Actions run](https://github.com/shi1720/HTCJ/actions/runs/35848318369).

- **Recorded demo:** 209.96 seconds of actual public-app footage, H.264 at 25 fps, with successful live Anakin capture and the 15-case rule lab. Clean and captioned variants are silent and ready for Shivam’s narration.
- **Recorded decision packet:** independently verified against the separately observed manifest digest, with `valid:true` and no errors.

## What was exercised

The suites cover a changed dependency revoking only dependent approvals, stale source-review rejection, required mission revisions, restored bytes not reviving old signatures, failed captures retaining prior text while holding work, expiry through a scheduled mission, provider allowance reservations, monitoring schedules and retries, account/session persistence, cross-workspace denial, and independent packet integrity checks.

Three rate-limit regression tests run with the actual limiter enabled. They verify HTTP429 with Retry-After, static/health availability without consuming API allowance, and isolation of trusted client buckets. This fixed a response-classification error found during the final browser pass.

Actual workerd checks covered persisted sessions after restart and an opt-in scheduled alarm capturing an FAA page without browser activity. The authenticated Anakin retrieval record is included separately. The product demonstration uses fictional jobs and simulated notices; it does not substitute those fixtures for the live provider proof.

## Limits of this evidence

Automated accessibility checks cover the tested routes and dialogs; they are not a complete accessibility certification. Mobile runs use Chromium emulation rather than physical devices. A checksum detects changed bytes against a trusted digest, not the truth of a source. A working cloud instance and covered tests do not establish capacity, field reliability, customer willingness to pay, or aviation approval.

The release supports one owner per workspace. Shared-team identity, self-service account recovery, billing, independently verified backup recovery, external security review and an operator pilot remain outside the completed acceptance record. Docker deployment instructions are supplied, but no successful container deployment is claimed.
