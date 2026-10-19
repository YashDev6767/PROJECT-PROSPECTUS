import { expect, test } from "@playwright/test";

test.skip(!process.env.TEST_DATABASE_URL, "needs TEST_DATABASE_URL (see README: npm run db:embedded)");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("prospectus.role", "admin"); localStorage.setItem("prospectus.campus", "hi-tech"); });
});

test("Exam Readiness shows exactly what the database-backed API computes (no demo numbers)", async ({ page }) => {
  const api = await (await page.request.get("/api/exam-readiness?campusId=hi-tech")).json() as { state: string; exams: Array<{ name: string; startsOn: string; subjects: Array<{ subjectId: string; name: string; status: string; coveragePct: number | null; bufferRatio: number | null }> }> };
  expect(api.state).toBe("ready");
  expect(api.exams.length).toBeGreaterThan(0);
  await page.goto("/exam-readiness");
  await expect(page.getByRole("heading", { level: 1, name: "Exam Readiness" })).toBeVisible();
  const first = api.exams[0]!;
  const table = page.getByRole("table", { name: `Readiness of each subject for ${first.name}` }).first();
  await expect(table).toBeVisible();
  await expect(table.locator("tbody tr")).toHaveCount(first.subjects.length);
  const s = first.subjects.find((x) => x.coveragePct !== null)!;
  const row = table.locator("tr", { hasText: s.name }).first();
  await expect(row).toContainText(`${s.coveragePct}%`);
  if (s.bufferRatio !== null) await expect(row).toContainText(s.bufferRatio.toFixed(2));
  await expect(page.getByText("Not available yet")).toHaveCount(0);
  // the explanation is a capacity check, never a marks prediction
  await expect(page.getByText(/not a prediction of marks/)).toBeVisible();
});

test("a subject name opens its progression detail", async ({ page }) => {
  await page.goto("/exam-readiness");
  await page.getByRole("table").first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/subjects\/[^/]+$/);
});

test("a failed live dashboard is an error with retry, never demo numbers or an all-clear", async ({ page }) => {
  await page.route("**/api/dashboard**", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "dashboard_unavailable", message: "The live dashboard could not be computed right now, so no academic status is shown." }) }));
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(/could not be computed right now/);
  await expect(page.getByText(/No subjects at risk/)).toHaveCount(0);
  await expect(page.getByText("Demo data")).toHaveCount(0);
  await expect(page.getByText("Syllabus covered")).toHaveCount(0);
});

test("a failed Exam Readiness request is an error with retry, not an empty page", async ({ page }) => {
  await page.route("**/api/exam-readiness**", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "internal_error", message: "Something went wrong on the server" }) }));
  await page.goto("/exam-readiness");
  await expect(page.getByRole("alert")).toContainText(/Something went wrong/);
  await expect(page.getByText("No upcoming exams configured")).toHaveCount(0);
});
