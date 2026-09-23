# GroundProof release verification

Observed September 23, 2026. This records covered software behavior and deployment checks. It does not establish customer adoption, field reliability or aviation certification.

**Primary application:** https://groundproof-flight.web.app

**Repository:** https://github.com/shi1720/HTCJ

## Release identity

| Component | Verified identity |
| --- | --- |
| Backend and complete functional baseline | `c277bbdbd32eccb93d23e70531a3cb9d1bd0ec66` |
| Final Firebase frontend, including landing-only CSS refinement | `a64ac2c6d7510c6ccb54d6b064a4ef63c23e680e` |
| Firebase Hosting version | `3967c6203a6b3502` |
| Hosting release time | `2026-09-23T11:20:57.483Z` |
| Cloud Run API gateway | `groundproof-api-00001-8jq`, `us-central1` |
| Cloudflare Worker version | `4322a99f-ed8d-4620-8125-c7ad84eec57b` |
| Durable database | Existing `groundproof-pilot-v1` Durable Object, schema 5 |

The complete hosted workflow suite exercised the functional baseline. The subsequent change adjusts landing illustration CSS only. Its final published assets and five-width layout checks are recorded separately below. This distinction avoids claiming that the entire workflow suite ran again on the CSS-only commit. The original Cloudflare host retains the functional baseline's static frontend.

## Executed checks

| Check | Observed result | Scope |
| --- | --- | --- |
| TypeScript and Vite production build | Passed | Native application and production frontend |
| Native automated suite | 156 tests passed across 10 files | API, evidence, authentication, recovery, histories, monitoring, provider budgets and packet checks |
| Worker-inclusive compatibility suite | 162 tests passed across 13 files | Includes the native cases plus adapter and signed gateway-metadata tests |
| Worker typecheck | Passed | Generated runtime declarations and strict TypeScript check |
| Cloud Run gateway HTTP suite | 3 tests passed | Cookie translation, origins, request bounds, signed metadata, cache controls and unexpected redirects |
| Dependency audit | Zero reported vulnerabilities | Dependency audit at verification time, not an independent security audit |
| Local browser acceptance | 16 of 16 cases passed | Production build at localhost:3002; 14 baseline cases plus 2 focused stale-session cases |
| Firebase browser acceptance | 16 of 16 cases passed | All cases together, no retries or skips; 347.215317 seconds, completed `2026-09-23T11:15:22.498317Z` |
| Firebase HTTP acceptance | 43 of 43 checks passed | Real hosted API, gateway and durable database, completed `2026-09-23T11:08:51.785Z` |
| Original Cloudflare HTTP acceptance | 41 of 41 checks passed | Real HTTPS backend, completed `2026-09-23T11:07:45.938Z` |
| Automated accessibility | Zero serious or critical Axe findings | Tested desktop/mobile surfaces using WCAG2 A/AA and WCAG2.1 A/AA tags |

The native and Worker-inclusive counts overlap. They are not additive. Browser cases repeat the workflows at desktop and mobile sizes, rather than representing 16 unrelated features.

