# GroundProof testing instructions

**Application:** https://groundproof-flight.web.app

No API key or account is needed for the guided demonstration. Open the application and choose **Explore the working demo**. Each demonstration has its own workspace with fictional jobs, sources, and changes.

## Five-minute judging path

1. Open **Mission board** and inspect the six example jobs. Open **Facade inspection · east elevation** to see the evidence behind its current signoff.
2. Return to **Operations overview** and select **Simulate site closure**. The example Harbor Works notice changes. Three dependent jobs should need a fresh decision; the other three retain their own state. The displayed $4,800 is illustrative planned job value, not claimed savings.
3. Open an affected job and its **Harbor Works access notice**. Compare the previous and current text. Record a decision to keep it on hold. Signing off the job should remain unavailable.
4. Open **Proof lab**, then use **Updated access notice** to recover with a new version. In **Evidence library**, review the current Harbor Works notice and accept that evidence with an explanatory note. The old job signoff must remain revoked.
5. Open the job again, add a signoff note, and sign off the current evidence. Export its decision packet. Inspect the audit trail to see the separate capture, review, and signoff events.
6. In **Proof lab**, run the verification suite. All 15 evidence scenarios should pass. Inject a source failure and confirm that the previous snapshot remains available while dependent work is held.
7. In **Evidence library**, add the **Boston filming requirements** template. Choose **Anakin API** under **Capture with** and capture the source. Inspect the provider, time, hash, and genuine public-page text. Captures are rate-limited; a provider failure is displayed honestly and does not become approval.

## Account and mobile checks

Use a separate browser session to create a personal workspace. Save the one-time recovery key shown after registration. Add a site, then an operator record with a reference and expiry. Create a mission and select that evidence. Review the evidence before signing off.

**Workspace settings** contains password and recovery controls. Password changes revoke prior sessions. A forgotten password can be reset with the previously saved recovery key; it is single-use and replaced after recovery. There is no email reset. If both password and key are lost, automated recovery is unavailable.

On a phone-sized screen, use the navigation menu, inspect mission cards, open source history, and complete a review. Blank search results and capture failures should explain the next action.

## Independent evidence check

Clone https://github.com/shi1720/HTCJ, run `npm ci`, then run:

```sh
npm run verify:packet -- /absolute/path/to/downloaded-decision-packet.json
```

The verifier checks the packet's recorded content and evidence bindings. It does not authenticate an external permission document or authorize a flight.

An embedded checksum can be recomputed by someone who edits a packet. To compare against a digest saved separately from a trusted source, supply that digest explicitly:

```sh
npm run verify:packet -- /absolute/path/to/downloaded-decision-packet.json --expected-hash YOUR_SEPARATELY_TRUSTED_SHA256
```

## Scope

This is operational evidence software for internal decisions. Demonstration jobs and source-change drills are fictional. Live captures are labeled separately. Proposed pricing, savings inputs, and pilot outcomes are hypotheses. The current product has one owner per workspace; shared organizational roles and customer field validation are future work.
