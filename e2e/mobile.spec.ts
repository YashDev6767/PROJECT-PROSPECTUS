import { expect, test } from "@playwright/test";
import { asFaculty, ensureE2EData } from "./helpers";

test.skip(!process.env.TEST_DATABASE_URL, "needs TEST_DATABASE_URL");

test("mobile: drawer navigation reaches academic setup pages", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("prospectus.role", "faculty"));
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("dialog", { name: "Navigation menu" }).getByRole("link", { name: "Timetable" }).click();
  await expect(page.getByRole("heading", { name: "Timetable" })).toBeVisible();
  await expect(page.getByText(/classes ·/)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false); // no horizontal page scroll
});

test("mobile: a faculty member logs a cancelled class with a reason in one screen", async ({ page, request }) => {
  const data = await ensureE2EData(request);
  await asFaculty(page, data.facultyId, "/session-logs?date=2026-03-09");
  await page.getByRole("button", { name: /Log session for E2E Subject/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Log a session" });
  await dialog.getByRole("radio", { name: "Cancelled" }).click();
  await dialog.getByLabel("Reason").fill("Faculty unwell");
  await dialog.getByRole("button", { name: "Save log" }).click();
  await expect(page.getByText(/Session logged/)).toBeVisible();
  await expect(dialog).toHaveCount(0); // dialog closed
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});
