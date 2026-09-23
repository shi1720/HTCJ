/** Records only this application's genuine UI. No fabricated data, results, or provider labels. */
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { captionDemo } from "./caption-demo.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(
  process.env.DEMO_OUTPUT_DIR ?? resolve(root, "work/recordings/deliverables"),
);
const args = process.argv.slice(2);
const url =
  process.env.DEMO_URL ??
  args.find((arg) => arg.startsWith("--url="))?.slice(6) ??
  "http://localhost:3001";
const rehearse = args.includes("--rehearse");
const assetsOnly = args.includes("--write-assets-only");
const totalSeconds = 210;
const scenes = [
  {
    start: 0,
    end: 24,
    title: "Yesterday’s approval. Today’s reality.",
    action:
      "Show the landing page, then enter a fresh isolated demonstration workspace at 00:12.",
    text: "I'm Shivam Gupta, and this is GroundProof. A drone inspection job can be approved yesterday and still depend on information that changes today. A site closes. A document expires. A required source stops responding. GroundProof connects every internal approval to the exact evidence behind it, so a changed fact cannot hide behind an old green status.",
  },
  {
    start: 24,
    end: 46,
    title: "Evidence behind the decision",
    action:
      "Open the mission board, the facade inspection, and its Harbor Works access notice. Show captured text, timestamp, and content hash.",
    text: "These are six fictional inspection jobs. This mission depends on the Harbor Works access notice. We preserve the source text, capture time, and content hash. A reviewer accepts this exact version. The mission signoff records those same hashes, giving us a concrete answer to what someone approved, and when.",
  },
  {
    start: 46,
    end: 69,
    title: "One changed source. Three affected jobs.",
    action:
      "Simulate the site closure, show the three affected jobs and $4,800 booked value, then return to the mission board.",
    text: "Now I'll run a simulated closure. Three jobs depend on this source. GroundProof identifies those jobs and invalidates their earlier approval. Their combined booked value is forty-eight hundred dollars in this demonstration. That is affected work, not claimed savings. The remaining jobs keep their own evidence state.",
  },
  {
    start: 69,
    end: 94,
    title: "A human decision on a specific version",
    action:
      "Show disabled signoff and the changed source. Compare previous and current text. Record a hold with an explanatory note.",
    text: "The coordinator can inspect what changed and record a decision. GroundProof does not ask a language model whether a flight is safe. Deterministic checks enforce the workflow. Missing, stale, blocked, or unavailable evidence prevents approval. An open review cannot silently approve a source version that changed while someone was reading it.",
  },
  {
    start: 94,
    end: 123,
    title: "Review again. Then approve again.",
    action:
      "Restore an updated demonstration notice in the proof lab. Accept the source, then separately sign off one mission. Show the audit trail.",
    text: "I'll restore the demonstration notice and review the current evidence. That review alone does not revive the old mission approval. I must approve the mission again against the latest version. Every step appears in the audit history, with the person and time attached. Operator-supplied permission records also support declared expiry, checked against the scheduled mission time.",
  },
  {
    start: 123,
    end: 153,
    title: "A portable record, and a visible failure",
    action:
      "Export the completed mission decision packet. Then inject a source failure and inspect the retained snapshot and hold state.",
    text: "For a completed review, the exported evidence bundle preserves the referenced versions and an integrity manifest. Another person can verify whether that bundle has changed. A hash proves integrity, not that the source itself is true. A source failure is visible too. GroundProof keeps the previous snapshot for investigation, but holds the dependent work.",
  },
  {
    start: 153,
    end: 184,
    title: "Rules you can test. Sources you can trace.",
    action:
      "Run the proof lab and show the actual 15/15 outcome. Add the official Boston filming page, select Anakin, capture it, and show the genuine Anakin provenance and public-source text.",
    text: "The proof lab runs authored failure scenarios through the actual evidence rules. Here are the results. Now I am capturing an official Boston source through the Anakin web API. The provider, timestamp, text, and hash are preserved. This is a live capture, separate from the simulated notice changes. Direct public-source retrieval is also available, with its own provenance.",
  },
  {
    start: 184,
    end: 210,
    title: "A practical first customer and pilot",
    action:
      "Open Workspace settings and show the commercial calculator, explicitly proposed $199 price, and planning-assumption disclosure.",
    text: "We're building for drone inspection operators coordinating repeated work across multiple sites. Our proposed starting price is one hundred ninety-nine dollars per month. These savings inputs are assumptions to test. We seek one operator for a four-week shadow pilot to measure review time and useful change detection. GroundProof manages evidence and internal approval. The remote pilot remains responsible for flight decisions. Yesterday's approval. Today's evidence.",
  },
];

