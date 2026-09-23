# GroundProof final skeptical review

Reviewed September 23, 2026 against the challenge's six weighted criteria. **Provisional score: 80.5 / 100.** This is an internal engineering/product review, not organizer feedback, customer validation, a security certification, or a prediction of winning. The reviewer contributed to the backend and then performed a deliberately skeptical reassessment; it is not an independent third-party audit. The final public Cloudflare deployment at `https://groundproof.groundproof.workers.dev` and its complete browser workflow were still being validated when this review was finalized. The score is conditional on those release gates; it does not treat a deployment URL as proof of a completed production acceptance test.

The product has moved beyond the preliminary architecture assessment in `RUBRIC.md`: a person can create an account, assemble evidence dependencies, inspect real captured text, review a version, sign a mission, change a dependency, and export a verifiable record. The most credible differentiation is the deliberately demonstrated inability to reuse an obsolete approval. Subsequent operator-record ingestion, declared-validity checks, opt-in monitoring and stale-dialog revision binding resolved concrete workflow gaps found in this review. The principal unresolved weakness is demonstrated customer value, not a missing dashboard feature.

## Weighted rubric

| Criterion | Weight | Score / 10 | Weighted points | Evidence and deduction |
| --- | ---: | ---: | ---: | --- |
| Problem relevance | 20 | 8.0 | 16.0 | A specific user, recurring drone inspection jobs and a concrete stale-approval failure are easy to understand. The causal example identifies three affected jobs rather than making an abstract safety claim. Deduction: no operator has confirmed incidence, burden or purchasing priority. |
| Innovation + differentiation | 15 | 7.5 | 11.25 | Version-bound approvals, dependency propagation, hash-bound operator references/validity, mission revision binding after restore, and portable evidence combine into a coherent narrow workflow. Deduction: hashes, scraping, approvals and checklists are established techniques; no evidence establishes exclusivity or a defensible moat. The competitor discussion correctly avoids unsupported feature-absence claims. |
| Technical execution | 20 | 9.0 | 18.0 | Integrated React/Fastify/SQLite product; isolated accounts; scrypt/session controls; server-authoritative rules; transactional checks; stale-write rejection; conservative outage handling; explicit source monitoring; typed requests; packet verification. Strict TypeScript and 136 automated checks passed in this review. Deduction: Cloudflare adapter production behavior, operational recovery and shared-team identity are not established by local tests. |
| PROOF / demonstration | 20 | 9.0 | 18.0 | Six-job demonstration has a reproducible three-job/$4,800 dependency effect, separate source review and mission signature, failure drills, audit history, downloadable packets and a 15-case live rule lab. Browser coverage includes the real-account workflow and Direct FAA capture. A dated real authenticated Anakin retrieval returned 5,930 characters in 2,458 ms. Deduction: authored scenarios and one retrieval prove covered behaviors, not field reliability; the final public deployment still needs its acceptance record. |
| Pilot readiness + feasibility | 15 | 7.5 | 11.25 | Four-week shadow pilot, explicit responsibility boundaries, operator-supplied records tied to retained originals, declared validity through scheduled jobs, optional source monitoring, supplier budgets, source coverage metrics and deployment/security notes. Deduction: no partner, verified recovery exercise, organization/RBAC support, identity recovery, external security review or agreement covering actual customer sources. |
| Impact + commercial potential | 10 | 6.0 | 6.0 | A named buyer and editable time-value model make the commercial case testable. The model admits a low-volume customer may not recover the subscription cost. Deduction: willingness to pay, useful-alert rate and source coverage are unvalidated; private records require operator entry and checks against retained originals; any added administration may reduce the proposed time saving. |
| **Total** | **100** | | **80.5 / 100** | **Strong demonstrable engineering; market fit and deployment proof remain the limiting evidence.** |

Public deployment alone should increase only deployment-related confidence. A polished recording should not increase the commercial or customer-validation score. The successful Anakin retrieval supports the Anakin integration claim; it is not proof of the aviation decision workflow's field performance.

## Checks actually reviewed

- `npx tsc --noEmit`: passed on the reviewed working tree.
- `npx vitest run`: **136 passed across seven test files** on September 23, 2026. Tests cover evidence rules, public-source protections, authenticated APIs, packet verification, monitoring, operator records and supplier budgets. Record the final release commit alongside the final execution report; the working tree was still receiving deployment/UI changes during review.
- API regressions exercise cross-workspace access and reference denial, session rotation/revocation, restart persistence, durable login budgets, inactive-demo cleanup, stale review/hash rejection, simultaneous sign-off/source changes, restore revocation, same-byte refresh after expiry, snapshot tampering, capture concurrency, audit identity collisions, changed mission revisions and stale dialogs after A→B→A source restoration.
- Monitoring tests exercise opt-in/default-off behavior, change-triggered revocation, outage preservation and backoff, recovery without automatic sign-off, overlapping ticks, disabling while in flight, the three-source tick budget and tenant/fixture rejection.
- Operator-record tests exercise manual provenance, reference/validity envelope hashes, stale updates, reference-only changes, immutable previous snapshots, concurrent edits, expiry before the job, web-capture/monitor refusal and tenant checks. Supplier-budget tests cover per-demo and global limits, failed-call reservation, explicit Direct choice and global counters surviving demo cleanup.
- Packet tests independently encode the documented canonical format, verify snapshot hashes and reject altered payloads, mismatched trusted digests, wrong coverage, false readiness, future timestamps, site mismatches and inconsistent fixture labels.
- Existing Playwright source covers desktop/mobile workflows, fresh registration and real Direct FAA capture, source-monitor enable/pause, mission edit/re-sign, independent demo isolation, export integrity, keyboard dialog closure and responsive containment. A final rerun after the latest backend restart was pending at review time; authored tests are not substituted for an execution result.
- Reviewed `anakin-integration-proof.json`: authenticated Anakin capture of Boston’s official filming-permit guidance at **2026-09-23 10:06:40 UTC**, **5,930 characters**, **2,458 ms**, `success:true`. This is one measured retrieval, not a benchmark or evidence of source completeness.
- Reviewed the actual overview and source-review screenshots. The visual hierarchy makes the dependency event, affected value and review action legible, while preserving simulation and navigation-scope labels. This strengthens communication, not proof of customer need.

