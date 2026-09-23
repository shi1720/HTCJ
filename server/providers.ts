import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { gunzipSync, inflateSync, brotliDecompressSync } from "node:zlib";

const APPROVED_DOMAINS = [
  "faa.gov",
  "nps.gov",
  "boston.gov",
  "mass.gov",
  "weather.gov",
  "noaa.gov",
];
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_TEXT = 180_000;
const REQUEST_TIMEOUT_MS = 25_000;
const ANAKIN_ORIGIN = "https://api.anakin.io";
const USER_AGENT =
  "GroundProof/1.0 (+https://github.com/shi1720/HTCJ; public-evidence-research)";

export function validateSourceUrl(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Enter a valid HTTPS source URL.");
  }
  if (
    raw.length > 2048 ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new Error(
      "Sources must use public HTTPS on port 443 without embedded credentials.",
    );
  }
  if (
    !APPROVED_DOMAINS.some(
      (domain) =>
        url.hostname === domain || url.hostname.endsWith(`.${domain}`),
    )
  ) {
    throw new Error(
      "Use an approved government source: faa.gov, nps.gov, boston.gov, mass.gov, weather.gov or noaa.gov.",
    );
  }
}

/** Reject reserved address ranges, including IPv4-mapped IPv6; DNS is pinned per request. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0)
    );
  }
  if (family !== 6) return false;
  const normalized = address.toLowerCase();
  // IPv4-compatible/mapped and translation ranges are excluded conservatively.
  if (
    normalized.includes(".") ||
    normalized.startsWith("::") ||
    normalized.startsWith("64:ff9b:")
  )
    return false;
  // Public unicast is currently 2000::/3. Exclude documentation / special assignments.
  const groups = normalized.split(":");
  const first = Number.parseInt(groups[0], 16);
  const second = Number.parseInt(groups[1] || "0", 16);
  return (
    first >= 0x2000 &&
    first < 0x3fff &&
    !(first === 0x2001 && second <= 0x1ff) &&
    !(first === 0x2001 && second === 0xdb8) &&
    first !== 0x2002
  );
}

type HttpResult = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

async function resolvePublic(hostname: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let addresses: { address: string; family: number }[];
  try {
    addresses = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("DNS timeout")), 5_000);
      }),
    ]);
  } catch {
    throw new Error("Source hostname could not be resolved.");
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (
    !addresses.length ||
    addresses.some((item) => !isPublicAddress(item.address))
  )
    throw new Error(
      "Source resolves to a private or reserved network address.",
    );
  return addresses.find((item) => item.family === 4) ?? addresses[0];
}

async function httpsRequest(
  url: URL,
  body?: string,
  apiKey?: string,
): Promise<HttpResult> {
  const selected = await resolvePublic(url.hostname);
  return new Promise((resolve, reject) => {
    let completed = false;
    const finishError = (message: string) => {
      if (!completed) {
        completed = true;
        clearTimeout(timer);
        reject(new Error(message));
      }
    };
    const req = request(
      url,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            body === undefined && url.origin !== ANAKIN_ORIGIN
              ? "text/html,application/xhtml+xml,text/plain"
              : "application/json",
          "Accept-Encoding": "identity",
          ...(body === undefined
            ? {}
            : {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
              }),
          ...(apiKey ? { "X-API-Key": apiKey } : {}),
        },
        lookup: (_hostname, options, callback) => {
          // Modern Node may request all results for family auto-selection.
          if (typeof options === "object" && options.all)
            callback(null, [
              { address: selected.address, family: selected.family },
            ] as never);
          else callback(null, selected.address, selected.family);
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > MAX_BYTES) {
            finishError("Source response exceeds the 2 MB capture limit.");
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", () =>
          finishError("Source response was interrupted."),
        );
        response.on("end", () => {
          if (completed) return;
          try {
            let data = Buffer.concat(chunks);
            const encoding = response.headers["content-encoding"];
            const options = { maxOutputLength: MAX_BYTES };
            if (encoding === "gzip") data = gunzipSync(data, options);
            else if (encoding === "deflate") data = inflateSync(data, options);
            else if (encoding === "br")
              data = brotliDecompressSync(data, options);
            else if (encoding && encoding !== "identity")
              throw new Error("encoding");
            completed = true;
            clearTimeout(timer);
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers,
              body: data.toString("utf8"),
            });
          } catch {
            finishError(
              "Source response encoding or decompressed size is unsupported.",
            );
          }
        });
      },
    );
    const timer = setTimeout(() => {
      finishError(
        "Source capture timed out. Retry when the provider is available.",
      );
      req.destroy();
    }, REQUEST_TIMEOUT_MS);
    req.on("error", () => finishError("Secure connection to source failed."));
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "\u2014",
    lsquo: "‘",
    rsquo: "’",
    ldquo: "“",
    rdquo: "”",
    hellip: "…",
  };
  return value.replace(
    /&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (original, entity: string) => {
      if (entity[0] !== "#") return named[entity.toLowerCase()] ?? original;
      const point =
        entity[1].toLowerCase() === "x"
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return point > 0 &&
        point <= 0x10ffff &&
        !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : "";
    },
  );
}

/** Plain text only; returned data must always be rendered as text, never as HTML/Markdown HTML. */
export function extractPlainText(content: string, html = false): string {
  let text = content;
  if (html)
    text = text
      .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
      .replace(
        /<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
        "",
      )
      .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*$/gi, "")
      .replace(
        /<\/(?:p|div|h[1-6]|li|tr|section|article|header|footer|nav)>|<br\s*\/?>/gi,
        "\n",
      )
      .replace(/<[^>]*>/g, "");
  text = decodeEntities(text)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length > MAX_TEXT)
    throw new Error(
      "Extracted text exceeds the 180,000 character evidence limit.",
    );
  if (text.length < 40)
    throw new Error(
      "Source returned too little readable text to capture evidence.",
    );
  return text;
}

