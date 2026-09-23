import { test, expect, type Page, type Download } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { hashManifest } from "../../server/evidence";

const outputs = resolve(
  process.env.E2E_OUTPUT_DIR ?? resolve(process.cwd(), "work/e2e-screenshots"),
);
const primaryMission = "Facade inspection · east elevation";
const notice = "Harbor Works access notice";

// Exercise the production rate limits at a human interaction pace, rather than bypassing them.
let nextApiAt = 0;
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const slot = Math.max(Date.now(), nextApiAt);
    nextApiAt = slot + 550;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, slot - Date.now())),
    );
    await route.continue();
  });
});

async function settleTransitions(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}

async function navigate(page: Page, label: string) {
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator("aside")
    .getByRole("button", { name: label, exact: true })
    .click();
  await settleTransitions(page);
}

async function startDemo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the working demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Every mission. A current reason." }),
  ).toBeVisible();
}

async function currentState(page: Page) {
  const response = await page.request.get("/api/state");
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function downloadJson(download: Download) {
  const stream = await download.createReadStream();
  const buffers: Buffer[] = [];
  for await (const chunk of stream!) buffers.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(buffers).toString("utf8"));
}

async function auditA11y(page: Page, context: string) {
  await settleTransitions(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const significant = results.violations.filter(
    (item) => item.impact === "critical" || item.impact === "serious",
  );
  expect
    .soft(
      significant.map((item) => ({
        id: item.id,
        impact: item.impact,
        description: item.description,
        nodes: item.nodes.map((node) => node.target),
      })),
      context,
    )
    .toEqual([]);
}

async function captureScreenshot(page: Page, filename: string) {
  const dismiss = page.getByRole("button", { name: "Dismiss notification" });
  if (await dismiss.isVisible()) await dismiss.click();
  const viewport = page.viewportSize();
  if (filename === "source-review.png" && viewport)
    await page.setViewportSize({ ...viewport, height: 1100 });
  await settleTransitions(page);
  await page.screenshot({
    path: resolve(outputs, filename),
    fullPage: true,
    animations: "disabled",
  });
  if (filename === "source-review.png" && viewport)
    await page.setViewportSize(viewport);
}

test("closure → source hold → recovery review → fresh signoff → verifiable export", async ({
  page,
}, testInfo) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await mkdir(outputs, { recursive: true });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Yesterday’s approval. Today’s reality.",
    }),
  ).toBeVisible();
  await auditA11y(page, "Landing accessibility");
  if (testInfo.project.name.startsWith("desktop"))
    await captureScreenshot(page, "landing.png");
  await page.getByRole("button", { name: "Explore the working demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Every mission. A current reason." }),
  ).toBeVisible();
  expect(
    (await currentState(page)).missions.filter(
      (mission: any) => mission.assessment.status === "ready",
    ),
  ).toHaveLength(6);

  await page.getByRole("button", { name: "Simulate site closure" }).click();
  await expect(
    page.getByRole("heading", { name: "3 missions need a fresh decision." }),
  ).toBeVisible();
  await expect(
    page.locator(".stat-card").filter({ hasText: "Booked value on hold" }),
  ).toContainText("$4,800");
  const closedState = await currentState(page);
  expect(
    closedState.missions.filter(
      (mission: any) => mission.assessment.status !== "ready",
    ),
  ).toHaveLength(3);
  expect(
    closedState.missions.filter(
      (mission: any) => mission.assessment.status === "ready",
    ),
  ).toHaveLength(3);
  await auditA11y(page, "Operations overview accessibility");
  if (testInfo.project.name.startsWith("desktop"))
    await captureScreenshot(page, "groundproof-overview.png");
  else await captureScreenshot(page, "mobile.png");

  await navigate(page, "Mission board");
  await expect(
    page.getByRole("heading", { name: "Mission board", exact: true }),
  ).toBeVisible();
  await auditA11y(page, "Mission board accessibility");
  if (testInfo.project.name.startsWith("desktop"))
    await captureScreenshot(page, "groundproof-mission-board.png");
  await page.getByRole("button", { name: primaryMission, exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign off current evidence" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close dialog" }).click();

  await navigate(page, "Evidence library");
  await auditA11y(page, "Evidence library accessibility");
  await page.getByRole("button", { name: notice, exact: true }).click();
  await expect(
    page.getByText("Previous capture", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".snapshot.current pre")).toContainText(
    "SITE ACCESS SUSPENDED",
  );
  await auditA11y(page, "Evidence review dialog accessibility");
  if (testInfo.project.name.startsWith("desktop"))
    await captureScreenshot(page, "source-review.png");
  await page
    .getByLabel("Review note", { exact: true })
    .fill(
      "Site staging area is suspended. Keep the three linked missions on hold.",
    );
  await page.getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await currentState(page)).missions.filter(
      (mission: any) => mission.assessment.status === "hold",
    ),
  ).toHaveLength(3);

  await navigate(page, "Proof lab");
  await page
    .getByRole("button", {
      name: "Updated access notice Recover with a new version",
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "3 missions need a fresh decision." }),
  ).toBeVisible();
  const restoredState = await currentState(page);
  expect(
    restoredState.missions.filter(
      (mission: any) => mission.assessment.status !== "ready",
    ),
  ).toHaveLength(3);

  await navigate(page, "Evidence library");
  await page.getByRole("button", { name: notice, exact: true }).click();
  await page
    .getByRole("radio", {
      name: "Accept evidence Record a checked, current source",
    })
    .check();
  await page
    .getByLabel("Review note", { exact: true })
    .fill(
      "Checked the restored fictional access notice and verified current source conditions.",
    );
  await page.getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await currentState(page)).missions.filter(
      (mission: any) => mission.assessment.status === "ready",
    ),
  ).toHaveLength(3);

  await navigate(page, "Mission board");
  await page.getByRole("button", { name: primaryMission, exact: true }).click();
  await page
    .getByLabel("Signoff note", { exact: true })
    .fill(
      "Reviewed current site access, planning checklist and insurance evidence for this fictional mission.",
    );
  await expect(
    page.getByRole("button", { name: "Sign off current evidence" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Sign off current evidence" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await currentState(page)).missions.filter(
      (mission: any) => mission.assessment.status === "ready",
    ),
  ).toHaveLength(4);
  await page.getByRole("button", { name: primaryMission, exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export decision packet" }).click();
  const bundle = await downloadJson(await download);
  const { manifest, ...payload } = bundle;
  expect(hashManifest(payload)).toBe(manifest.hash);
  expect(bundle.mission.assessment.status).toBe("ready");
  expect(bundle.sources).toHaveLength(3);
  expect(bundle.audit.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Close dialog" }).click();

  await navigate(page, "Proof lab");
  await page.getByRole("button", { name: "Run verification suite" }).click();
  await expect(page.locator(".lab-result-hero strong")).toHaveText("15/15");
  await expect(page.locator(".lab-result-row")).toHaveCount(15);
  const labDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download results" }).click();
  const lab = await downloadJson(await labDownload);
  expect(lab.passed).toBe(lab.total);
  expect(
    lab.results.every(
      (result: any) => result.passed && result.expected === result.actual,
    ),
  ).toBe(true);
  await auditA11y(page, "Proof lab accessibility");
  await navigate(page, "Audit trail");
  await auditA11y(page, "Audit trail accessibility");
  await navigate(page, "Workspace settings");
  await auditA11y(page, "Workspace settings accessibility");
  expect(failures).toEqual([]);
});

test("new account → real source capture → mission review → logout and login persistence", async ({
  page,
}, testInfo) => {
  const email = `e2e-${Date.now()}-${testInfo.project.name}@example.com`;
  const password = "Evidence-test-passphrase-2026";
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await page
    .getByLabel("Your name", { exact: true })
    .fill("Browser Test Operator");
  await page
    .getByLabel("Workspace name", { exact: true })
    .fill("Browser Evidence Workspace");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Every mission. A current reason." }),
  ).toBeVisible();
  expect((await currentState(page)).missions).toHaveLength(0);

  await page.getByRole("button", { name: "New mission", exact: true }).click();
  await page.getByRole("button", { name: "Add a site", exact: true }).click();
  await page
    .getByLabel("Site name", { exact: true })
    .fill("Test Inspection Site");
  await page
    .getByLabel("Address or site description", { exact: true })
    .fill("Fictional site for browser acceptance testing");
  await page.getByLabel("Latitude", { exact: true }).fill("42.36");
  await page.getByLabel("Longitude", { exact: true }).fill("-71.06");
  await page.getByRole("button", { name: "Create site", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "Evidence library");
  await page.getByRole("button", { name: "Add source", exact: true }).click();
  await page
    .getByLabel("Source title", { exact: true })
    .fill("FAA UAS official reference");
  await page
    .getByLabel("Public source URL", { exact: true })
    .fill("https://www.faa.gov/uas");
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("airspace");
  await page
    .getByRole("button", { name: "Add evidence source", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Capture FAA UAS official reference",
      exact: true,
    })
    .click();
  await expect(page.locator(".source-card")).toContainText("DIRECT CAPTURE", {
    timeout: 35_000,
  });
  await page
    .getByRole("button", { name: "FAA UAS official reference", exact: true })
    .click();
  await expect(page.locator(".snapshot.current pre")).toContainText(
    "Federal Aviation Administration",
  );
  await page
    .getByRole("button", { name: "Enable monitoring", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause monitoring", exact: true }),
  ).toBeVisible();
  expect((await currentState(page)).sources[0].monitor.enabled).toBe(true);
  await page
    .getByRole("button", { name: "Pause monitoring", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Enable monitoring", exact: true }),
  ).toBeVisible();
  expect((await currentState(page)).sources[0].monitor.enabled).toBe(false);
  await page
    .getByRole("radio", {
      name: "Accept evidence Record a checked, current source",
    })
    .check();
  await page
    .getByLabel("Review note", { exact: true })
    .fill(
      "Verified this public FAA reference is captured for a documentation workflow test; no flight authorization inferred.",
    );
  await page.getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await navigate(page, "Mission board");
  await page.getByRole("button", { name: "New mission", exact: true }).click();
  await page
    .getByLabel("Mission name", { exact: true })
    .fill("Browser documentation workflow");
  await page.getByLabel("Client", { exact: true }).fill("Test client");
  await page.getByLabel("Booked value ($)", { exact: true }).fill("900");
  const scheduledLocal = await page.evaluate(() => {
    const scheduled = new Date(Date.now() + 72 * 3_600_000);
    return new Date(
      scheduled.getTime() - scheduled.getTimezoneOffset() * 60_000,
    )
      .toISOString()
      .slice(0, 16);
  });
  await page
    .getByLabel("Scheduled time (your local timezone)", { exact: true })
    .fill(scheduledLocal);
  await page
    .getByRole("checkbox", {
      name: "FAA UAS official reference Airspace reference",
    })
    .check();
  await page
    .getByRole("button", { name: "Create mission", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Browser documentation workflow",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Signoff note", { exact: true })
    .fill(
      "Reviewed the selected reference for this documentation-only acceptance test.",
    );
  await page.getByRole("button", { name: "Sign off current evidence" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const signed = await currentState(page);
  expect(signed.missions[0].assessment.status).toBe("ready");
  expect(signed.sources[0].latest.provider).toBe("direct");

  await page
    .getByRole("button", {
      name: "Browser documentation workflow",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Edit mission", exact: true }).click();
  await page.getByLabel("Booked value ($)", { exact: true }).fill("950");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const edited = await currentState(page);
  expect(edited.missions[0].value).toBe(950);
  expect(edited.missions[0].scheduledAt).toBe(signed.missions[0].scheduledAt);
  expect(edited.missions[0].approval).toBeNull();
  expect(edited.missions[0].assessment.status).not.toBe("ready");
  await page
    .getByRole("button", {
      name: "Browser documentation workflow",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Signoff note", { exact: true })
    .fill("Rechecked documentation after updated commercial mission details.");
  await page.getByRole("button", { name: "Sign off current evidence" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Explore the working demo" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Every mission. A current reason." }),
  ).toBeVisible();
  await expect(page.locator("aside")).not.toHaveClass(/open/);
  await expect(
    page.getByRole("button", {
      name: "Browser documentation workflow",
      exact: true,
    }),
  ).toBeVisible();
  expect((await currentState(page)).missions[0].assessment.status).toBe(
    "ready",
  );
});

test("independent demo isolation, keyboard dialog and responsive containment", async ({
  page,
  browser,
}) => {
  await startDemo(page);
  const first = await currentState(page);
  const secondContext = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
  });
  const otherPage = await secondContext.newPage();
  await startDemo(otherPage);
  const second = await currentState(otherPage);
  expect(first.user.id).not.toBe(second.user.id);
  await page.getByRole("button", { name: "Simulate site closure" }).click();
  await expect(
    page.getByRole("heading", { name: "3 missions need a fresh decision." }),
  ).toBeVisible();
  expect(
    (await currentState(otherPage)).missions.every(
      (mission: any) => mission.assessment.status === "ready",
    ),
  ).toBe(true);
  await secondContext.close();
  await page.getByRole("button", { name: "New mission", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("operator record → expiry blocks planned job → version update → separate review and approval", async ({
  page,
}) => {
  await startDemo(page);
  const times = await page.evaluate(() => {
    const local = (hours: number) => {
      const d = new Date(Date.now() + hours * 3_600_000);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16);
    };
    return { early: local(24), mission: local(48), renewed: local(72) };
  });
  await navigate(page, "Evidence library");
  await page.getByRole("button", { name: "Add source", exact: true }).click();
  await page
    .getByRole("button", { name: "Operator record", exact: true })
    .click();
  await page
    .getByLabel("Record title", { exact: true })
    .fill("Browser written site permission");
  await page
    .getByLabel("Original document reference", { exact: true })
    .fill("TEST-PERMIT-2026-001");
  await page
    .getByRole("textbox", { name: "Evidence excerpt", exact: true })
    .fill(
      "Synthetic permission for exterior inspection at the test site, subject to current site restrictions and pilot review. This is a browser test record, not a real permit.",
    );
  await page
    .getByLabel("Declared valid until (optional, your local time)", {
      exact: true,
    })
    .fill(times.early);
  await auditA11y(page, "Operator record form accessibility");
  await page
    .getByRole("button", { name: "Create operator record", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Browser written site permission",
      exact: true,
    })
    .click();
  await expect(page.locator(".snapshot.current pre")).toContainText(
    "OPERATOR-SUPPLIED RECORD — NOT INDEPENDENTLY VERIFIED",
  );
  await page
    .getByRole("radio", {
      name: "Accept evidence Record a checked, current source",
    })
    .check();
  await page
    .getByLabel("Review note", { exact: true })
    .fill(
      "Reviewed the operator supplied test excerpt and declared validity; no issuer authenticity is inferred.",
    );
  await page
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await navigate(page, "Mission board");
  await page.getByRole("button", { name: "New mission", exact: true }).click();
  await page
    .getByLabel("Mission name", { exact: true })
    .fill("Permit expiry acceptance test");
  await page
    .getByLabel("Client", { exact: true })
    .fill("Fictional test client");
  await page.getByLabel("Booked value ($)", { exact: true }).fill("700");
  await page
    .getByLabel("Scheduled time (your local timezone)", { exact: true })
    .fill(times.mission);
  await page
    .getByRole("checkbox", {
      name: "Browser written site permission Site access",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Create mission", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let state = await currentState(page);
  let job = state.missions.find(
    (item: any) => item.name === "Permit expiry acceptance test",
  );
  expect(job.assessment.status).toBe("hold");
  expect(job.assessment.issues.some((item: any) => item.code === "stale")).toBe(
    true,
  );
  await page
    .getByRole("button", { name: "Permit expiry acceptance test", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign off current evidence" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await navigate(page, "Evidence library");
  await page
    .getByRole("button", {
      name: "Browser written site permission",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Update record", exact: true })
    .click();
  await page
    .getByLabel("Declared valid until (optional, your local time)", {
      exact: true,
    })
    .fill(times.renewed);
  await page
    .getByRole("button", { name: "Save a new record version", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Browser written site permission",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Previous capture", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("radio", {
      name: "Accept evidence Record a checked, current source",
    })
    .check();
  await page
    .getByLabel("Review note", { exact: true })
    .fill(
      "Reviewed renewed validity against the planned fictional mission; checked the current version.",
    );
  await page
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  state = await currentState(page);
  job = state.missions.find(
    (item: any) => item.name === "Permit expiry acceptance test",
  );
  expect(job.assessment.status).not.toBe("ready");
  await navigate(page, "Mission board");
  await page
    .getByRole("button", { name: "Permit expiry acceptance test", exact: true })
    .click();
  await page
    .getByLabel("Signoff note", { exact: true })
    .fill(
      "Current permission record reviewed and valid through the planned fictional job.",
    );
  await page.getByRole("button", { name: "Sign off current evidence" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await currentState(page)).missions.find((item: any) => item.id === job.id)
      .assessment.status,
  ).toBe("ready");
  await navigate(page, "Evidence library");
  await page
    .getByRole("button", {
      name: "Browser written site permission",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Update record", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Evidence excerpt", exact: true })
    .fill(
      "Synthetic permission revised: exterior inspection at the test site is restricted to the eastern facade only. This updated browser test record is not a real permit.",
    );
  await page
    .getByRole("button", { name: "Save a new record version", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const changed = (await currentState(page)).missions.find(
    (item: any) => item.id === job.id,
  );
  expect(changed.approval).toBeNull();
  expect(changed.assessment.status).toBe("review");
});
