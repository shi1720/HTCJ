# Adversarial rubric review

This is an internal adversarial assessment, not judge feedback or an independent endorsement. The updated assessment reflects implemented functionality and observed checks on September 23, 2026. It retains penalties for missing operator validation. It cannot predict whether the entry will win.

| Criterion | Weight | Updated / 10 | Weighted points | Strongest objection |
| --- | ---: | ---: | ---: | --- |
| Problem relevance | 20 | 7 | 14.0 | No operator has confirmed frequency, disruption cost, or source coverage |
| Innovation and differentiation | 15 | 7 | 10.5 | The source-to-job invalidation is demonstrable, but established fleet vendors could add or already offer related workflows |
| Technical execution | 20 | 8.5 | 17.0 | Integrated persistent authentication, tenant isolation, scheduled capture, version checks and independent exports work; account recovery, scale and operational recovery need more work |
| PROOF / demonstration | 20 | 8.5 | 17.0 | Real Anakin capture, browser workflows and runtime tests supplement the controlled drill; no real operator trial exists |
| Pilot readiness and feasibility | 15 | 7 | 10.5 | A durable hosted workflow and bounded shadow-pilot plan exist, but a partner and deployment-specific review remain missing |
| Impact and commercial potential | 10 | 5 | 5.0 | Pricing and time savings are hypotheses; low-volume customers may not justify another subscription |
| **Total** | **100** | | **74.0 / 100** | **Stronger execution evidence; market proof still missing** |

The preliminary planning score was 65/100. The improvement comes from implementation evidence, not a revised claim about customers. Authenticated Anakin retrieval returned 5,930 characters from a Boston government page in 2,458 ms. Real Cloudflare runtime checks passed 34 HTTP assertions, preserved sessions and invalidated approvals across a restart, and ran a scheduled FAA source capture. The compatibility test suite passed 140 tests including operator records and the later approval revision controls. Consult the final validation report for release counts rather than treating this snapshot as the final test inventory.

## Highest-value improvements

1. Demonstrate stale approvals cannot survive source changes, re-review, restoration, duplicate events, or stale browser state. Present actual tests and expose the failure path in the interface.
2. Completed: authenticated live Anakin capture is recorded separately from the fixture drill. Next measure source completeness and repeated retrieval reliability.
3. Let judges create an account, add a supported source, create a job, review the captured version, approve, and export without developer help. Verify on a fresh workspace.
4. Provide an independently runnable bundle verifier. Clarify that hashing establishes consistency, not source truth or legal validity.
5. Make the commercial case falsifiable. Include the break-even sensitivity where the proposed subscription is not worthwhile.
6. Obtain an operator review when possible. Do not invent one or substitute an LLM's opinion for customer validation.

## Questions a skeptical judge should ask

**Why not use Aloft or AirHub?** They cover broad flight operations and compliance. GroundProof focuses on which evidence version an internal approval used and what a source change invalidates. We must validate that this adds enough value alongside existing tools.

**Could a webpage change mean nothing?** Yes. The current conservative rule asks for human review on any content change. This can create nuisance work. Meaningful-change filtering needs evaluation before it can safely suppress review.

**Can this decide whether a drone may fly?** No. It checks only the configured evidence workflow. The operator and remote pilot retain authorization, planning, and safety obligations.

**Does a hash prove a permit is genuine?** No. It identifies the captured content and detects later changes to a packet. Source identity, authority, completeness, and authenticity need separate validation.

**Does a successful refresh make an old approval valid again?** It must not. The exact approved hashes must match current evidence. A fresh source review still requires a fresh mission approval after an invalidating change.

**What if there is no API or a page changes layout?** Anakin supports web capture, but retrieval may fail or capture incomplete content. The application records unavailability and requires review. Source coverage is a pilot measure.

**Why should an operator pay $199?** We have an explicit time-savings model and an unvalidated price. A small operator may not save enough. The pilot requires a paid continuation decision, not an enthusiastic interview.

**Is this production ready?** It is a working demonstrable application with a defined deployment path. Production suitability depends on the specific customer, deployment security, backups/recovery, monitoring, support, and regulatory workflow review. A public deployment exists, but it is not an aviation certification or an operator-approved production deployment.

## Release review record

Final technical results belong in the repository's validation report, including commands, actual outcomes, date, and release commit. Update this document's implementation score only after those results and a fresh-account walkthrough are available. Do not raise the market-validation scores because the interface looks polished.
