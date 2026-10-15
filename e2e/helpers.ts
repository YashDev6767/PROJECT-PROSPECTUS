import type { APIRequestContext, Page } from "@playwright/test";

const admin = { "X-Demo-Role": "admin" };
export interface E2EData { facultyId: string; subjectId: string }

/**
 * A finished semester in the past (so "log it" is always allowed, whatever today's date is) with one batch, one faculty member, one
 * subject (2 topics x 2 h) and a Monday 09:00-10:00 class. Created through the API, idempotently.
 */
export async function ensureE2EData(request: APIRequestContext): Promise<E2EData> {
  const sems = await (await request.get("/api/semesters?campusId=ratnam")).json() as { semesters: Array<{ id: string; name: string }> };
  let sem = sems.semesters.find((s) => s.name === "E2E Spring");
  if (!sem) {
    const r = await request.post("/api/semesters", { headers: admin, data: { name: "E2E Spring", academicYear: "2025-26", track: "UNIVERSITY", campusId: "ratnam", startsOn: "2026-01-05", endsOn: "2026-05-29", saturdayRule: "NONE" } });
    sem = await r.json() as { id: string; name: string };
  }
  const subjects = await (await request.get(`/api/subjects?semesterId=${sem.id}`)).json() as { subjects: Array<{ id: string; facultyId: string }> };
  if (subjects.subjects[0]) return { facultyId: subjects.subjects[0].facultyId, subjectId: subjects.subjects[0].id };
  const post = async (path: string, data: object, method: "post" | "put" = "post") => (await (await request[method](path, { headers: admin, data })).json()) as { id: string };
  const batch = await post("/api/batches", { name: "E2E Batch", semesterId: sem.id });
  const fac = await post("/api/faculty", { name: "E2E Faculty", campusId: "ratnam" });
  const subject = await post("/api/subjects", { code: "E2E1", name: "E2E Subject", batchId: batch.id, facultyId: fac.id });
  await post(`/api/subjects/${subject.id}/syllabus`, { units: [{ title: "Unit 1", topics: [{ title: "E2E Topic A", plannedHours: 2 }, { title: "E2E Topic B", plannedHours: 2 }] }] }, "put");
  await post("/api/timetable", { subjectId: subject.id, weekday: 1, startTime: "09:00", endTime: "10:00" });
  return { facultyId: fac.id, subjectId: subject.id };
}

export const asFaculty = async (page: Page, facultyId: string, path: string) => {
  await page.addInitScript(([id]) => { localStorage.setItem("prospectus.role", "faculty"); localStorage.setItem("prospectus.faculty", id!); localStorage.setItem("prospectus.campus", "ratnam"); }, [facultyId]);
  await page.goto(path);
};
