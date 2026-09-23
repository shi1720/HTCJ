// Optional editable pitch-deck builder. See docs/ARTIFACTS.md for prerequisites.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const workspaceDir = path.resolve(process.env.WORKSPACE_DIR || repo);
function requiredPath(name, description) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is required: ${description}. See docs/ARTIFACTS.md. The supplied PPTX can be edited without this builder.`,
    );
  }
  return path.resolve(value);
}
const skillDir = requiredPath(
  "PRESENTATION_SKILL_DIR",
  "path to the Codex presentations skill directory",
);
const runtimePython = requiredPath(
  "RUNTIME_PYTHON",
  "path to the Python executable with the presentation validation dependencies",
);
const modules = path.resolve(
  process.env.ARTIFACT_NODE_MODULES || path.join(repo, "node_modules"),
);
for (const [target, hint] of [
  [
    path.join(modules, "@oai/artifact-tool/package.json"),
    "Set ARTIFACT_NODE_MODULES to the directory containing @oai/artifact-tool",
  ],
  [
    path.join(skillDir, "container_tools/artifact_tool_utils.mjs"),
    "Check PRESENTATION_SKILL_DIR",
  ],
  [runtimePython, "Check RUNTIME_PYTHON"],
]) {
  try {
    await fs.access(target);
  } catch {
    throw new Error(
      `Missing artifact prerequisite: ${target}. ${hint}. See docs/ARTIFACTS.md.`,
    );
  }
}
process.env.RUNTIME_NODE_MODULES ||= modules;
const buildDir = path.join(workspaceDir, "work/artifacts/pitch");
const outputDir = path.join(workspaceDir, "outputs");
await fs.mkdir(buildDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });
const artifact = await import(
  pathToFileURL(path.join(modules, "@oai/artifact-tool/dist/artifact_tool.mjs"))
    .href
).catch(async () => {
  const packageJson = JSON.parse(
    await fs.readFile(
      path.join(modules, "@oai/artifact-tool/package.json"),
      "utf8",
    ),
  );
  return import(
    pathToFileURL(path.join(modules, "@oai/artifact-tool", packageJson.main))
      .href
  );
});
const { Presentation, PresentationFile, FileBlob } = artifact;
const { resolvePresentationFont, finalizePresentation } = await import(
  pathToFileURL(path.join(skillDir, "container_tools/artifact_tool_utils.mjs"))
    .href
);
const font = resolvePresentationFont({ fontFamily: "Liberation Sans" });
const presentation = Presentation.create({
  slideSize: { width: 1280, height: 720 },
});
const C = {
  ink: "#142C29",
  paper: "#F4F4EB",
  muted: "#5F716B",
  green: "#08694F",
  lime: "#D5ED64",
  white: "#FFFFFF",
  red: "#A5452D",
};

function text(
  slide,
  content,
  x,
  y,
  w,
  h,
  size = 28,
  color = C.ink,
  bold = false,
) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { fill: "none", width: 0 },
  });
  shape.text = content;
  shape.text.style = {
    typeface: font,
    fontSize: size,
    color,
    bold,
    autoFit: "none",
  };
  return shape;
}
function slide(title, dark = false) {
  const s = presentation.slides.add();
  s.background.fill = dark ? C.ink : C.paper;
  text(s, "GROUNDPROOF", 68, 36, 560, 26, 17, dark ? C.lime : C.green, true);
  if (title)
    text(s, title, 68, 99, 1144, 116, 48, dark ? C.white : C.ink, true);
  text(
    s,
    String(presentation.slides.items.length).padStart(2, "0"),
    1145,
    665,
    62,
    24,
    16,
    dark ? "#ADC1B9" : C.muted,
  );
  return s;
}
function note(s, content) {
  s.speakerNotes.textFrame.setText(content);
}
function table(s, values, widths, y = 250, height = 310) {
  const t = s.tables.add({
    rows: values.length,
    columns: values[0].length,
    left: 68,
    top: y,
    width: 1144,
    height,
    values,
    columnWidths: widths,
  });
  t.borders.assign({ fill: "#CAD4C7", width: 1 });
  for (let r = 0; r < values.length; r++)
    for (let c = 0; c < values[0].length; c++) {
      const cell = t.getCell(r, c);
      cell.fill = r === 0 ? C.ink : C.paper;
      cell.text.style = {
        typeface: font,
        fontSize: r === 0 ? 21 : 23,
        color: r === 0 ? C.white : C.ink,
        bold: r === 0,
      };
    }
  return t;
}
async function screenshot(s, filename, alt) {
  const p = path.join(outputDir, filename);
  try {
    await fs.access(p);
    s.images.add({
      blob: new Uint8Array(await fs.readFile(p)),
      contentType: "image/png",
      fit: "contain",
      alt,
      position: { left: 470, top: 211, width: 742, height: 438 },
    });
    return true;
  } catch {
    return false;
  }
}

// 1. Minimal editable cover.
{
  const s = slide("", true);
  text(
    s,
    "Yesterday’s approval.\nToday’s evidence.",
    68,
    174,
    1110,
    205,
    76,
    C.white,
    true,
  );
  text(
    s,
    "Operational evidence for drone inspection teams",
    72,
    431,
    1090,
    76,
    32,
    "#BED0C8",
  );
  text(s, "Shivam Gupta", 72, 590, 530, 36, 27, C.lime, true);
  text(
    s,
    "PROOF Aviation Futures Challenge 2026",
    72,
    632,
    1000,
    30,
    20,
    "#BED0C8",
  );
  note(
    s,
    "GroundProof by Shivam Gupta, founder and product lead. AI-assisted development and research. The current product is Demo Ready. Fictional jobs and controlled source changes demonstrate application behavior, not flight performance.",
  );
}
// 2. Concrete operator problem.
{
  const s = slide("An approval depends on facts that can change");
  text(s, "08:00", 68, 245, 260, 83, 62, C.green, true);
  text(
    s,
    "The coordinator approves tomorrow’s inspection.",
    68,
    341,
    324,
    131,
    29,
  );
  text(s, "16:30", 470, 245, 260, 83, 62, C.green, true);
  text(s, "The site owner changes access conditions.", 470, 341, 320, 131, 29);
  text(s, "Tomorrow", 870, 245, 340, 83, 62, C.red, true);
  text(
    s,
    "Which approved jobs now need another decision?",
    870,
    341,
    340,
    148,
    29,
  );
  text(
    s,
    "Illustrative scenario. Frequency and cost still need operator validation.",
    68,
    597,
    1130,
    43,
    22,
    C.muted,
  );
  note(
    s,
    "This scenario is fictional. The separation of ground-use conditions and aviation permissions is supported by FAA and NPS context: https://www.faa.gov/uas/resources/policy_library/UAS_Fact_Sheet_2023.pdf and https://www.nps.gov/articles/uncrewed-aircraft-in-the-national-parks.htm . Neither source establishes customer pain frequency or willingness to pay.",
  );
}
// 3. Product evidence.
{
  const s = slide("Every job has an evidence trail");
  text(
    s,
    "One source can affect\nseveral jobs.",
    68,
    245,
    370,
    130,
    38,
    C.green,
    true,
  );
  text(
    s,
    "GroundProof connects each internal approval to the source versions its reviewer accepted.",
    68,
    399,
    363,
    157,
    27,
  );
  const found = await screenshot(
    s,
    "groundproof-mission-board.png",
    "Actual GroundProof mission board with labeled simulation data",
  );
  if (!found) {
    text(
      s,
      "Source snapshot\n\nHuman review\n\nMission approval",
      520,
      245,
      640,
      330,
      42,
      C.green,
      true,
    );
  }
  note(
    s,
    "Product screenshot shows the actual application with fictional demo data. It may contain illustrative booked values, which are not earned revenue or savings. Source capture, source review, and mission approval are distinct operations.",
  );
}
// 4. Change invalidation evidence.
{
  const s = slide("Changed evidence requires a fresh decision");
  text(s, "3 jobs", 68, 250, 380, 100, 67, C.red, true);
  text(
    s,
    "depend on the simulated\nHarbor Works notice",
    68,
    360,
    370,
    104,
    28,
  );
  text(s, "$4,800", 68, 502, 380, 68, 44, C.ink, true);
  text(
    s,
    "illustrative booked value\naffected, not savings",
    68,
    574,
    380,
    70,
    22,
    C.muted,
  );
  const found = await screenshot(
    s,
    "source-review.png",
    "Actual GroundProof changed evidence review showing prior and current source versions",
  );
  if (!found) {
    text(
      s,
      "The old approval\nloses validity.\n\nReviewing the source\ndoes not reapprove\nthe mission.",
      520,
      245,
      640,
      360,
      40,
      C.green,
      true,
    );
  }
  note(
    s,
    "The demo dataset has six jobs, three sites and five sources. The Harbor Works fixture affects the first three jobs with a combined illustrative booked value of $4,800. This is a controlled simulation. It demonstrates dependency propagation and version-bound approval, not financial loss avoided.",
  );
}
// 5. Core technical proof.
{
  const s = slide("Approval follows the exact evidence version");
  table(
    s,
    [
      ["Condition", "Internal workflow result"],
      ["New or changed source", "Human evidence review required"],
      ["Missing, stale, blocked, unavailable", "Job on hold"],
      ["Current evidence + matching approval", "Review complete"],
      [
        "Source re-reviewed after change",
        "Fresh mission approval still required",
      ],
    ],
    [595, 549],
    239,
    343,
  );
  text(
    s,
    "Deterministic rules. Server checks. No LLM decides readiness.",
    68,
    609,
    1130,
    37,
    24,
    C.green,
    true,
  );
  note(
    s,
    "The server checks source hashes and review decisions, tenant ownership, timestamps, and approval inputs. This is operational evidence administration, not flight authorization. The rule lab executes authored test scenarios. Exact test counts belong in the release validation report and live demonstration.",
  );
}
// 6. Evidence and boundaries.
{
  const s = slide("What we can prove today", true);
  text(s, "Working software", 68, 251, 510, 59, 35, C.lime, true);
  text(
    s,
    "Accounts and isolated workspaces\nAuthenticated Anakin capture\nScheduled source monitoring\nOperator-supplied records\nVersion-bound review and export",
    68,
    332,
    527,
    225,
    29,
    C.white,
  );
  text(s, "Still to validate", 690, 251, 510, 59, 35, C.lime, true);
  text(
    s,
    "Operator time savings\nSource coverage in real workflows\nWillingness to pay\nDeployment-specific readiness",
    690,
    332,
    512,
    225,
    29,
    C.white,
  );
  text(
    s,
    "Simulation proves logic. A shadow pilot tests usefulness.",
    68,
    611,
    1130,
    39,
    24,
    "#BED0C8",
  );
  note(
    s,
    "Authenticated Anakin retrieval verified September 23, 2026 at 10:06:40 UTC: Boston public filming guidance, 5,930 characters in 2,458 ms. Evidence file docs/deliverables/anakin-integration-proof.json. This single call is not an availability or completeness benchmark. No customer, pilot partner, revenue, flight performance, certification, or prevented incident is claimed. Evidence packet hashes show content consistency. They do not establish source truth, a genuine permit, or legal compliance. GroundProof leaves flight decisions with the operator and remote pilot.",
  );
}
// 7. Differentiation.
{
  const s = slide("A focused addition to existing flight software");
  table(
    s,
    [
      ["Existing category", "Published focus"],
      ["Aloft / AirHub", "Fleet, compliance, approvals"],
      ["Drone Harmony", "Inspection capture and review"],
      ["Anakin", "Web capture and change monitoring"],
      ["GroundProof", "Evidence versions linked to job approval"],
    ],
    [437, 707],
    243,
    324,
  );
  text(
    s,
    "The pilot must prove this narrow workflow adds enough value.",
    68,
    610,
    1130,
    40,
    24,
    C.green,
    true,
  );
  note(
    s,
    "Public feature descriptions inspected September 23, 2026: https://www.aloft.ai/air-control/ ; https://www.airhub.app/all-features ; https://www.droneharmony.com/asset-inspector ; https://anakin.io/products/monitoring . GroundProof does not claim those products lack version-aware capabilities. This is positioning, not a complete competitive teardown.",
  );
}
// 8. Unit economics editable table.
{
  const s = slide("A subscription the pilot must earn");
  text(s, "$199 / month", 68, 226, 700, 90, 59, C.green, true);
  text(
    s,
    "Proposed future plan for 25 sites and five users",
    68,
    327,
    1130,
    51,
    27,
  );
  table(
    s,
    [
      ["Illustrative monthly time value", "Result"],
      ["100 jobs × 4 minutes ÷ 60 × $40/hour", "$267"],
      ["50 jobs × 4 minutes ÷ 60 × $40/hour", "$133"],
    ],
    [864, 280],
    410,
    166,
  );
  text(
    s,
    "Unvalidated inputs. At lower volume, time savings alone may not justify the price.",
    68,
    604,
    1130,
    55,
    23,
    C.muted,
  );
  note(
    s,
    "All commercial numbers are hypotheses. Exact values $266.67 and $133.33 rounded to nearest dollar. Time capacity is not guaranteed payroll savings. Planning direct-cost case is $19 Anakin + $25 infrastructure + $20 support = $64 monthly cost, before other expenses. Anakin pricing inspected September 23, 2026 at https://anakin.io/pricing . 25 sites x 2 sources x 2 daily checks x 30 days = 3,000 basic captures, within the stated 5,000 Pro credits. Scheduled source monitoring and protective supplier budgets are implemented. Commercial billing and multi-user membership remain future work. The initial pilot uses one named coordinator account.",
  );
}
// 9. Pilot.
{
  const s = slide("Four weeks to a paid continuation decision");
  table(
    s,
    [
      ["Week", "Operator evidence"],
      ["1", "Baseline review time and source inventory"],
      ["2", "Shadow workflow and discrepancy log"],
      ["3", "Controlled failures and recovery drills"],
      ["4", "Measured benefit, cost and continuation decision"],
    ],
    [170, 974],
    239,
    342,
  );
  text(
    s,
    "Proposed gates: zero known invalid approvals in drills, 90% source coverage,\nand 25% less median review time. Agree thresholds with the partner first.",
    68,
    605,
    1130,
    65,
    23,
    C.green,
  );
  note(
    s,
    "Pilot proposal only. Target 5-10 recurring sites and at least 30 job reviews if available. These are feasibility targets, not a statistically powered study. Maintain operator dispatch procedures throughout. Stop for an approval-control bypass or access-control defect. Full definitions and go/no-go criteria: docs/PILOT.md.",
  );
}
// 10. Direct ask.
{
  const s = slide("One operator. A measurable pilot.", true);
  text(
    s,
    "We need a drone inspection team\nwith recurring sites and a coordinator\nwilling to test the evidence workflow.",
    68,
    258,
    1120,
    195,
    42,
    C.white,
    true,
  );
  text(
    s,
    "Shivam Gupta\nFounder and product lead",
    68,
    520,
    700,
    90,
    29,
    C.lime,
    true,
  );
  const productLink = text(
    s,
    "groundproof.groundproof.workers.dev",
    68,
    625,
    1060,
    34,
    25,
    "#BED0C8",
  );
  productLink.text.get("groundproof.groundproof.workers.dev").link = {
    uri: "https://groundproof.groundproof.workers.dev",
    isExternal: true,
  };
  note(
    s,
    "Ask: a commercial drone inspection operator, an experienced remote pilot or operations reviewer, and representative source records for a four-week shadow pilot. AI-assisted development and research. The application does not authorize or control aircraft. Repository: https://github.com/shi1720/HTCJ .",
  );
}

const candidatePath = path.join(buildDir, "candidate.pptx");
await (await PresentationFile.exportPptx(presentation)).save(candidatePath);
for (let i = 0; i < presentation.slides.items.length; i++) {
  const s = presentation.slides.items[i];
  const png = await presentation.export({ slide: s, format: "png", scale: 1 });
  await fs.writeFile(
    path.join(buildDir, `slide-${String(i + 1).padStart(2, "0")}.png`),
    new Uint8Array(await png.arrayBuffer()),
  );
  const layout = await s.export({ format: "layout" });
  await fs.writeFile(
    path.join(buildDir, `slide-${i + 1}.layout.json`),
    await layout.text(),
  );
}
const finalPath = path.join(
  outputDir,
  process.env.PITCH_FILENAME || "groundproof-pitch.pptx",
);
await finalizePresentation({
  workspaceDir,
  candidatePath,
  finalPath,
  pythonExecutable: runtimePython,
  integrityValidatorPath: path.join(
    skillDir,
    "container_tools/inspect_presentation_package_integrity.py",
  ),
  layoutValidatorPath: path.join(
    skillDir,
    "container_tools/inspect_presentation_layout_geometry.py",
  ),
  layoutArgs: [
    "--expected-slide-size-emu",
    "12192000,6858000",
    "--validate-heading-fit",
    ...[5, 7, 8, 9].flatMap((n) => ["--require-native-table-slide", String(n)]),
  ],
  requiredNativeTableOwnerSlides: [5, 7, 8, 9],
  fontPolicy: { basis: "design", families: [font] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(
    buildDir,
    `${path.basename(finalPath)}.validation.json`,
  ),
});
const finalDeck = await PresentationFile.importPptx(
  await FileBlob.load(finalPath),
);
for (let i = 0; i < finalDeck.slides.items.length; i++) {
  const png = await finalDeck.export({
    slide: finalDeck.slides.items[i],
    format: "png",
    scale: 1,
  });
  await fs.writeFile(
    path.join(buildDir, `final-${String(i + 1).padStart(2, "0")}.png`),
    new Uint8Array(await png.arrayBuffer()),
  );
}
console.log(
  JSON.stringify({
    finalPath,
    slides: presentation.slides.items.length,
    previewDir: buildDir,
  }),
);
