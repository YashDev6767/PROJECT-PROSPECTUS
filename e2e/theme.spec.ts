import { expect, test, type Page } from "@playwright/test";

const html = (page: Page) => page.locator("html");
const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const pickTheme = async (page: Page, name: "Light" | "Dark" | "System") => {
  await page.getByRole("button", { name: /^Theme:/ }).click();
  await page.getByRole("menuitemradio", { name }).click();
};
const paths = ["/", "/calendar", "/semesters", "/exams", "/subjects", "/timetable", "/session-logs", "/exam-readiness", "/reports", "/settings"];

test("System follows the OS live; an explicit choice wins, persists across reloads and is applied before React starts", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => localStorage.setItem("prospectus.role", "admin"));
  await page.goto("/");
  await expect(html(page)).toHaveClass(/dark/);
  await expect(page.getByRole("button", { name: "Theme: System (dark)" })).toBeVisible();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html(page)).not.toHaveClass(/dark/);

  await pickTheme(page, "Dark");
  await expect(html(page)).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "light" }); // OS says light, user said dark
  await page.reload();
  await expect(html(page)).toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem("prospectus.theme"))).toBe("dark");
  expect(await bodyBg(page)).toBe("rgb(8, 10, 19)");

  await pickTheme(page, "Light");
  await page.reload();
  await expect(html(page)).not.toHaveClass(/dark/);
  expect(await bodyBg(page)).toBe("rgb(243, 244, 251)");
});

test("no flash of the wrong theme: the saved theme is applied by an inline script before the app bundle runs", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("prospectus.theme", "dark"));
  await page.route("**/src/main.tsx*", (r) => r.abort()); // the React app never starts
  await page.goto("/");
  await expect(html(page)).toHaveClass(/dark/);
  expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe("dark");
});

test("every route renders in dark mode with dark surfaces and no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/status of (4|5)\d\d/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { localStorage.setItem("prospectus.theme", "dark"); localStorage.setItem("prospectus.role", "admin"); });
  for (const path of paths) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    expect(await bodyBg(page), path).toBe("rgb(8, 10, 19)");
    const lightSurfaces = await page.evaluate(() => [...document.querySelectorAll("main *")].filter((el) => getComputedStyle(el).backgroundColor === "rgb(255, 255, 255)").length);
    expect(lightSurfaces, `${path}: elements still painted pure white in dark mode`).toBe(0);
  }
  expect(errors).toEqual([]);
});

test("the theme menu works from the keyboard", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: /^Theme:/ });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: "System" })).toBeFocused();
  await page.keyboard.press("ArrowUp"); // Dark
  await page.keyboard.press("Enter");
  await expect(html(page)).toHaveClass(/dark/);
  await expect(trigger).toBeFocused();
});

test("reduced motion removes entrance animations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/calendar");
  const ms = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".page-enter")!).animationDuration) * 1000);
  expect(ms).toBeLessThan(1);
});

test("with motion allowed the page entrance is a short transition (≤ 400 ms)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/calendar");
  const ms = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".page-enter")!).animationDuration) * 1000);
  expect(ms).toBeGreaterThan(100);
  expect(ms).toBeLessThanOrEqual(400);
});

test("Magic UI theme toggler: one click flips the theme (with its view-transition reveal) and persists", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => { if (!localStorage.getItem("prospectus.theme")) localStorage.setItem("prospectus.theme", "light"); });
  await page.goto("/calendar");
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(html(page)).toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem("prospectus.theme"))).toBe("dark");
  await page.reload();
  await expect(html(page)).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(html(page)).not.toHaveClass(/dark/);
});

test("Originkit call-to-action on the Overview navigates in-app, and the dashboard shows the API's exact numbers", async ({ page, isMobile }) => {
  test.skip(isMobile, "the pill CTA is desktop-only; mobile uses the bottom bar");
  await page.addInitScript(() => { localStorage.setItem("prospectus.role", "admin"); localStorage.setItem("prospectus.campus", "hi-tech"); });
  await page.goto("/");
  const api = await (await page.request.get("/api/dashboard?campusId=hi-tech")).json() as { metrics: { overallCoveragePct: number } };
  const coverage = page.getByText("Syllabus covered").locator("xpath=following-sibling::p[1]");
  // the figure is rendered statically and must equal the API value
  await expect(coverage).toHaveText(`${api.metrics.overallCoveragePct.toFixed(1)}%`, { timeout: 10_000 });
  await page.getByRole("button", { name: "Log a session" }).first().click();
  await expect(page).toHaveURL(/\/session-logs$/);
});
