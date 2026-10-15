import { expect, test } from "@playwright/test";
import { asFaculty, ensureE2EData, type E2EData } from "./helpers";

test.skip(!process.env.TEST_DATABASE_URL, "needs TEST_DATABASE_URL (see README: npm run db:embedded)");
test.describe.configure({ mode: "serial" });

let data: E2EData;
test.beforeAll(async ({ request }) => { data = await ensureE2EData(request); });

test("faculty logs a class in a few taps and the progress explanation follows", async ({ page }) => {
  await asFaculty(page, data.facultyId, "/session-logs?date=2026-03-02"); // a Monday inside the E2E semester
  await expect(page.getByText(/Classes on Monday 2 March/)).toBeVisible();
  await page.getByRole("button", { name: /Log session for E2E Subject/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Log a session" });
  await expect(dialog.getByText(/09:00–10:00 · 1 h scheduled/)).toBeVisible();
  await dialog.getByRole("group", { name: "E2E Topic A progress this session" }).getByRole("button", { name: "Done" }).click();
  await dialog.getByRole("button", { name: "Save log" }).click();
  await expect(page.getByText(/Session logged — Coverage 0% → 50%/)).toBeVisible();

  // the card now offers a correction, not a second log (duplicate prevention in the UI)
  await expect(page.getByRole("button", { name: /Log session for E2E Subject, E2E Batch, 2 Mar/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Correct log for E2E Subject, E2E Batch, 2 Mar/ }).click();
  const fix = page.getByRole("dialog", { name: "Correct this log" });
  await expect(fix.getByText(/already has a log \(revision 1\)/)).toBeVisible();
  await fix.getByRole("button", { name: "Save correction" }).click();
  await expect(fix.getByText(/Explain the correction/)).toBeVisible(); // note is mandatory
  await fix.getByLabel(/Why are you correcting this log/).fill("Checking the audit trail");
  await fix.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByText(/Log corrected/)).toBeVisible();

  await page.goto(`/subjects/${data.subjectId}`);
  await expect(page.getByText(/Why: /)).toBeVisible();
  const numbers = page.getByRole("list", { name: "Progress numbers" });
  await expect(numbers.getByText("Planned hours in scope").locator("xpath=following-sibling::p[1]")).toHaveText("4 h");
  await expect(numbers.getByText("Covered", { exact: true }).locator("xpath=following-sibling::p[1]")).toHaveText("2 h");
  await expect(numbers.getByText("Remaining", { exact: true }).locator("xpath=following-sibling::p[1]")).toHaveText("2 h");
  await expect(page.getByRole("table", { name: "Topic progress" })).toContainText("E2E Topic A");
});

test("sample subjects explain their status and the dashboard is live", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("prospectus.role", "admin"); localStorage.setItem("prospectus.campus", "hi-tech"); });
  await page.goto("/subjects");
  await page.getByRole("link", { name: /Progress details for/ }).first().click();
  await expect(page.getByRole("region", { name: "Why this status" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Progress numbers" })).toContainText("Buffer ratio");

  await page.goto("/");
  await expect(page.getByText("Live data")).toBeVisible();
  await expect(page.getByText("Overall status")).toBeVisible();
});

test("calendar day panel and timetable show planned classes and log state", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("prospectus.role", "admin"); localStorage.setItem("prospectus.campus", "hi-tech"); });
  await page.goto("/timetable");
  await expect(page.getByText(/Next .* logged/).first()).toBeVisible();
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: /Classes planned/ })).toBeVisible();
});

test("students cannot open Session Logs", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("prospectus.role", "student"));
  await page.goto("/session-logs");
  await expect(page.getByText(/isn't available to the Student role/)).toBeVisible();
});
