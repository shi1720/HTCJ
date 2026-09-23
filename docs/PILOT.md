# Four-week GroundProof shadow pilot

## Decision the pilot should enable

Should one commercial drone inspection operator pay for GroundProof and expand its use? The pilot evaluates evidence administration. It does not establish flight safety, regulatory compliance, certification, or general-purpose rule extraction accuracy.

Sponsor: operator owner or operations manager. Daily user: coordinator. Domain reviewer: experienced remote pilot or safety lead. Product lead: Shivam Gupta. No pilot partner is currently committed.

## Scope and entry conditions

Target 5-10 recurring sites, at least 30 job reviews if the operator's workload permits, and 10-20 approved source records. The sample is a feasibility target, not a statistically powered outcome study. Include approved public policy pages, operator-supplied text excerpts with references to retained primary records, job metadata, and internal review decisions. PDF upload, signature verification and document authentication are outside this release. Avoid passenger, patient, and unnecessary employee-sensitive data.

For every operator-supplied record, the operator retains the signed permission, policy certificate or other primary document and identifies who checked it. Record the excerpt reference and any declared expiry; the system preserves that statement and its revisions but does not verify its truth or authenticity. Include a controlled case where a document is valid today but expires before the planned appointment, and confirm that sign-off is blocked.

The operator agrees on the source inventory, owner for every requirement, freshness limits, review notes, source access rights, and retention/deletion window. Verify deployment configuration, workspace access isolation, TLS, backups, and recovery before loading non-demo data. GroundProof runs alongside the existing dispatch process. No integration issues commands to aircraft or replaces existing authorization steps.

## Weekly plan

| Week | Work | Evidence at the end |
| --- | --- | --- |
| 1: Baseline | Map job dependencies, observe manual review timing, define which changes matter, configure source access | Approved scope, baseline observations, data dictionary, failure drill plan |
| 2: Shadow capture | Run the evidence workflow alongside normal work, record review time and alerts, inspect every discrepancy | Timestamped comparison log and source coverage report |
| 3: Controlled drills | In a separate test workspace, inject expired records, content changes, retrieval failures, duplicate events, and stale approval attempts | Reproducible drill results and reviewer feedback |
| 4: Decision | Review time savings, false alerts, missed events, operating cost, usability, and willingness to pay | Written continue / revise / stop decision and deletion/export confirmation |

## Measures and proposed thresholds

Agree these thresholds before the pilot. They are acceptance hypotheses, not demonstrated results.

| Measure | Definition | Proposed decision threshold |
| --- | --- | --- |
| Invalid approval attempts | Attempts accepted despite known stale, blocked, missing, changed, or unavailable dependencies in controlled drills | Zero accepted in the defined drill set |
| Change propagation | Time between stored source update and affected job status update | 95th percentile below 2 seconds in the pilot deployment, excluding external retrieval latency |
| Retrieval timeliness | Time from scheduled check to captured result, with failures recorded | Report distribution and failures separately; no invented real-time guarantee |
| Source coverage | Required records available through a supported public capture or operator-supplied excerpt tied to a retained primary record / agreed required records | At least 90%, with every uncovered requirement explicitly handled |
| Useful alerts | Reviewer-confirmed actionable changes / alerts reviewed | At least 80%; report numerator and denominator |
| Missed known events | Known events not surfaced within agreed freshness policy | Zero in controlled drills; report every known live discrepancy |
| Review effort | Median active minutes per comparable job review, including excerpt entry and updating, measured in baseline and shadow periods | At least 25% lower without increased unresolved evidence |
| Reviewer comprehension | Coordinator correctly explains why a job is held and what action resolves it in observed tasks | All critical test tasks completed without product-team intervention |
| Paid continuation | Sponsor's actual decision after reviewing results and proposed terms | Named budget owner agrees to continue at a defined price |

Time comparisons must record job complexity, source count, and interrupted work. A small convenience sample supports an operating decision, not a population-wide claim. Do not infer prevented accidents, compliance rates, or lost-revenue avoidance from these measures.

## Stop conditions and recovery

Stop using pilot data if an access-control defect, unintended data disclosure, or unexplained approval bypass appears. Preserve diagnostic records and use the operator's established process. Pause a problematic source connector if it captures the wrong page or an authentication wall. Mark affected records unavailable; never substitute an old snapshot as fresh evidence.

## Exit paths

**Continue:** critical drills pass, source coverage is adequate, measured benefit supports price, and sponsor requests paid continuation. Expand only with an agreed production operating plan.

**Revise:** no critical control failure, but nuisance alerts, source gaps, or time savings miss targets. Limit the next iteration to the specific unmet condition.

**Stop:** repeated approval-control failure, missing essential source access, no measurable workflow improvement, or no credible buyer willingness to pay. Export customer records and apply the agreed deletion policy.

## Pilot request

We seek one operator, one coordinator for brief weekly reviews, a domain reviewer, and a representative set of recurring jobs. In return, GroundProof provides the configured shadow workspace, transparent source records, reproducible failure drills, and a written outcome report. No aviation endorsement or commercial commitment is implied.

## Current account boundary

Use one named coordinator account for the initial shadow workspace. The current application isolates accounts and does not implement workspace invitations or reviewer roles. Do not share credentials to simulate team access. Other stakeholders can review exported packets and observe sessions. Multi-user permissions must be implemented and tested before a multi-reviewer production pilot.
