/** End-to-end reproducible product video: genuine browser actions, disclosed voice, aligned captions, verification. */
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(
  process.env.DEMO_OUTPUT_DIR ?? resolve(root, "work/recordings/deliverables"),
);
const media = resolve(
  process.env.NARRATION_WORK_DIR ?? resolve(root, "work/media"),
);
const url = process.env.DEMO_URL ?? "https://groundproof-flight.web.app";
const env = {
  ...process.env,
  DEMO_OUTPUT_DIR: output,
  NARRATION_WORK_DIR: media,
  DEMO_URL: url,
};
const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
await mkdir(output, { recursive: true });
function run(command, args, capture = false) {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(command, args, {
      cwd: root,
      env,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let out = "",
      err = "";
    if (capture) {
      proc.stdout.on("data", (b) => (out += b));
      proc.stderr.on("data", (b) => (err += b));
    }
    proc.on("error", reject);
    proc.on("exit", (code) =>
      code === 0
        ? resolvePromise({ out, err })
        : reject(
            new Error(
              `${command} failed with exit ${code}: ${err.slice(-3000)}`,
            ),
          ),
    );
  });
}
if (!process.argv.includes("--use-recording"))
  await run(process.execPath, ["scripts/record-demo.mjs", "--skip-captions"]);
const recording = JSON.parse(
  await readFile(resolve(output, "groundproof-demo-recording.json"), "utf8"),
);
if (recording.url !== url || recording.applicationErrors.length)
  throw new Error(
    "Recording URL or browser acceptance does not match the requested release.",
  );
await run(process.execPath, ["scripts/narrate-demo.mjs"]);
await run(process.execPath, ["scripts/align-demo-narration.mjs"]);
await run(process.execPath, ["scripts/caption-demo.mjs"]);
const narrated = resolve(output, "groundproof-demo-narrated.mp4");
await run(ffmpeg, [
  "-y",
  "-loglevel",
  "error",
  "-i",
  resolve(output, "groundproof-demo-captioned.mp4"),
  "-i",
  resolve(media, "groundproof-narration.wav"),
  "-map",
  "0:v:0",
  "-map",
  "1:a:0",
  "-c:v",
  "copy",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-t",
  String(recording.targetDurationSeconds),
  "-movflags",
  "+faststart",
  narrated,
]);
const probe = JSON.parse(
  (
    await run(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", narrated],
      true,
    )
  ).out,
);
const video = probe.streams.find((s) => s.codec_type === "video"),
  audio = probe.streams.find((s) => s.codec_type === "audio");
if (
  !video ||
  !audio ||
  video.codec_name !== "h264" ||
  audio.codec_name !== "aac" ||
  Math.abs(Number(probe.format.duration) - recording.targetDurationSeconds) > 1
)
  throw new Error("Narrated video did not pass codec/duration checks.");
const loudness = await run(
  ffmpeg,
  [
    "-hide_banner",
    "-i",
    narrated,
    "-vn",
    "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json",
    "-f",
    "null",
    "-",
  ],
  true,
);
const match = loudness.err.match(/\{\s*"input_i"[\s\S]*?\}/);
if (!match) throw new Error("No loudness measurement returned.");
const measured = JSON.parse(match[0]);
if (
  Number(measured.input_tp) >= 0 ||
  Number(measured.input_i) < -21 ||
  Number(measured.input_i) > -12
)
  throw new Error("Narration loudness requires review.");
await run(ffmpeg, [
  "-y",
  "-loglevel",
  "error",
  "-i",
  narrated,
  "-vf",
  "fps=1/24,scale=480:-1,tile=3x3",
  "-frames:v",
  "1",
  resolve(output, "groundproof-demo-storyboard.jpg"),
]);
const result = {
  verifiedAt: new Date().toISOString(),
  publicApplication: url,
  recordedAt: recording.recordedAt,
  file: "groundproof-demo-narrated.mp4",
  durationSeconds: Number(probe.format.duration),
  width: video.width,
  height: video.height,
  videoCodec: video.codec_name,
  audioCodec: audio.codec_name,
  sampleRate: audio.sample_rate,
  integratedLoudnessLUFS: Number(measured.input_i),
  truePeakDBTP: Number(measured.input_tp),
  captionMethod:
    "Whisper word timestamps aligned to actual narration; burned into a reserved band below real product footage.",
  voiceDisclosure: "AI-generated OpenAI cedar narrator; not a voice clone.",
  browserErrors: recording.applicationErrors,
  narrationWords: recording.narrationWords,
  simulation:
    "Six fictional jobs and site-notice drills; separate genuine live Anakin Boston capture.",
  visualReview:
    "Inspect groundproof-demo-storyboard.jpg and exported scene frames before publishing.",
};
await writeFile(
  resolve(output, "groundproof-video-verification.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  "Narrated video, captions, storyboard and technical verification are complete.",
);
