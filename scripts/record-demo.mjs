/** Records only this application's genuine UI. No fabricated data, results, or provider labels. */
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
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
const scenes = JSON.parse(
  await readFile(resolve(root, "scripts/demo-scenes.json"), "utf8"),
);

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
const narration = `# GroundProof: verbatim voiceover and recording guide\n\nRuntime: **3 minutes 30 seconds**. Narration: **${wordCount} words** with deliberate pauses to inspect the interface. The completed video uses an explicitly disclosed AI narrator. The separate SRT is aligned to the spoken audio with word timestamps. All screen footage comes from the running application.\n\nThe video shows the actual application at 1440 × 900. Demonstration jobs and notice changes are fictional and labeled. The Boston capture is genuinely retrieved through Anakin during recording. No password, recovery key, or API key appears.\n\n${scenes.map((scene) => `## ${stamp(scene.start)} to ${stamp(scene.end)} · ${scene.title}\n\n> ${scene.text}\n\nScreen action: ${scene.action}\n`).join("\n")}\n## Reproduce the video\n\n1. Run the application, then node scripts/record-demo.mjs --url=https://groundproof-flight.web.app. Set DEMO_OUTPUT_DIR to choose the output directory. A successful live Anakin capture is required; the recorder never substitutes fixtures or changes provider labels.\n2. Set OPENAI_API_KEY_FILE to a private local file outside the repository, then run node scripts/narrate-demo.mjs. The key never enters product footage or deliverables.\n3. Run node scripts/align-demo-narration.mjs with the same output directory. This replaces draft subtitle timing with timestamps from the actual audio.\n4. Run node scripts/caption-demo.mjs, then mux the captioned footage and work/media/groundproof-narration.wav with H.264 video and AAC audio. Inspect exported frames, transcript, duration, and audio loudness.\n5. Upload groundproof-demo-narrated.mp4. Keep the AI voice disclosure and the distinction between fictional drills and real public-page capture.\n\nUse --rehearse for an accelerated UI check and --write-assets-only to regenerate the guide and draft captions without recording. Draft captions are not the final speech-aligned track.\n\n## Credit and scope\n\nGroundProof by Shivam Gupta, built with AI-assisted development. Narrator generated using OpenAI text to speech; it is not a clone of Shivam or another person. Proposed pricing and pilot assumptions are unvalidated. The application manages internal evidence decisions and does not authorize or control flights.\n`;
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
let anakinCaptureStarted;
let anakinCaptureProof;
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
    anakinCaptureStarted = performance.now();
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
    const response = await page.request.get("/api/state");
    if (!response.ok())
      throw new Error("Could not verify recorded live capture.");
    const state = await response.json();
    const source = state.sources.find(
      (source) => source.title === "City of Boston · Film permits",
    );
    if (
      source?.latest?.provider !== "anakin" ||
      !/Boston/i.test(source.latest.content)
    )
      throw new Error(
        "Recorded source does not contain genuine Anakin provenance and Boston text.",
      );
    anakinCaptureProof = {
      provider: source.latest.provider,
      source: source.url,
      capturedAt: source.latest.capturedAt,
      hash: source.latest.hash,
      characters: source.latest.content.length,
      verifiedAfterMs: Math.round(performance.now() - anakinCaptureStarted),
      durationScope:
        "User click to recorded snapshot verification, including the planned on-screen pause; not provider latency.",
      application: url,
      success: true,
    };
    if (!rehearse)
      await writeFile(
        resolve(output, "anakin-integration-proof.json"),
        JSON.stringify(anakinCaptureProof, null, 2) + "\n",
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
      process.env.FFMPEG_PATH ?? "ffmpeg",
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
          targetDurationSeconds: totalSeconds,
          width: 1440,
          height: 900,
          narrationWords: wordCount,
          scenarios:
            "Fictional demo jobs and source changes; genuine live Anakin Boston source capture.",
          liveCapture: anakinCaptureProof,
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
    if (!args.includes("--skip-captions"))
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
