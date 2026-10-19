import { expect, test, type Page } from "@playwright/test";

test.skip(!process.env.TEST_DATABASE_URL, "needs TEST_DATABASE_URL (see README: npm run db:embedded)");

const routes = ["/", "/calendar", "/semesters", "/exams", "/subjects", "/timetable", "/session-logs", "/exam-readiness", "/reports", "/settings", "/subjects/sample-subj-sample-batch-hi-tech-mirai-a-s3-smp103"];
const asAdmin = (page: Page) => page.addInitScript(() => { localStorage.setItem("prospectus.role", "admin"); localStorage.setItem("prospectus.campus", "hi-tech"); });

for (const [width, height] of [[390, 844], [820, 1100], [1440, 900]] as const) {
  test(`no page-level horizontal overflow on any route at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await asAdmin(page);
    for (const path of routes) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} at ${width}px overflows by ${overflow}px`).toBeLessThanOrEqual(0);
    }
  });
}

test("touch targets on phones are at least 40 × 40 CSS px (links with a full-card hit area excepted)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await asAdmin(page);
  for (const path of routes) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("button,a[href],select,input:not([type=hidden])")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        if (getComputedStyle(e, "::after").position === "absolute") return false; // stretched card link: the whole card is the target
        if (e.closest(".sr-only") || String(e.className).includes("sr-only")) return false;
        return r.height < 40 || r.width < 40;
      })
      .map((e) => `${e.tagName} "${(e.getAttribute("aria-label") ?? e.textContent ?? "").trim().slice(0, 30)}" ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`));
    expect(small, `${path}: undersized touch targets`).toEqual([]);
  }
});
