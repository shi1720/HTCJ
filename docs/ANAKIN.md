# Anakin integration

GroundProof uses Anakin to retrieve evidence from supported official web pages. It stores the returned text, provider, capture time and SHA-256 digest, then traces changed evidence to the inspection jobs that depend on it. A person reviews the captured version before signing a mission. Anakin does not make the readiness decision.

## Try the deployed integration

1. Open [GroundProof](https://groundproof-flight.web.app) and create a workspace or explore an isolated demo.
2. Open **Evidence library** and add a public web source. Use Boston's [filming-permit guidance](https://www.boston.gov/departments/tourism-sports-and-entertainment/how-apply-film-boston) as a reproducible public-page example. This page is an integration example, not proof of permission for any particular drone mission.
3. Choose **Anakin** and capture the source. Inspect the actual content, timestamp, hash and provider.
4. Review the evidence with a note. If appropriate to your own requirement model, link that source to a mission. A later changed or unsuccessful capture revokes dependent approvals.

The public deployment has a server-side key configured. A demo has three Anakin attempted calls per UTC day; the deployment shares a conservative ceiling of 30 attempts per UTC day. Failed upstream attempts count. Direct capture is a separate, explicit selection. There is no hidden fallback.

## Configure your own deployment

Create an account and key through the [Anakin dashboard](https://anakin.io/), then set `ANAKIN_API_KEY` in the server environment. For Cloudflare:

```sh
npx wrangler secret put ANAKIN_API_KEY
```

Paste the key only into the secret prompt. For local development, put the key in the untracked `.env` file and run `node --env-file=.env --import tsx server/index.ts`. Never put it in browser code, a `VITE_` variable, a screenshot, or a committed file. The fixture demonstration and Direct capture work without Anakin credentials. Keyless access, if available from Anakin, remains subject to its own allowance.

## Protocol and failure handling

The server calls `POST https://api.anakin.io/v1/url-scraper/scrape` with the source URL and optional `X-API-Key`. It accepts completed inline responses and polls bounded asynchronous jobs on the same provider origin. See the [official API documentation](https://anakin.io/docs/api-reference/url-scraper).

Captured text is untrusted data. It is rendered as text, never executed, and cannot instruct the application to approve a mission. GroundProof restricts source URLs to its supported government HTTPS domains, rejects oversized/empty results, and treats authentication, credit, rate-limit, network and malformed-response failures explicitly. An unsuccessful capture preserves the previous snapshot but marks the source unavailable and invalidates dependent mission signatures. Recovery still requires current evidence and a fresh human signoff.

## Observed proof

The final Firebase recording captured Boston's public filming guidance through authenticated Anakin on September 23, 2026 at **11:25:54.529 UTC**, returning **5,930 characters**. The [machine-readable record](deliverables/anakin-integration-proof.json) includes the actual provider, source URL, timestamp and snapshot digest. Its 7,722 ms verification interval includes a planned screen pause and is not a provider-latency benchmark.

This single successful request establishes a working integration, not uptime, source completeness or customer value. The genuine capture is separate from fictional site notices and failure drills. A separate actual workerd retrieval also succeeded; see [runtime verification](CLOUDFLARE-VALIDATION.md).

Provider credits, prices and access policies can change. Check the dashboard before increasing monitoring frequency. GroundProof's daily ceiling limits attempted calls; it is not a guarantee of a particular provider bill.
