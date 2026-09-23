/** Align accessibility subtitles to the actual generated speech. No credentials are written to outputs. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(
  process.env.NARRATION_WORK_DIR ?? resolve(root, "work/media"),
);
const output = resolve(
  process.env.DEMO_OUTPUT_DIR ?? resolve(root, "work/recordings/deliverables"),
);
const key =
  process.env.OPENAI_API_KEY ??
  (process.env.OPENAI_API_KEY_FILE
    ? await readFile(process.env.OPENAI_API_KEY_FILE, "utf8")
    : "");
if (!key.trim())
  throw new Error("Set OPENAI_API_KEY or OPENAI_API_KEY_FILE locally.");
const report = JSON.parse(
  await readFile(resolve(dir, "narration-report.json"), "utf8"),
);
await mkdir(output, { recursive: true });
function stamp(s) {
  const ms = Math.round(s * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}
function wrap(words) {
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && line.length + word.length + 1 > 44) {
      lines.push(line);
      line = word;
    } else line += (line ? " " : "") + word;
  }
  if (line) lines.push(line);
  return lines;
}
const cues = [],
  checks = [];
// Whisper's word array omits punctuation and can split "$4,800" or "sign-off".
// Restore the checked transcript's typography by matching exact character spans.
// Refuse any lexical mismatch instead of inventing alignment for different speech.
function punctuatedWords(result) {
  const normalize = (word) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  let cursor = 0;
  const timed = result.words.map((word) => {
    const from = cursor;
    cursor += normalize(word.word).length;
    return { ...word, from, to: cursor };
  });
  const words = result.text.trim().split(/\s+/);
  if (
    words.map(normalize).join("") !==
    timed.map((word) => normalize(word.word)).join("")
  )
    throw new Error(
      "Transcript text and timestamp words differ; review before captioning.",
    );
  cursor = 0;
  return words.map((word) => {
    const from = cursor;
    cursor += normalize(word).length;
    const spans = timed.filter((item) => item.to > from && item.from < cursor);
    if (!spans.length)
      throw new Error("Transcript contains an unaligned token.");
    return { word, start: spans[0].start, end: spans.at(-1).end };
  });
}
function readableGroups(words) {
  const best = Array(words.length + 1).fill(null);
  best[words.length] = { cost: 0, groups: [] };
  for (let i = words.length - 1; i >= 0; i--) {
    for (let j = i + 1; j <= words.length; j++) {
      const group = words.slice(i, j);
      const text = group.map((word) => word.word).join(" ");
      const duration = group.at(-1).end - group[0].start;
      if (wrap(group.map((word) => word.word)).length > 2 || duration > 6)
        break;
      if (!best[j]) continue;
      const boundary = /[.!?]$/.test(text) ? 0 : /[,;:]$/.test(text) ? 2 : 7;
      const sentenceBreak = /[.!?]\s/.test(text) ? 20 : 0;
      const penalty = (duration < 1.3 ? 25 : 0) + (text.length < 22 ? 12 : 0);
      const cost =
        4 +
        Math.abs(duration - 3.4) +
        boundary +
        penalty +
        sentenceBreak +
        best[j].cost;
      if (!best[i] || cost < best[i].cost)
        best[i] = { cost, groups: [group, ...best[j].groups] };
    }
  }
  if (!best[0])
    throw new Error("Speech cannot fit readable two-line captions.");
  return best[0].groups;
}
for (const [index, scene] of report.scenes.entries()) {
  const bytes = await readFile(resolve(dir, `scene-${index + 1}.wav`));
  const hash = createHash("sha256")
    .update(bytes)
    .update("GroundProof. Shivam Gupta. Anakin.")
    .digest("hex");
  const cachePath = resolve(dir, `scene-${index + 1}-transcript.json`);
  let result;
  try {
    const cache = JSON.parse(await readFile(cachePath, "utf8"));
    if (cache.audioHash === hash) result = cache.result;
  } catch {}
  if (!result) {
    const body = new FormData();
    body.set("file", new Blob([bytes], { type: "audio/wav" }), "speech.wav");
    body.set("model", "whisper-1");
    body.set("language", "en");
    body.set("prompt", "GroundProof. Shivam Gupta. Anakin.");
    body.set("response_format", "verbose_json");
    body.append("timestamp_granularities[]", "word");
    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key.trim()}` },
        body,
        signal: AbortSignal.timeout(120000),
      },
    );
    if (!response.ok)
      throw new Error(`Transcription API failed with HTTP ${response.status}.`);
    result = await response.json();
    await writeFile(
      cachePath,
      JSON.stringify({ audioHash: hash, result }, null, 2),
    );
  }
  if (!result.words?.length)
    throw new Error(`No speech timestamps for scene ${index + 1}.`);
  for (const group of readableGroups(punctuatedWords(result))) {
    const start =
      scene.start + scene.leadSeconds + group[0].start / scene.tempo;
    const end = Math.min(
      scene.end,
      scene.start + scene.leadSeconds + group.at(-1).end / scene.tempo + 0.1,
    );
    cues.push({
      start,
      end,
      text: wrap(group.map((w) => w.word.trim())).join("\n"),
    });
  }
  checks.push({
    scene: index + 1,
    intended: scene.text,
    heard: result.text.trim(),
    wordCount: result.words.length,
    firstWord: result.words[0].start,
    lastWord: result.words.at(-1).end,
  });
  console.log(
    `Aligned scene ${index + 1}: ${result.words.length} timestamped words.`,
  );
}
for (let i = 0; i < cues.length - 1; i++)
  cues[i].end = Math.min(cues[i].end, cues[i + 1].start);
await writeFile(
  resolve(output, "groundproof-demo-captions.srt"),
  cues
    .map(
      (cue, i) =>
        `${i + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text}\n`,
    )
    .join("\n"),
);
await writeFile(
  resolve(dir, "speech-verification.json"),
  JSON.stringify(checks, null, 2),
);
console.log(`Saved ${cues.length} aligned subtitle cues.`);
