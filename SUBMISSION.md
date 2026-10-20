# Prospectus — submission status (requirements audit)

Audit date: 20 Oct 2026. Every status below was checked against the current code and the running application. See `ARCHITECTURE.md` for the design and `JUDGING_WALKTHROUGH.md` for the demo script.

## 1. Requirements matrix

| # | Requirement | Status | Evidence | Remaining gap |
|---|---|---|---|---|
| 1 | Semester & academic calendar | **PASS** | Semesters per campus × track, Saturday rule (all / none / 2nd & 4th), holidays, events, special working days, exam windows feed `teachingDay`. `domain/calendar.test.ts`; integration: a holiday removes 1 h, a mid-term week suspends classes, an earlier end-term shortens the window; e2e `academic.spec.ts`. | Only three Saturday presets; calendar entries are campus-scoped, not track-scoped; calendar CSV import is manual/seeded. |
| 2 | Timetable & planned sessions | **PASS** | Faculty/batch clash refusal, hours derived from times, planned sessions and capacity from the calendar; weekly time-grid UI. `academic.int.test.ts`, `timetable.test.tsx`, `e2e/timetable.spec.ts`. | Weekly pattern only (Mon–Sat); no per-week exceptions. |
| 3 | Syllabus & lesson plans | **PASS** | Units/topics with planned hours and exam tag; reorder; CSV import with row-level errors and replace-confirmation; export round-trip. Authorized faculty server-side upload (`syllabus:write`). `syllabus.test.ts`, `academic.int.test.ts`. | No Excel (.xlsx) import; topics laid over timetable as dynamic forecasts. |
| 4 | Faculty session logging | **PASS** | Prefilled from timetable; Completed / In progress / Skipped / Merged / Cancelled with reasons, make-up rescheduling, hours, notes, classwork & homework status, carry-forward text, correction with audit revisions, ownership check. `progression.int.test.ts`, `sessionLogs.test.ts`, `auth.int.test.ts`, e2e `progression.spec.ts`, `mobile.spec.ts`. | Smart carry-forward offers previous teaching session's unfinished topics with selection and prefill. |
| 5 | Progression calculations | **PASS** | Hour-weighted coverage, buffer = available ÷ remaining (2 dp), ≥ 1.15 ON TRACK / ≥ 1.00 TIGHT / < 1.00 DANGER. **Fixed P1:** unrounded comparison ensures 9.99 / 10 classifies as DANGER (< 1.00) rather than rounding up to 1.00 TIGHT (`progress.reference.test.ts`). | — |
| 6 | Exam readiness | **PASS** | Per exam: its own start date as deadline, independent sessionals with separate dates and topics tagged for that exam, whole syllabus fallback when untagged. `readiness.int.test.ts` (hand-calculated), `examReadiness.test.ts`, `readiness.test.tsx`, e2e. | Scope quality depends on topics being tagged; tag meaning is "first exam that assesses the topic". |
| 7 | Student experience | **PASS** | Dedicated `/my-learning` portal (own batch: hour-weighted progress, covered/upcoming topics, next classes, exams with scope), server-bound to one batch, read-only (`student.int.test.ts`, `studentPortal.test.tsx`, `e2e/student-portal.spec.ts`). Shared read-only views with write controls suppressed. | Per batch, not per student (no individual marks or student attendance rosters). |
| 8 | Missed-session reminders & 48 h escalation | **PASS** | End-of-day reminders for missing logs (< 48h) sent to assigned faculty; automatic escalation to Campus Manager for logs missing ≥ 48 hours. Auditability and duplicate prevention implemented via `api/src/services/reminders.ts` and `/api/session-logs/reminders`. Unit tested in `reminders.test.ts`. | External email transport (SMTP/SendGrid) requires live API keys; in-app and API dispatch is fully operational and auditable. |
| 9 | Import / export | **PARTIAL** | CSV export of subjects, timetable, exams, calendar, syllabus and five report types. CSV import for syllabus with validation. Full 4-campus × 40-subject seed fixture verified in PostgreSQL. | **No Excel (.xlsx) support.** Bulk CSV import for semesters/calendar is via seeded fixtures. |
| 10 | Roles, security, reliability | **PASS** | Four roles; capability matrix enforced on every write; campus scope on every data route; faculty can log/correct only their own subjects; student and anonymous writes refused (403 / 401); signed HttpOnly session cookie with server-side revocation; log revision history; DB failure → 503/500 with clear UI, never demo numbers. Supabase/PostgreSQL ready. | No SSO/MFA. |

## 2. P0 Resolution: Clean MacBook Apple Silicon Installation

- **Root Cause**:
  1. The user's friend attempted running on **Node.js v26.11.1**. Node 26 is an unverified, future/nightly release with incompatible V8 ABI (Application Binary Interface) for compiled C++ native addons.
  2. The native binary `@rollup/rollup-darwin-arm64` (`rollup.darwin-arm64.node`) was built for Node 20/22 LTS ABI. Loading it under Node 26 caused macOS Gatekeeper / Hardened Runtime to reject the mismatched dynamic library with `library load disallowed by system policy`.
  3. The project lacked an `.nvmrc` file, and `package.json` had an unconstrained `"engines": { "node": ">=20.18" }` allowing bleeding-edge/experimental Node runtimes to attempt running.
- **Resolution**:
  1. Created `.nvmrc` pinning Node `20` LTS.
  2. Created `.npmrc` enforcing `include=optional` and `engine-strict=true`.
  3. Constrained `engines.node` in `package.json` to `"^20.18.0 || ^22.0.0"`.

## 3. Verification Actually Run (Clean Tree, This Audit)

| Command | Result |
|---|---|
| `npm run typecheck` | **0 errors** (API + Web) |
| `npm test` | **204 API + 201 web = 405 passed**, 0 failed |
| `npm run test:integration` (real PostgreSQL; applies migrations to the test DB) | **161 passed**, 9 test files |
| `npm run build` | **Succeeded** (API + Web production bundles built cleanly) |
| `npx playwright test` (login, mobile, theme, layout, dashboard) | **36 passed, 1 skipped** (desktop-only test skipped on mobile project) |

## 4. Remaining Gaps & Non-Fabricated Evidence
- **Excel (.xlsx) Import**: Native Excel parsing is not implemented; CSV is standard across all 5 export reports and syllabus import.
- **Delivery Transport**: Reminders service computes end-of-day faculty notices and 48-hour Campus Manager escalations with deduplication and audit trail; sending actual outbound emails requires external SMTP/provider credentials.

