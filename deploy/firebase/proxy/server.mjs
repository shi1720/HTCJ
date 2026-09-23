import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const LIMIT = 256 * 1024;
const safeHeaders = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000",
  vary: "Cookie, Origin",
};
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function json(res, status, error) {
  res.writeHead(status, {
    ...safeHeaders,
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify({ error }));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    const cleanup = () => {
      req.off("data", data);
      req.off("end", end);
      req.off("error", error);
      req.off("aborted", aborted);
    };
    const error = (err) => {
      cleanup();
      reject(err);
    };
    const aborted = () =>
      error(new HttpError(400, "Request body was interrupted."));
    const data = (chunk) => {
      bytes += chunk.length;
      if (bytes > LIMIT) {
        cleanup();
        req.resume();
        reject(new HttpError(413, "Request body is too large."));
        return;
      }
      chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      resolve(Buffer.concat(chunks));
    };
    req.on("data", data);
    req.once("end", end);
    req.once("error", error);
    req.once("aborted", aborted);
  });
}
export function gatewaySignature(secret, timestamp, method, path, network) {
  return createHmac("sha256", secret)
    .update([timestamp, method, path, network].join("\n"))
    .digest("hex");
}
export function firebaseCookie(cookie = "") {
  const values = cookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("__session="));
  if (values.length !== 1) return "";
  const token = values[0].slice("__session=".length);
  return /^[a-f0-9]{64}$/.test(token) ? `groundproof_session=${token}` : "";
}
export function createGateway({
  upstreamOrigin,
  publicOrigins,
  secret,
  fetchImpl = fetch,
  trustGoogleProxy = false,
}) {
  const upstream = new URL(upstreamOrigin);
  if (
    upstream.protocol !== "https:" ||
    upstream.pathname !== "/" ||
    upstream.search ||
    upstream.hash ||
    upstream.username ||
    upstream.password
  )
    throw new Error("UPSTREAM_ORIGIN must be an HTTPS origin.");
  if (!secret || secret.length < 32)
    throw new Error("GATEWAY_SECRET must contain at least 32 characters.");
  const allowed = new Set(publicOrigins);
  if (
    !allowed.size ||
    [...allowed].some(
      (value) => new URL(value).origin !== value || !value.startsWith("https:"),
    )
  )
    throw new Error("PUBLIC_ORIGINS must contain exact HTTPS origins.");
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://gateway.invalid");
      if (url.origin !== "http://gateway.invalid")
        throw new HttpError(400, "Invalid request path.");
      if (url.pathname === "/healthz") {
        res.writeHead(200, {
          ...safeHeaders,
          "content-type": "application/json",
        });
        res.end('{"status":"ok"}');
        return;
      }
      if (url.pathname !== "/api" && !url.pathname.startsWith("/api/"))
        throw new HttpError(404, "Endpoint not found.");
      if (
        !["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(
          req.method,
        )
      )
        throw new HttpError(405, "Method not allowed.");
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      if (
        mutating &&
        (req.headers["sec-fetch-site"] === "cross-site" ||
          (req.headers.origin && !allowed.has(req.headers.origin)))
      )
        throw new HttpError(403, "Request origin is not allowed.");
      if (Number(req.headers["content-length"]) > LIMIT)
        throw new HttpError(413, "Request body is too large.");
      const body = mutating ? await readBody(req) : undefined;
      const headers = new Headers();
      for (const name of ["accept", "content-type", "sec-fetch-site"])
        if (typeof req.headers[name] === "string")
          headers.set(name, req.headers[name]);
      if (req.headers.origin) headers.set("origin", upstream.origin);
      const cookie = firebaseCookie(req.headers.cookie);
      if (cookie) headers.set("cookie", cookie);
      // Only the final Google-appended hop is trusted. Firebase may represent
      // many anonymous visitors by one network key. Authenticated limits use the
      // validated account in the Worker, never a user-provided forwarded address.
      const tail = trustGoogleProxy
        ? String(req.headers["x-forwarded-for"] || "")
            .split(",")
            .at(-1)
            ?.trim()
        : undefined;
      const network = isIP(tail || "")
        ? tail
        : isIP(req.socket.remoteAddress || "")
          ? req.socket.remoteAddress
          : "127.0.0.1";
      const timestamp = String(Date.now()),
        path = url.pathname + url.search;
      headers.set("x-groundproof-gateway-time", timestamp);
      headers.set("x-groundproof-gateway-network", network);
      headers.set(
        "x-groundproof-gateway-signature",
        gatewaySignature(secret, timestamp, req.method, path, network),
      );
      const response = await fetchImpl(new URL(path, upstream), {
        method: req.method,
        headers,
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(55000),
      });
      if (response.status >= 300 && response.status < 400)
        throw new HttpError(
          502,
          "The evidence service returned an unexpected redirect.",
        );
      const output = { ...safeHeaders };
      for (const [key, value] of response.headers)
        if (
          ![
            "set-cookie",
            "content-length",
            "content-encoding",
            "transfer-encoding",
            "connection",
            "keep-alive",
            "cache-control",
            "vary",
          ].includes(key)
        )
          output[key] = value;
      const cookies = response.headers
        .getSetCookie()
        .filter((value) => value.startsWith("groundproof_session="))
        .map((value) =>
          value
            .replace(/^groundproof_session=/, "__session=")
            .replace(/;\s*Domain=[^;]+/gi, ""),
        );
      if (cookies.length) output["set-cookie"] = cookies;
      res.writeHead(response.status, output);
      if (req.method === "HEAD" || [204, 304].includes(response.status)) {
        res.end();
        return;
      }
      if (response.body) await pipeline(Readable.fromWeb(response.body), res);
      else res.end();
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      json(
        res,
        error instanceof HttpError ? error.status : 502,
        error instanceof HttpError
          ? error.message
          : "The evidence service is temporarily unavailable. Please retry.",
      );
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const server = createGateway({
    upstreamOrigin: process.env.UPSTREAM_ORIGIN,
    publicOrigins: (process.env.PUBLIC_ORIGINS || "")
      .split(",")
      .filter(Boolean),
    secret: process.env.GATEWAY_SECRET,
    trustGoogleProxy: process.env.K_SERVICE !== undefined,
  });
  server.requestTimeout = 60000;
  server.headersTimeout = 15000;
  server.listen(Number(process.env.PORT || 8080), "0.0.0.0");
}
