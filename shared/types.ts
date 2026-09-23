export type Category =
  "site-access" | "airspace" | "insurance" | "operating-policy";
export type Provider = "fixture" | "direct" | "anakin" | "manual";
export interface User {
  id: string;
  name: string;
  email: string;
  workspace: string;
  demo: boolean;
}
export interface Site {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
}
export interface Snapshot {
  id: string;
  hash: string;
  content: string;
  capturedAt: string;
  provider: Provider;
}
export interface EvidenceSource {
  kind?: "record";
  reference?: string;
  validUntil?: string | null;
  monitor?: {
    enabled: boolean;
    intervalHours: number;
    provider: "direct" | "anakin";
    nextCaptureAt: string | null;
    lastAttemptAt: string | null;
  };
  id: string;
  title: string;
  url: string;
  category: Category;
  siteId: string | null;
  freshnessHours: number;
  latest: Snapshot | null;
  previous: Snapshot | null;
  reviewedHash: string | null;
  reviewDecision: "accepted" | "blocked" | null;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  lastError: string | null;
  updatedAt: string;
  fixture: boolean;
}
export interface Issue {
  sourceId: string;
  code:
    "missing" | "stale" | "changed" | "blocked" | "unreviewed" | "unavailable";
  message: string;
}
export interface Approval {
  id: string;
  actor: string;
  at: string;
  note: string;
  hashes: Record<string, string>;
}
export interface Mission {
  revision?: number;
  id: string;
  name: string;
  client: string;
  siteId: string;
  scheduledAt: string;
  value: number;
  sourceIds: string[];
  approval: Approval | null;
  createdAt: string;
  assessment: {
    status: "ready" | "hold" | "review" | "draft";
    issues: Issue[];
  };
}
export interface AuditEvent {
  id: string;
  at: string;
  action: string;
  actor: string;
  detail: string;
  objectName: string;
}
export interface AppState {
  user: User;
  sites: Site[];
  sources: EvidenceSource[];
  missions: Mission[];
  audit: AuditEvent[];
  integrations: { anakinConfigured: boolean; directAvailable: boolean };
  serverTime: string;
}
export interface LabResult {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  durationMs: number;
}
export interface LabReport {
  at: string;
  results: LabResult[];
  passed: number;
  total: number;
  durationMs: number;
}
