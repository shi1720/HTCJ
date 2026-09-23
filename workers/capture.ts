import { extractPlainText, validateSourceUrl } from "../server/providers.js";

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT = 25_000;

async function request(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const response = await fetch(url, {
      ...init,
      redirect: "manual",
      signal: controller.signal,
    });
    if (Number(response.headers.get("content-length")) > MAX_BYTES)
      throw new Error("Source response exceeds the 2 MB capture limit.");
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_BYTES) {
          await reader.cancel();
          throw new Error("Source response exceeds the 2 MB capture limit.");
        }
        chunks.push(chunk.value);
      }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    return {
      status: response.status,
      headers: response.headers,
      body: new TextDecoder().decode(body),
    };
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        "Source capture timed out. Previous evidence is preserved.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Workers uses Cloudflare fetch egress, not the Node provider's DNS-pinning implementation. */
export function workerCapture(apiKey?: string) {
  return async (
    url: string,
    provider: "direct" | "anakin",
  ): Promise<{ content: string }> => {
    validateSourceUrl(url);
    if (provider === "direct") {
      for (let hop = 0; hop <= 4; hop++) {
        validateSourceUrl(url);
        const result = await request(url, {
          headers: {
            Accept: "text/html,application/xhtml+xml,text/plain",
            "User-Agent": "GroundProof/1.0 public-evidence-research",
          },
        });
        if ([301, 302, 303, 307, 308].includes(result.status)) {
          const location = result.headers.get("location");
          if (!location || hop === 4)
            throw new Error("Source redirect cannot be followed.");
          url = new URL(location, url).href;
          validateSourceUrl(url);
          continue;
        }
        if (result.status !== 200)
          throw new Error(
            `Direct source capture returned HTTP ${result.status}. Previous evidence is preserved.`,
          );
        const type = (result.headers.get("content-type") || "").toLowerCase();
        if (!/^(text\/(html|plain)|application\/xhtml\+xml)\b/.test(type))
          throw new Error("Capture supports HTML and plain text sources.");
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
    }
    if (provider !== "anakin")
      throw new Error("Choose Direct or Anakin capture.");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (apiKey?.trim()) headers["X-API-Key"] = apiKey.trim();
    let result = await request("https://api.anakin.io/v1/url-scraper/scrape", {
      method: "POST",
      headers,
      body: JSON.stringify({
        url,
        country: "us",
        useBrowser: false,
        generateJson: false,
      }),
    });
    for (let attempt = 0; attempt < 5; attempt++) {
      if (result.status === 402)
        throw new Error(
          "Anakin credit or keyless capacity is unavailable. Add a server API key or explicitly choose Direct capture.",
        );
      if (result.status === 401 || result.status === 403)
        throw new Error(
          "Anakin authentication failed. Check the server API key.",
        );
      if (result.status === 429)
        throw new Error(
          "Anakin rate limit reached. Retry later; previous evidence is preserved.",
        );
      if (![200, 202].includes(result.status))
        throw new Error(
          `Anakin returned HTTP ${result.status}. Previous evidence is preserved.`,
        );
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(result.body);
      } catch {
        throw new Error("Anakin returned invalid JSON.");
      }
      if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data) ||
        data.error ||
        data.status === "failed"
      )
        throw new Error("Anakin reported a failed scrape.");
      for (const field of ["url", "finalUrl", "final_url"])
        if (typeof data[field] === "string") validateSourceUrl(data[field]);
      if (
        result.status === 200 &&
        (data.status === undefined || data.status === "completed") &&
        typeof data.markdown === "string"
      )
        return { content: extractPlainText(data.markdown) };
      if (
        result.status === 202 ||
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
        await new Promise((resolve) =>
          setTimeout(resolve, 600 * (attempt + 1)),
        );
        result = await request(
          `https://api.anakin.io/v1/url-scraper/${data.id}`,
          { headers },
        );
        continue;
      }
      throw new Error("Anakin returned no completed readable evidence.");
    }
    throw new Error(
      "Anakin capture is still processing. Retry later; previous evidence is preserved.",
    );
  };
}
