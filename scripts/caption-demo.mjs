/** Adds a dedicated caption band below genuine screen footage; never covers or alters the UI. */
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

function seconds(stamp) {
  const [h, m, s] = stamp.replace(",", ".").split(":").map(Number);
  return h * 3600 + m * 60 + s;
}
export async function captionDemo({
  input,
  srt,
  output,
  workingDirectory,
  ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg",
}) {
  const raw = await readFile(srt, "utf8");
  const cues = raw
    .trim()
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const [from, to] = lines[1].split(" --> ");
      return {
        start: seconds(from),
        end: seconds(to),
        text: lines.slice(2).join("\n"),
      };
    });
  if (
    !cues.length ||
    cues.some((cue) => !Number.isFinite(cue.start) || cue.end <= cue.start)
  )
    throw new Error("Subtitle timing is invalid.");
  const framesDir = resolve(workingDirectory, "caption-panels");
  await mkdir(framesDir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 180 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.setContent(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:1440px;height:180px;overflow:hidden}body{background:#15291e;color:#fff;font-family:Arial,Helvetica,sans-serif;border-top:1px solid #61725a;display:flex;align-items:center;justify-content:center}small{position:absolute;left:30px;top:16px;font-size:10px;letter-spacing:2px;color:#c5d1bb}p{font-size:32px;line-height:1.3;text-align:center;white-space:pre-line;margin:17px 40px 0;width:1360px}</style></head><body><small>GROUNDPROOF · DEMONSTRATION NARRATION</small><p></p></body></html>',
  );
  const concat = ["ffconcat version 1.0"];
  try {
    for (const [index, cue] of cues.entries()) {
      const filename = `caption-${String(index).padStart(4, "0")}.png`;
      await page.locator("p").evaluate((element, text) => {
        element.textContent = text;
      }, cue.text);
      await page.screenshot({
        path: resolve(framesDir, filename),
        animations: "disabled",
      });
      const duration =
        (Math.round(cue.end * 25) - Math.round(cue.start * 25)) / 25;
      concat.push(`file '${filename}'`, `duration ${duration.toFixed(6)}`);
    }
    concat.push(
      `file 'caption-${String(cues.length - 1).padStart(4, "0")}.png'`,
    );
  } finally {
    await context.close();
    await browser.close();
  }
  const list = resolve(framesDir, "captions.ffconcat");
  await writeFile(list, concat.join("\n") + "\n");
  const result = spawnSync(
    ffmpeg,
    [
      "-y",
      "-i",
      input,
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      list,
      "-filter_complex",
      "[0:v]fps=25[screen];[1:v]fps=25[caption];[screen][caption]vstack=inputs=2:shortest=1[v]",
      "-map",
      "[v]",
      "-t",
      String(cues.at(-1).end),
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
      output,
    ],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  console.log(`Saved captioned video: ${output}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const output = resolve(
    process.env.DEMO_OUTPUT_DIR ??
      resolve(root, "work/recordings/deliverables"),
  );
  await captionDemo({
    input: resolve(output, "groundproof-demo-silent.mp4"),
    srt: resolve(output, "groundproof-demo-captions.srt"),
    output: resolve(output, "groundproof-demo-captioned.mp4"),
    workingDirectory: resolve(root, "work/recordings"),
  });
}
