import { expect, test, type Page } from "@playwright/test";
import { E2E_LOGIN } from "../playwright.config";

test.skip(!process.env.TEST_DATABASE_URL, "needs TEST_DATABASE_URL (see README: npm run db:embedded)");

const BATCH = "sample-batch-hi-tech-mirai-a-s3"; // the batch the e2e student account is linked to (see playwright.config.ts)
const OTHER = "sample-batch-hi-tech-university-a-s3";

async function signInStudent(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(E2E_LOGIN.studentEmail);
  await page.getByLabel("Password", { exact: true }).fill(E2E_LOGIN.studentPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
}

test("a student opens My learning and sees their own batch's real, hour-weighted progress", async ({ page }) => {
  await signInStudent(page);
  await page.getByRole("link", { name: "My learning" }).first().click();
  await expect(page).toHaveURL(/\/my-learning$/);
  const api = await (await page.request.get("/api/student/portal")).json() as { batch: { name: string }; overview: { overallCoveragePct: number; subjectCount: number }; subjects: Array<{ name: string; coveragePct: number; coveredHours: number }>; exams: Array<{ name: string }> };
  await expect(page.getByText(new RegExp(`${api.batch.name} · HI-Tech · Mirai Track`))).toBeVisible();
  const overview = page.getByRole("list", { name: "Overview" });
  await expect(overview).toContainText(`${api.overview.overallCoveragePct}%`);
  await expect(overview).toContainText(String(api.overview.subjectCount));
  const subjects = page.getByRole("region", { name: "My subjects" });
  for (const s of api.subjects) await expect(subjects).toContainText(s.name);
  const first = api.subjects.find((s) => s.coveragePct !== null)!;
  await expect(subjects.getByRole("progressbar", { name: `${first.name} syllabus covered` })).toHaveAttribute("aria-valuenow", String(Math.round(first.coveragePct)));
  await expect(page.getByRole("region", { name: "Upcoming exams" })).toContainText(api.exams[0]!.name);
  // read-only: nothing to click that changes data
  await expect(page.getByRole("button", { name: /Add|Edit|Delete|Save|Log a session/i })).toHaveCount(0);
});

test("manipulated requests cannot reach another batch, write data or bypass sign-in", async ({ page, browser }) => {
  await signInStudent(page);
  const own = await page.request.get(`/api/student/portal?batchId=${BATCH}`);
  expect(own.status()).toBe(200);
  const other = await page.request.get(`/api/student/portal?batchId=${OTHER}`);
  expect(other.status()).toBe(403);
  expect((await other.json() as { error: string }).error).toBe("forbidden_batch");
  expect((await page.request.get("/api/student/portal", { headers: { "X-Demo-Batch": OTHER, "X-Demo-Role": "admin" } })).status()).toBe(200); // headers are ignored: still the session's own batch…
  expect(((await (await page.request.get("/api/student/portal", { headers: { "X-Demo-Batch": OTHER } })).json()) as { batch: { id: string } }).batch.id).toBe(BATCH); // …never the header's
  for (const [method, path] of [["post", "/api/faculty"], ["post", "/api/session-logs"], ["post", "/api/exams"]] as const) expect((await page.request[method](path, { data: {} })).status(), path).toBe(403);
  expect((await page.request.post("/api/student/portal", { data: {} })).status()).toBe(404);
  const anon = await browser.newContext();
  expect((await anon.request.get(`${page.url().split("/").slice(0, 3).join("/")}/api/session-logs`)).status()).toBe(401);
  await anon.close();
});

test("My learning is usable on a phone: no overflow, content visible without zooming", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInStudent(page);
  await page.goto("/my-learning");
  await expect(page.getByRole("region", { name: "My subjects" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("main button, main a[href]")].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && (r.height < 40 || r.width < 40); }).map((e) => (e.textContent ?? "").trim().slice(0, 20)));
  expect(small).toEqual([]);
});

test("the development role preview can still look at a batch (labelled demo, no sign-in)", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("prospectus.role", "student"); localStorage.setItem("prospectus.campus", "hi-tech"); });
  await page.goto("/my-learning");
  await expect(page.getByText("Choose a batch to preview")).toBeVisible();
  await page.getByLabel(/Preview as a student of batch/).selectOption(BATCH);
  await expect(page.getByRole("region", { name: "My subjects" })).toBeVisible();
});
