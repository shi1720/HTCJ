import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type {
  AppState,
  EvidenceSource,
  Mission,
  Site,
  User,
} from "../shared/types.js";
import {
  appendAudit,
  getData,
  insertData,
  listData,
  openDatabase,
  updateData,
  recentAudit,
  objectAudit,
  type Db,
} from "./db.js";
import {
  clearSession,
  createSession,
  hashPassword,
  publicUser,
  sessionUser,
  verifyPassword,
  type UserRow,
} from "./auth.js";
import {
  assessMission,
  hashContent,
  hashManifest,
  runLab,
} from "./evidence.js";
import {
  captureSource,
  isAnakinConfigured,
  validateSourceUrl,
} from "./providers.js";
import { ApiError, fail } from "./errors.js";
import {
  captureAndPersist,
  invalidateSourceApprovals,
  commitSnapshot,
  assertArchiveCapacity,
} from "./capture.js";
import { cleanupExpiredData, reserveLoginAttempt } from "./maintenance.js";
import {
  HARBOR_CLOSED,
  HARBOR_OPEN,
  makeSnapshot,
  saveSnapshot,
  seedDemo,
} from "./seed.js";

declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
  }
}
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success)
    fail(
      400,
      result.error.issues
        .map(
          (issue) => `${issue.path.join(".") || "request"}: ${issue.message}`,
        )
        .join("; ")
        .slice(0, 500),
    );
  return result.data;
}
const text = (max = 200) => z.string().trim().min(1).max(max);
const id = z.string().uuid();
const note = z
  .string()
  .trim()
  .min(8, "Please include at least 8 characters explaining your decision.")
  .max(2000);
const siteSchema = z
  .object({
    name: text(),
    address: text(500),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  })
  .strict();
const missionSchema = z
  .object({
    name: text(),
    client: text(),
    siteId: id,
    scheduledAt: z.iso.datetime({ offset: true }),
    value: z.number().finite().min(0).max(100000000),
    sourceIds: z
      .array(id)
      .min(1)
      .max(50)
      .refine(
        (values) => new Set(values).size === values.length,
        "Source references must be unique.",
      ),
  })
  .strict();
const loginSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(256),
  })
  .strict();
const registerSchema = z
  .object({
    name: text(100),
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(12, "Use at least 12 characters.").max(256),
    workspace: text(100),
  })
  .strict();
const recordFields = {
  content: z.string().trim().min(50).max(20000),
  reference: z
    .string()
    .trim()
    .min(3)
    .max(300)
    .refine((value) => !/[\r\n]/.test(value), "Use a single-line reference."),
  validUntil: z.iso.datetime({ offset: true }).nullable().optional(),
};
function recordEnvelope(
  content: string,
  reference: string,
  validUntil: string | null,
): string {
  return `OPERATOR-SUPPLIED RECORD — NOT INDEPENDENTLY VERIFIED\nReference: ${reference}\nValid until: ${validUntil ?? "Not specified; configured freshness applies"}\n\n${content}`;
}
const sourceSchema = z
  .object({
    title: text(),
    url: z.url().max(2000),
    category: z.enum([
      "site-access",
      "airspace",
      "insurance",
      "operating-policy",
    ]),
    siteId: id.nullable(),
    freshnessHours: z.number().min(1).max(8760),
  })
  .strict();

