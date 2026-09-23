# Firebase release verification

Release date: 23 September 2026. Primary URL: https://groundproof-flight.web.app.

The functional release passed both HTTP and browser checks against the actual Firebase URL. A subsequent CSS-only landing refinement received its own hosted layout and asset verification. The unchanged backend and the final frontend commits are recorded separately below.

## Deployment identity

| Component                              | Identity                                                                |
| -------------------------------------- | ----------------------------------------------------------------------- |
| Firebase project                       | `gen-lang-client-0444960702`                                            |
| Hosting site                           | `groundproof-flight`                                                    |
| Cloud Run gateway                      | `groundproof-api`, `us-central1`                                        |
| Gateway revision                       | `groundproof-api-00001-8jq`                                             |
| Firebase frontend commit               | `a64ac2c6d7510c6ccb54d6b064a4ef63c23e680e`                              |
| Backend and functional baseline commit | `c277bbdbd32eccb93d23e70531a3cb9d1bd0ec66`                              |
| Hosting version                        | `3967c6203a6b3502`                                                      |
| Hosting release time                   | `2026-09-23T11:20:57.483Z`                                              |
| Worker version                         | `4322a99f-ed8d-4620-8125-c7ad84eec57b`                                  |
| Durable backend                        | Existing `groundproof` Worker and `groundproof-pilot-v1` Durable Object |
| Database schema                        | Version 5, preserving existing evidence data                            |

## Checks before publication

- Worker runtime type generation and TypeScript checking passed.
- Worker-compatible API, evidence, monitoring, recovery, and gateway metadata suite: 162 tests in 13 files passed.
- Gateway HTTP tests: 3 passed, covering session translation, origin enforcement, request limits, signed metadata, cache protection, and rejected redirects.
- Deployed Cloud Run `/api/health`: HTTP 200 with expected JSON and `private, no-store` cache control.

## Hosted release checks

- **Firebase: 43/43 HTTP workflow checks passed**, completed `2026-09-23T11:08:51.785Z`.
- **Original Cloudflare host: 41/41 HTTP checks passed**, completed `2026-09-23T11:07:45.938Z`.
- Actual Firebase `__session` cookies work with `Secure`, `HttpOnly`, and `SameSite=Strict` flags. Signed gateway metadata produces separate request limits for separately authenticated accounts.
- Both hosts passed registration, login/session rotation, tenant isolation, stale approval rejection, operator-record updates, historical snapshots, packet export with the offline integrity verifier, password changes, one-use recovery, and session revocation.
- All application API responses on Firebase carried private/no-store cache headers. One intentionally malformed `%ZZ` URL was rejected with an empty-data HTTP 400 at Firebase's edge before the application; application headers cannot be added to that edge response.
- Final static checks passed at `2026-09-23T11:21:13.197Z`: deployed HTML, JavaScript, and CSS equal the compiled build byte-for-byte, canonical metadata uses Firebase, hashed JS/CSS assets return HTTP 200 with immutable caching, and the social cover, robots file, and SPA deep link return HTTP 200.
- The final landing artwork passed checks against the actual Firebase site at widths 320, 390, 768, 1024, and 1440 pixels: no caption/card intersections, no card-to-card intersections, no clipped artwork footer, no horizontal overflow, and zero Axe serious/critical findings. The CSS change and current static release do not change the gateway or Worker. The original Cloudflare site's static artwork remains at the functional baseline commit.

Machine-readable evidence: [firebase-deployment-verification.json](deliverables/firebase-deployment-verification.json).

The full hosted browser suite passed **16/16 cases** on the functional baseline commit, with zero retries or skips and zero Axe serious/critical findings, completing `2026-09-23T11:15:22.498317Z` in 347.215317 seconds. This includes desktop and mobile account recovery, history, internal sign-off, operator records, source review, keyboard focus across a real background refresh, and protection against a late response from a previous session. The later landing-only CSS change received the five-width checks above. Workflow results remain tied to the baseline commit, with final CSS layout checks recorded separately. See [browser verification](BROWSER-VERIFICATION.md) and its [machine-readable report](deliverables/browser-verification.json).

These tests use synthetic operator records and demonstration missions. They do not establish real-world flight permission, customer adoption, or a successful operational pilot.
