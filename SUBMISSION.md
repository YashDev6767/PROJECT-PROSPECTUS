# Prospectus — submission status (requirements audit)

Audit date: 19 Oct 2026. Every status below was checked against the current code and, where stated, the running application — not against earlier reports. See `ARCHITECTURE.md` for the design and `JUDGING_WALKTHROUGH.md` for the demo script.

## 1. Requirements matrix

| # | Requirement | Status | Evidence | Remaining gap |
|---|---|---|---|---|
| 1 | Semester & academic calendar | **PASS** | Semesters per campus × track, Saturday rule (all / none / 2nd & 4th), holidays, events, special working days, exam windows feed `teachingDay`. `domain/calendar.test.ts`; integration: a holiday removes 1 h, a mid-term week suspends classes, an earlier end-term shortens the window; e2e `academic.spec.ts`. | Only three Saturday presets; calendar entries are campus-scoped, not track-scoped; no calendar CSV import. |
| 2 | Timetable & planned sessions | **PASS** | Faculty/batch clash refusal, hours derived from times, planned sessions and capacity from the calendar; weekly time-grid UI. `academic.int.test.ts`, `timetable.test.tsx`, `e2e/timetable.spec.ts`. | Weekly pattern only (Mon–Sat); no per-week exceptions. |
| 3 | Syllabus & lesson plans | **PASS** | Units/topics with planned hours and exam tag; reorder; CSV import with row-level errors and replace-confirmation; export round-trip. `syllabus.test.ts`, `academic.int.test.ts`. | No Excel import; no separate per-session "lesson plan" (topics are laid over the timetable as a forecast instead). |
| 4 | Faculty session logging | **PARTIAL** | Prefilled from the timetable; Completed / In progress / Skipped / Merged / Cancelled with reasons, make-up rescheduling, hours, notes, classwork & homework status, carry-forward text, correction with audit revisions, ownership check. `progression.int.test.ts`, `sessionLogs.test.ts`, `auth.int.test.ts`, e2e `progression.spec.ts`, `mobile.spec.ts`. | Carry-forward is recorded and shown on the log, but not pre-filled into the next session's form. |
| 5 | Progression calculations | **PASS** | Hour-weighted coverage, buffer = available ÷ remaining (2 dp), ≥ 1.15 ON TRACK / ≥ 1.00 TIGHT / < 1.00 DANGER, skipped topics leave scope, worst subject rolls up. Hand-calculated `progress.reference.test.ts` + integration. **Independent live check:** coverage and status of all 20 HI-Tech subjects recomputed outside the engine from raw topic hours — 18 identical; the other 2 have no syllabus and are correctly UNKNOWN. A plain topic-count % would have differed for 16 of the 20, so the weighting is real. | — |
| 6 | Exam readiness | **PASS** | Per exam: its own start date as deadline, only topics tagged for that exam (cumulative), whole syllabus only when no topic is tagged (and says so), UNKNOWN / "Needs data" instead of a score. `readiness.int.test.ts` (hand-calculated), `examReadiness.test.ts`, `readiness.test.tsx`, e2e. | Scope quality depends on topics being tagged; tag meaning is "first exam that assesses the topic". |
| 7 | Student experience | **PARTIAL** | Students get read-only shared pages: Overview, Subjects → subject detail with per-topic status and next/forecast dates, Syllabus (read-only, shows exam tags), Timetable, Exam Schedule, Exam Readiness; no write controls; the API refuses their writes. Browser-checked; e2e `login.spec.ts`. | No dedicated student portal or "my topics" page (estimate: 1 page + endpoint, ~½ day). |
| 8 | Missed-session reminders & 48 h escalation | **FAIL** | Nothing is scheduled, emailed or escalated. Only on-screen warnings exist: "Log pending", unlogged-session counts, the Session Logs queue, reports. | Needs a scheduler, a delivery channel and escalation state (≥ 1–2 days, external credentials). Documented, not faked. |
| 9 | Import / export | **PARTIAL** | CSV export of subjects, timetable, exams, calendar, syllabus and five report types (formula-safe cells, tested). CSV **import: syllabus only**. | **No Excel (.xlsx) support at all.** No CSV import for semesters, batches, subjects, timetables. |
| 10 | Roles, security, reliability | **PARTIAL** | Four roles; capability matrix enforced on every write; faculty can log/correct only their own subjects; student and anonymous writes refused (probed live: 403 / 401); signed HttpOnly session cookie with expiry and server-side revocation on logout; production read gate; log revision history; DB failure → 503/500 with clear UI, never demo numbers. | No campus scoping (below); no audit trail for configuration edits; no SSO/MFA/reset. |

## 2. Security findings

