import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  responses: [] as {
    status: number;
    body: string;
    headers?: Record<string, string>;
  }[],
  requests: [] as {
    url: string;
    options: Record<string, unknown>;
    body: string;
  }[],
  addresses: [{ address: "23.1.2.3", family: 4 }],
}));

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => mock.addresses),
}));
vi.mock("node:https", () => ({
  request: vi.fn(
    (
      url: URL,
      options: Record<string, unknown>,
      callback: (response: EventEmitter) => void,
    ) => {
      const sent = { url: url.href, options, body: "" };
      mock.requests.push(sent);
      const req = new EventEmitter() as EventEmitter & {
        write: (body: string) => void;
        end: () => void;
        destroy: () => void;
      };
      req.write = (body) => {
        sent.body += body;
      };
      req.destroy = () => {};
      req.end = () => {
        queueMicrotask(() => {
          const spec = mock.responses.shift();
          if (!spec) {
            req.emit("error", new Error("No mock response"));
            return;
          }
          const response = Object.assign(new EventEmitter(), {
            statusCode: spec.status,
            headers: spec.headers ?? { "content-type": "text/html" },
          });
          callback(response);
          response.emit("data", Buffer.from(spec.body));
          response.emit("end");
        });
      };
      return req;
    },
  ),
}));

import {
  captureSource,
  extractPlainText,
  isAnakinConfigured,
  isPublicAddress,
  validateSourceUrl,
} from "../server/providers";

const notice =
  "Synthetic official notice: prior written permission is required before using this site.";
beforeEach(() => {
  mock.responses.length = 0;
  mock.requests.length = 0;
  mock.addresses = [{ address: "23.1.2.3", family: 4 }];
  delete process.env.ANAKIN_API_KEY;
});