function stamp(seconds, srt = false) {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor(ms / 60_000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return srt
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`
    : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function wrapWords(words, max = 42) {
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && line.length + word.length + 1 > max) {
      lines.push(line);
      line = word;
    } else line += (line ? " " : "") + word;
  }
  if (line) lines.push(line);
  return lines;
}
let captionIndex = 0;
const captions = [];
for (const scene of scenes) {
  const words = scene.text.split(/\s+/);
  const groups = [];
  let current = [];
  for (const word of words) {
    if (wrapWords([...current, word]).length > 2) {
      groups.push(current);
      current = [];
    }
    current.push(word);
  }
  if (current.length) groups.push(current);
  let used = 0;
  for (const group of groups) {
    const start =
      scene.start + ((scene.end - scene.start) * used) / words.length;
    used += group.length;
    const end = scene.start + ((scene.end - scene.start) * used) / words.length;
    captions.push(
      `${++captionIndex}\n${stamp(start, true)} --> ${stamp(end, true)}\n${wrapWords(group).join("\n")}\n`,
    );
  }
}
await mkdir(output, { recursive: true });
await writeFile(
  resolve(output, "groundproof-demo-captions.srt"),
  captions.join("\n"),
);
const wordCount = scenes.reduce(
  (n, scene) => n + scene.text.split(/\s+/).length,
  0,
);
const narration = `# GroundProof — verbatim voiceover and recording guide\n\nRuntime: **3 minutes 30 seconds**. Narration: **${wordCount} words**, approximately ${Math.round(wordCount / 3.5)} words per minute. Read the quoted text exactly. Record your voice against the supplied clean silent video; the separate SRT matches this script. The captioned MP4 adds these words in a reserved band below the interface and can be watched immediately without a voice track. Timing allows natural pauses.\n\nThe video shows the actual application at 1440 × 900. All demonstration jobs and notice changes are fictional and labeled. The Boston capture is genuinely retrieved through Anakin during recording. No account password or API key appears.\n\n${scenes.map((scene) => `## ${stamp(scene.start)}–${stamp(scene.end)} · ${scene.title}\n\n> ${scene.text}\n\nScreen action: ${scene.action}\n`).join("\n")}\n## How to finish\n\n1. Import groundproof-demo-silent.mp4 into your preferred video editor.\n2. Record the narration one segment at a time, matching the timestamps above. Keep brief pauses at sentence boundaries.\n3. Import groundproof-demo-captions.srt as an optional subtitle track. These captions represent the supplied narration; keep them only if you read this version.\n4. Export MP4 with H.264 video and AAC audio. Check that the first and last words are audible and no private tabs or notifications were added.\n5. Upload the completed video to your chosen hosting service and place the public viewing link in the submission.\n\n## Reproduce the silent screencast\n\nRun npm start, then node scripts/record-demo.mjs --url=http://localhost:3001. Generated deliverables default to work/recordings/deliverables inside the repository. Set DEMO_OUTPUT_DIR to an explicit output directory to choose another destination. A successful Anakin capture requires server-side provider availability. The recorder stops if live evidence cannot be captured; it never substitutes fixtures or relabels another provider. Use --rehearse for an accelerated UI check, and --write-assets-only to regenerate this guide and captions without recording.\n\n## Submission video description\n\nGroundProof by Shivam Gupta. Working operational evidence management software for drone inspection teams, demonstrated with fictional jobs and explicit source-change simulations. Includes current-version review, approval invalidation, failure handling, operator-supplied records with expiry, audit history, verifiable evidence export, and genuine Anakin public-page capture. AI-assisted development. Commercial assumptions and proposed pilot are unvalidated. This application does not authorize or control flights.\n`;
await writeFile(resolve(root, "docs/DEMO-SCRIPT.md"), narration);
await writeFile(resolve(output, "groundproof-demo-voiceover.md"), narration);
await writeFile(resolve(output, "groundproof-demo-script.md"), narration);
const narrationOnly = scenes.map((scene) => scene.text).join("\n\n") + "\n";
await writeFile(resolve(root, "docs/VIDEO-NARRATION.txt"), narrationOnly);
await writeFile(resolve(output, "groundproof-narration.txt"), narrationOnly);
if (assetsOnly) {
  console.log(
    `Voiceover and captions generated: ${wordCount} words / ${totalSeconds}s.`,
  );
  process.exit(0);
}

const recordings = resolve(root, "work/recordings");
await mkdir(recordings, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL: url,
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
  ...(rehearse
    ? {}
    : { recordVideo: { dir: recordings, size: { width: 1440, height: 900 } } }),
});
const videoStart = performance.now();
const page = await context.newPage();
page.setDefaultTimeout(15_000);
if (rehearse) {
  let nextApiAt = 0;
  await page.route("**/api/**", async (route) => {
    const slot = Math.max(Date.now(), nextApiAt);
    nextApiAt = slot + 550;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, slot - Date.now())),
    );
    await route.continue();
  });
}
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto("/");
await expect(
  page.getByRole("heading", { name: "Yesterday’s approval. Today’s reality." }),
).toBeVisible();
await page.evaluate(() => document.fonts.ready);
const started = performance.now();
const trimStart = (started - videoStart) / 1000;
async function settle() {
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
}
async function at(seconds, description, action = async () => {}) {
  const wait = seconds * 1000 - (performance.now() - started);
  if (!rehearse && wait > 0)
    await new Promise((resolve) => setTimeout(resolve, wait));
  if (!rehearse && wait < -5000)
    throw new Error(
      `Recording is more than 5 seconds late at ${description}; retry instead of misaligning narration.`,
    );
  console.log(`${stamp(seconds)} ${description}`);
  await action();
  await settle();
}
async function nav(label) {
  await page
    .locator("aside")
    .getByRole("button", { name: label, exact: true })
    .click();
  await settle();
}
async function close() {
  await page.getByRole("button", { name: "Close dialog" }).click();
}
async function dismiss() {
  const toast = page.getByRole("button", { name: "Dismiss notification" });
  if (await toast.isVisible()) await toast.click();
}
const mission = "Facade inspection · east elevation";
const notice = "Harbor Works access notice";
let decisionBundle;
try {
  await at(12, "Enter isolated demonstration", async () => {
    await page
      .getByRole("button", { name: "Explore the working demo" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Every mission. A current reason." }),
    ).toBeVisible();
  });
  await at(24, "Mission board", () => nav("Mission board"));
  await at(26, "Open approved mission", () =>
    page.getByRole("button", { name: mission, exact: true }).click(),
  );
  await at(34, "Inspect source evidence", () =>
    page
      .locator(".mission-sources")
      .getByRole("button", { name: new RegExp(notice) })
      .click(),
  );
  await at(44, "Close source", close);
  await at(46, "Return to operations", () => nav("Operations overview"));
  await at(48, "Simulate closure", async () => {
    await page.getByRole("button", { name: "Simulate site closure" }).click();
    await expect(
      page.getByRole("heading", { name: "3 missions need a fresh decision." }),
    ).toBeVisible();
  });
  await at(56, "Affected work remains visible", dismiss);
  await at(61, "Show affected mission board", () => nav("Mission board"));
  await at(69, "Show invalidated mission", async () => {
    await page.getByRole("button", { name: mission, exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Sign off current evidence" }),
    ).toBeDisabled();
  });
  await at(75, "Compare previous and current source", () =>
    page
      .locator(".mission-sources")
      .getByRole("button", { name: new RegExp(notice) })
      .click(),
  );
  await at(85, "Record the human hold", async () => {
    await page
      .getByLabel("Review note", { exact: true })
      .fill(
        "Site staging area is suspended. Keep the three linked missions on hold.",
      );
  });
  await at(89, "Save source hold", async () => {
    await page.getByRole("button", { name: "Record decision" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
  await at(94, "Open recovery drill", () => nav("Proof lab"));
  await at(97, "Restore an updated access notice", async () => {
    await page
      .getByRole("button", {
        name: "Updated access notice Recover with a new version",
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "3 missions need a fresh decision." }),
    ).toBeVisible();
  });
  await at(100, "Current source library", () => nav("Evidence library"));
  await at(102, "Inspect restored notice", () =>
    page.getByRole("button", { name: notice, exact: true }).click(),
  );
  await at(105, "Accept reviewed evidence", async () => {
    await page
      .getByRole("radio", {
        name: "Accept evidence Record a checked, current source",
      })
      .check();
    await page
      .getByLabel("Review note", { exact: true })
      .fill(
        "Checked the updated fictional notice and confirmed the current site conditions.",
      );
  });
  await at(108, "Record version-bound source acceptance", async () => {
    await page.getByRole("button", { name: "Record decision" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
  await at(111, "Separate mission review", () => nav("Mission board"));
  await at(113, "Open mission for fresh signoff", () =>
    page.getByRole("button", { name: mission, exact: true }).click(),
  );
  await at(115, "Explain mission signoff", () =>
    page
      .getByLabel("Signoff note", { exact: true })
      .fill(
        "Reviewed current site access, operating checklist and insurance evidence for this fictional job.",
      ),
  );
  await at(118, "Approve current evidence only", async () => {
    await page
      .getByRole("button", { name: "Sign off current evidence" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
  await at(120, "Audit history", () => nav("Audit trail"));
  await at(123, "Open completed mission packet", async () => {
    await nav("Mission board");
    await page.getByRole("button", { name: mission, exact: true }).click();
  });
  await at(126, "Export evidence packet", async () => {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export decision packet" }).click();
    const download = await pending;
    if (!rehearse)
      await download.saveAs(resolve(output, "groundproof-demo-decision.json"));
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    decisionBundle = JSON.parse(Buffer.concat(chunks).toString());
    if (!rehearse) {
      await writeFile(
        resolve(output, "groundproof-decision-packet.json"),
        JSON.stringify(decisionBundle, null, 2) + "\n",
      );
      await writeFile(
        resolve(output, "groundproof-decision-manifest.sha256"),
        decisionBundle.manifest.hash + "\n",
      );
    }
    if (decisionBundle.mission.assessment.status !== "ready")
      throw new Error("Exported mission is not freshly signed.");
  });
  await at(132, "Return to failure drill", async () => {
    await close();
    await nav("Proof lab");
  });
  await at(136, "Inject visible source failure", async () => {
    await page
      .getByRole("button", {
        name: "Source unavailable Inject a capture failure",
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "3 missions need a fresh decision." }),
    ).toBeVisible();
  });
  await at(142, "Retained snapshot, blocked work", async () => {
    await nav("Evidence library");
    await page.getByRole("button", { name: notice, exact: true }).click();
    await expect(page.getByText(/Capture unavailable:/)).toBeVisible();
  });
  await at(153, "Open actual rule verification", async () => {
    await close();
    await nav("Proof lab");
  });
  await at(155, "Run proof lab", async () => {
    await page.getByRole("button", { name: "Run verification suite" }).click();
    await expect(page.locator(".lab-result-hero strong")).toHaveText("15/15");
  });
  await at(163, "Add official Boston public source", async () => {
    await nav("Evidence library");
    await page.getByRole("button", { name: "Add source", exact: true }).click();
    await page
      .getByRole("button", { name: "Boston filming requirements" })
      .click();
  });
  await at(166, "Save public-source reference", async () => {
    await page
      .getByRole("button", { name: "Add evidence source", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("combobox", { name: "Capture with" })
      .selectOption("anakin");
  });
  await at(169, "Live Anakin capture", async () => {
    await page
      .getByRole("button", {
        name: "Capture City of Boston · Film permits",
        exact: true,
      })
      .click();
    await expect(
      page
        .locator(".source-card")
        .filter({ hasText: "City of Boston · Film permits" }),
    ).toContainText("ANAKIN CAPTURE", { timeout: 35_000 });
  });
  await at(176, "Show genuine Anakin evidence", async () => {
    await page
      .getByRole("button", {
        name: "City of Boston · Film permits",
        exact: true,
      })
      .click();
    await expect(page.locator(".snapshot.current pre")).toContainText(
      /Boston/i,
    );
  });
  await at(184, "Open business assumptions", async () => {
    await close();
    await nav("Workspace settings");
    await dismiss();
    await page.locator(".roi-panel").scrollIntoViewIfNeeded();
  });
  await at(195, "Pricing and measurable pilot hypothesis", async () => {
    await page.getByLabel("Minutes saved / mission", { exact: true }).fill("5");
    await page.locator(".roi-results").scrollIntoViewIfNeeded();
  });
  await at(totalSeconds, "Recording complete");
  if (errors.length)
    throw new Error(`Application errors: ${errors.join("; ")}`);
  const video = page.video();
  await context.close();
  await browser.close();
  if (!rehearse) {
    const videoPath = await video.path();
    const target = resolve(output, "groundproof-demo-silent.mp4");
    const converted = spawnSync(
      process.env.FFMPEG_PATH ?? "/opt/homebrew/bin/ffmpeg",
      [
        "-y",
        "-ss",
        String(Math.max(0, trimStart)),
        "-i",
        videoPath,
        "-vf",
        "tpad=stop_mode=clone:stop_duration=3",
        "-t",
        String(totalSeconds),
        "-c:v",
        "libx264",
        "-crf",
        "20",
        "-preset",
        "medium",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-an",
        target,
      ],
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    );
    if (converted.status !== 0) throw new Error(converted.stderr);
    await writeFile(
      resolve(output, "groundproof-demo-recording.json"),
      JSON.stringify(
        {
          recordedAt: new Date().toISOString(),
          url,
          durationSeconds: totalSeconds,
          width: 1440,
          height: 900,
          narrationWords: wordCount,
          scenarios:
            "Fictional demo jobs and source changes; genuine live Anakin Boston source capture.",
          completedMissionId: decisionBundle.mission.id,
          exportManifestHash: decisionBundle.manifest.hash,
          video: "groundproof-demo-silent.mp4",
          captions: "groundproof-demo-captions.srt",
          applicationErrors: errors,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`Saved ${target}`);
    await captionDemo({
      input: target,
      srt: resolve(output, "groundproof-demo-captions.srt"),
      output: resolve(output, "groundproof-demo-captioned.mp4"),
      workingDirectory: recordings,
    });
  } else console.log("All screencast actions rehearsed successfully.");
} catch (error) {
  await page
    .screenshot({
      path: resolve(root, "work/recordings/failed.png"),
      fullPage: true,
    })
    .catch(() => {});
  await context.close();
  await browser.close();
  throw error;
}
