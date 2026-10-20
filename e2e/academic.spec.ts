import { expect, test, type Page } from "@playwright/test";
import { asFaculty, ensureE2EData } from "./helpers";

test.skip(!process.env.TEST_DATABASE_URL, "needs TEST_DATABASE_URL (see README: npm run db:embedded)");
test.describe.configure({ mode: "serial" });

const asRole = async (page: Page, role: string, path: string) => {
  await page.addInitScript((r) => { localStorage.setItem("prospectus.role", r); localStorage.removeItem("prospectus.campus"); }, role);
  await page.goto(path);
};
const dialog = (page: Page) => page.getByRole("dialog");

test("semesters: validation, overlap warning that needs confirmation, then delete", async ({ page }) => {
  await asRole(page, "admin", "/semesters");
  await expect(page.getByText("Semester 3").first()).toBeVisible();
  await expect(page.getByText("Sample", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "New semester" }).click();
  await dialog(page).getByLabel("Semester name").fill("E2E Semester");
  await dialog(page).getByLabel("Academic year").fill("2027-28");
  await dialog(page).getByLabel("Academic track").selectOption("UNIVERSITY");
  await dialog(page).getByLabel("Start date").fill("2027-08-02");
  await dialog(page).getByLabel("End date").fill("2027-07-01");
  await dialog(page).getByRole("button", { name: "Create semester" }).click();
  await expect(dialog(page).getByText("End date cannot be before the start date")).toBeVisible();

  await dialog(page).getByLabel("End date").fill("2027-12-17");
  await dialog(page).getByRole("button", { name: "Create semester" }).click();
  await expect(page.getByText("E2E Semester saved")).toBeVisible();
  await expect(page.getByRole("row", { name: /E2E Semester/ })).toContainText("Not activated");

  await page.getByRole("button", { name: "New semester" }).click();
  await dialog(page).getByLabel("Semester name").fill("E2E Overlap");
  await dialog(page).getByLabel("Academic year").fill("2027-28");
  await dialog(page).getByLabel("Academic track").selectOption("UNIVERSITY");
  await dialog(page).getByLabel("Start date").fill("2027-12-01");
  await dialog(page).getByLabel("End date").fill("2028-04-30");
  await dialog(page).getByRole("button", { name: "Create semester" }).click();
  await expect(dialog(page)).toContainText('Overlaps "E2E Semester"');
  await expect(page.getByRole("row", { name: /E2E Overlap/ })).toHaveCount(0); // nothing saved yet
  await dialog(page).getByRole("button", { name: "Save anyway" }).click();
  await expect(page.getByRole("row", { name: /E2E Overlap/ })).toBeVisible();

  for (const name of ["E2E Overlap", "E2E Semester"]) {
    await page.getByRole("button", { name: new RegExp(`Delete ${name} University Track`) }).click();
    await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("row", { name: new RegExp(name) })).toHaveCount(0);
  }
});

test("calendar: a holiday makes the day non-working; deleting it restores the rule", async ({ page }) => {
  await asRole(page, "admin", "/calendar");
  await expect(page.getByRole("grid")).toBeVisible();
  await page.getByRole("button", { name: "Add entry" }).first().click();
  const start = await dialog(page).getByLabel("Start date").inputValue();
  await dialog(page).getByLabel("Title").fill("E2E Holiday");
  await dialog(page).getByRole("button", { name: "Add entry" }).click();
  await expect(page.getByText("Calendar entry added")).toBeVisible();
  const day = Number(start.slice(8));
  const cell = page.getByRole("gridcell", { name: new RegExp(`^[A-Za-z]+ ${day} [A-Za-z]+\\.`) }).filter({ hasText: "E2E Holiday" });
  await expect(cell).toHaveAttribute("aria-label", /Holiday — not a working day/);

  await page.getByRole("button", { name: "Delete E2E Holiday" }).click();
  await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Calendar entry deleted")).toBeVisible();
  await expect(page.getByRole("gridcell", { name: /E2E Holiday/ })).toHaveCount(0);
});

