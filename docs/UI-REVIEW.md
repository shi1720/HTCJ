# Interface review and improvements

This is an implementation review, not an independent customer evaluation. The review asked whether an operator can understand the next action, finish the evidence-to-signoff workflow, recover from errors, and use a small screen without hiding important status.

## Friction removed

- A reviewed source previously left the review desk looking finished while affected missions still needed separate signoff. Eligible missions now remain in a clearly labeled signoff queue.
- An existing source had no obvious way to retry a failed or outdated capture. Its detail view now includes a provider selector and a current-version capture action, with truthful provider provenance.
- The immediate previous capture was visible, but older evidence was inaccessible in the interface. A paginated history panel now exposes preserved content, hashes, timestamps and providers.
- Dependent jobs were passive labels. They now open the corresponding mission decision record.
- The desktop mission table hid context on narrow screens. Mobile cards show the job, client, site, scheduled time, evidence status and booked value together.
- Empty filtered results looked like an empty account. They now explain the active search and offer to clear it. Evidence sources are searchable too.
- New workspaces lacked guidance. Three concrete setup steps now lead through site, evidence and mission creation. A mission's evidence picker excludes sources bound to other sites.
- Account credentials previously had no self-service recovery. Registration now displays a single-use recovery key with copy, download and explicit storage acknowledgment. Settings support password changes, replacement keys and ending all sessions. Recovery does not claim to send email.
- Recreated dialog callbacks caused focus to move during background refresh. Dialogs now retain typed input and focus, restore focus on close, trap keyboard navigation, and keep their close control visible while scrolling. The closed mobile navigation is inert and its open state contains keyboard focus.
- Saving a change could close its form before refreshed state arrived, allowing an immediate reopen on a stale version. The save now waits for refreshed state before completing. If the server saved the change but refresh fails, the interface says so explicitly, preventing misleading retry behavior.
- A late response from a previous login session could affect a replacement workspace. Workspace refreshes now bind to both the session generation and the latest request; a deliberately delayed failure is covered in the browser suite.
- Expired or unavailable source evidence now gets an actionable status in the source interface. Backend revision and content-hash checks remain the authority for actual decisions.

## Deliberate limits

This remains an operational evidence product with one owner per workspace. It does not issue flight permission or verify an operator-supplied document's issuer. Account recovery depends on a saved recovery key; there is no email delivery service. Automated accessibility checks and mobile emulation are useful regression evidence, but do not establish full accessibility conformance or physical-device coverage. Public-source capture also depends on the remote source remaining available.

The browser verification document records the exact tested environments and outcomes. Production monitoring, customer interviews and a supervised shadow pilot remain necessary before claiming operational reliability or customer impact.
