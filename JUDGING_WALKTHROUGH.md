# PROSPECTUS — Judging walkthrough

Course Progression Tracker for Mirai School of Technology (MSOT). This guide describes what is **actually in the app today** (checked against the running application). Numbers shown on screen depend on *today's date*, because progress is computed from the timetable, calendar and session logs — expect them to differ slightly from any screenshot.

## 1. The question it answers
> *"Will every subject be taught before its exams begin?"*

Prospectus does not count topics. It compares **remaining syllabus hours** with the **teaching hours still available** before the deadline (derived from timetable, Saturday rule, holidays, special working days and exam weeks):

- **Buffer ratio** = available teaching hours ÷ remaining syllabus hours (rounded to 2 dp, then classified)
- **On track** ≥ 1.15 · **Tight** 1.00–1.14 · **Danger** < 1.00 · **Complete** · **Needs data** (no syllabus hours or no deadline)
- The **worst subject decides** a batch / track / campus status — never an average.

## 2. Start it (local)
Prerequisites: Node.js ≥ 20.18, npm ≥ 10 (no Docker needed).
```bash
npm install
cp .env.example .env
npm run db:embedded        # terminal 1 — keep running (PostgreSQL on :5432, data in .pgdata/)
npm run db:deploy          # terminal 2
npm run db:seed            # sample data, safe to re-run
npm run dev                # API :4000, web http://localhost:5173
```
Remove the sample rows again with `npm run db:clear-sample` (only rows flagged sample are deleted).

**Access.** Locally the sidebar has a **Role Preview** card ("Preview as": Admin, Campus Manager, Faculty, Student). That is a development convenience built on spoofable headers — **not a login**. A real server-verified sign-in page exists at `/login` for hosted evaluation; it needs operator-issued accounts (README → "Safe demo access procedure"). Do not expose the dev server publicly.

## 3. What the sample data contains
Four campuses (HI-Tech, Ratnam, RGIB, JUJ), two tracks (Mirai, University). Each campus/track has an **active "Semester 3"**, plus a completed Semester 2 and an upcoming Semester 4. A batch has four subjects (Programming Fundamentals, Discrete Mathematics, Database Concepts, Professional Communication; codes SMP101–104 for Mirai, SMP201–204 for University), each with a 5-unit syllabus, a weekly timetable, faculty ("Sample Faculty …") and session logs up to 15 Oct 2026, including completed, in-progress, cancelled-with-make-up and merged sessions. Calendar and exams include holidays (Gandhi Jayanti, Diwali break, Christmas), a special working Saturday, Mid-term, Sessional 2 (Batch A), Pre-University Test and End-term. Sample rows are labelled **Sample** in the UI.

Because the logs stop at 15 Oct, sample subjects drift toward Tight / Danger as the date advances; on 19 Oct 2026 HI-Tech showed **Danger** overall with 8 subjects tight or in danger. That is the demo scenario: several subjects genuinely cannot finish in the time left.

## 4. Five-minute tour
1. **Overview (`/`)** — overall status badge and the worst subject that decides it; four headline figures; **Subjects at risk** with separate Danger / Tight counts, a filter, and a card per subject (coverage, planned-to-date, hours behind, buffer ratio, plain-language sentence, "Why this status"); today's schedule with log state; upcoming exams; recent sessions. Switch campus in the top bar. The badge says **Live data** (or **Demo data** for a campus with no academic setup).
2. **Calendar (`/calendar`) and Timetable (`/timetable`)** — Month/Agenda calendar with working days, holidays, events, exam periods and the Saturday rule; weekly time-grid timetable (Week/Day view, filters, overlap handling, clash errors when saving).
3. **Session Logs (`/session-logs`)** — choose *Acting as* a faculty member (demo) or use an admin/manager role. Open a pending class; if the previous class left work unfinished, a **Carry forward from previous session** panel lists those topics (with % done, hours left and their original date) — untick what you don't want to keep, or teach one now by marking it Partly/Done. Then → mark topics Done / Partly (%) / Not today, add carry-forward, or log **Cancelled** (reason, optional reschedule), **Skipped** or **Merged**. Saving shows coverage before → after.
4. **Subject detail (`/subjects/:id`)** — hours in scope / covered / remaining, available hours, pace vs plan, projected completion, per-topic status and overdue topics, and the reasons behind the status. Use the *As of* date to look back in time.
5. **Exam Readiness (`/exam-readiness`)** — every upcoming exam with its dates, track, semester and batch scope; each subject's coverage, syllabus left, teaching left and buffer against **that exam's start date**. Topics tagged with an exam type are counted per exam; a subject with no tags is measured on its whole syllabus (the row says which). Subjects with no syllabus hours show **Needs data** — no score is invented and nothing predicts marks.
6. **Reports (`/reports`, admin / campus manager / faculty)** — five tabs: **Course Progress, Teaching Delivery, Faculty Activity, Exam Readiness, Campus & Track**, with filters and **Export CSV** (formula characters `= + - @` are neutralised).
7. **Student portal (`/my-learning`)** — choose *Student* in Role Preview, pick a batch (development demo only; a signed-in student is linked to one batch by the administrator): overall and per-subject progress in hours, covered and coming-up topics, classes in the next two weeks, upcoming exams with the topics they cover. Write controls and Session Logs / Reports / Settings are gone; the API refuses every write.
8. **Themes and mobile** — Light / Dark / System from the header; the sidebar becomes a drawer on phones and the timetable defaults to Day view.

## 5. Verified behaviours worth showing
- Cancel a class → available hours drop and the buffer changes; give it a make-up date and they return.
- Merge two batches taught together → teaching hours are counted once.
- Delete a timetable slot that has session logs → refused (historical plans are protected).
- Stop the API → the Overview shows an error with *Try again*, never demo numbers or an all-clear.

## 6. Test evidence
See `SUBMISSION.md` for the requirements matrix and the actual recorded test run, and the "Tests" section of the README for the commands (`npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`, `npm run test:e2e`). Results are recorded in the submission report, not in this file, so they cannot go stale.

## 7. Known limitations (read before judging)
- **No scheduled reminders or Campus-Manager escalation** — warnings are on-screen only.
- **Only the syllabus has CSV import**; semesters, calendar, exams, batches, subjects and timetables are entered through the UI.
- **The student portal is per batch, not per student** (no roster or individual marks), and other read endpoints are still not limited to a student's campus.
- **Authentication is a restricted evaluation sign-in**, not an identity platform (no SSO, reset, MFA, campus scoping). In production mode all data endpoints require a session; in local development reads stay open for the role preview.
- No hosted deployment is claimed; there is no Dockerfile or CI configuration.
- A mid-semester timetable edit re-plans past sessions too (logged sessions keep their own slot snapshot).
- Reports and exam readiness are capacity checks, not predictions of marks.
