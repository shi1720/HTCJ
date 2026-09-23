## Inspiration

A drone can be ready while the job is not.

Imagine a crew travelling to an inspection with yesterday's approval. Overnight, the property manager closes access to the site. The notice changes, but the job still looks approved. The aircraft is not the problem. The evidence behind the decision is out of date.

We started with a narrow question: **when one fact changes, which jobs need a fresh human decision?**

GroundProof focuses on commercial drone inspection coordinators who manage repeat work across multiple sites. They need to connect site notices, permission records, insurance evidence, and operating checklists to the jobs that depend on them. Our initial customer and pricing are hypotheses for a pilot, not claims of existing demand.

## What it does

GroundProof ties each internal job signoff to the exact evidence versions reviewed by the coordinator.

- Capture supported official public pages through Anakin or direct retrieval. Each capture records the source, provider, time, text, and content hash.
- Add operator-supplied records with a reference and an expiry date. Attach the relevant evidence to a job.
- Review each source, then separately sign off the job. Signoff checks the current mission revision and records the exact evidence hashes.
- Source changes revoke dependent approvals. Expired, blocked, or unavailable evidence also prevents signoff.
- Inspect earlier captures, compare versions, explain a decision, and export a decision packet for independent integrity checking.

The key behavior is simple: **putting the old text back does not put the old approval back.** A person must review the evidence and sign off the job again.

The demo contains six fictional jobs. Changing one fictional access notice affects exactly three jobs with a combined planned job value of $4,800. That figure illustrates the work affected, not money saved. The same demo separately captures a real City of Boston page through Anakin.

GroundProof supports internal coordination. It does not issue flight permission, verify that a supplied document is genuine, or replace the remote pilot's decisions.

## How we built it

Shivam Gupta led the product direction and built GroundProof with AI-assisted development, testing, and iteration.

The interface uses React, TypeScript, and Vite. A Fastify API handles accounts, workspaces, missions, sources, monitoring, and exports. The hosted application uses Firebase Hosting for its public web address, a small Cloud Run gateway, and a Cloudflare Worker with durable SQLite storage for the application backend. This preserves durable data behind the Firebase address.

Anakin retrieves supported public pages. Deterministic evidence rules decide whether a job needs review. A language model does not make readiness or flight decisions. The proof lab exercises the same evidence engine used by the product.

We built cookie-based authentication, isolated workspaces, saved recovery keys, password changes, session revocation, bounded source capture, audit history, and portable evidence packets. Browser tests exercise the complete journey from a changed source through review, fresh signoff, and export.

## Challenges we ran into

The hardest problem was preventing an old approval from silently becoming valid again. Comparing only the current text was insufficient. We had to preserve the decision history and bind signoff to both the evidence versions and the saved mission revision.

Live retrieval introduced another challenge: a failed capture must remain visible without erasing the last useful snapshot. Competing captures also need clear ownership so an older response cannot overwrite newer evidence.

Finally, a convincing demo needed to survive ordinary use. We improved mobile mission cards, empty states, capture history, account recovery, and the queue of jobs still waiting for signoff. We also kept simulated events visibly separate from genuine public-page captures.

## Accomplishments that we're proud of

We can show the full consequence of a changed fact, not just an alert on a dashboard: affected jobs, revoked approvals, source comparison, a recorded human decision, a fresh signoff, and an exported evidence packet.

The application has a public Firebase address and a no-signup demonstration workspace. Its proof lab runs 15 explicit scenarios, including changed, missing, expired, blocked, and unavailable evidence. The demo video shows the working product and a real Anakin capture.

The exported packet can be checked outside GroundProof. That makes the evidence easier to inspect and reduces dependence on a screenshot or our own presentation of the result.

## What we learned

A useful operational tool has to explain what changed and what to do next. A red status alone creates more work.

We also learned to distinguish integrity from authenticity. A hash can show that recorded content has changed; it cannot prove that a permission record was legitimate in the first place.

Commercial value must include the cost of maintaining evidence. Saving review time means little if entering private records or handling irrelevant alerts takes longer. Our pilot will measure the total effort, not just the attractive part of the workflow.

## What's next for GroundProof

We are seeking one drone inspection operator for a four-week shadow pilot across a small set of repeat sites. We would compare existing review effort with GroundProof, measure useful change alerts and record-maintenance time, and ask whether the results justify a proposed $199 monthly workspace price.

The pilot would run alongside the operator's existing process. Shared team roles, verified organizational identity, operator-specific integrations, and independent security review are the next deployment steps. Our immediate goal is evidence of customer value before a broader rollout.
