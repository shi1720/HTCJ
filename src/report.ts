import type {
  AuditEvent,
  EvidenceSource,
  Mission,
  Site,
} from "../shared/types";
export interface DecisionPacket {
  mission: Mission;
  site: Site;
  sources: EvidenceSource[];
  audit: AuditEvent[];
  exportedAt: string;
  workspace: { name: string; demo: boolean };
  manifest: { hash: string };
  scope: string;
}
const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function decisionReport(packet: DecisionPacket): string {
  const { mission: m } = packet;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GroundProof decision record — ${esc(m.name)}</title><style>
 *{box-sizing:border-box}body{font-family:system-ui,sans-serif;line-height:1.55;color:#243b2d;max-width:960px;margin:auto;padding:48px;background:#fafbf6}header{border-bottom:2px solid #395638;padding-bottom:25px}header p{font-size:11px;letter-spacing:1.3px}h1{font-size:32px;line-height:1.15;margin:12px 0}h2{font-size:19px;margin:30px 0 12px}h3{font-size:14px;margin:16px 0 8px}p,td,th,li{font-size:12px}small{font-size:10px;color:#58674d}.facts{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:25px 0}.facts div{padding:11px 0;border-bottom:1px solid #dce5d1}.facts span{display:block;font-size:10px;color:#627356}.facts strong{font-size:13px}.notice{border-left:3px solid #8aa75d;padding:12px 16px;background:#edf3e3;font-size:12px}.source{page-break-inside:avoid;padding:16px 20px;border:1px solid #dce5d1;border-radius:6px;background:white;margin:16px 0}.source pre{white-space:pre-wrap;overflow-wrap:anywhere;font-family:ui-monospace,monospace;font-size:10px;line-height:1.6}code{font-size:9px;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e0e6d8;text-align:left;padding:9px;vertical-align:top}th{font-size:10px;background:#eef3e7}footer{border-top:1px solid #d9e3cf;padding-top:18px;margin-top:32px;font-size:10px;color:#677a55}@media print{body{background:white;padding:0;max-width:none}header{page-break-after:avoid}h2,h3{page-break-after:avoid}.source{break-inside:avoid}a{color:inherit;text-decoration:none}@page{size:A4;margin:18mm}}
 </style></head><body><header><p>GROUNDPROOF / OPERATIONAL DECISION RECORD ${packet.workspace.demo ? " / FICTIONAL DEMONSTRATION" : ""}</p><h1>${esc(m.name)}</h1><small>${esc(packet.workspace.name)} · Exported ${esc(packet.exportedAt)}</small></header>
 <div class="facts"><div><span>Client</span><strong>${esc(m.client)}</strong></div><div><span>Site</span><strong>${esc(packet.site.name)}</strong></div><div><span>Scheduled (UTC)</span><strong>${esc(m.scheduledAt)}</strong></div><div><span>Operational review status</span><strong>${esc(m.assessment.status.toUpperCase())}</strong></div><div><span>Mission revision</span><strong>${m.revision ?? 0}</strong></div><div><span>Booked job value (USD)</span><strong>${esc(m.value)}</strong></div></div>
 <div class="notice">${esc(packet.scope)} ${packet.workspace.demo ? "All missions, site notices, and job values in this packet are fictional." : ""}</div>
 ${m.assessment.issues.length ? `<h2>Outstanding evidence issues</h2><ul>${m.assessment.issues.map((i) => `<li><strong>${esc(i.code)}</strong>: ${esc(i.message)}</li>`).join("")}</ul>` : ""}
 <h2>Current mission signoff</h2>${m.approval ? `<p><strong>${esc(m.approval.actor)}</strong> · ${esc(m.approval.at)}</p><p>${esc(m.approval.note)}</p>` : "<p>No valid current signoff is recorded. Historical decisions do not release the current work.</p>"}
 <h2>Evidence used in this review</h2>${packet.sources.map((s) => `<section class="source"><h3>${esc(s.title)}</h3><p>${esc(s.kind === "record" ? "Operator-supplied record" : s.fixture ? "Fictional demo fixture" : s.url)}<br><small>Provider: ${esc(s.latest?.provider ?? "none")} · Captured: ${esc(s.latest?.capturedAt ?? "not captured")} · Freshness: ${s.freshnessHours} hours</small></p>${s.validUntil ? `<p>Declared expiry: ${esc(s.validUntil)}</p>` : ""}<p>Evidence review: <strong>${esc(s.reviewDecision ?? "unreviewed")}</strong>${s.reviewedBy ? " · " + esc(s.reviewedBy) : ""}<br>${esc(s.reviewNote ?? "")}</p><pre>${esc(s.latest?.content.slice(0, 3500) ?? "No captured content.")}</pre>${s.latest && s.latest.content.length > 3500 ? "<small>Excerpt shown. The exported JSON packet contains the full captured content.</small>" : ""}<p><small>Content SHA-256</small><br><code>${esc(s.latest?.hash ?? "none")}</code></p></section>`).join("")}
 <h2>Decision history</h2><table><thead><tr><th>Timestamp</th><th>Actor / action</th><th>Record</th></tr></thead><tbody>${packet.audit.map((e) => `<tr><td>${esc(e.at)}</td><td>${esc(e.actor)}<br><small>${esc(e.action)}</small></td><td>${esc(e.detail)}</td></tr>`).join("")}</tbody></table>
 <footer>Companion JSON packet SHA-256: <code>${esc(packet.manifest.hash)}</code><br>This report is a readable rendering of the companion JSON payload. Verify the JSON with the independent verifier and a separately trusted digest. Flight authorization and preflight checks remain the operator's responsibility.</footer></body></html>`;
}