export interface AppOptions {
  databasePath?: string;
  db?: Db;
  logger?: boolean;
  rateLimit?: boolean;
  staticRoot?: string;
  secureCookies?: boolean;
  publicOrigin?: string;
  capture?: typeof captureSource;
  maintenanceIntervalMs?: number;
  maintenanceOnStart?: boolean;
  anakinConfigured?: boolean;
  rateLimitKeyGenerator?: (request: FastifyRequest) => string;
}
export async function buildApp(options: AppOptions = {}) {
  const production = process.env.NODE_ENV === "production";
  const origin = options.publicOrigin ?? process.env.PUBLIC_ORIGIN;
  if (
    production &&
    (!origin ||
      new URL(origin).protocol !== "https:" ||
      new URL(origin).origin !== origin ||
      options.secureCookies === false)
  )
    throw new Error(
      "Production requires an exact HTTPS PUBLIC_ORIGIN and Secure session cookies.",
    );
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 256 * 1024,
    trustProxy: false,
    requestTimeout: 30000,
  });
  const db = options.db ?? openDatabase(options.databasePath);
  const secure = options.secureCookies ?? process.env.NODE_ENV === "production";
  const capture = options.capture ?? captureSource;
  if (options.maintenanceOnStart !== false) cleanupExpiredData(db);
  const maintenanceInterval = options.maintenanceIntervalMs ?? 3600000;
  const maintenance =
    maintenanceInterval > 0
      ? setInterval(() => {
          try {
            cleanupExpiredData(db);
          } catch (error) {
            app.log.error({ err: error }, "Retention cleanup failed");
          }
        }, maintenanceInterval)
      : null;
  maintenance?.unref();
  app.decorateRequest("user", null);
  await app.register(cookie);
  if (options.rateLimit !== false)
    await app.register(rateLimit, {
      max: 180,
      timeWindow: "1 minute",
      ...(options.rateLimitKeyGenerator
        ? { keyGenerator: options.rateLimitKeyGenerator }
        : {}),
      allowList: (request) => {
        const path = request.url.split("?")[0];
        return !path.startsWith("/api/") || path === "/api/health";
      },
      errorResponseBuilder: () =>
        new ApiError(429, "Too many requests. Please wait a minute and retry."),
    });
  app.addHook("onClose", async () => {
    if (maintenance) clearInterval(maintenance);
    if (!options.db && db.open) db.close();
  });
  app.addHook("onRequest", async (request, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("X-Frame-Options", "DENY")
      .header("Referrer-Policy", "no-referrer")
      .header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'",
    );
    if (secure) reply.header("Strict-Transport-Security", "max-age=31536000");
    if (request.url.startsWith("/api/"))
      reply.header("Cache-Control", "no-store");
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) {
      if (request.headers["sec-fetch-site"] === "cross-site")
        fail(403, "Cross-site requests are not allowed.");
      const requestOrigin = request.headers.origin;
      if (requestOrigin) {
        const allowed = new Set(
          origin ? [origin] : [`${request.protocol}://${request.headers.host}`],
        );
        if (!production && !origin) {
          allowed.add("http://localhost:5173");
          allowed.add("http://127.0.0.1:5173");
        }
        if (!allowed.has(requestOrigin))
          fail(403, "Request origin is not allowed.");
      }
    }
    request.user = sessionUser(db, request.cookies.groundproof_session);
    const path = request.url.split("?")[0];
    const publicPaths = [
      "/api/health",
      "/api/auth/register",
      "/api/auth/login",
      "/api/auth/me",
      "/api/demo/start",
    ];
    if (
      path.startsWith("/api/") &&
      !publicPaths.includes(path) &&
      !request.user
    )
      fail(401, "Sign in to continue.");
  });
  app.setErrorHandler((error, request, reply) => {
    if (request.url.startsWith("/api/"))
      reply.header("Cache-Control", "no-store");
    const statusCode = (error as { statusCode?: number }).statusCode;
    const code = typeof statusCode === "number" ? statusCode : 500;
    if (code >= 500) request.log.error({ err: error }, "Request failed");
    const message =
      error instanceof ApiError
        ? error.message
        : code === 429
          ? "Too many requests. Please retry shortly."
          : code === 413
            ? "Request body is too large."
            : code === 400
              ? "Invalid request."
              : "The request could not be completed. Please try again.";
    reply
      .status(code >= 400 && code < 600 ? code : 500)
      .send({ error: message });
  });
  const limited = {
    config: { rateLimit: { max: 12, timeWindow: "1 minute" } },
  };
  const user = (request: FastifyRequest) => request.user!;
  function sourceFor(tenant: string, sourceId: string) {
    return (
      getData<EvidenceSource>(db, "sources", tenant, sourceId) ??
      fail(404, "Evidence source not found.")
    );
  }
  function missionFor(tenant: string, missionId: string) {
    return (
      getData<Mission>(db, "missions", tenant, missionId) ??
      fail(404, "Mission not found.")
    );
  }
  function siteFor(tenant: string, siteId: string) {
    return (
      getData<Site>(db, "sites", tenant, siteId) ?? fail(404, "Site not found.")
    );
  }
  function assess(
    tenant: string,
    mission: Mission,
    sources: EvidenceSource[],
  ): Mission {
    const assessment = assessMission(mission, sources);
    const row = db
      .prepare("SELECT invalidated FROM missions WHERE tenant_id=? AND id=?")
      .get(tenant, mission.id) as { invalidated: number } | undefined;
    if (row?.invalidated && assessment.status === "draft")
      assessment.status = "review";
    return { ...mission, revision: mission.revision ?? 0, assessment };
  }
  function state(actor: User): AppState {
    const sources = listData<EvidenceSource>(db, "sources", actor.id);
    return {
      user: actor,
      sites: listData<Site>(db, "sites", actor.id),
      sources,
      missions: listData<Mission>(db, "missions", actor.id).map((m) =>
        assess(actor.id, m, sources),
      ),
      audit: recentAudit(db, actor.id),
      integrations: {
        anakinConfigured: options.anakinConfigured ?? isAnakinConfigured(),
        directAvailable: true,
      },
      serverTime: new Date().toISOString(),
    };
  }
  function invalidate(
    tenant: string,
    sourceId: string,
    actor: string,
    reason: string,
  ) {
    invalidateSourceApprovals(db, tenant, sourceId, actor, reason);
  }
  function validateReferences(
    tenant: string,
    siteId: string,
    sourceIds: string[],
  ) {
    siteFor(tenant, siteId);
    for (const sourceId of sourceIds) {
      const source = sourceFor(tenant, sourceId);
      if (source.siteId && source.siteId !== siteId)
        fail(400, "Site-specific evidence must belong to the mission site.");
    }
  }
  function cap(
    table: "sites" | "sources" | "missions",
    tenant: string,
    max: number,
  ) {
    const row = db
      .prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE tenant_id=?`)
      .get(tenant) as { total: number };
    if (row.total >= max)
      fail(409, `This workspace has reached its ${table} limit (${max}).`);
  }
  app.get("/api/health", async () => ({ status: "ok", version: "1.0.0" }));
  app.get("/api/auth/me", async (request) => ({ user: request.user }));
  app.post("/api/auth/register", limited, async (request, reply) => {
    const input = parse(registerSchema, request.body);
    const password_hash = await hashPassword(input.password);
    const row: UserRow = {
      id: randomUUID(),
      name: input.name,
      email: input.email,
      workspace: input.workspace,
      password_hash,
      demo: 0,
      created_at: new Date().toISOString(),
    };
    try {
      db.transaction(() => {
        db.prepare(
          "INSERT INTO users(id,name,email,workspace,password_hash,demo,created_at) VALUES(@id,@name,@email,@workspace,@password_hash,@demo,@created_at)",
        ).run(row);
        appendAudit(
          db,
          row.id,
          row.name,
          "workspace.created",
          row.workspace,
          "Created an empty workspace. Add your own sites, sources and planned jobs.",
        );
      })();
    } catch (error) {
      if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE")
        fail(409, "An account with this email already exists.");
      throw error;
    }
    const account = publicUser(row);
    createSession(
      db,
      account,
      reply,
      secure,
      request.cookies.groundproof_session,
    );
    return reply.status(201).send({ user: account });
  });
  app.post("/api/auth/login", limited, async (request, reply) => {
    const input = parse(loginSchema, request.body);
    const identityHash = createHash("sha256").update(input.email).digest("hex");
    if (!reserveLoginAttempt(db, identityHash))
      fail(
        429,
        "Too many sign-in attempts for this account. Try again in 15 minutes.",
      );
    const row = db
      .prepare("SELECT * FROM users WHERE email=? AND demo=0")
      .get(input.email) as UserRow | undefined;
    if (!(await verifyPassword(input.password, row?.password_hash)) || !row)
      fail(401, "Email or password is incorrect.");
    db.prepare("DELETE FROM login_attempts WHERE identity_hash=?").run(
      identityHash,
    );
    const account = publicUser(row);
    createSession(
      db,
      account,
      reply,
      secure,
      request.cookies.groundproof_session,
    );
    appendAudit(
      db,
      account.id,
      account.name,
      "session.started",
      account.workspace,
      "Signed in with a password.",
    );
    return { user: account };
  });
  app.post("/api/auth/logout", async (request, reply) => {
    clearSession(db, reply, secure, request.cookies.groundproof_session);
    return { ok: true };
  });
  app.post(
    "/api/demo/start",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const uid = randomUUID();
      const row: UserRow = {
        id: uid,
        name: "Demo operator",
        email: `demo-${uid}@groundproof.invalid`,
        workspace: "Boston field operations",
        password_hash: "disabled",
        demo: 1,
        created_at: new Date().toISOString(),
      };
      const account = publicUser(row);
      db.transaction(() => {
        db.prepare(
          "INSERT INTO users(id,name,email,workspace,password_hash,demo,created_at) VALUES(@id,@name,@email,@workspace,@password_hash,@demo,@created_at)",
        ).run(row);
        seedDemo(db, account);
      })();
      createSession(
        db,
        account,
        reply,
        secure,
        request.cookies.groundproof_session,
      );
      return reply.status(201).send({ user: account });
    },
  );
  app.post("/api/demo/reset", async (request) => {
    const actor = user(request);
    if (!actor.demo)
      fail(403, "Reset is only available in a demonstration workspace.");
    db.transaction(() => {
      for (const table of ["missions", "sources", "sites", "audit"])
        db.prepare(`DELETE FROM ${table} WHERE tenant_id=?`).run(actor.id);
      seedDemo(db, actor);
      appendAudit(
        db,
        actor.id,
        actor.name,
        "demo.reset",
        actor.workspace,
        "Reset only this isolated demonstration workspace.",
      );
    })();
    return state(actor);
  });
  app.get("/api/state", async (request) => state(user(request)));
  app.post("/api/sites", async (request, reply) => {
    const actor = user(request),
      input = parse(siteSchema, request.body),
      site: Site = { id: randomUUID(), ...input };
    db.transaction(() => {
      cap("sites", actor.id, 200);
      insertData(db, "sites", actor.id, site);
      appendAudit(
        db,
        actor.id,
        actor.name,
        "site.created",
        site.name,
        "Added a planning site. Coordinates do not define a flight route.",
        site.id,
      );
    })();
    return reply.status(201).send(site);
  });
  app.post("/api/sources", async (request, reply) => {
    const actor = user(request),
      input = parse(sourceSchema, request.body);
    try {
      validateSourceUrl(input.url);
    } catch (error) {
      fail(400, (error as Error).message);
    }
    const source: EvidenceSource = {
      id: randomUUID(),
      ...input,
      latest: null,
      previous: null,
      reviewedHash: null,
      reviewDecision: null,
      reviewNote: null,
      reviewedBy: null,
      reviewedAt: null,
      lastError: null,
      updatedAt: new Date().toISOString(),
      fixture: false,
    };
    db.transaction(() => {
      if (input.siteId) siteFor(actor.id, input.siteId);
      cap("sources", actor.id, 200);
      insertData(db, "sources", actor.id, source);
      appendAudit(
        db,
        actor.id,
        actor.name,
        "source.created",
        source.title,
        `Added ${source.url}. No content has been captured or accepted yet.`,
        source.id,
      );
    })();
    return reply.status(201).send(source);
  });
  app.post("/api/sources/record", async (request, reply) => {
    const actor = user(request),
      input = parse(
        z
          .object({
            title: text(),
            category: z.enum([
              "site-access",
              "airspace",
              "insurance",
              "operating-policy",
            ]),
            siteId: id.nullable(),
            freshnessHours: z.number().min(1).max(8760),
            ...recordFields,
          })
          .strict(),
        request.body,
      );
    const source: EvidenceSource = {
      id: randomUUID(),
      title: input.title,
      url: "",
      category: input.category,
      siteId: input.siteId,
      freshnessHours: input.freshnessHours,
      latest: null,
      previous: null,
      reviewedHash: null,
      reviewDecision: null,
      reviewNote: null,
      reviewedBy: null,
      reviewedAt: null,
      lastError: null,
      updatedAt: new Date().toISOString(),
      fixture: false,
      kind: "record",
      reference: input.reference,
      validUntil: input.validUntil ?? null,
    };
    source.url = `https://groundproof.invalid/operator-record/${source.id}`;
    const record = db.transaction(() => {
      if (source.siteId) siteFor(actor.id, source.siteId);
      cap("sources", actor.id, 200);
      assertArchiveCapacity(db, actor.id);
      insertData(db, "sources", actor.id, source);
      const saved = commitSnapshot(
        db,
        actor.id,
        source,
        recordEnvelope(
          input.content,
          input.reference,
          source.validUntil ?? null,
        ),
        "manual",
        actor.name,
      );
      appendAudit(
        db,
        actor.id,
        actor.name,
        "record.created",
        source.title,
        "Operator supplied a text excerpt and reference. Original document retained by the operator; authenticity and permissions are not verified by GroundProof.",
        source.id,
      );
      return saved;
    })();
    return reply.status(201).send(record);
  });
  app.post<{ Params: { id: string } }>(
    "/api/sources/:id/record",
    async (request) => {
      const actor = user(request),
        input = parse(
          z
            .object({
              ...recordFields,
              expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
            })
            .strict(),
          request.body,
        );
      return db.transaction(() => {
        const source = sourceFor(actor.id, request.params.id);
        if (source.kind !== "record")
          fail(
            400,
            "Only operator-supplied records can be edited through this endpoint.",
          );
        if (!source.latest || source.latest.hash !== input.expectedHash)
          fail(
            409,
            "The record changed since you opened it. Refresh and inspect the current version.",
          );
        assertArchiveCapacity(db, actor.id);
        source.reference = input.reference;
        source.validUntil = input.validUntil ?? null;
        const saved = commitSnapshot(
          db,
          actor.id,
          source,
          recordEnvelope(input.content, input.reference, source.validUntil),
          "manual",
          actor.name,
          { forceReview: true },
        );
        appendAudit(
          db,
          actor.id,
          actor.name,
          "record.updated",
          source.title,
          "Operator replaced the supplied text/reference/validity. Prior snapshots retained; current review and dependent signatures revoked.",
          source.id,
        );
        return saved;
      })();
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/sources/:id/capture",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const actor = user(request),
        input = parse(
          z.object({ provider: z.enum(["direct", "anakin"]) }).strict(),
          request.body,
        );
      const result = await captureAndPersist(
        db,
        actor.id,
        request.params.id,
        input.provider,
        actor.name,
        { capture },
      );
      if (!result.ok)
        return reply.status(result.statusCode).send({ error: result.error });
      return result.source;
    },
  );
  app.patch<{ Params: { id: string } }>(
    "/api/sources/:id/monitor",
    async (request) => {
      const actor = user(request),
        input = parse(
          z
            .object({
              enabled: z.boolean(),
              intervalHours: z.number().int().min(1).max(168),
              provider: z.enum(["direct", "anakin"]),
            })
            .strict(),
          request.body,
        );
      return db.transaction(() => {
        const source = sourceFor(actor.id, request.params.id);
        if (source.kind === "record")
          fail(
            400,
            "Operator-supplied records cannot enable web monitoring. Update the record when its owner provides new evidence.",
          );
        if (source.fixture)
          fail(
            400,
            "Scheduled monitoring is available only for real public sources. Demo fixtures use scenario controls.",
          );
        if (input.enabled && input.intervalHours >= source.freshnessHours)
          fail(
            400,
            "Choose a monitoring interval shorter than the evidence freshness window.",
          );
        source.monitor = {
          ...input,
          nextCaptureAt: input.enabled ? new Date().toISOString() : null,
          lastAttemptAt: source.monitor?.lastAttemptAt ?? null,
        };
        source.updatedAt = new Date().toISOString();
        updateData(db, "sources", actor.id, source);
        appendAudit(
          db,
          actor.id,
          actor.name,
          "monitor.configured",
          source.title,
          input.enabled
            ? `Enabled ${input.provider} monitoring every ${input.intervalHours} hour(s). Provider charges may apply; source decisions remain manual.`
            : "Disabled scheduled monitoring.",
          source.id,
        );
        return source;
      })();
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/sources/:id/review",
    async (request) => {
      const actor = user(request),
        input = parse(
          z
            .object({
              expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
              decision: z.enum(["accepted", "blocked"]),
              note,
            })
            .strict(),
          request.body,
        );
      return db.transaction(() => {
        const source = sourceFor(actor.id, request.params.id);
        if (!source.latest || source.latest.hash !== input.expectedHash)
          fail(
            409,
            "Evidence changed since you opened it. Refresh and review the latest content.",
          );
        if (hashContent(source.latest.content) !== source.latest.hash)
          fail(
            409,
            "Evidence content failed its integrity check. Capture the source again.",
          );
        if (source.lastError)
          fail(409, "Capture the source successfully before reviewing it.");
        if (
          source.validUntil &&
          (!Number.isFinite(Date.parse(source.validUntil)) ||
            Date.parse(source.validUntil) <= Date.now())
        )
          fail(
            409,
            "This operator record has expired. Obtain and record current evidence before review.",
          );
        const age = Date.now() - Date.parse(source.latest.capturedAt);
        if (
          !Number.isFinite(age) ||
          age < 0 ||
          age >= source.freshnessHours * 3600000
        )
          fail(
            409,
            "Evidence is stale or has an invalid timestamp. Capture it again before review.",
          );
        source.reviewedHash = input.expectedHash;
        source.reviewDecision = input.decision;
        source.reviewNote = input.note;
        source.reviewedBy = actor.name;
        source.reviewedAt = new Date().toISOString();
        source.updatedAt = source.reviewedAt;
        updateData(db, "sources", actor.id, source);
        if (input.decision === "blocked")
          invalidate(
            actor.id,
            source.id,
            actor.name,
            "A reviewer blocked this evidence.",
          );
        appendAudit(
          db,
          actor.id,
          actor.name,
          "evidence.reviewed",
          source.title,
          `${input.decision}; SHA-256 ${input.expectedHash}; ${input.note}`,
          source.id,
        );
        return source;
      })();
    },
  );
  app.post("/api/missions", async (request, reply) => {
    const actor = user(request),
      input = parse(missionSchema, request.body);
    const mission: Mission = {
      id: randomUUID(),
      ...input,
      revision: 0,
      approval: null,
      createdAt: new Date().toISOString(),
      assessment: { status: "draft", issues: [] },
    };
    db.transaction(() => {
      validateReferences(actor.id, input.siteId, input.sourceIds);
      cap("missions", actor.id, 1000);
      insertData(db, "missions", actor.id, mission);
      appendAudit(
        db,
        actor.id,
        actor.name,
        "mission.created",
        mission.name,
        "Created a planned job. Evidence review and a separate human sign-off are required.",
        mission.id,
      );
    })();
    return reply
      .status(201)
      .send(
        assess(
          actor.id,
          mission,
          listData<EvidenceSource>(db, "sources", actor.id),
        ),
      );
  });
  app.patch<{ Params: { id: string } }>(
    "/api/missions/:id",
    async (request) => {
      const actor = user(request),
        input = parse(
          missionSchema
            .partial()
            .extend({
              expectedRevision: z.number().int().nonnegative().optional(),
            })
            .refine(
              (value) => Object.keys(value).length > 0,
              "Include at least one field.",
            ),
          request.body,
        );
      return db.transaction(() => {
        const previous = missionFor(actor.id, request.params.id);
        const { expectedRevision, ...changes } = input;
        if (
          expectedRevision !== undefined &&
          expectedRevision !== (previous.revision ?? 0)
        )
          fail(
            409,
            "Mission details changed since you opened this form. Refresh before saving.",
          );
        const mission = {
          ...previous,
          ...changes,
          revision: (previous.revision ?? 0) + 1,
          approval: null,
        };
        validateReferences(actor.id, mission.siteId, mission.sourceIds);
        updateData(db, "missions", actor.id, mission);
        db.prepare(
          "UPDATE missions SET invalidated=1 WHERE tenant_id=? AND id=?",
        ).run(actor.id, mission.id);
        appendAudit(
          db,
          actor.id,
          actor.name,
          "mission.updated",
          mission.name,
          "Planning details changed. Previous approval invalidated; a new sign-off is required.",
          mission.id,
        );
        return assess(
          actor.id,
          mission,
          listData<EvidenceSource>(db, "sources", actor.id),
        );
      })();
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/missions/:id/approve",
    async (request) => {
      const actor = user(request),
        input = parse(
          z
            .object({
              expectedRevision: z.number().int().nonnegative(),
              expectedHashes: z.record(
                z.string().uuid(),
                z.string().regex(/^[a-f0-9]{64}$/),
              ),
              note,
            })
            .strict(),
          request.body,
        );
      return db.transaction(() => {
        const mission = missionFor(actor.id, request.params.id),
          sources = listData<EvidenceSource>(db, "sources", actor.id);
        if (input.expectedRevision !== (mission.revision ?? 0))
          fail(
            409,
            "Mission details or evidence changed since you opened this review. Reopen the mission and inspect the current record.",
          );
        if (
          Object.keys(input.expectedHashes).length !==
            mission.sourceIds.length ||
          mission.sourceIds.some(
            (sid) => !Object.hasOwn(input.expectedHashes, sid),
          )
        )
          fail(
            409,
            "Sign-off must include exactly the current required evidence sources.",
          );
        for (const sid of mission.sourceIds) {
          const source = sources.find((s) => s.id === sid);
          if (
            !source?.latest ||
            source.latest.hash !== input.expectedHashes[sid] ||
            hashContent(source.latest.content) !== source.latest.hash
          )
            fail(
              409,
              "Evidence changed or is missing. Refresh and inspect the latest content before signing.",
            );
        }
        const assessment = assessMission(
          { ...mission, approval: null },
          sources,
        );
        if (assessment.issues.length || assessment.status !== "draft")
          fail(
            409,
            "All required evidence must be fresh, available and accepted before sign-off.",
          );
        mission.approval = {
          id: randomUUID(),
          actor: actor.name,
          at: new Date().toISOString(),
          note: input.note,
          hashes: { ...input.expectedHashes },
        };
        updateData(db, "missions", actor.id, mission);
        db.prepare(
          "UPDATE missions SET invalidated=0 WHERE tenant_id=? AND id=?",
        ).run(actor.id, mission.id);
        appendAudit(
          db,
          actor.id,
          actor.name,
          "mission.approved",
          mission.name,
          `Approval ${mission.approval.id}; ${input.note}; bound hashes ${JSON.stringify(input.expectedHashes)}. This is an evidence sign-off, not flight authorization.`,
          mission.id,
        );
        return assess(actor.id, mission, sources);
      })();
    },
  );
  app.post("/api/demo/drill", async (request) => {
    const actor = user(request);
    if (!actor.demo)
      fail(
        403,
        "Scenario injection is only available in a demonstration workspace.",
      );
    const { scenario } = parse(
      z
        .object({
          scenario: z.enum(["closure", "stale", "unavailable", "restore"]),
        })
        .strict(),
      request.body,
    );
    db.transaction(() => {
      const source =
        listData<EvidenceSource>(db, "sources", actor.id).find(
          (s) => s.fixture && s.title === "Harbor Works access notice",
        ) ?? fail(404, "Demonstration source missing. Reset this demo.");
      invalidate(
        actor.id,
        source.id,
        actor.name,
        `Demonstration scenario: ${scenario}.`,
      );
      if (scenario === "unavailable")
        source.lastError =
          "Simulated source outage: HTTP 503. The last successful snapshot is preserved.";
      else {
        const content =
          scenario === "closure"
            ? HARBOR_CLOSED
            : scenario === "restore"
              ? HARBOR_OPEN
              : source.latest!.content;
        const capturedAt =
          scenario === "stale"
            ? new Date(Date.now() - 49 * 3600000).toISOString()
            : new Date().toISOString();
        const snapshot = makeSnapshot(content, "fixture", capturedAt);
        source.previous = source.latest;
        source.latest = snapshot;
        source.lastError = null;
        if (scenario === "closure" || scenario === "restore") {
          source.reviewedHash = null;
          source.reviewDecision = null;
          source.reviewNote = null;
          source.reviewedBy = null;
          source.reviewedAt = null;
        }
        saveSnapshot(db, actor.id, source.id, snapshot);
      }
      source.updatedAt = new Date().toISOString();
      updateData(db, "sources", actor.id, source);
      appendAudit(
        db,
        actor.id,
        actor.name,
        `demo.${scenario}`,
        source.title,
        "Injected a fictional scenario. All dependent signatures invalidated. No real source or aviation operation was modified.",
        source.id,
      );
    })();
    return state(actor);
  });
  app.post("/api/lab/run", async (request) => {
    const actor = user(request),
      report = runLab();
    appendAudit(
      db,
      actor.id,
      actor.name,
      "lab.executed",
      "Evidence rules lab",
      `${report.passed}/${report.total} independent rule checks passed.`,
    );
    return report;
  });
  app.get<{ Params: { id: string } }>(
    "/api/missions/:id/export",
    async (request, reply) => {
      const actor = user(request);
      const payload = db.transaction(() => {
        const allSources = listData<EvidenceSource>(db, "sources", actor.id),
          mission = assess(
            actor.id,
            missionFor(actor.id, request.params.id),
            allSources,
          );
        const sources = allSources.filter((s) =>
          mission.sourceIds.includes(s.id),
        );
        for (const source of sources)
          for (const snapshot of [source.latest, source.previous]) {
            if (snapshot && hashContent(snapshot.content) !== snapshot.hash)
              fail(409, "Evidence failed its integrity check. Export stopped.");
          }
        appendAudit(
          db,
          actor.id,
          actor.name,
          "mission.exported",
          mission.name,
          "Exported a self-contained evidence bundle with canonical SHA-256 manifest.",
          mission.id,
        );
        return {
          schemaVersion: "groundproof.evidence.v1",
          exportedAt: new Date().toISOString(),
          scope:
            "Operational evidence management only. This bundle is not flight authorization, legal advice, airspace clearance or proof of insurance. A SHA-256 digest detects changes; it does not establish third-party authenticity.",
          workspace: { name: actor.workspace, demo: actor.demo },
          mission,
          site: siteFor(actor.id, mission.siteId),
          sources,
          audit: objectAudit(db, actor.id, [
            mission.id,
            ...sources.map((s) => s.id),
          ]),
        };
      })();
      const manifest = {
        algorithm: "SHA-256",
        canonicalization:
          "Recursive lexicographic object-key ordering; array order preserved; UTF-8 JSON; exclude manifest from hash.",
        hash: hashManifest(payload),
      };
      reply
        .header("Content-Type", "application/json; charset=utf-8")
        .header(
          "Content-Disposition",
          `attachment; filename="groundproof-${request.params.id}.json"`,
        );
      return { ...payload, manifest };
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/api/missions/:id",
    async (request) => {
      const actor = user(request);
      db.transaction(() => {
        const mission = missionFor(actor.id, request.params.id);
        db.prepare("DELETE FROM missions WHERE tenant_id=? AND id=?").run(
          actor.id,
          mission.id,
        );
        appendAudit(
          db,
          actor.id,
          actor.name,
          "mission.deleted",
          mission.name,
          "Removed the planned job; audit history retained.",
          mission.id,
        );
      })();
      return { ok: true };
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/api/sources/:id",
    async (request) => {
      const actor = user(request);
      db.transaction(() => {
        const source = sourceFor(actor.id, request.params.id);
        if (
          listData<Mission>(db, "missions", actor.id).some((m) =>
            m.sourceIds.includes(source.id),
          )
        )
          fail(
            409,
            "This source is required by a planned job. Remove those references first.",
          );
        db.prepare("DELETE FROM sources WHERE tenant_id=? AND id=?").run(
          actor.id,
          source.id,
        );
        appendAudit(
          db,
          actor.id,
          actor.name,
          "source.deleted",
          source.title,
          "Removed an unreferenced evidence source.",
          source.id,
        );
      })();
      return { ok: true };
    },
  );
  app.delete<{ Params: { id: string } }>("/api/sites/:id", async (request) => {
    const actor = user(request);
    db.transaction(() => {
      const site = siteFor(actor.id, request.params.id);
      if (
        listData<Mission>(db, "missions", actor.id).some(
          (m) => m.siteId === site.id,
        ) ||
        listData<EvidenceSource>(db, "sources", actor.id).some(
          (s) => s.siteId === site.id,
        )
      )
        fail(
          409,
          "This site is referenced by evidence or jobs. Remove those references first.",
        );
      db.prepare("DELETE FROM sites WHERE tenant_id=? AND id=?").run(
        actor.id,
        site.id,
      );
      appendAudit(
        db,
        actor.id,
        actor.name,
        "site.deleted",
        site.name,
        "Removed an unreferenced planning site.",
        site.id,
      );
    })();
    return { ok: true };
  });
  const staticRoot = options.staticRoot ?? resolve("dist");
  if (existsSync(staticRoot)) {
    await app.register(staticFiles, { root: staticRoot, prefix: "/" });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith("/api/"))
        return reply.status(404).send({ error: "Endpoint not found." });
      if (request.method !== "GET")
        return reply.status(404).send({ error: "Not found." });
      return reply.sendFile("index.html");
    });
  } else
    app.setNotFoundHandler(async (_request, reply) =>
      reply
        .status(404)
        .send({
          error: "Endpoint not found. Build the frontend with npm run build.",
        }),
    );
  return app;
}
