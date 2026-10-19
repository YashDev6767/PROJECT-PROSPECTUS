import { expect, test } from "@playwright/test";
import { asFaculty, ensureE2EData, type E2EData } from "./helpers";

test.skip(!process.env.TEST_DATABASE_URL, "needs TEST_DATABASE_URL (see README: npm run db:embedded)");
test.describe.configure({ mode: "serial" });

let data: E2EData;
test.beforeAll(async ({ request }) => { data = await ensureE2EData(request); });

const admin = async (page: import("@playwright/test").Page, path: string) => {
  await page.addInitScript(() => { localStorage.setItem("prospectus.role", "admin"); localStorage.setItem("prospectus.campus", "ratnam"); });
  await page.goto(path);
  const select = page.getByLabel("Semester");
  const value = await select.locator("option", { hasText: "E2E Spring" }).getAttribute("value");
  await select.selectOption(value!);
};

test("timetable: the class sits in its Monday column at its saved time; week navigation crosses month and year boundaries", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await admin(page, "/timetable");
  await expect(page.getByTestId("range-label")).toHaveText("5 Jan – 10 Jan 2026"); // semester starts Mon 5 Jan; today is outside it
  const monday = page.getByRole("group", { name: "Monday 2026-01-05" });
  const card = monday.getByRole("group").or(monday.getByRole("button", { name: /E2E Subject/ })).first();
  await expect(card).toContainText("E2E Subject");
  await expect(card).toContainText("09:00 – 10:00");
  await expect(card).toContainText("E2E Batch");
  // 09:00 is one hour below the 08:00 top of the grid; a one-hour class is exactly one hour tall
  const cols = await monday.boundingBox(), box = await card.boundingBox();
  const hourPx = box!.height + 2;
  expect(Math.round(box!.y - cols!.y)).toBe(Math.round(hourPx + 1));
  await expect(page.getByRole("group", { name: "Tuesday 2026-01-06" }).getByText("No classes")).toBeVisible();

  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.getByTestId("range-label")).toHaveText("12 Jan – 17 Jan 2026");
  for (let i = 0; i < 50; i++) await page.getByRole("button", { name: "Next week" }).click(); // → week of 28 Dec 2026 …
  await expect(page.getByTestId("range-label")).toHaveText("28 Dec 2026 – 2 Jan 2027");
  await expect(page.getByText(/is outside E2E Spring/)).toBeVisible();
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(page.getByTestId("range-label")).toHaveText("21 Dec – 26 Dec 2026");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("timetable: Day view on a phone shows one readable column and nothing overflows the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await admin(page, "/timetable");
  await expect(page.getByRole("tab", { name: "Day", selected: true })).toBeVisible(); // phones default to Day
  await expect(page.getByTestId("range-label")).toContainText("Monday, 5 January 2026");
  await expect(page.getByRole("group", { name: "Monday 2026-01-05" })).toContainText("E2E Subject");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.getByTestId("range-label")).toContainText("Tuesday, 6 January 2026");
  await page.getByRole("tab", { name: "Week" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); // the grid scrolls inside its own container
  expect(await page.getByTestId("timetable-scroll").evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
});

test("timetable: clicking a class opens the existing edit dialog", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await admin(page, "/timetable");
  await page.getByRole("button", { name: /Edit E2E Subject/ }).click();
  await expect(page.getByRole("dialog", { name: "Edit class" })).toBeVisible();
});

for (const [w, h, theme] of [[1280, 720, "light"], [1024, 560, "dark"], [390, 640, "light"], [390, 420, "dark"]] as const) {
  test(`Log a session dialog stays inside a ${w}×${h} ${theme} viewport and scrolls to Save (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.addInitScript((t) => localStorage.setItem("prospectus.theme", t), theme);
    await asFaculty(page, data.facultyId, "/session-logs?date=2026-03-02");
    const trigger = page.getByRole("button", { name: /(Log session|Correct log) for E2E Subject/ }).first();
    await trigger.focus();
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(450); // let the entry animation settle before measuring
    const box = (await dialog.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(h + 0.5);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    // the scrolling region is the dialog body; wheel it all the way down and the buttons must be on screen
    await page.mouse.move(w / 2, h / 2);
    await page.mouse.wheel(0, 4000);
    const save = (await dialog.getByRole("button", { name: /^Save (log|correction)$/ }).boundingBox())!;
    expect(save.y).toBeGreaterThanOrEqual(0); expect(save.y + save.height).toBeLessThanOrEqual(h);
    const cancel = (await dialog.getByRole("button", { name: "Cancel" }).boundingBox())!;
    expect(cancel.y + cancel.height).toBeLessThanOrEqual(h);
    await expect(dialog.getByRole("heading").first()).toBeInViewport(); // header stays put
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  });
}