## Recording and status accuracy

| Demonstrated action | Actual behavior to narrate |
| --- | --- |
| Initial demo | Six missions, three sites, five fixture sources; all six display **Review complete**. |
| Simulated closure | Exactly three dependent approvals are revoked. Their status is **Needs review** (`review`), not yet the explicit **On hold** (`hold`) state. Their combined illustrative value is $4,800. |
| Reviewer selects a blocking decision | The three dependent missions display **On hold**. |
| Restore notice | Original content can return, but previous signatures remain revoked and evidence needs review. |
| Accept restored evidence | This does not restore any mission signature. Dependent missions still need fresh sign-off. |
| Sign one affected mission | Only that mission returns to **Review complete**; unaffected missions remain unchanged. |
| Source unavailable or freshness expired | Dependent missions display **On hold**; the last successful snapshot is retained. |
| Edit a mission's time or other planning details | The persisted prior signature is removed and mission revision advances; stale dialogs cannot sign the edited job. The UI supports editing. |
| Supply a private-record excerpt | Text, reference and optional declared expiry are visibly operator-supplied and hash-bound. Separate review/sign-off is required; original-document authenticity is not verified. |
| Record expires before the appointment | A declared expiry at or before scheduled time holds that mission even if the record is valid today. |
| Proof lab | The current lab executes **15** cases. The repository's **136** automated tests are a separate count. Do not confuse them. |
| Export packet | Verifies recorded content and internal consistency. An embedded digest is not a digital signature, source authenticity proof or flight authorization. |

The quoted narration in `DEMO-SCRIPT.md` and `VIDEO-NARRATION.txt` both contain **402 words** in the reviewed version. At 140–150 words/minute this is approximately 2:41–2:52 of speech before pauses. The three-minute target is credible with prepared cuts; a real read-through is still required. The script correctly calls the closure a simulation, the $4,800 affected work rather than savings, and the $199 price proposed.

Keep the source-change badge wording exact. “Stops use of the old sign-off” is accurate for both `review` and `hold`; “the status becomes On hold” is accurate only for explicit blockers, stale/missing evidence or capture failure. Show the visible disabled-sign-off reason rather than pretending to click a disabled button. Preserve fixture labels in the recording and clearly separate a live Direct or Anakin source record from the Harbor Works fixture.

## Highest-impact remaining actions

1. **Finish public-release proof.** Run a fresh browser against the actual HTTPS URL, including account/session persistence, a Direct capture, review/sign-off, export verification, monitor enable/pause, tenant isolation and a restart/alarm continuity check. Save the URL, release commit and actual command/test outcomes. If a deployment is not verified, present the local runnable release honestly.
2. **Validate the operator-record burden with one customer.** The source mismatch identified earlier now has an implemented path: explicit text excerpts, references and declared validity, with originals retained by the operator. This is useful evidence administration, not PDF upload or authenticity verification. Make source coverage and total review effort—including entering/updating records—the first pilot go/no-go gate.
3. **Include the successful Anakin trace in the demonstration package.** A real call is now recorded; keep its provider, timestamp and measured retrieval separate from the Harbor Works simulation. One successful request does not guarantee future quota, uptime or accurate coverage. The shared supplier-call budget fails closed and never substitutes providers silently.
4. **Keep commercial claims synchronized with implemented scope.** The five-user/$199 plan is a proposed future plan; today's workspace has one owner. Anakin now has a durable shared default 30-attempt/day ceiling and three attempts/day per demo workspace, but these deployment safeguards are not commercial-plan metering or billing. Keep the pilot's provider budget explicit.
5. **Rehearse one uninterrupted failure-to-recovery story.** Capture the “old signature does not return” moment, one fresh sign-off and the packet verifier. Keep the long setup/forms out of the main three-minute narrative; the public app and README make the complete workflow inspectable separately.

The single most important commercial question is: **Will one real operator save enough review effort, including the cost of maintaining operator-entered excerpts, to justify the proposed subscription?** A measured pilot answers it. More fictional jobs, a larger claimed market, another AI component or another dashboard does not.

## Security and release disposition

The stale-dialog/changed-mission approval issue identified during the final pass was addressed with a pinned client review and a required server-side mission revision. No unresolved authorization bypass was found in the local backend paths exercised by the reviewed tests. This is a bounded observation, not assurance that no vulnerability exists. The new cloud adapter and public deployment require their own validation. Identity recovery, shared-team authorization, external audit, operational backup/restore and service-level monitoring remain documented deployment limitations.

Release gates before declaring the public build verified: final HTTPS fresh-account/browser run, operator-record and stale-dialog checks, packet export/verification, Durable Object persistence/alarm continuation, correct origin/cookie configuration, and a sanitized evidence bundle tied to the published commit. Human narration/upload and actual hackathon submission remain separate completion steps.

Recommend **Demo Ready / controlled shadow-pilot candidate**. Do not describe the release as certified aviation infrastructure, autonomous flight technology, customer-validated software or a deployed enterprise service unless separately demonstrated. Publish the strongest verified release and a clear pilot ask; let the evidence carry the claim.