async function captureDirect(rawUrl: string): Promise<{ content: string }> {
  let url = new URL(rawUrl);
  for (let redirects = 0; redirects <= 4; redirects++) {
    validateSourceUrl(url.href);
    const result = await httpsRequest(url);
    if ([301, 302, 303, 307, 308].includes(result.status)) {
      if (redirects === 4) throw new Error("Source redirected too many times.");
      const location = result.headers.location;
      if (typeof location !== "string")
        throw new Error("Source returned an invalid redirect.");
      url = new URL(location, url);
      validateSourceUrl(url.href);
      continue;
    }
    if (result.status !== 200)
      throw new Error(
        `Direct source capture returned HTTP ${result.status}. Previous evidence has been preserved.`,
      );
    const type = String(result.headers["content-type"] ?? "").toLowerCase();
    if (!/^(text\/(html|plain)|application\/xhtml\+xml)\b/.test(type))
      throw new Error(
        "Capture supports HTML and plain text sources. Link to a readable government page instead of a PDF or binary file.",
      );
    const content = extractPlainText(
      result.body,
      !type.startsWith("text/plain"),
    );
    if (
      /^(access denied|just a moment|request rejected|attention required)/i.test(
        content.slice(0, 80),
      )
    )
      throw new Error(
        "Source returned an access challenge instead of evidence.",
      );
    return { content };
  }
  throw new Error("Source capture did not complete.");
}

export function isAnakinConfigured(): boolean {
  return Boolean(process.env.ANAKIN_API_KEY?.trim());
}

async function captureAnakin(url: string): Promise<{ content: string }> {
  // Validate the requested destination before handing it to a remote capture service.
  await resolvePublic(new URL(url).hostname);
  const apiKey = process.env.ANAKIN_API_KEY?.trim();
  let response = await httpsRequest(
    new URL("/v1/url-scraper/scrape", ANAKIN_ORIGIN),
    JSON.stringify({
      url,
      country: "us",
      useBrowser: false,
      generateJson: false,
    }),
    apiKey,
  );
  for (let attempt = 0; attempt < 5; attempt++) {
    if (response.status === 402) {
      let capacity = false;
      try {
        capacity = JSON.parse(response.body)?.error === "keyless_unavailable";
      } catch {
        /* Generic, non-sensitive provider failure below. */
      }
      throw new Error(
        capacity
          ? "Anakin keyless capacity is unavailable. Add a server API key or explicitly choose Direct capture."
          : "Anakin rejected the request because of its credit or account limit. Check the server API key and credit balance, or explicitly choose Direct capture.",
      );
    }
    if (response.status === 401 || response.status === 403)
      throw new Error(
        "Anakin authentication failed. Check the server API key.",
      );
    if (response.status === 429)
      throw new Error(
        "Anakin rate limit reached. Retry later; previous evidence is preserved.",
      );
    if (![200, 202].includes(response.status))
      throw new Error(
        `Anakin returned HTTP ${response.status}. Previous evidence is preserved.`,
      );
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(response.body);
    } catch {
      throw new Error("Anakin returned invalid JSON.");
    }
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("Anakin returned an invalid response.");
    if (data.status === "failed" || data.error)
      throw new Error(
        "Anakin reported a failed scrape. Previous evidence is preserved.",
      );
    for (const field of ["url", "finalUrl", "final_url"]) {
      if (typeof data[field] === "string") validateSourceUrl(data[field]);
    }
    if (
      response.status === 200 &&
      (data.status === undefined || data.status === "completed") &&
      typeof data.markdown === "string"
    ) {
      return { content: extractPlainText(data.markdown) };
    }
    if (
      response.status === 202 ||
      ["pending", "queued", "processing", "running"].includes(
        String(data.status),
      )
    ) {
      if (
        typeof data.id !== "string" ||
        !/^[A-Za-z0-9_-]{1,160}$/.test(data.id)
      )
        throw new Error("Anakin returned an invalid job identifier.");
      if (attempt === 4) break;
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
      response = await httpsRequest(
        new URL(`/v1/url-scraper/${data.id}`, ANAKIN_ORIGIN),
        undefined,
        apiKey,
      );
      continue;
    }
    throw new Error("Anakin returned no completed readable evidence.");
  }
  throw new Error(
    "Anakin capture is still processing. Retry later; previous evidence is preserved.",
  );
}

export async function captureSource(
  url: string,
  provider: "direct" | "anakin",
): Promise<{ content: string }> {
  validateSourceUrl(url);
  if (provider === "direct") return captureDirect(url);
  if (provider === "anakin") return captureAnakin(url);
  throw new Error("Choose Direct or Anakin capture.");
}
