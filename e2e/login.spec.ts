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

// ---- React Bits Beams (official WebGL2 component) behind the sign-in form ----
const countFrames = (page: import("@playwright/test").Page) => page.addInitScript(() => {
  (window as unknown as { __raf: number }).__raf = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { (window as unknown as { __raf: number }).__raf++; return raf(cb); };
});
const frames = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __raf: number }).__raf);

test("login background: a live WebGL2 canvas fills the viewport, animates, never blocks the form and logs no errors", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" || (m.type() === "warning" && !/GL Driver Message|Reduced Motion/.test(m.text()))) problems.push(m.text()); });
  await countFrames(page);
  await page.goto("/login");
  const canvas = page.locator(".beams-canvas");
  await expect(canvas).toHaveCount(1);
  await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => { const gl = c.getContext("webgl2"); return !!gl && !gl.isContextLost() && gl.getError() === 0; })).toBe(true); // the context is alive (React StrictMode must not have killed it)
  const box = await page.getByTestId("login-beams").boundingBox();
  expect(box).toMatchObject({ x: 0, y: 0, width: page.viewportSize()!.width, height: page.viewportSize()!.height });
  const a = await frames(page); await page.waitForTimeout(800);
  expect(await frames(page)).toBeGreaterThan(a + 5); // animating
  await page.getByLabel("Email").fill("someone@example.edu"); // typing and clicking work through the layer
  await page.getByRole("button", { name: "Show password" }).click();
  expect(await page.evaluate(() => { const b = document.querySelector("button[type=submit]")!.getBoundingClientRect(); return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest("button")?.getAttribute("type"); })).toBe("submit");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await page.getByRole("link", { name: /continue with the role preview/ }).click(); // leaving the page unmounts it cleanly
  await expect(page.locator(".beams-canvas")).toHaveCount(0);
  expect(problems).toEqual([]);
});

test("login background: reduced motion draws one still frame, and a browser without WebGL2 still gets a usable form", async ({ page, browser }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await countFrames(page);
  await page.goto("/login");
  await expect(page.locator(".beams-canvas")).toHaveCount(1);
  await page.waitForTimeout(600); const a = await frames(page); await page.waitForTimeout(1000);
  expect(await frames(page)).toBe(a); // no animation loop

  const ctx = await browser.newContext(); const bare = await ctx.newPage();
  const errors: string[] = []; bare.on("pageerror", (e) => errors.push(e.message));
  await bare.addInitScript(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) { return type === "webgl2" ? null : (get as (...a: unknown[]) => unknown).call(this, type, ...rest); } as typeof get; });
  await bare.goto("/login");
  await bare.getByLabel("Email").fill("someone@example.edu");
  await expect(bare.getByRole("button", { name: "Sign in" })).toBeEnabled();
  expect(await bare.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
  await ctx.close();
});
