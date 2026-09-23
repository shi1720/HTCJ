# Running GroundProof

## Local development

Requirements: Node.js 22 and npm. A local C/C++ toolchain may be needed if `better-sqlite3` cannot download a matching prebuilt binary.

```sh
npm ci
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`). Vite proxies `/api` to the server on port 3001. SQLite data persists in `./data/groundproof.sqlite`. No external API key is required for the complete fixture demonstration or Direct public-page capture.

```sh
npm run build
npm test
npm start
```

After the build, `npm start` serves both the UI and API at `http://localhost:3001` in development mode. For local-only binding set `HOST=127.0.0.1`. The server closes SQLite cleanly on SIGINT/SIGTERM.

The process does not automatically load `.env`. Set variables in your shell/process manager, or use a Node version supporting `--env-file`:

```sh
node --env-file=.env --import tsx server/index.ts
```

## Production container

```sh
export PUBLIC_ORIGIN=https://groundproof.example.com
docker compose up --build -d
```

Replace the example origin with your actual domain. Terminate HTTPS in a reverse proxy and proxy to `127.0.0.1:3001`. The Compose configuration exposes only loopback, uses a non-root application user, a read-only container filesystem, and a persistent named volume for SQLite. `PUBLIC_ORIGIN` must be an HTTPS origin with no trailing slash or path. Production cookies are Secure and will not work over ordinary HTTP.

The `Dockerfile` is supplied as a deployment path; successful local builds/tests do not claim a deployed service or verified cloud infrastructure. Verify the actual container and proxy in your deployment environment.

| Variable | Default / purpose |
| --- | --- |
| `NODE_ENV` | Development unless set; `production` enables Secure cookies, HSTS and strict origin configuration |
| `PUBLIC_ORIGIN` | Required HTTPS browser origin in production |
| `HOST` | `0.0.0.0`; use `127.0.0.1` for a local-only server |
| `PORT` | `3001` |
| `DATABASE_PATH` | `./data/groundproof.sqlite` |
| `ANAKIN_API_KEY` | Optional server-only API key for explicit Anakin capture |
| `ANAKIN_DAILY_LIMIT` | `30`; shared attempted-call allowance per UTC day, integer 0–10,000; 0 disables Anakin |

Do not use a `VITE_` prefix for secrets; that exposes variables in the browser bundle. The server trusts no forwarding headers by default. Behind a reverse proxy, IP rate limits may apply to the proxy address collectively. Configure edge-level per-client limits and controlled access for a pilot; do not broadly trust client-supplied forwarding headers.

SQLite fits a single-instance pilot. Do not mount this database on network filesystems or run multiple independently scaled application containers against it. Move to a transactional managed database and an explicit tenant/identity model before multi-instance growth.

## Backups and operations

Use SQLite's online backup operation for a consistent backup, or stop the application before copying the database and its WAL/SHM companions. Do not copy only an active `.sqlite` file while WAL writes continue. Protect backups as user data. Test a restore into a separate instance before relying on it. Sessions persist with the database, so a restored backup may restore still-unexpired session records; revoke sessions after a security incident.

`GET /api/health` is a lightweight liveness check and reports no secrets. Monitor error rates, disk usage, capture failures and backup age separately. Captures run on demand or through explicit per-source monitoring. The Node process checks persisted due schedules immediately and every 60 seconds, with at most three attempts per tick and bounded backoff after failure. Monitoring requires the application to remain running and is best effort. Expired sessions and inactive demo accounts older than 24 hours are cleaned at startup and hourly; registered accounts are preserved. Audit history is retained rather than silently truncated, so monitor disk use and establish a retention/archive policy with the pilot customer. Evidence snapshot archives stop accepting new captures at a 100 MiB/10,000-snapshot threshold per workspace; operator intervention is required to archive records or provision capacity.

## Pilot acceptance

Before allowing real operator data: verify HTTPS, Secure cookies, origin rejection, cross-workspace access denial, persistent storage, restart behavior, backups, recovery and outbound provider restrictions. Review the source allowlist and evidence freshness windows with the participating operator. Agree on access, data retention and the operational scope described in [`SECURITY.md`](SECURITY.md). The product is a tested local release and pilot candidate, not certified aviation infrastructure.

## Monitor verification

Create a real public source, enable a one-hour Direct monitor with a longer freshness window, and verify a captured snapshot plus `Scheduled monitor` audit event. Disable monitoring to stop future work. Fixture controls remain separate and cannot activate network polling. On Node shutdown the process stops the scheduler and waits for the current bounded capture batch before closing SQLite. Container stop timeouts must accommodate outbound provider timeouts if a graceful completion is required.
