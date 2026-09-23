# GroundProof

## Paste-ready submission

### 1. Project name

**GroundProof**

**Live product:** https://groundproof.groundproof.workers.dev

**Repository:** https://github.com/shi1720/HTCJ

**Tagline:** Yesterday's approval. Today's evidence.

**Short description:** GroundProof connects drone inspection jobs to the evidence behind their operational approvals. When that evidence changes, expires, or becomes unavailable, it identifies affected jobs and requires a fresh human decision.

### 2. The problem

A drone inspection can have a valid internal approval and still depend on yesterday's information. Site access notices change. Insurance evidence expires. An operator cannot retrieve a required source. A completed checklist does not automatically explain which scheduled jobs depend on those facts or whether someone reviewed the latest version.

Our first intended user is the operations coordinator at a commercial drone inspection business managing repeated work across multiple sites. The business problem is repeated checking, disrupted dispatches, and approvals whose supporting evidence is difficult to reconstruct. These are hypotheses we plan to measure with an operator; we have not claimed customer interviews, measured savings, or prevented incidents.

### 3. Our solution

GroundProof gives every mission an explicit set of evidence dependencies. It captures public source text or an explicitly labeled operator-supplied record, including its reference and optional expiry, with a timestamp and content hash, records a person's review of that exact version, and binds the mission approval to the reviewed hashes and current mission revision. A change in a dependency invalidates the previous approval. Stale, missing, blocked, or unavailable evidence holds the job. The coordinator can inspect the source, resolve the problem, and approve the mission again against current evidence.

Operator-supplied records are explicit text excerpts with a reference and optional declared expiry. The operator retains and checks the primary document. GroundProof does not upload or authenticate a PDF, validate a signature, or establish that a permission or insurance statement is genuine. Declared expiry is checked against both current time and the scheduled job.

The application manages operational evidence and internal review. It does not issue flight authorization, evaluate every aviation requirement, control aircraft, or replace the remote pilot's responsibilities.

### 4. Our proof

We built an integrated web application with accounts, isolated workspaces, sites, mission creation, source capture, opt-in scheduled monitoring, evidence review, mission approval, an audit history, and downloadable evidence bundles. Readiness comes from deterministic rules. No language model decides whether a mission can proceed through our internal workflow.

The demo includes six fictional inspection jobs across three illustrative Boston-area sites. A clearly labeled simulated change to the Harbor Works access notice affects three jobs with $4,800 in combined illustrative booked value. That figure identifies the work affected by the change. It is not revenue earned, money saved, or a prediction of loss.

The proof lab executes authored rule scenarios and displays their actual results. A downloadable bundle preserves the exact evidence versions and an integrity manifest. Independent verification can reveal a changed bundle. Hashes demonstrate content integrity, not the truth of a source or regulatory acceptance.

A real authenticated Anakin capture of Boston's public filming-permit guidance succeeded on September 23, 2026 at 10:06:40 UTC. It returned 5,930 characters in 2,458 milliseconds. [the integration evidence record](deliverables/anakin-integration-proof.json) records that single observed retrieval. This establishes a working integration, not source completeness or customer benefit. A separate real Direct retrieval and scheduled Cloudflare alarm captured the FAA UAS page.

### 5. Demo

The demonstration follows one failure and recovery: approved jobs, a simulated site closure, affected approvals invalidated, an attempted approval rejected, current evidence reviewed, a fresh mission approval, and a downloaded evidence packet. It also shows stale or unavailable evidence and the proof lab.

The repository includes a word-for-word narration and recording instructions in `docs/DEMO-SCRIPT.md`. The final video link should be added only after recording and uploading the actual demonstration.

### 6. Images and screenshots

Use the delivered [mission-board screenshot](deliverables/groundproof-mission-board.png) and [source-review screenshot](deliverables/source-review.png). The video also demonstrates the proof lab and audit workflow. Each simulation screenshot should retain its demo labeling. The pitch deck and pilot brief explain the workflow, commercial assumptions, and next validation step.

### 7. Technology used

TypeScript, React, Vite, Fastify, and SQLite, with a Cloudflare Workers deployment using Durable Object SQLite and static assets. Server-side sessions scope actions to the user's workspace. The application stores source snapshots and audit events and computes evidence hashes with SHA-256. Anakin's web data API provides a source-capture integration; direct retrieval is also available for supported public government sources. Source text is untrusted data. Server-side rules check evidence freshness, review state, and the approval's bound hashes.

Anakin's role is retrieving web evidence where the operator has no native data feed. GroundProof adds the aviation job dependencies and review workflow. Operators can also enter a text excerpt and reference from their own records. These records are labeled as supplied by the operator, retain revision history, and require review. The product does not independently verify document authenticity. A fixture drill is a simulation; a live Anakin retrieval is identified separately.

