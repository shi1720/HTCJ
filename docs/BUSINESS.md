# GroundProof commercial case

## Customer hypothesis

Initial segment: commercial drone inspection service businesses with several crews and repeated industrial, construction, or property sites. User: operations coordinator. Buyer: business owner or operations lead. Trigger: coordinating tomorrow's jobs requires checking several site policies and documents whose versions can change independently.

Hypotheses to test: these checks consume meaningful paid time; relevant changes reach the coordinator late enough to matter; the buyer will pay for versioned evidence and review workflow; their source material is accessible through a supported integration. No interviews, customers, pilots, letters of intent, or revenue are claimed.

## Existing products and our intended wedge

| Product | What its published materials support | GroundProof positioning |
| --- | --- | --- |
| Aloft Air Control | Fleet management, airspace authorizations, checklists, logs, compliance reports | Complement the established flight workflow with evidence-version dependencies. Do not claim Aloft lacks a feature without testing it |
| AirHub | Mission approvals, assets, weather, checklists, risk analysis | A focused pre-dispatch evidence workflow instead of another complete operations platform |
| Drone Harmony | Inspection scope, field collection, review, reporting, APIs | Provide the evidence behind internal job review; leave inspection data collection and analysis to the existing system |
| Anakin Monitoring | Website checks, snapshots, diffs, extraction, signed webhooks | Our supplier for retrieval. Generic change detection alone is not differentiation |
| Apian / Matternet | Healthcare drone logistics and dispatch orchestration | Adjacent market demonstrating demand for integrated operations; not our initial customer workflow |
| ANRA VMS / VoloIQ | Vertiport resource and fleet/infrastructure operations | Adjacent AAM opportunity with a later and more integration-intensive buyer |

Sources appear in `SOURCES.md`. This is a public-material comparison, not a comprehensive competitive teardown.

## Pricing to test

| Proposed plan | Monthly price | Intended boundary |
| --- | ---: | --- |
| Operator | $199 | One workspace, 25 sites, five users, 3,000 basic source captures, evidence exports |
| Team | $499 | Larger portfolio, negotiated usage allowance, integration support with an explicit service limit |
| Shadow pilot | $0-$199 | Four weeks, limited scope, an agreed success review; no implied commitment |

These prices and limits are proposals, not enforced billing functionality. The current account owns its isolated workspace. Multi-user membership, invitations, and roles are not implemented, so the five-user allowance is a proposed commercial capacity rather than a shipped collaboration feature. Avoid an unlimited-monitoring plan. A site may require many sources, and frequent refreshes create real supplier cost. Opt-in scheduled monitoring is implemented with a minimum interval and a bounded worker. Commercial usage metering, per-plan quotas, and billing are still required before selling a plan.

## Unit cost assumptions

Anakin's pricing page inspected September 23, 2026 lists 300 signup credits, Pro at $19/month for 5,000 credits, and Pro top-ups from $10, displaying $4.75 per 1,000 credits at final review. A basic scrape costs one credit. JSON extraction adds two credits; it is not required for GroundProof's deterministic readiness checks. Its Zero Touch service meters an unauthenticated allowance and returns HTTP 402 when exhausted. The website homepage and pricing page show different Scale allowances, so this model uses only the consistent Pro/basic-scrape figures. Recheck terms before committing a commercial price.

Illustrative monthly workspace:

- 25 sites x 2 sources per site x 2 checks/day x 30 days = **3,000 basic captures**.
- At the displayed $4.75 per 1,000 Pro top-up rate, 3,000 credits have a nominal marginal value of **$14.25**, subject to purchase increments. A **$15** internal reserve rounds that up. A standalone small deployment also incurs the **$19 base subscription**, which includes credits; do not add both as if the same credits were charged twice.
- A single workspace fitting within the included 5,000 credits could therefore allocate **$19** to Anakin before hosting and support. At larger scale, allocate the base plan and extra usage across customers using actual invoices. The hosted demo currently enforces a separate 30-attempt daily supplier budget, so this commercial 3,000-capture scenario is not the demo allowance.
- The initial Cloudflare pilot can use the free tier, subject to its limits. Hosting, backups, storage, and operational monitoring at commercial scale: **$15-$40/workspace/month** as an internal planning assumption, not a vendor quote or measured production bill.
- Human support: **0.5 hour x $40/hour = $20/month** as an internal cost assumption.
- At $199/month and $19 + $25 + $20 = **$64** assumed direct monthly cost, illustrative contribution is **$135, or 67.8%** before acquisition cost, payment fees, taxes, engineering, and overhead.

This arithmetic is a sensitivity model, not forecast financial guidance. More frequent polling, document storage, hard-to-retrieve sources, and support may erase that margin. For example, 50 sources checked every 15 minutes for 30 days means 144,000 captures, far beyond the proposed starter allowance. The production product must add commercial metering and per-plan caps before selling the implemented monitoring workflow at these prices.

## Editable ROI model

Monthly review-time value = jobs per month x minutes saved per job / 60 x loaded coordinator hourly cost.

Illustrative inputs: 100 jobs x 4 minutes / 60 x $40/hour = **$266.67** of time capacity per month. Subtracting a $199 subscription leaves **$67.67** before implementation cost. This is modest, and the buyer may value redeployed time below payroll cost. At 50 jobs with the same assumptions, value is **$133.33**, below the proposed price. These inputs are unvalidated. Do not present either result as customer savings.

Disrupted-job value needs separate measurement. Booked value is not margin, a prevented loss, or attributable savings. The demo's $4,800 identifies the work linked to changed evidence only.

## Route to the first customer

1. Recruit one operator through an industry introduction, with an experienced remote pilot as reviewer. No outreach has been sent.
2. Import a small set of recurring jobs and customer-approved public sources. Record the existing review process and timing before changing it.
3. Run four weeks in shadow mode. Preserve the operator's actual process and compare the evidence workflow at the same time.
4. Present the measured time/alert results and ask for a concrete paid continuation decision at the proposed price.

The initial distribution hypothesis is service-provider referrals and integrations with existing operations software. Broad paid advertising is premature.

## Defensibility and limits

A potential advantage could develop through validated source templates, historical change records, reliable integration, and a trusted review workflow. None is an established moat today. Generic scraping, hashes, and a dashboard are reproducible. The business must prove that source coverage and workflow adoption create enough value to justify switching or adding another tool.

Expansion into drone delivery or AAM ground infrastructure should follow validation of the core dependency/review model, not precede it. The product needs enterprise identity, retention policy, backup recovery evidence, integration contracts, and a deployment-specific security review before a larger rollout.