test("calendar: agenda view lists sample entries and legend is shown", async ({ page }) => {
  await asRole(page, "admin", "/calendar");
  await expect(page.getByRole("list", { name: "Legend" })).toBeVisible();
  await page.getByRole("tab", { name: "Agenda" }).click();
  await expect(page.getByRole("tab", { name: "Agenda" })).toHaveAttribute("aria-selected", "true");
});

test("timetable: a clashing class is refused with an explanation", async ({ page }) => {
  await asRole(page, "campus_manager", "/timetable");
  await expect(page.getByText(/classes ·/)).toBeVisible();
  await page.getByRole("button", { name: "Add class" }).first().click();
  const option = dialog(page).locator("option", { hasText: "Discrete Mathematics — Mirai Batch A" }).first();
  await dialog(page).getByLabel(/^Subject/).selectOption(await option.getAttribute("value") ?? "");
  await dialog(page).getByLabel("Weekday").selectOption("1");
  await dialog(page).getByLabel("Start time").fill("09:00");
  await dialog(page).getByLabel("End time").fill("10:00");
  await dialog(page).getByRole("button", { name: "Add class" }).click();
  await expect(dialog(page)).toContainText("Mirai Batch A already has Programming Fundamentals on Monday 09:00–10:00");
  await dialog(page).getByLabel("End time").fill("08:00");
  await dialog(page).getByRole("button", { name: "Add class" }).click();
  await expect(dialog(page)).toContainText("End time must be after the start time");
});

test("syllabus: reorder and save, and an invalid CSV is rejected row by row", async ({ page }) => {
  await asRole(page, "campus_manager", "/subjects");
  await page.getByRole("link", { name: /Syllabus for Programming Fundamentals, Mirai Batch A/ }).click();
  await expect(page.getByText(/placeholder sample data/)).toBeVisible();
  const save = page.getByRole("button", { name: "Save syllabus" });
  await expect(save).toBeDisabled();
  await page.getByRole("button", { name: "Move topic 1.2 up" }).click();
  await expect(page.getByLabel("Unit 1 topic 1 title")).toHaveValue("Sample Topic 1.2");
  await save.click();
  await expect(page.getByText("Syllabus saved")).toBeVisible();
  await expect(page.getByLabel("Unit 1 topic 1 title")).toHaveValue("Sample Topic 1.2"); // persisted order
  await page.getByRole("button", { name: "Move topic 1.2 up" }).click(); // restore original order
  const restored = page.waitForResponse((r) => r.request().method() === "PUT" && /\/syllabus$/.test(r.url()));
  await save.click();
  expect((await restored).ok()).toBe(true); // wait for the server to confirm, so the shared database really is back to its original order when the test ends
  await expect(page.getByLabel("Unit 1 topic 1 title")).toHaveValue("Sample Topic 1.1");

  await page.getByRole("button", { name: "Import CSV" }).click();
  await dialog(page).getByLabel("Choose CSV file").setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("unit,topic,planned_hours,exam_scope\nA,Good,2,\nA,Bad,xyz,\n,NoUnit,1,\n") });
  await expect(dialog(page)).toContainText("2 problem(s) found in 3 row(s)");
  await expect(dialog(page).getByRole("row", { name: /3 planned_hours/ })).toBeVisible();
  await expect(dialog(page).getByRole("button", { name: /Replace syllabus/ })).toHaveCount(0);
});

test("roles: faculty sees their own data but no write controls", async ({ page, request }) => {
  const data = await ensureE2EData(request);
  await asFaculty(page, data.facultyId, "/semesters");
  await expect(page.getByText("E2E Spring").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "New semester" })).toHaveCount(0);
  await page.goto("/calendar");
  await expect(page.getByRole("grid")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add entry" })).toHaveCount(0);
});

test("sample data is labelled everywhere it appears", async ({ page }) => {
  await asRole(page, "admin", "/exams");
  await expect(page.getByText("Sample", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/to see whether each subject will be ready in time/i)).toBeVisible();
});
