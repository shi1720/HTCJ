/** Generate a disclosed AI voiceover for the actual product recording. Secrets stay in the process. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(
  process.env.NARRATION_WORK_DIR ?? resolve(root, "work/media"),
);
await mkdir(dir, { recursive: true });
const key =
  process.env.OPENAI_API_KEY ??
  (process.env.OPENAI_API_KEY_FILE
    ? await readFile(process.env.OPENAI_API_KEY_FILE, "utf8")
    : "");
if (!key.trim())
  throw new Error(
    "Set OPENAI_API_KEY or OPENAI_API_KEY_FILE in the local process. Never commit a key.",
  );
const scenes = JSON.parse(
  await readFile(resolve(root, "scripts/demo-scenes.json"), "utf8"),
);
const model = "gpt-4o-mini-tts",
  voice = "cedar";
const instructions =
  "Narrate a polished product demonstration in clear, natural English. Be calm, warm, credible, and conversational. Speak at approximately 140 words per minute with short pauses at sentence boundaries. Do not sound like an advertisement. Pronounce GroundProof as Ground Proof and Anakin as An-uh-kin. Read only the supplied text. Do not add words or sound effects.";
const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
function command(exe, args) {
  const r = spawnSync(exe, args, {
    encoding: "utf8",
    maxBuffer: 15 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`${exe} failed: ${r.stderr}`);
  return r.stdout;
}
const report = [];
for (let i = 0; i < scenes.length; i++) {
  const scene = scenes[i],
    base = resolve(dir, `scene-${i + 1}`),
    raw = base + ".wav",
    meta = base + ".json";
  const request = {
    model,
    voice,
    input: scene.text,
    instructions,
    response_format: "wav",
  };
  const digest = createHash("sha256")
    .update(JSON.stringify(request))
    .digest("hex");
  let cache = false;
  try {
    cache = JSON.parse(await readFile(meta, "utf8")).inputHash === digest;
    await readFile(raw);
  } catch {}
  if (!cache) {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) {
      let code;
      try {
        code = (await res.json()).error?.code;
      } catch {}
      throw new Error(
        `Speech API failed with HTTP ${res.status}${code ? ` (${code})` : ""}.`,
      );
    }
    await writeFile(raw, Buffer.from(await res.arrayBuffer()));
    await writeFile(
      meta,
      JSON.stringify(
        {
          inputHash: digest,
          model,
          voice,
          generatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }
  const duration = Number(
    command("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      raw,
    ]).trim(),
  );
  const window = scene.end - scene.start,
    available = window - 1.1;
  const tempo = Math.max(1, duration / available);
  if (tempo > 1.18)
    throw new Error(
      `Scene ${i + 1} needs a shorter script or regenerated narration; audio would be rushed.`,
    );
  const fitted = base + "-fit.wav";
  command(ffmpeg, [
    "-y",
    "-i",
    raw,
    "-af",
    `atempo=${tempo.toFixed(6)},adelay=450|450,apad`,
    "-t",
    String(window),
    "-ar",
    "48000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    fitted,
  ]);
  report.push({
    ...scene,
    rawDuration: duration,
    tempo,
    leadSeconds: 0.45,
    file: fitted,
  });
  console.log(
    `Narrated scene ${i + 1}/${scenes.length}: ${duration.toFixed(2)}s in ${window}s window.`,
  );
}
await writeFile(
  resolve(dir, "narration-report.json"),
  JSON.stringify(
    {
      model,
      voice,
      disclosure:
        "AI-generated narrator. Not a clone of Shivam Gupta or another person.",
      scenes: report,
    },
    null,
    2,
  ),
);
await writeFile(
  resolve(dir, "narration.ffconcat"),
  "ffconcat version 1.0\n" +
    report.map((s) => `file '${s.file.replaceAll("'", "'\\''")}'`).join("\n") +
    "\n",
);
command(ffmpeg, [
  "-y",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  resolve(dir, "narration.ffconcat"),
  "-af",
  "loudnorm=I=-16:TP=-1.5:LRA=8",
  "-ar",
  "48000",
  "-ac",
  "1",
  "-c:a",
  "pcm_s16le",
  resolve(dir, "groundproof-narration.wav"),
]);
console.log("Narration assembled and loudness normalized.");
