import { describe, expect, it } from "vitest";
import {
  assessMission,
  canonicalJson,
  hashContent,
  hashManifest,
  runLab,
} from "../server/evidence";
import type { EvidenceSource, Mission } from "../shared/types";

const now = new Date("2026-09-23T12:00:00.000Z");
function fixture(): {
  source: EvidenceSource;
  mission: Pick<Mission, "sourceIds" | "approval">;
} {
  const content =
    "Synthetic notice: prior written permission required for all commercial launches.";
  const hash = hashContent(content);
  const source: EvidenceSource = {
    id: "s1",
    title: "Test source",
    url: "https://www.faa.gov/uas",
    category: "site-access",
    siteId: null,
    freshnessHours: 24,
    latest: {
      id: "v1",
      hash,
      content,
      capturedAt: "2026-09-23T11:00:00.000Z",
      provider: "fixture",
    },
    previous: null,
    reviewedHash: hash,
    reviewDecision: "accepted",
    reviewNote: "Test review",
    reviewedBy: "Test",
    reviewedAt: "2026-09-23T11:30:00.000Z",
    lastError: null,
    updatedAt: "2026-09-23T11:30:00.000Z",
    fixture: true,
  };
  return {
    source,
    mission: {
      sourceIds: ["s1"],
      approval: {
        id: "a1",
        actor: "Test",
        at: "2026-09-23T11:45:00.000Z",
        note: "Test approval",
        hashes: { s1: hash },
      },
    },
  };
}

function recordFixture(validUntil?: string | null) {
  const { source, mission } = fixture();
  const reference = "SITE-2026-001";
  const content = `OPERATOR-SUPPLIED RECORD — NOT INDEPENDENTLY VERIFIED\nReference: ${reference}\nValid until: ${validUntil ?? "Not specified; configured freshness applies"}\n\nWritten permission for this site.`;
  const hash = hashContent(content);
  return {
    source: {
      ...source,
      kind: "record" as const,
      reference,
      validUntil,
      reviewedHash: hash,
      latest: { ...source.latest!, provider: "manual" as const, content, hash },
    },
    mission: {
      ...mission,
      approval: { ...mission.approval!, hashes: { s1: hash } },
    },
  };
}

