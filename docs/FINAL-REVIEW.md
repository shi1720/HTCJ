# GroundProof release assessment

Reviewed September 23, 2026 against the HTCJ × PROOF Aviation Futures Challenge rubric. **Provisional internal score: 80.5 / 100.** The reviewer contributed to the backend and submission artifacts. This is a skeptical contributor review, not an independent audit, organizer feedback, customer validation or a prediction of winning.

The current product completes a narrow operational workflow: capture or record evidence, attach it to a job, review the source, separately sign off the job, invalidate an obsolete approval, inspect history and export a verifiable packet. Its strongest demonstrated behavior is that restoring old source text does not restore the old signature. Its largest evidence gap remains whether an operator saves enough total effort to pay for it.

**Release status at this review:** Firebase HTTP and complete desktop/mobile browser acceptance have passed at [groundproof-flight.web.app](https://groundproof-flight.web.app). The final landing-only CSS change also passed separate hosted asset and five-width layout checks. The narrated video passed acceptance; public publication remains pending. Use [release verification](RELEASE-VERIFICATION.md) for the functional baseline, final frontend commit, exact test counts and actual public-host results. Counts across native and Worker-inclusive suites overlap and must not be added together.

## Weighted assessment

| Criterion | Weight | Score / 10 | Weighted points | Evidence and deduction |
| --- | ---: | ---: | ---: | --- |
| Problem relevance | 20% | 8.0 | 16.0 | A repeat-site drone inspection coordinator and a stale-approval failure are specific and understandable. One changed notice identifies the dependent jobs. No operator has yet confirmed the frequency, burden or purchasing priority. |
| Innovation and differentiation | 15% | 7.5 | 11.25 | Evidence dependencies, hash-bound record references and validity, mission revision checks, retained history and portable packets form a coherent workflow. The underlying techniques are established. No evidence establishes exclusivity or a durable moat. |
| Technical execution | 20% | 9.0 | 18.0 | Integrated accounts, tenant isolation, deterministic rules, transactional signoff, supplier budgets, monitoring and packet verification. Recovery/password races and superseded scheduled captures now have targeted regressions. Single-owner identity, operational recovery and broader abuse resistance remain limits. |
| PROOF and demonstration | 20% | 9.0 | 18.0 | Reproducible six-job scenario, precise three-job/$4,800 effect, source comparison, separate decisions, failure drills, audit, export and rule lab. Real authenticated Anakin retrieval is recorded separately. Controlled scenarios and a successful capture do not establish field reliability. The narrated video passed acceptance; public publication remains pending. |
| Pilot readiness and feasibility | 15% | 7.5 | 11.25 | Four-week shadow-pilot proposal, declared record validity through the scheduled job, explicit responsibility boundaries, recovery controls and a documented deployment path. No committed partner, organization roles, independent security audit or verified customer backup/restore process. |
| Impact and commercial potential | 10% | 6.0 | 6.0 | Named target buyer, proposed price and editable time-value assumptions make value testable. Willingness to pay, useful-alert rate, source coverage and total record-maintenance effort remain unvalidated. |
| **Total** | **100%** | | **80.5 / 100** | **Strong demonstration of covered behavior. Customer value and operational readiness still require evidence.** |

A completed deployment or polished recording can strengthen demonstration confidence. It cannot establish demand, cost savings or flight safety. The proposed $199 monthly workspace price remains a hypothesis. The current product has one owner per workspace; proposed future team plans are not implemented membership features.

## Improvements that resolve real workflow gaps

- Saved recovery keys enable self-service password recovery without pretending to send email. Keys are single-use, stored only as digests and replaced after recovery. Password changes and recovery revoke prior sessions. Losing both the password and key still leaves no automated recovery path.
- Source history exposes retained captures through tenant-scoped pagination and checks their content hashes. Deleting an unreferenced source also deletes its snapshots, so operators must export needed evidence first.
- Credential mutations recheck the current credential version after asynchronous hashing. An old-password login cannot create a session after a competing reset replaces those credentials.
- A scheduled capture that finishes after a newer manual capture cannot turn the successful newer evidence into an apparent outage. The stale result is discarded and audited.
- Firebase Hosting provides the intended primary address. A Cloud Run gateway forwards the same-origin API to the existing Cloudflare Worker and durable SQLite storage. Hosted checks passed for cookie translation, origin controls and signed gateway metadata, described in [Firebase verification](FIREBASE-VERIFICATION.md).

See [backend security reassessment](BACKEND-SECURITY-REVIEW.md) for the bounded audit findings and [API](API.md) for implemented behavior.

## Demonstration claims that must stay exact

A changed Harbor Works notice produces **Needs review** and revokes exactly three fictional mission approvals. Their **$4,800 illustrative planned value** is affected work, not revenue saved. An explicit blocking review, missing/stale evidence or capture failure produces **On hold**. Reviewing a recovered source does not sign a mission. Mission planning changes also require a fresh signature.

A web capture records retrieved text, provider, time and hash. Operator records remain supplied excerpts and references, with original documents retained by the operator. An embedded checksum establishes neither publisher authenticity nor legal permission; independent comparison to a trusted digest provides stronger integrity evidence.

Keep the genuine Anakin capture visibly separate from the fictional closure drill. A provider or quota failure must remain visible. Keep the revised video's disclosure that its narrator uses OpenAI text to speech and is not a voice clone. The voice does not imply an interview, customer testimonial or independent endorsement. Retain footage and capture logs that support the final recording's claims.

## Remaining release and pilot gates

1. Preserve the completed Firebase acceptance record and its distinction between the functional baseline and subsequent CSS-only refinement. Keep release identities and machine-readable evidence with the submission.
2. Completed: the narrated video, actual speech timestamps, captions, interface labels and live provider provenance passed acceptance. Remaining: upload to YouTube, verify public playback, attach images/video to Devpost and submit. Desktop file-upload control is currently blocked.
3. Agree a shadow pilot with one operator. Measure total active effort, including entering private records, maintaining references and processing irrelevant alerts. Agree required-source coverage and freshness before comparing time savings.
4. Validate backup restoration, access policies, retention and service monitoring before admitting sensitive operator records. Public-signup abuse controls, shared-team authorization and external security review remain work for broader deployment.

Recommend **Demo Ready / controlled shadow-pilot candidate**. Public software acceptance is complete within the recorded scope; narrated-video acceptance is complete. YouTube and Devpost publication remain pending. Do not present this release as certified aviation infrastructure, customer-validated enterprise software or evidence of prevented incidents.