### 8. Target user and customer

The initial user is a drone inspection operations coordinator. The initial buyer is the owner or operations lead of a drone service business with several crews and recurring commercial sites. GroundProof is intended to complement flight planning and fleet-management tools through source records and exports.

### 9. Current stage

**Demo Ready.** The application supports an end-to-end evidence workflow and repeatable simulations. The next step is a supervised shadow-mode pilot. There is no completed live flight integration, aviation certification, customer deployment, or validated willingness to pay. Production deployment requires the documented operating controls and a deployment-specific review.

### 10. Business and deployment case

Our future pricing hypothesis is $199 per workspace per month for up to 25 monitored sites and five users. The current release supports one owner per workspace; shared-team membership and commercial billing are not implemented. A larger $499 plan would add higher usage and integration support. These are proposed prices, not contracted revenue. The initial shadow pilot uses one named coordinator account. A subscription keeps the decision-support workflow affordable while the operator retains its existing aircraft and flight systems.

A four-week pilot would map one operator's requirements, establish a manual baseline, run GroundProof alongside the current process, and measure review time, useful change alerts, missed test events, and operating cost. The initial deployment would not block or release actual flights. The operator remains responsible for its dispatch and flight decisions.

### 11. What we need next

One commercial drone inspection operator willing to sponsor a four-week shadow pilot, an experienced remote pilot or operations manager to review the requirement model, and a small set of representative site policies and historical changes. We would value introductions to fleet-software integration partners. We seek evidence of a repeatable customer problem before pursuing broader automation.

### 12. Team

**Shivam Gupta, founder and product lead.** Shivam set the product direction, commercial priorities, and standards for a usable submission. GroundProof uses AI-assisted development and research. We disclose the assistance and distinguish working software from simulation and unvalidated commercial assumptions.

## Devpost narrative fields

### Inspiration

The future of flight depends on information that changes on the ground. A site owner can update access conditions after a coordinator has approved tomorrow's job. We focused on the gap between the approval and the evidence it depended on.

### What it does

GroundProof records the evidence behind each internal mission approval. It traces changes to affected jobs, holds incomplete records, and gives a human reviewer a clear path to resolve and approve current evidence.

### How we built it

We separated source capture from readiness evaluation. Anakin or direct retrieval captures plain text. Opt-in monitoring recaptures sources on a schedule and routes changes back to human review. A deterministic rules engine evaluates freshness and review state. The server binds approval to exact hashes and a persisted mission revision, preventing a stale client from approving a newer record or a changed appointment. Supplier budgets cap Anakin calls before they reach the provider. Isolated demo workspaces let judges run the failure scenarios themselves.

### Challenges

The difficult part is preserving the meaning of approval over time. Reviewing a new source must not revive an old mission signoff. A failed refresh must preserve the earlier snapshot without presenting it as current. We designed the workflow around those failure cases.

### What we learned

Existing drone platforms already cover broad fleet management. Our focused contribution is the dependency between changed evidence and a previous approval. A useful product needs a measurable operational benefit and an honest boundary around what it can establish.

### What's next

A supervised operator pilot, measured review-time comparisons, source-coverage evaluation, and integration with an existing dispatch workflow.

## Submission and date checklist

The official pages inspected September 23, 2026 contain conflicting dates. Preserve this conflict until the organizer confirms the applicable submission path:

- **October 8, 2026:** the [rules page's Dates section](https://htcj-aviation-futures.devpost.com/rules) lists this as the submission deadline, followed by October 8-9 judging and October 9 results. The same page's header shows the later portal deadline.
- **October 23, 2026:** evidence lock. No time or timezone was supplied.
- **October 25, 2026:** PROOF Boston one-day flagship. This precedes the portal deadline.
- **October 28, 2026 at 05:30 GMT+5:30:** displayed portal deadline, equivalent to October 28 at 00:00 UTC and October 27 at 17:00 PDT on the [official overview](https://htcj-aviation-futures.devpost.com/).

Plan to finish materials before the earliest listed date, October 8, until the organizer resolves the discrepancy. Do not assume the October 28 portal deadline qualifies a project for the October 25 stage. The rules' Prizes section asks for a 3-5 minute demo, although other sections describe video as encouraged. Prepare the video to satisfy the stricter wording. No organizer query, RSVP, or submission has been sent by this document.

Before submitting, verify the deployed product URL and add the uploaded video URL, verify repository visibility, re-run checks at the release commit, remove any outdated screenshots, and confirm the participant's eligibility and any required disclosure against the [full rules](https://htcj-aviation-futures.devpost.com/rules). The rules require identifying significant third-party technologies and permit simulations where physical testing needs authorization. GroundProof discloses its AI-assisted development and performs no real flight operations.
