import { expect, test } from "@playwright/test";

test.skip(!process.env.TEST_DATABASE_URL, "needs TEST_DATABASE_URL (see README: npm run db:embedded)");

// Uses its own disposable semester, batch and subject (on another campus than the shared "E2E Spring" data), so it cannot change what the other specs find.
test("faculty logging: unfinished work from the previous session is offered, selectable, and saved without duplicates", async ({ page, request }) => {
  const admin = { "X-Demo-Role": "admin" };
  const post = async (path: string, data: object) => (await (await request.post(path, { headers: admin, data })).json()) as { id: string };
  const sem = await post("/api/semesters", { name: "CF Spring", academicYear: "2025-26", track: "MIRAI", campusId: "rgib", startsOn: "2026-01-05", endsOn: "2026-05-29", saturdayRule: "NONE", confirmOverlap: true });
  const batch = await post("/api/batches", { name: "CF Batch", semesterId: sem.id });
  const fac = await post("/api/faculty", { name: "CF Faculty", campusId: "rgib" });
  const subject = await post("/api/subjects", { code: "CF1", name: "Carry Subject", batchId: batch.id, facultyId: fac.id });
  const syl = await (await request.put(`/api/subjects/${subject.id}/syllabus`, { headers: admin, data: { units: [{ title: "CF Unit", topics: [{ title: "CF Alpha", plannedHours: 2 }, { title: "CF Beta", plannedHours: 2 }, { title: "CF Gamma", plannedHours: 2 }] }] } })).json() as { units: Array<{ topics: Array<{ id: string }> }> };
  const [alpha, beta, gamma] = syl.units[0]!.topics.map((t) => t.id) as [string, string, string];
  const slot = await post("/api/timetable", { subjectId: subject.id, weekday: 1, startTime: "14:00", endTime: "15:00" });
  // Mon 16 Mar: Alpha done, Beta half done, Gamma left over
  const first = await request.post("/api/session-logs", { headers: admin, data: { subjectId: subject.id, heldOn: "2026-03-16", timetableEntryId: slot.id, outcome: "IN_PROGRESS", covered: [{ topicId: alpha, completionPct: 100 }, { topicId: beta, completionPct: 50 }], leftover: [gamma] } });
  expect(first.status()).toBe(201);
  const firstId = ((await first.json()) as { log: { id: string } }).log.id;
  const firstBefore = await (await request.get(`/api/session-logs/${firstId}`, { headers: admin })).json();

  await page.addInitScript(() => { localStorage.setItem("prospectus.role", "admin"); localStorage.setItem("prospectus.campus", "rgib"); });
  await page.goto("/session-logs?date=2026-03-23");
  await page.getByRole("button", { name: /Log session for Carry Subject, CF Batch, 23 Mar/ }).click();
  const dialog = page.getByRole("dialog", { name: "Log a session" });
  const section = dialog.getByRole("region", { name: "Carry forward from previous session" });
  await expect(section).toBeVisible();
  await expect(section).toContainText("CF Beta");
  await expect(section).toContainText("50% done · 1 h left");
  await expect(section).toContainText("CF Gamma");
  await expect(section).toContainText("Left over · 2 h");
  await expect(section).not.toContainText("CF Alpha"); // finished: never carried
  // nothing was marked completed automatically
  await expect(dialog.getByRole("group", { name: "CF Beta progress this session" }).getByRole("button", { name: "Not today" })).toHaveAttribute("aria-pressed", "true");
  // select only some: drop Gamma, teach Beta now
  await section.getByRole("checkbox", { name: "Carry forward CF Gamma" }).uncheck();
  await dialog.getByRole("group", { name: "CF Beta progress this session" }).getByRole("button", { name: "Done" }).click();
  await expect(section).toContainText("Being covered in this session");
  await dialog.getByRole("button", { name: "Save log" }).click();
  await expect(page.getByText(/Session logged — Coverage/)).toBeVisible();

  const logs = await (await request.get(`/api/session-logs?subjectId=${subject.id}`, { headers: admin })).json() as { logs: Array<{ id: string; heldOn: string; covered: Array<{ topicId: string; completionPct: number }>; leftover: Array<{ topicId: string }> }> };
  expect(logs.logs).toHaveLength(2);
  const second = logs.logs.find((l) => l.heldOn === "2026-03-23")!;
  expect(second.covered).toEqual([expect.objectContaining({ topicId: beta, completionPct: 100 })]);
  expect(second.leftover).toEqual([]); // Gamma deselected, Beta taught: no duplicate or stray carry
  // the historical record is untouched, and retrying the same save is refused rather than duplicated
  expect(await (await request.get(`/api/session-logs/${firstId}`, { headers: admin })).json()).toEqual(firstBefore);
  const retry = await request.post("/api/session-logs", { headers: admin, data: { subjectId: subject.id, heldOn: "2026-03-23", timetableEntryId: slot.id, outcome: "IN_PROGRESS", covered: [{ topicId: beta, completionPct: 100 }] } });
  expect(retry.status()).toBe(409);
  // progression: Alpha 2 h + Beta 2 h of 6 h
  const p = (await (await request.get(`/api/progression/subjects/${subject.id}`)).json()) as { progress: { coveragePct: number; coveredHours: number } };
  expect(p.progress).toMatchObject({ coveragePct: 66.67, coveredHours: 4 });
});
