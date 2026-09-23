/** Packages only explicitly listed public deliverables. Never collects environment files or credentials. */
import { readFile, writeFile, copyFile, mkdir, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(process.env.DEMO_OUTPUT_DIR ?? resolve(root, "outputs"));
await mkdir(output, { recursive: true });
const copies = {
  "SUBMISSION.md": "groundproof-submission.md",
  "PUBLICATION.md": "groundproof-publication-status.md",
  "PROJECT-STORY.md": "groundproof-project-story.md",
  "TESTING-INSTRUCTIONS.md": "groundproof-testing-instructions.md",
  "YOUTUBE.md": "groundproof-youtube-title-description.md",
  "BUSINESS.md": "groundproof-business.md",
  "PILOT.md": "groundproof-pilot.md",
  "SOURCES.md": "groundproof-sources.md",
  "FINAL-REVIEW.md": "groundproof-final-review.md",
  "RUBRIC.md": "groundproof-rubric.md",
  "RELEASE-VERIFICATION.md": "groundproof-release-verification.md",
};
for (const [source, target] of Object.entries(copies))
  await copyFile(resolve(root, "docs", source), resolve(output, target));
const readJSON = async (name) =>
  JSON.parse(await readFile(resolve(output, name), "utf8"));
const deployment = await readJSON("firebase-deployment-verification.json");
const video = await readJSON("groundproof-video-verification.json");
if (video.browserErrors.length || !video.visualReview?.passed)
  throw new Error("Complete and record the video review before packaging.");
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const youtube = process.env.YOUTUBE_URL || null;
const submitted = process.env.DEVPOST_SUBMITTED === "true";
const release = {
  release: "v1.1.0",
  generatedAt: new Date().toISOString(),
  sourceCommit: commit,
  primaryUrl: deployment.primaryUrl,
  frontendCommit: deployment.applicationCommit,
  backendCommit: deployment.backendApplicationCommit,
  firebaseHostingVersion: deployment.firebase.version,
  repository: "https://github.com/shi1720/HTCJ",
  youtubeUrl: youtube,
  devpostUrl: "https://devpost.com/software/groundproof",
  devpostStatus: submitted
    ? "submitted and verified"
    : "draft; story, links, cover, three captioned screenshots, demo URL and contributor credit saved; final submission pending",
  video: {
    file: video.file,
    durationSeconds: video.durationSeconds,
    voice: video.voiceDisclosure,
  },
  scope:
    "Demo Ready, one-owner workspace; controlled shadow-pilot candidate. No customer, savings or flight-safety claims.",
};
await writeFile(
  resolve(output, "groundproof-release.json"),
  JSON.stringify(release, null, 2) + "\n",
);
await writeFile(
  resolve(output, "START-HERE.md"),
  `# GroundProof | Shivam Gupta\n\n**A changed fact should trigger a fresh decision.**\n\n- **Open the app:** https://groundproof-flight.web.app\n- **Source:** https://github.com/shi1720/HTCJ\n- **Release:** https://github.com/shi1720/HTCJ/releases/tag/v1.1.0\n- **Watch the completed narrated demo:** [groundproof-demo-narrated.mp4](groundproof-demo-narrated.mp4)${youtube ? `\n- **Public YouTube video:** ${youtube}` : ""}\n\nChoose **Explore the working demo** for a private six-job demonstration without registration. Choose **Create workspace** to start with your own data. Save the recovery key shown after registration. This release has one owner per workspace.\n\n## Submission materials\n\n| File | Purpose |\n| --- | --- |\n| [Project story](groundproof-project-story.md) | The seven requested Devpost narrative fields |\n| [Complete submission](groundproof-submission.md) | Problem, solution, proof, business case, stage and team |\n| [Testing instructions](groundproof-testing-instructions.md) | A five-minute judging path, account controls and independent verification |\n| [YouTube title and description](groundproof-youtube-title-description.md) | Ready to paste, including chapters and voice disclosure |\n| [Narrated video](groundproof-demo-narrated.mp4) | 3:30 of actual hosted product footage, clear AI voiceover and burned captions |\n| [Subtitle file](groundproof-demo-captions.srt) | Speech-aligned captions, also available as a separate track |\n| [Verbatim script](groundproof-demo-script.md) | Exact words and screen actions |\n| [Editable pitch deck](groundproof-pitch.pptx) | Ten slides with problem, demonstration, commercial case and pilot ask |\n| [Pilot brief](groundproof-pilot-brief.pdf) | Two pages ready to share |\n| [Commercial case](groundproof-business.md) | Buyer, competitors, proposed pricing and costs |\n| [Shadow pilot](groundproof-pilot.md) | Four-week scope and measurable acceptance criteria |\n| [Release verification](groundproof-release-verification.md) | Exact deployment identities, test results and practical limits |\n| [Source archive](groundproof-source.zip) | Repository at the recorded release commit |\n\nUse [the Devpost cover](groundproof-devpost-cover.png), [YouTube thumbnail](groundproof-youtube-thumbnail.png), [mission board](groundproof-mission-board.png), [source comparison](source-review.png), [overview](groundproof-overview.png) and [mobile view](mobile.png). The clean and captioned silent variants are editing assets; the completed upload file is **groundproof-demo-narrated.mp4**.\n\n## Verified behavior\n\nThe release passed 156 native tests and 162 tests including Worker compatibility. Those counts overlap. It also passed three gateway tests, 16 hosted desktop/mobile browser cases, 43 Firebase HTTP checks and a dependency audit with zero reported vulnerabilities. The final landing refinement passed five widths from 320 to 1440 pixels, with no overlaps or horizontal overflow. Tested surfaces had no serious or critical Axe findings. The video shows a genuine Anakin capture separately from the fictional site-change drill.\n\nThe [decision packet](groundproof-decision-packet.json) independently verifies against the [separately recorded digest](groundproof-decision-manifest.sha256). See [video verification](groundproof-video-verification.json), [deployment evidence](firebase-deployment-verification.json) and [Anakin evidence](anakin-integration-proof.json).\n\n## Publication status\n\n${submitted ? "The Devpost entry has been submitted and checked." : "The Devpost draft has its story, technology tags, app/repository/testing links, cover, three captioned screenshots, demo URL and contributor credit saved. Final submission is pending until the YouTube video can be made public and its playback verified. This package does not imply that the entry was submitted."}\n\n${youtube ? `The public demo is at ${youtube}.` : "The narrated video is uploaded as private YouTube draft 0zYnjZi1MFg, with its title, description and custom thumbnail saved and HD processing complete. Public visibility and separate subtitle-track persistence still need verification. Studio publishing controls failed to load reliably. See groundproof-publication-status.md for the existing draft link and remaining steps. No public YouTube playback is claimed."}\n\nThe official pages show conflicting dates: October 8 in the rules, October 23 evidence lock, October 25 Boston event, and October 28 at 05:30 IST on the portal. Use the earliest listed date until the organizer clarifies. No organizer message has been sent.\n\n## Operating scope\n\nFirebase Hosting serves the frontend. A Cloud Run gateway forwards the API to the existing Cloudflare Worker and durable SQLite database. Cloud Run scales to zero and is capped at one instance; a zero bill is not guaranteed. API keys stay server-side. Anakin permits up to 30 attempted calls daily across this deployment and three per demo workspace; no provider fallback is hidden.\n\nThe six demo jobs are fictional. The $4,800 figure is their illustrative planned value, not savings. Proposed $199 monthly pricing, demand and the four-week operator pilot remain unvalidated. GroundProof supports internal evidence decisions and does not authorize flights or verify document authenticity.\n\nShivam Gupta is the founder and product lead. AI-assisted development and the synthetic narrator are disclosed. The narrator is not a voice clone.\n`,
);

execFileSync(
  "git",
  [
    "archive",
    "--format=zip",
    `--output=${resolve(output, "groundproof-source.zip")}`,
    "HEAD",
  ],
  { cwd: root },
);
const assets = [
  "START-HERE.md",
  ...Object.values(copies),
  "groundproof-release.json",
  "groundproof-publication-verification.json",
  "groundproof-source.zip",
  "groundproof-pilot-brief.pdf",
  "groundproof-pitch.pptx",
  "groundproof-demo-narrated.mp4",
  "groundproof-demo-silent.mp4",
  "groundproof-demo-captioned.mp4",
  "groundproof-demo-captions.srt",
  "groundproof-demo-script.md",
  "groundproof-demo-voiceover.md",
  "groundproof-narration.txt",
  "groundproof-demo-storyboard.jpg",
  "groundproof-demo-recording.json",
  "groundproof-video-verification.json",
  "groundproof-decision-packet.json",
  "groundproof-decision-manifest.sha256",
  "groundproof-decision-verification.json",
  "anakin-integration-proof.json",
  "firebase-deployment-verification.json",
  "browser-verification.json",
  "landing-art-verification.json",
  "groundproof-devpost-cover.png",
  "groundproof-youtube-thumbnail.png",
  "groundproof-mission-board.png",
  "source-review.png",
  "groundproof-overview.png",
  "landing.png",
  "landing-mobile.png",
  "landing-mobile-art.png",
  "mobile.png",
];
const hashes = [];
for (const file of assets) {
  const bytes = await readFile(resolve(output, file));
  hashes.push(`${createHash("sha256").update(bytes).digest("hex")}  ${file}`);
}
await writeFile(resolve(output, "SHA256SUMS.txt"), hashes.join("\n") + "\n");
const zip = resolve(output, "groundproof-submission-kit.zip");
await unlink(zip).catch((error) => {
  if (error.code !== "ENOENT") throw error;
});
execFileSync("zip", ["-q", zip, ...assets, "SHA256SUMS.txt"], { cwd: output });
console.log(`Packaged ${assets.length} verified deliverables from ${commit}.`);