| Severity | Finding | Where | Status |
|---|---|---|---|
| **Critical** | `ALLOW_DEMO_HEADERS=false` was parsed as **true** (`z.coerce.boolean`). | `api/src/config/env.ts` | **Fixed** (strict parser + tests) |
| **High** | In production **every read endpoint, including all CSV exports of academic setup, answered anonymous requests (200)**, even with sign-in configured. Verified by probing. | `api/src/app.ts` | **Fixed**: with demo headers off, all `/api` routes except `/health`, `/meta`, `/auth/*` need a session. Re-probed: 22 data routes anonymous → 401; test `security.test.ts`. |
| Medium | Logout did not invalidate the token; a copied cookie stayed valid until expiry. | `services/auth.ts` | **Fixed**: per-token id + in-memory revocation (cleared on restart). Re-probed + `auth.test.ts`. |
| **High (for any multi-campus deployment)** | **No campus scoping.** Accounts have a role, not a campus: a campus manager can write to any campus (probed: created and deleted a faculty row at another campus), and every signed-in role reads all campuses. | all routes | **Not fixed** (needs campus on accounts + checks on ~30 routes; not safe in this window). Documented. |
| Medium | Demo role headers are spoofable by design in development. | `http/errors.ts` | By design; off in production; never expose the dev server. |
| Low | Rate limiting only on sign-in (in memory); sessions are stateless apart from the revocation list; no CSRF token beyond SameSite=Lax + JSON bodies. | — | Documented |
| Info | Verified OK: student/anonymous mutations refused on all probed write routes; faculty ownership (integration test); CORS rejects other origins; invalid JSON and DB errors return generic messages; CSV cells neutralise `= + - @`; password hashes (scrypt) only in `.env`, which is gitignored (not tracked, checked). | — | — |

## 3. Verification actually run (clean tree, this audit)

| Command | Result |
|---|---|
| `npm run typecheck` | no errors |
| `npm test` | **194 API + 180 web = 374 passed**, 0 failed |
| `npm run test:integration` (real PostgreSQL; applies migrations to the test DB) | **82 passed**, 5 files |
| `npm run build` | succeeded (API + web) |
| `npx playwright test` | **61 passed, 1 skipped, 0 failed** (desktop + mobile viewports) |
| Live API probe in production mode (4 accounts) | read gate, role checks, logout revocation, CORS, error shape as above |
| Browser sweep (12 routes × 390/820/1440 px), student role | no console errors apart from one defect fixed earlier; no overflow |

Not tested: screen readers or any accessibility audit, browsers other than Chromium, a hosted deployment, load/performance, installation on a different machine or OS (the fresh clone below ran on the same Mac).

### Fresh-clone rehearsal (commit `aef9b22`, isolated ports/database)
Cloned the repository into a temporary directory, `npm install` (generates the Prisma client), `.env` from `.env.example` with rehearsal-only values, embedded PostgreSQL on a separate port, `db:deploy` (2 migrations applied to an empty database), `db:seed` (10 semesters, 44 subjects, 126 timetable entries, 1,162 session logs; second run inserts 0), dev servers and a production build with `npm start` (API only). In the clone: typecheck clean, **194 + 180 unit, 82 integration, 61 e2e passed (1 skipped)**, build succeeded.
Judging workflow in that clone (browser + API, disposable data): admin sign-in; overview with worst subject; hour-weighted coverage recomputed independently for 42 subjects across all four campuses (0 mismatches); a University-track class (67-character timetable id) logged through the UI; completed log lowers remaining hours by exactly the topic's hours; cancelled and skipped classes each lower available hours by the session's hours and leave coverage unchanged; Exam Readiness shows scope and coverage matching the API; all five report types export valid formula-safe CSV; a student session gets 403 on writes, on a spoofed admin header and on reports; a faculty session gets 403 `not_your_subject` on another faculty member's subject; anonymous requests get 401; in production mode anonymous data reads are 401 and a logged-out session stops working.
Two defects were found by this rehearsal and fixed: a fresh clone had no generated Prisma client (now a `postinstall`), and 36 of 126 seeded timetable ids (all University track) exceeded the API's 64-character id limit so those classes could not be logged (limit now 128; regression test over every seeded id).
`npm start` serves **only the API**; the built web app in `web/dist` is static files that must be served by a web server or reverse proxy. For the judging demo use `npm run dev`.

## 4. Demo coverage
The seed covers four campuses (HI-Tech, Ratnam, RGIB, JUJ) × two tracks (Mirai, University), each with an active Semester 3 plus completed Semester 2 and upcoming Semester 4, four subjects per batch with syllabi, timetables, calendar, exams and session logs (completed, in progress, cancelled with make-up, merged). It is sample data, labelled **Sample**, and drifts toward Tight/Danger as the date passes 15 Oct 2026 (the logs stop there).

## Submission artefacts
Present: README, `ARCHITECTURE.md`, this file, `JUDGING_WALKTHROUGH.md`, seed data for four campuses × two tracks, automated test suites. **Not present:** demo video, hosted URL, Dockerfile/CI, load-test or accessibility-audit evidence, cross-browser evidence.

## 5. Priorities
- **P0:** none open. (Closed this audit: demo-header parsing, anonymous reads in production.)
- **P1:** campus scoping for manager/faculty/student accounts (before any real multi-campus use); scheduled reminders + 48 h escalation; decide how to describe requirement 8 and Excel to judges (they are not built).
- **P2:** Excel import/export; dedicated student page; carry-forward pre-fill; audit trail for configuration changes; Dockerfile/CI; hosted deployment.
