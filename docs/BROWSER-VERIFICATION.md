# Browser verification

Build and start the application with `npm run build` and `npm start`, then run `npx playwright test` in another terminal. Install Chromium first with `npx playwright install chromium` if it is not already available.

The suite exercises desktop Chromium and Pixel 7 mobile emulation. It covers closure and recovery, current-version review, separate mission signoff, exported packet integrity, account persistence, live official-source capture, scheduled monitoring controls, demo isolation, and operator-record expiry and version changes. Automated Axe checks run on the principal interfaces; they do not replace a full accessibility review or physical-device testing.

To test a deployed instance, set `E2E_BASE_URL`:

```sh
E2E_BASE_URL=https://groundproof.groundproof.workers.dev npx playwright test
```

Screenshots default to the ignored `work/e2e-screenshots` directory inside the repository. Choose a different destination explicitly:

```sh
E2E_OUTPUT_DIR=/absolute/path/to/screenshots npx playwright test
```

The JSON result report is written to `test-results/e2e-report.json`. Requests run serially at a human interaction pace, with the application's actual API quotas enabled. Account tests use unique synthetic example.com identities and create their own workspace; demonstration tests use isolated demo sessions.
