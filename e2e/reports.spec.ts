import { expect, test } from "@playwright/test";

test.skip(!process.env.TEST_DATABASE_URL, "needs TEST_DATABASE_URL (see README: npm run db:embedded)");

test.describe("Academic Intelligence & Reports E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("prospectus.role", "admin");
      localStorage.setItem("prospectus.campus", "hi-tech");
    });
  });

  test("loads reports page, renders course progress by default, and allows tab switching", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();

    // Course Progress Tab is default
    await expect(page.getByRole("tab", { name: "Course Progress" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Total Subjects")).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();

    // Switch to Teaching Delivery
    await page.getByRole("tab", { name: "Teaching Delivery" }).click();
    await expect(page.getByRole("tab", { name: "Teaching Delivery" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Scheduled Sessions")).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();

    // Switch to Faculty Activity
    await page.getByRole("tab", { name: "Faculty Activity" }).click();
    await expect(page.getByRole("tab", { name: "Faculty Activity" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Active Faculty")).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();

    // Switch to Exam Readiness
    await page.getByRole("tab", { name: "Exam Readiness" }).click();
    await expect(page.getByRole("tab", { name: "Exam Readiness" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Assessed Subjects")).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();

    // Switch to Campus & Track
    await page.getByRole("tab", { name: "Campus & Track" }).click();
    await expect(page.getByRole("tab", { name: "Campus & Track" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Total Campuses")).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
  });

  test("allows exporting CSV on current report", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Export CSV/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain("course_progress");
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });

  test("filtering by track updates the view and parameters", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.getByRole("table")).toBeVisible();

    // Select Mirai Track
    const trackSelect = page.getByLabel("Track");
    await trackSelect.selectOption("MIRAI");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("table")).toBeVisible();

    // Reset filters
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(trackSelect).toHaveValue("");
  });

  test("student role is restricted from viewing reports", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("prospectus.role", "student");
      localStorage.setItem("prospectus.campus", "hi-tech");
    });
    await page.goto("/reports");
    await expect(page.getByText("Reports isn't available to the Student role")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Overview" })).toBeVisible();
  });

  test("server failure shows error state with retry", async ({ page }) => {
    await page.route("**/api/reports*", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "internal_error", message: "Failed to load report data" }),
      }),
    );
    await page.goto("/reports");
    await expect(page.getByRole("alert")).toContainText("Failed to load report data");
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});
