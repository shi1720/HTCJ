# GroundProof source register

Research inspected September 23, 2026. Public product descriptions support feature comparisons, not independent performance verification. Recheck time-sensitive pricing and rules before submission. No source establishes GroundProof's customer demand or results.

| Source | URL | Supported use |
| --- | --- | --- |
| FAA: State and Local Regulation of UAS | https://www.faa.gov/uas/state-and-local-regulation-unmanned-aircraft-systems | Federal/local jurisdiction distinction; consult full fact sheet for nuance |
| FAA: 2023 jurisdiction fact sheet | https://www.faa.gov/uas/resources/policy_library/UAS_Fact_Sheet_2023.pdf | Context for distinct requirements around operations and property use; not legal clearance |
| NPS: Uncrewed Aircraft in National Parks | https://www.nps.gov/articles/uncrewed-aircraft-in-the-national-parks.htm | Example of ground-use restrictions and written exceptions; not permission for a mission |
| FAA: Package delivery by drone | https://www.faa.gov/uas/advanced_operations/package_delivery_drone | Regulatory complexity of an alternative delivery wedge |
| Aloft Air Control | https://www.aloft.ai/air-control/ | Fleet, authorization, checklist, log, compliance features |
| Aloft Compliance | https://www.aloft.ai/compliance/ | Tracking of documents, certifications, authorizations, and reporting |
| AirHub features | https://www.airhub.app/all-features | Mission approval, templates, weather, risk analysis, asset management |
| Drone Harmony Asset Inspector | https://www.droneharmony.com/asset-inspector | Inspection workflow, evidence records, reporting, enterprise integration |
| Apian | https://www.apian.health/ | Healthcare delivery orchestration and integrations; competing alternative wedge |
| Matternet Software Platform | https://www.matternet.com/our-system-software-platform | Mission Control, ground operations, and simulation |
| ANRA Vertiport Management System | https://www.anratechnologies.com/home/anra-vertiport-management-system/ | Pad/charger resource reservation and adaptive scheduling |
| Volocopter VoloIQ | https://www.volocopter.com/en/solutions/voloiq | Fleet, battery, and infrastructure management concept |
| NASA High-Density Automated Vertiport ConOps | https://ntrs.nasa.gov/citations/20210016168 | Vertiport scheduling and turnaround research context |
| Anakin URL Scraper API | https://anakin.io/docs/api-reference/url-scraper | Inline/async source capture API behavior |
| Anakin Zero Touch | https://anakin.io/products/zero-touch | No-key initial access, per-IP credits, HTTP 402 on allowance exhaustion |
| Anakin pricing | https://anakin.io/pricing | 300 signup credits; Pro $19 / 5,000 credits; basic scrape 1 credit; Pro top-ups shown from $10 at $4.75 / 1,000 credits on final review |
| Anakin Monitoring | https://anakin.io/products/monitoring | Website diffs, extraction, snapshots, webhook features already offered by supplier |
| Official challenge overview | https://htcj-aviation-futures.devpost.com/ | Required fields, rubric, October 23 evidence lock, October 25 event, October 27 PDT portal deadline |
| Official challenge rules | https://htcj-aviation-futures.devpost.com/rules | Rules body lists October 8 submission deadline, conflicting with header. Requires third-party technology disclosure and permits simulations. Prizes section specifies 3-5 minute demo |
| Challenge guidelines supplied by participant | User-provided text in project brief | Initial research brief. The official pages independently confirm the supplied dates while adding a conflicting earlier October 8 deadline |

## Evidence labels used in deliverables

- **Implemented:** demonstrated behavior in the current application. Verify against the final release.
- **Simulation:** fictional mission/site content and deliberately injected source changes.
- **Measured:** output produced by a recorded test run, with command, date, and commit where available.
- **Hypothesis:** buyer, price, ROI, cost allocation, pilot thresholds, and future defensibility.
- **External context:** cited regulator or vendor statements, not GroundProof validation.

The short source excerpts displayed by the application are evidence inputs. They are not a comprehensive regulatory database. A government domain allowlist limits capture scope but does not establish that every page is sufficient or authoritative for a mission.

## Implementation evidence, September 23, 2026

- Authenticated Anakin capture: Boston public filming guidance, 5,930 characters, 2,458 ms at 10:06:40 UTC. Machine record: [integration evidence record](deliverables/anakin-integration-proof.json). This is one successful retrieval, not an availability benchmark.
- Real Cloudflare workerd testing: 34 HTTP smoke assertions, persistent session and invalidated approval across restart, Direct FAA UAS capture (9,111 characters), and an actual scheduled Durable Object alarm that captured the source at 10:08:14 UTC. These are implementation observations, not customer validation.
- Cloudflare [free Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/pricing/), [SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), and [Node HTTP bridge](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/) underpin the deployed architecture.
