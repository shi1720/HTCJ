import "./router-compat.js";
import { DurableObject } from "cloudflare:workers";
import { handleAsNodeRequest } from "cloudflare:node";
import { isIP } from "node:net";
import { buildApp } from "../server/app.js";
import { initializeDatabase, type Db } from "../server/db.js";
import { cleanupExpiredData } from "../server/maintenance.js";
import { nextMonitorAt, runDueCaptures } from "../server/monitoring.js";
import { DurableSqlite } from "./sqlite.js";
import { workerCapture } from "./capture.js";
import { trustedGatewayNetwork } from "./gateway.js";
import { sessionUser } from "../server/auth.js";

interface Env {
  GROUNDPROOF: DurableObjectNamespace<GroundProofDatabase>;
  ASSETS: Fetcher;
  PUBLIC_ORIGIN?: string;
  ANAKIN_API_KEY?: string;
  ANAKIN_DAILY_LIMIT?: string;
  FIREBASE_GATEWAY_SECRET?: string;
}

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'",
  "Strict-Transport-Security": "max-age=31536000",
};

export class GroundProofDatabase extends DurableObject<Env> {
  private db: Db;
  private application?: Promise<number>;
  private maintainedAt = Date.now();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = initializeDatabase(
      new DurableSqlite(ctx.storage) as unknown as Db,
    );
    cleanupExpiredData(this.db);
  }
  private async scheduleMonitor() {
    const next = nextMonitorAt(this.db),
      existing = await this.ctx.storage.getAlarm();
    if (next === null) {
      if (existing !== null) await this.ctx.storage.deleteAlarm();
      return;
    }
    const scheduled = Math.max(Date.now() + 60000, Date.parse(next));
    // Frequent requests must never postpone an already-scheduled overdue monitor.
    if (existing === null || existing > scheduled)
      await this.ctx.storage.setAlarm(scheduled);
  }
  async alarm() {
    try {
      await runDueCaptures(this.db, {
        capture: workerCapture(this.env.ANAKIN_API_KEY),
      });
    } finally {
      await this.scheduleMonitor();
    }
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const origin = this.env.PUBLIC_ORIGIN || url.origin;
    this.application ??= buildApp({
      db: this.db,
      publicOrigin: origin,
      secureCookies: origin.startsWith("https:"),
      staticRoot: "/__groundproof_no_static_files__",
      maintenanceIntervalMs: 0,
      maintenanceOnStart: false,
      logger: false,
      anakinConfigured: Boolean(this.env.ANAKIN_API_KEY?.trim()),
      rateLimitKeyGenerator: (request) => {
        if (request.headers["x-groundproof-trusted-gateway"] === "1") {
          const actor = sessionUser(
            this.db,
            request.cookies.groundproof_session,
          );
          if (actor) return `firebase-account:${actor.id}`;
        }
        return typeof request.headers["x-groundproof-client-ip"] === "string"
          ? request.headers["x-groundproof-client-ip"]
          : request.ip;
      },
      capture: workerCapture(this.env.ANAKIN_API_KEY),
    }).then(async (app) => {
      await app.ready();
      return new Promise<number>((resolve, reject) => {
        app.server.once("error", reject);
        // In Workers, this is a bridge routing identifier, not a network listener.
        app.server.listen(0, () => {
          app.server.removeListener("error", reject);
          const address = app.server.address();
          if (!address || typeof address === "string") {
            reject(
              new Error("HTTP bridge did not allocate a port identifier."),
            );
            return;
          }
          resolve(address.port);
        });
      });
    });
    const port = await this.application;
    if (Date.now() - this.maintainedAt > 3600000) {
      cleanupExpiredData(this.db);
      this.maintainedAt = Date.now();
    }
    let payload: Buffer | undefined;
    if (!["GET", "HEAD"].includes(request.method)) {
      const reader = request.body?.getReader(),
        parts: Uint8Array[] = [];
      let size = 0;
      if (reader)
        while (true) {
          const item = await reader.read();
          if (item.done) break;
          size += item.value.length;
          if (size > 256 * 1024) {
            await reader.cancel();
            return Response.json(
              { error: "Request body is too large." },
              { status: 413, headers: securityHeaders },
            );
          }
          parts.push(item.value);
        }
      payload = Buffer.concat(parts.map((part) => Buffer.from(part)));
    }
    const bridgedRequest = payload
      ? new Request(request, { body: payload })
      : request;
    const response = await handleAsNodeRequest(port, bridgedRequest);
    await this.scheduleMonitor();
    return response;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (
      !env.PUBLIC_ORIGIN &&
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      return Response.json(
        { error: "Deployment requires PUBLIC_ORIGIN configuration." },
        { status: 503, headers: securityHeaders },
      );
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const id = env.GROUNDPROOF.idFromName("groundproof-pilot-v1");
      const headers = new Headers(request.headers);
      // Cloudflare overwrites CF-Connecting-IP at the public edge. Never trust a
      // caller-supplied internal header or X-Forwarded-For inside the HTTP bridge.
      const gatewayNetwork = trustedGatewayNetwork(
        request,
        env.FIREBASE_GATEWAY_SECRET,
      );
      const clientIp =
        gatewayNetwork || request.headers.get("cf-connecting-ip") || "";
      headers.set(
        "x-groundproof-client-ip",
        isIP(clientIp) ? clientIp : "127.0.0.1",
      );
      headers.delete("x-groundproof-trusted-gateway");
      if (gatewayNetwork) headers.set("x-groundproof-trusted-gateway", "1");
      for (const name of [
        "x-groundproof-gateway-time",
        "x-groundproof-gateway-network",
        "x-groundproof-gateway-signature",
      ])
        headers.delete(name);
      return env.GROUNDPROOF.get(id).fetch(new Request(request, { headers }));
    }
    const asset = await env.ASSETS.fetch(request);
    const headers = new Headers(asset.headers);
    for (const [key, value] of Object.entries(securityHeaders))
      headers.set(key, value);
    return new Response(asset.body, {
      status: asset.status,
      statusText: asset.statusText,
      headers,
    });
  },
};