describe("source network boundary", () => {
  it.each([
    "http://faa.gov",
    "https://faa.gov.evil.test",
    "https://evilfaa.gov",
    "https://user:secret@faa.gov",
    "https://faa.gov:444",
    "https://127.0.0.1",
    "https://[::1]",
    "https://faa.gov@evil.test",
    "https://faa.gov./uas",
    "file:///etc/passwd",
  ])("rejects unsafe URL %s", (url) => {
    expect(() => validateSourceUrl(url)).toThrow();
  });
  it.each([
    "https://faa.gov/uas",
    "https://www.boston.gov/example",
    "https://home.nps.gov/articles/test",
    "https://www.mass.gov",
  ])("allows approved HTTPS URL %s", (url) => {
    expect(() => validateSourceUrl(url)).not.toThrow();
  });
  it.each([
    "127.0.0.1",
    "10.1.1.1",
    "172.31.1.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.1.1",
    "0.0.0.0",
    "224.1.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "2001::1",
    "2001:20::1",
    "2002:7f00:1::",
    "3fff::1",
    "not-an-address",
  ])("rejects reserved address %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
  it.each(["23.1.2.3", "8.8.8.8", "2606:4700:4700::1111"])(
    "accepts public address %s",
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );
  it("rejects an allowed hostname resolving to any private address", async () => {
    mock.addresses.push({ address: "127.0.0.1", family: 4 });
    await expect(
      captureSource("https://faa.gov/uas", "direct"),
    ).rejects.toThrow(/private/);
    expect(mock.requests).toHaveLength(0);
  });
  it("revalidates redirects before making another request", async () => {
    mock.responses.push({
      status: 302,
      body: "",
      headers: { location: "https://127.0.0.1/admin" },
    });
    await expect(
      captureSource("https://faa.gov/uas", "direct"),
    ).rejects.toThrow(/approved/);
    expect(mock.requests).toHaveLength(1);
  });
  it("captures allowed redirects with pinned DNS lookups and no credential forwarding", async () => {
    mock.responses.push(
      { status: 301, body: "", headers: { location: "/new" } },
      { status: 200, body: `<h1>Source</h1><p>${notice}</p>` },
    );
    await expect(
      captureSource("https://faa.gov/old", "direct"),
    ).resolves.toEqual({ content: `Source\n${notice}` });
    expect(mock.requests[1].url).toBe("https://faa.gov/new");
    expect(typeof mock.requests[0].options.lookup).toBe("function");
  });
});

describe("bounded, inert evidence", () => {
  it("strips executable markup and preserves readable evidence/entities", () => {
    expect(
      extractPlainText(
        `<script>stealSecrets()</script><style>body{display:none}</style><p>${notice} &amp; terms &#8212; checked.</p>`,
        true,
      ),
    ).toBe(`${notice} & terms \u2014 checked.`);
  });
  it("rejects unreadable responses and unsupported binary sources", async () => {
    mock.responses.push({
      status: 200,
      body: "binary",
      headers: { "content-type": "application/pdf" },
    });
    await expect(
      captureSource("https://faa.gov/a.pdf", "direct"),
    ).rejects.toThrow(/HTML and plain text/);
    expect(() => extractPlainText("ok")).toThrow(/too little/);
  });
  it("rejects overly large network bodies and extracted content", async () => {
    mock.responses.push({ status: 200, body: "a".repeat(2 * 1024 * 1024 + 1) });
    await expect(
      captureSource("https://faa.gov/uas", "direct"),
    ).rejects.toThrow(/2 MB/);
    expect(() => extractPlainText("a".repeat(180_001))).toThrow(/180,000/);
  });
  it("does not treat an access challenge as source content", async () => {
    mock.responses.push({
      status: 200,
      body: `<h1>Access Denied</h1><p>${notice}</p>`,
    });
    await expect(
      captureSource("https://faa.gov/uas", "direct"),
    ).rejects.toThrow(/access challenge/);
  });
});

describe("honest Anakin provenance", () => {
  it("uses documented API body and optional server key", async () => {
    process.env.ANAKIN_API_KEY = "unit-test-key";
    mock.responses.push({
      status: 200,
      body: JSON.stringify({ status: "completed", markdown: notice }),
    });
    expect(isAnakinConfigured()).toBe(true);
    await expect(
      captureSource("https://faa.gov/uas", "anakin"),
    ).resolves.toEqual({ content: notice });
    expect(mock.requests[0].url).toBe(
      "https://api.anakin.io/v1/url-scraper/scrape",
    );
    expect(JSON.parse(mock.requests[0].body)).toEqual({
      url: "https://faa.gov/uas",
      country: "us",
      useBrowser: false,
      generateJson: false,
    });
    expect(mock.requests[0].options.headers).toMatchObject({
      "X-API-Key": "unit-test-key",
    });
  });
  it("supports documented keyless shape without pretending an account exists", async () => {
    mock.responses.push({
      status: 200,
      body: JSON.stringify({
        markdown: notice,
        trial: { remaining_credits: 12 },
      }),
    });
    expect(isAnakinConfigured()).toBe(false);
    await expect(
      captureSource("https://faa.gov/uas", "anakin"),
    ).resolves.toEqual({ content: notice });
    expect(mock.requests[0].options.headers).not.toHaveProperty("X-API-Key");
  });
  it.each([
    [402, JSON.stringify({ error: "keyless_unavailable" }), "keyless capacity"],
    [429, "{}", "rate limit"],
    [401, "{}", "authentication"],
    [
      200,
      JSON.stringify({ status: "failed", error: "upstream failure" }),
      "failed scrape",
    ],
    [200, "<html>not JSON</html>", "invalid JSON"],
    [200, JSON.stringify({ status: "completed" }), "no completed"],
  ])(
    "never substitutes direct data on provider failure %s",
    async (status, body, error) => {
      mock.responses.push({ status: status as number, body: body as string });
      await expect(
        captureSource("https://faa.gov/uas", "anakin"),
      ).rejects.toThrow(error as string);
      expect(mock.requests).toHaveLength(1);
    },
  );
  it("polls a 202 response using a validated job id", async () => {
    mock.responses.push(
      {
        status: 202,
        body: JSON.stringify({ id: "job_123", status: "processing" }),
      },
      {
        status: 200,
        body: JSON.stringify({ status: "completed", markdown: notice }),
      },
    );
    await expect(
      captureSource("https://faa.gov/uas", "anakin"),
    ).resolves.toEqual({ content: notice });
    expect(mock.requests[1].url).toBe(
      "https://api.anakin.io/v1/url-scraper/job_123",
    );
  });
  it("rejects job ids that could escape the provider endpoint", async () => {
    mock.responses.push({
      status: 202,
      body: JSON.stringify({ id: "../../secrets", status: "processing" }),
    });
    await expect(
      captureSource("https://faa.gov/uas", "anakin"),
    ).rejects.toThrow(/job identifier/);
  });
  it("rejects an unapproved final URL reported by Anakin", async () => {
    mock.responses.push({
      status: 200,
      body: JSON.stringify({
        status: "completed",
        finalUrl: "https://evil.test",
        markdown: notice,
      }),
    });
    await expect(
      captureSource("https://faa.gov/uas", "anakin"),
    ).rejects.toThrow(/approved government/);
  });
});
