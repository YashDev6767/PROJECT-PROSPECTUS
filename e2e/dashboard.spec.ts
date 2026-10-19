import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("dashboard loads from the API and labels where its numbers come from", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Syllabus covered")).toBeVisible();
  await expect(page.getByText(/^(Demo|Live) data$/)).toBeVisible(); // live when the database has academic setup for the campus, demo otherwise
  await expect(page.getByRole("region", { name: "Subjects at risk" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Today's schedule" })).toBeVisible();
});

test("campus switch refetches the dashboard", async ({ page }) => {
  await expect(page.getByText("Syllabus covered")).toBeVisible();
  await page.getByLabel("Campus").selectOption({ label: "Ratnam" });
  await expect(page.getByText(/Friday|Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday/).first()).toContainText("Ratnam");
});

test("unbuilt sections are honest about their status", async ({ page, isMobile }) => {
  await page.evaluate(() => localStorage.setItem("prospectus.role", "admin")); // Reports is only offered to admins and campus managers
  await page.reload();
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("navigation", { name: "Primary" }).locator("visible=true").getByRole("link", { name: "Reports" }).click();
  await expect(page.getByText("Not available yet")).toBeVisible();
});

test("students do not see Log a session", async ({ page, isMobile }) => {
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click(); // the role picker lives in the sidebar (a drawer on phones)
  await page.getByLabel("Preview as role").filter({ visible: true }).selectOption("student");
  if (isMobile) await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: /Log a session/ })).toHaveCount(0);
});
