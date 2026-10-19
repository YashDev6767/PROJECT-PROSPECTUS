import { expect, test } from "@playwright/test";
import { E2E_LOGIN } from "../playwright.config";

// The e2e API is started with two throw-away accounts (see playwright.config.ts) and, being a development server, still allows the demo picker.

test("sign-in page: validation, wrong password, then a real server session with a fixed role", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Enter your email")).toBeVisible();
  await expect(page.getByText("Enter your password")).toBeVisible();

  await page.getByLabel("Email", { exact: true }).fill(E2E_LOGIN.email);
  await page.getByLabel("Password", { exact: true }).fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("Email or password is incorrect.");

  await page.getByLabel("Password", { exact: true }).fill(E2E_LOGIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === "prospectus_session")!;
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe("Lax");
  expect(await page.evaluate(() => document.cookie)).not.toContain("prospectus_session"); // not readable from page scripts
  await expect(page.getByLabel("Preview as role")).toHaveCount(0); // the role is fixed by the server now
});

test("a student session is read-only for real: the server refuses writes even if the page sends admin demo headers", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(E2E_LOGIN.studentEmail);
  await page.getByLabel("Password", { exact: true }).fill(E2E_LOGIN.studentPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  const res = await page.request.post("/api/faculty", { headers: { "X-Demo-Role": "admin" }, data: { name: "Intruder", campusId: "hi-tech" } });
  expect(res.status()).toBe(403);
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Log a session/ })).toHaveCount(0);
});

test("signing out ends the session", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(E2E_LOGIN.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_LOGIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  await page.getByRole("button", { name: /Sign out/ }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  expect(((await (await page.request.get("/api/auth/session")).json()) as { user: unknown }).user).toBeNull();
});

test("login page on a phone: no overflow, controls at least 40px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  for (const name of ["Email", "Password"]) expect((await page.getByLabel(name, { exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(40);
  expect((await page.getByRole("button", { name: "Sign in" }).boundingBox())!.height).toBeGreaterThanOrEqual(40);
  expect((await page.getByRole("button", { name: "Show password" }).boundingBox())!.width).toBeGreaterThanOrEqual(40);
});
