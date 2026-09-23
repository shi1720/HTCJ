/** Generate original brand covers using vector layout and a real product screenshot. */
import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(
  process.env.DEMO_OUTPUT_DIR ?? resolve(root, "work/recordings/deliverables"),
);
const screenshot = resolve(
  process.env.DEMO_SCREENSHOT ??
    resolve(root, "docs/deliverables/groundproof-mission-board.png"),
);
await mkdir(output, { recursive: true });
const screen =
  "data:image/png;base64," + (await readFile(screenshot)).toString("base64");
const browser = await chromium.launch();
for (const spec of [
  { name: "groundproof-devpost-cover.png", w: 1500, h: 1000 },
  { name: "groundproof-youtube-thumbnail.png", w: 1600, h: 900 },
]) {
  const page = await browser.newPage({
    viewport: { width: spec.w, height: spec.h },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<!doctype html><html><head><style>
 *{box-sizing:border-box}body{margin:0;background:#f1f0e7;color:#203d30;font-family:Arial,Helvetica,sans-serif;width:${spec.w}px;height:${spec.h}px;overflow:hidden}
 .canvas{padding:64px;position:relative;height:100%;background:radial-gradient(ellipse at 95% 85%,#dbe6ba 0,transparent 50%)}
 .brand{display:flex;align-items:center;gap:17px;font-size:32px;letter-spacing:-1.2px;font-weight:700}.mark{height:47px;width:47px;border-radius:13px;background:#254b38;color:#dcf09c;display:grid;place-items:center;font-size:34px}
 .eyebrow{font-size:14px;letter-spacing:2.3px;text-transform:uppercase;margin-top:50px;color:#526f5b;font-weight:700}
 h1{font-size:83px;line-height:1.01;letter-spacing:-4.5px;max-width:650px;margin:24px 0 24px;position:relative;z-index:2}h1 em{font-style:normal;color:#60802b}
 .lede{font-size:24px;line-height:1.45;max-width:540px;color:#53635a}.pill{display:inline-flex;border:1px solid #bbcba8;border-radius:50px;padding:12px 17px;font-size:15px;margin-top:18px;background:#fff9}
 .preview{position:absolute;left:730px;top:180px;width:1020px;transform:rotate(-5deg);border:10px solid #fff;border-radius:23px;box-shadow:0 30px 75px #264e3425;overflow:hidden;background:#fff}.preview img{display:block;width:100%}
 .notice{position:absolute;z-index:3;left:805px;top:${spec.h - 305}px;background:#254b38;color:#f7f9ef;border:1px solid #5b7553;border-radius:20px;padding:26px 34px;box-shadow:0 15px 40px #28493430;width:410px}.notice strong{font-size:26px;display:block;margin-bottom:9px}.notice span{font-size:16px;color:#d3ddc8;line-height:1.4;display:block}
 footer{position:absolute;bottom:46px;left:64px;right:64px;border-top:1px solid #c5cec0;padding-top:20px;display:flex;justify-content:space-between;font-size:14px;color:#5b6d60;letter-spacing:.3px}
 </style></head><body><div class="canvas"><div class="brand"><span class="mark">↗</span>GroundProof</div><div class="eyebrow">Evidence for drone operations</div><h1>One notice changes.<br><em>Which jobs<br>need review?</em></h1><p class="lede">Keep each internal approval tied to the evidence behind it.</p><div class="pill">Live product · Traceable decisions · Human signoff</div><div class="preview"><img src="${screen}" alt="GroundProof mission board"></div><div class="notice"><strong>A changed fact needs<br>a fresh decision.</strong><span>See the affected jobs.<br>Review the change. Sign off again.</span></div><footer><span>Built by Shivam Gupta · HTCJ × PROOF</span><span>groundproof-flight.web.app</span></footer></div></body></html>`);
  await page.screenshot({ path: resolve(output, spec.name) });
  await page.close();
}
await browser.close();
console.log("Created Devpost and YouTube covers.");