describe("conservative evidence assessment", () => {
  it("requires a human mission approval beyond an accepted source review", () => {
    const { source, mission } = fixture();
    expect(assessMission(mission, [source], now)).toEqual({
      status: "ready",
      issues: [],
    });
    expect(
      assessMission({ ...mission, approval: null }, [source], now).status,
    ).toBe("draft");
  });
  it("holds missing and empty source coverage, even with an approval", () => {
    const { source, mission } = fixture();
    expect(assessMission(mission, [], now).issues[0].code).toBe("missing");
    expect(
      assessMission({ sourceIds: [], approval: null }, [source], now).status,
    ).toBe("hold");
    expect(
      assessMission(mission, [{ ...source, latest: null }], now).status,
    ).toBe("hold");
  });
  it.each([
    "2026-09-22T12:00:00.000Z",
    "2026-09-22T11:59:59.999Z",
    "2026-09-24T00:00:00.000Z",
    "invalid",
  ])("holds expired or invalid capture time %s", (capturedAt) => {
    const { source, mission } = fixture();
    expect(
      assessMission(
        mission,
        [{ ...source, latest: { ...source.latest!, capturedAt } }],
        now,
      ).status,
    ).toBe("hold");
  });
  it("does not expire one millisecond before the freshness boundary", () => {
    const { source, mission } = fixture();
    expect(
      assessMission(
        mission,
        [
          {
            ...source,
            latest: {
              ...source.latest!,
              capturedAt: "2026-09-22T12:00:00.001Z",
            },
          },
        ],
        now,
      ).status,
    ).toBe("ready");
  });
  it("requires both a new source review and mission approval after change", () => {
    const { source, mission } = fixture();
    const content =
      "Synthetic notice: launch permission suspended pending site maintenance.";
    const hash = hashContent(content);
    const changed = { ...source, latest: { ...source.latest!, content, hash } };
    expect(
      assessMission(mission, [changed], now).issues.some(
        (issue) => issue.code === "changed",
      ),
    ).toBe(true);
    expect(
      assessMission(mission, [{ ...changed, reviewedHash: hash }], now).status,
    ).toBe("review");
    expect(
      assessMission(
        {
          ...mission,
          approval: { ...mission.approval!, hashes: { s1: hash } },
        },
        [{ ...changed, reviewedHash: hash }],
        now,
      ).status,
    ).toBe("ready");
  });
  it("does not revive a revoked approval when old bytes return (backend revocation contract)", () => {
    const { source, mission } = fixture();
    expect(
      assessMission({ ...mission, approval: null }, [source], now).status,
    ).toBe("draft");
  });
  it("blocks cached evidence after provider error and after reviewer rejection", () => {
    const { source, mission } = fixture();
    expect(
      assessMission(
        mission,
        [{ ...source, lastError: "upstream unavailable" }],
        now,
      ).issues[0].code,
    ).toBe("unavailable");
    expect(
      assessMission(mission, [{ ...source, reviewDecision: "blocked" }], now)
        .status,
    ).toBe("hold");
  });
  it("detects tampering and removed approval coverage", () => {
    const { source, mission } = fixture();
    expect(
      assessMission(
        mission,
        [
          {
            ...source,
            latest: { ...source.latest!, content: "altered after hashing" },
          },
        ],
        now,
      ).status,
    ).toBe("hold");
    expect(
      assessMission(
        {
          ...mission,
          approval: {
            ...mission.approval!,
            hashes: { ...mission.approval!.hashes, removed: "old" },
          },
        },
        [source],
        now,
      ).status,
    ).toBe("review");
  });
  it("surfaces unreviewed evidence rather than approving it implicitly", () => {
    const { source, mission } = fixture();
    const result = assessMission(
      mission,
      [{ ...source, reviewedHash: null, reviewDecision: null }],
      now,
    );
    expect(result.status).toBe("review");
    expect(result.issues[0].code).toBe("unreviewed");
  });
  it.each([
    "2026-09-22T12:00:00.000Z",
    "2026-09-23T12:00:00.000Z",
    "not-a-date",
    "",
  ])(
    "holds a reviewed manual record with expired or invalid validity %s",
    (validUntil) => {
      const { source, mission } = recordFixture(validUntil);
      const result = assessMission(mission, [source], now);
      expect(result.status).toBe("hold");
      expect(
        result.issues.some(
          (issue) =>
            issue.code === "stale" && issue.message.includes("record validity"),
        ),
      ).toBe(true);
    },
  );
  it.each(["2026-09-23T12:00:00.001Z", null, undefined])(
    "allows an otherwise valid manual record before expiration %s",
    (validUntil) => {
      const { source, mission } = recordFixture(validUntil);
      expect(assessMission(mission, [source], now).status).toBe("ready");
    },
  );
  it.each(["2026-09-24T11:59:59.999Z", "2026-09-24T12:00:00.000Z"])(
    "holds a record expiring before or exactly at the scheduled job %s",
    (validUntil) => {
      const { source, mission } = recordFixture(validUntil);
      const result = assessMission(
        { ...mission, scheduledAt: "2026-09-24T12:00:00.000Z" },
        [source],
        now,
      );
      expect(result.status).toBe("hold");
      expect(
        result.issues.some(
          (issue) =>
            issue.code === "stale" && issue.message.includes("planned mission"),
        ),
      ).toBe(true);
    },
  );
  it("allows a currently fresh record with validity after the planned job", () => {
    const { source, mission } = recordFixture("2026-09-24T12:00:00.001Z");
    expect(
      assessMission(
        { ...mission, scheduledAt: "2026-09-24T12:00:00.000Z" },
        [source],
        now,
      ).status,
    ).toBe("ready");
  });
  it.each(["expiry", "reference", "provider", "envelope"])(
    "holds manual record metadata tampering: %s",
    (mutation) => {
      const { source, mission } = recordFixture("2026-09-24T12:00:00.000Z");
      if (mutation === "expiry") source.validUntil = "2027-01-01T00:00:00.000Z";
      if (mutation === "reference") source.reference = "";
      if (mutation === "provider")
        Object.assign(source.latest, { provider: "direct" });
      if (mutation === "envelope") {
        source.latest.content = "No trusted envelope";
        source.latest.hash = hashContent(source.latest.content);
        source.reviewedHash = source.latest.hash;
        mission.approval.hashes.s1 = source.latest.hash;
      }
      const result = assessMission(mission, [source], now);
      expect(result.status).toBe("hold");
      expect(
        result.issues.some(
          (issue) =>
            issue.code === "unavailable" && issue.message.includes("metadata"),
        ),
      ).toBe(true);
    },
  );
});

describe("portable evidence manifest", () => {
  it("sorts keys recursively but preserves array order and UTF-8 bytes", () => {
    expect(canonicalJson({ z: [{ b: "é", a: 1 }], a: 0 })).toBe(
      '{"a":0,"z":[{"a":1,"b":"é"}]}',
    );
    expect(hashManifest({ b: 2, a: 1 })).toBe(hashManifest({ a: 1, b: 2 }));
    expect(hashManifest([1, 2])).not.toBe(hashManifest([2, 1]));
  });
  it.each([undefined, NaN, Infinity, 1n, () => 1, new Date()])(
    "rejects non-JSON input %s",
    (value) => {
      expect(() => canonicalJson(value)).toThrow();
    },
  );
  it("rejects cycles while allowing repeated plain objects", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => canonicalJson(circular)).toThrow(/circular/);
    const repeated = { value: 1 };
    expect(canonicalJson([repeated, repeated])).toBe(
      '[{"value":1},{"value":1}]',
    );
  });
  it("runs a complete live lab report", () => {
    const report = runLab();
    expect(report.total).toBeGreaterThanOrEqual(12);
    expect(report.passed).toBe(report.total);
    expect(
      report.results.every(
        (item) => item.passed && item.expected === item.actual,
      ),
    ).toBe(true);
  });
});
