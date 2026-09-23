import { randomUUID } from "node:crypto";
import type {
  EvidenceSource,
  Mission,
  Site,
  Snapshot,
  User,
} from "../shared/types.js";
import { appendAudit, insertData, type Db } from "./db.js";
import { hashContent } from "./evidence.js";

export const HARBOR_OPEN = `SIMULATED EVIDENCE — NOT AN OPERATIONAL NOTICE\nHarbor Works access notice | Revision A\nSite: Harbor Works, Boston demonstration area.\nContractor access is open 08:00–18:00 for scheduled inspection teams.\nCoordinate with the site supervisor before entering the loading area.\nThis fictional fixture provides no airspace or flight authorization.`;
export const HARBOR_CLOSED = `SIMULATED EVIDENCE — NOT AN OPERATIONAL NOTICE\nHarbor Works access notice | Revision B\nSITE ACCESS SUSPENDED: crane operations now occupy the contractor staging area.\nNo contractor access until the site supervisor confirms a new access window.\nThe three demonstration inspection jobs require a human scheduling decision.\nThis fictional fixture provides no airspace or flight authorization.`;
export function makeSnapshot(
  content: string,
  provider: Snapshot["provider"] = "fixture",
  capturedAt = new Date().toISOString(),
): Snapshot {
  return {
    id: randomUUID(),
    hash: hashContent(content),
    content,
    capturedAt,
    provider,
  };
}
export function saveSnapshot(
  db: Db,
  tenant: string,
  sourceId: string,
  snapshot: Snapshot,
) {
  db.prepare(
    "INSERT INTO snapshots(id,source_id,tenant_id,data) VALUES(?,?,?,?)",
  ).run(snapshot.id, sourceId, tenant, JSON.stringify(snapshot));
}
export function seedDemo(db: Db, user: User) {
  const now = new Date().toISOString();
  const sites: Site[] = [
    {
      id: randomUUID(),
      name: "Harbor Works",
      address: "Boston waterfront · fictional demonstration site",
      lat: 42.35,
      lon: -71.041,
    },
    {
      id: randomUUID(),
      name: "Foundry Quay",
      address: "Boston harbor · fictional demonstration site",
      lat: 42.361,
      lon: -71.03,
    },
    {
      id: randomUUID(),
      name: "North Marsh",
      address: "Boston north shore · fictional demonstration site",
      lat: 42.385,
      lon: -71.019,
    },
  ];
  const actor = "Demo operations lead";
  const sourceDefinitions = [
    {
      title: "Harbor Works access notice",
      category: "site-access" as const,
      siteId: sites[0].id,
      content: HARBOR_OPEN,
    },
    {
      title: "Airspace planning checklist",
      category: "airspace" as const,
      siteId: null,
      content:
        "SIMULATED EVIDENCE — NOT FLIGHT AUTHORIZATION\nDemonstration planning checklist reviewed. Before every real mission, the remote pilot must independently verify airspace restrictions, authorizations, weather and all applicable operating requirements. No live airspace information is included.",
    },
    {
      title: "Operator insurance record",
      category: "insurance" as const,
      siteId: null,
      content:
        "SIMULATED EVIDENCE — NOT AN INSURANCE POLICY\nFictional demonstration operator has an insurance checklist on file. Verify coverage, exclusions and current policy documents with the operator before any real engagement.",
    },
    {
      title: "Foundry Quay access notice",
      category: "site-access" as const,
      siteId: sites[1].id,
      content:
        "SIMULATED EVIDENCE — NOT AN OPERATIONAL NOTICE\nFoundry Quay fictional access window is open for scheduled teams. Site supervisor coordination is required. No aviation permission is implied.",
    },
    {
      title: "North Marsh access notice",
      category: "site-access" as const,
      siteId: sites[2].id,
      content:
        "SIMULATED EVIDENCE — NOT AN OPERATIONAL NOTICE\nNorth Marsh fictional inspection area is open to scheduled survey teams. No public access or flight authorization is implied.",
    },
  ];
  const sources: EvidenceSource[] = sourceDefinitions.map((source, index) => ({
    id: randomUUID(),
    title: source.title,
    url: `https://fixtures.groundproof.local/source-${index + 1}`,
    category: source.category,
    siteId: source.siteId,
    freshnessHours: 24,
    latest: makeSnapshot(source.content),
    previous: null,
    reviewedHash: hashContent(source.content),
    reviewDecision: "accepted",
    reviewNote: "Simulation baseline reviewed for the demonstration only.",
    reviewedBy: actor,
    reviewedAt: now,
    lastError: null,
    updatedAt: now,
    fixture: true,
  }));
  const names = [
    "Facade inspection · east elevation",
    "Crane progress survey",
    "Roof condition assessment",
    "Quay asset inspection",
    "Dock inventory survey",
    "Wetland boundary survey",
  ];
  const clients = [
    "Harbor Works development",
    "Harbor Works development",
    "Harbor Works facilities",
    "Foundry Quay operations",
    "Foundry Quay operations",
    "North Marsh project",
  ];
  const values = [1800, 1600, 1400, 1250, 1750, 2100];
  db.transaction(() => {
    for (const site of sites) insertData(db, "sites", user.id, site);
    for (const source of sources) {
      insertData(db, "sources", user.id, source);
      saveSnapshot(db, user.id, source.id, source.latest!);
      appendAudit(
        db,
        user.id,
        actor,
        "evidence.reviewed",
        source.title,
        `Simulation baseline accepted; SHA-256 ${source.latest!.hash}.`,
        source.id,
      );
    }
    for (let index = 0; index < 6; index++) {
      const siteIndex = index < 3 ? 0 : index < 5 ? 1 : 2;
      const access = sources[siteIndex === 0 ? 0 : siteIndex === 1 ? 3 : 4];
      const refs = [access, sources[1], sources[2]];
      const mission: Mission = {
        id: randomUUID(),
        revision: 0,
        name: names[index],
        client: clients[index],
        siteId: sites[siteIndex].id,
        scheduledAt: new Date(
          Date.now() + 86400000 + index * 3600000,
        ).toISOString(),
        value: values[index],
        sourceIds: refs.map((source) => source.id),
        approval: {
          id: randomUUID(),
          actor,
          at: now,
          note: "Simulation baseline signed. No permission to conduct a real flight.",
          hashes: Object.fromEntries(
            refs.map((source) => [source.id, source.latest!.hash]),
          ),
        },
        createdAt: now,
        assessment: { status: "ready", issues: [] },
      };
      insertData(db, "missions", user.id, mission);
      appendAudit(
        db,
        user.id,
        actor,
        "mission.approved",
        mission.name,
        `Simulation baseline approval ${mission.approval!.id}; no flight authorization.`,
        mission.id,
      );
    }
    appendAudit(
      db,
      user.id,
      actor,
      "workspace.seeded",
      "Demonstration workspace",
      "Created six fictional jobs at three illustrative sites with five fixture evidence sources.",
    );
    appendAudit(
      db,
      user.id,
      actor,
      "evidence.reviewed",
      "Five simulated evidence sources",
      "Baseline content reviewed and accepted for demonstration.",
    );
    appendAudit(
      db,
      user.id,
      actor,
      "mission.approved",
      "Six fictional jobs",
      "Signed against exact fixture content hashes; planned job values are illustrative, not realized revenue.",
    );
  })();
}
