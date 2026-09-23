# Browser verification

Build and start the application with `npm run build` and `npm start`, then run `npx playwright test` in another terminal. Install Chromium first with `npx playwright install chromium` if it is not already available.

The suite exercises desktop Chromium and Pixel 7 mobile emulation. It covers closure and recovery, current-version review, separate mission signoff, exported packet integrity, account persistence, live official-source capture, scheduled monitoring controls, demo isolation, operator-record expiry and version changes, searchable evidence, archived capture history, the next-signoff queue, recovery-key storage and rotation, password changes, account recovery, logout-all, mobile keyboard navigation, and preserved input focus through a real 30-second background refresh. Automated Axe checks run on the principal interfaces; they do not replace a full accessibility review or physical-device testing.

To test a deployed instance, set `E2E_BASE_URL`:

```sh
E2E_BASE_URL=https://groundproof-flight.web.app npx playwright test
```

Screenshots default to the ignored `work/e2e-screenshots` directory inside the repository. Choose a different destination explicitly:

```sh
E2E_OUTPUT_DIR=/absolute/path/to/screenshots npx playwright test
```

The JSON result report is written to `test-results/e2e-report.json`. Requests run serially at a human interaction pace, with the application's actual API quotas enabled. Account tests use unique synthetic example.com identities and create their own workspace; demonstration tests use isolated demo sessions.

The interface audit and the changes it prompted are documented in [UI review](UI-REVIEW.md). One browser resilience case deliberately delays and injects a failed state response from an old session; other workflow requests use the real application API. Official-source capture tests retrieve the real public FAA page and may depend on its availability. Fictional demo mission evidence remains explicitly labeled.

Use the production build for release verification. A development server can reload the page when another process changes the HTML or source files, which invalidates an in-progress browser interaction without representing production behavior.

## Verified release

On 2026-09-23, the hosted functional build at [groundproof-flight.web.app](https://groundproof-flight.web.app) passed **16 of 16 browser cases**: eight desktop and eight mobile, with no retries or skipped cases. This run used application commit `c277bbdbd32eccb93d23e70531a3cb9d1bd0ec66`. It completed at **11:15:22 UTC** in **347.2 seconds**.

The production build also passed 14 baseline local cases and two focused local cases for the final session-isolation guard. The full hosted run exercised all 16 together. All automated Axe assertions passed with **zero serious or critical findings** in the audited views. These counts describe the authored browser suite, not field reliability or full accessibility certification.

The complete sanitized results are in [browser-verification.json](deliverables/browser-verification.json). Refreshed screenshots were visually inspected on desktop and mobile: landing, operations overview, mission board, source review, and mobile overview with mission cards. No account recovery key or API key is included in these screenshots.

Screenshots written by the suite: `landing.png`, `groundproof-overview.png`, `groundproof-mission-board.png`, `source-review.png`, and `mobile.png`. Source review uses a taller desktop viewport to include the complete decision form; mobile screenshots preserve the full scrollable layout.

A subsequent CSS-only correction removed a collision between the landing illustration caption and its tilted card. The production build passed. Checks at 320, 390, 768, 1024 and 1440 pixels found no caption/card overlap, no card-to-card overlap, no artwork footer clipping, no horizontal overflow and no serious or critical Axe findings. Desktop and mobile screenshots were inspected visually. See [landing-art-verification.json](deliverables/landing-art-verification.json). The correction changes no application workflow or API behavior.