Clean Linux CI passed on the [functional baseline](https://github.com/shi1720/HTCJ/actions/runs/35852733460) and the [subsequent documentation/media-pipeline commit](https://github.com/shi1720/HTCJ/actions/runs/35852981119). The latter is commit `d79af72e499ad653e5493d3af99bd5a46aaa0e29`. The final landing commit also passed [the complete clean Linux pipeline](https://github.com/shi1720/HTCJ/actions/runs/35853952984). This CI result is separate from the hosted CSS checks.

## What the workflow checks exercise

The public application passed registration, session rotation, saved-key recovery, password changes, recovery-key replacement and revocation of prior sessions. Source histories remain tenant-scoped, with source-specific pagination. Operators can record private excerpts, declare validity, update a version, review it separately and sign a mission only with current evidence and mission revision.

The evidence workflow covers changed dependencies, stale signoff rejection, restored bytes not reviving old signatures, capture failure preserving previous text, expiry through a scheduled job, separate source review and mission signoff, and JSON export checked by the offline verifier. A real FAA retrieval is part of the browser flow. The separately recorded authenticated Anakin trace supports that integration claim; it does not establish provider availability or complete source coverage.

Targeted regressions exercise an old-password login racing a credential reset, competing recovery requests, and a late scheduled capture after a newer manual capture. The browser suite also checks a delayed response from an old session cannot contaminate a new workspace. That one case intentionally injects a delayed 401 response; the other browser workflows use the actual API.

Firebase checks include `__session` cookie translation, Secure/HttpOnly/SameSite flags, exact-origin enforcement, separately authenticated request limits and private/no-store API caching. Firebase itself returns an empty-data HTTP400 for an intentionally malformed `%ZZ` path before the application runs; application cache headers cannot be attached to that edge response.

## Final static and responsive acceptance

At `2026-09-23T11:21:13.197Z`, the deployed Firebase HTML, JavaScript and CSS matched the compiled build byte-for-byte. The hashed assets returned HTTP200 with immutable caching. The social cover, robots file and SPA deep link also returned HTTP200.

The final landing illustration passed local production-build checks and subsequent checks against the actual Firebase site at widths **320, 390, 768, 1024 and 1440 pixels**. No caption/card intersections, card-to-card intersections, clipped artwork footer or horizontal overflow were reported. Axe found zero serious or critical issues at those widths. The hosted check completed at `2026-09-23T11:22:20.185Z`. The final CSS does not change the gateway or backend.

Machine-readable records:

- [Firebase deployment and hosted checks](deliverables/firebase-deployment-verification.json)
- [Desktop/mobile browser workflows](deliverables/browser-verification.json)
- [Landing artwork checks](deliverables/landing-art-verification.json)

Additional deployment detail is in [Firebase verification](FIREBASE-VERIFICATION.md) and the [Firebase runbook](FIREBASE.md).

## Narrated demonstration acceptance

The final recording shows the actual Firebase application and completed at `2026-09-23T11:26:36.976Z`. All recorded browser actions passed, with no application errors. Its genuine Anakin capture returned 5,930 characters from the Boston source at `2026-09-23T11:25:54.529Z`; the provider, timestamp and content hash are preserved in the evidence record.

The finished video is **210 seconds**, H.264 at **1440 × 1080**, with **48 kHz AAC narration**. Measured integrated loudness is **-16.68 LUFS**, with a **-1.43 dBTP** true peak. The voice is an explicitly disclosed OpenAI cedar narrator, not a voice clone. All eight speech transcripts were compared with the intended script. Forty-four captions use actual word timestamps, restored punctuation and monetary formatting, and a reserved band below the product footage. A nine-frame storyboard and full-resolution comparison, Anakin and commercial frames were inspected.

The recorded decision packet independently passed the verifier against the separately observed digest `40af31a222c6ee6d020a7a6275c9304736a12b669257a69950f6c3d37552b375`, with `valid:true` and no errors. See [video verification](deliverables/groundproof-video-verification.json), [recording log](deliverables/groundproof-demo-recording.json) and [packet verification](deliverables/groundproof-decision-verification.json).

## Publication status

The narrated video has uploaded to YouTube as draft `0zYnjZi1MFg`, with the saved title, description, custom thumbnail, English language, AI disclosure and completed HD processing. Public visibility and separate subtitle-track persistence are not yet verified. The Devpost draft now has its cover, three captioned screenshots, demo URL, contributor credit, story, technology tags and product/repository/testing links saved. Its preview confirms all three captions, but the video embed still reports private. Final submission remains pending. YouTube Studio repeatedly failed to expose usable publishing controls, with blank page rendering and native browser capture errors. No public YouTube playback or completed Devpost submission is claimed.

## Limits of this evidence

Automated accessibility findings cover the inspected routes and states. They are not complete accessibility certification. Mobile browser runs use Chromium device emulation, not physical-device testing. Content hashes and an embedded manifest do not authenticate an original permit or authorize flight.

The release has one owner per workspace, with saved-key self-service recovery. Losing both password and key has no automated recovery path. Shared-team roles, verified organization identity, billing, independent security review, customer backup/restore acceptance and an operator pilot remain outside this completed software acceptance record. Public-signup abuse and cumulative storage growth need operating controls before broader scale. Docker instructions are supplied; no successful container deployment is claimed.

The demonstration's jobs and private records are synthetic. The $4,800 figure is illustrative planned work affected by a simulated notice change. It is not measured savings, earned revenue, a prevented incident or customer proof.
