import type { ReactElement } from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { AcademicCalendar } from "./pages/Calendar";
import { Exams } from "./pages/Exams";
import { Overview } from "./pages/Overview";
import { PhasePage } from "./pages/PhasePage";
import { Semesters } from "./pages/Semesters";
import { Settings } from "./pages/Settings";
import { Subjects } from "./pages/Subjects";
import { SubjectDetail } from "./pages/SubjectDetail";
import { SessionLogs } from "./pages/SessionLogs";
import { Syllabus } from "./pages/Syllabus";
import { Timetable } from "./pages/Timetable";
import { AccessGate } from "./components/layout/AccessGate";

/** Each live page is wrapped so a role that can't see it in the navigation gets an explanation, not the page. */
const guard = (path: string, el: ReactElement) => <AccessGate path={path}>{el}</AccessGate>;

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Overview />} />
        <Route path="calendar" element={guard("/calendar", <AcademicCalendar />)} />
        <Route path="semesters" element={guard("/semesters", <Semesters />)} />
        <Route path="exams" element={guard("/exams", <Exams />)} />
        <Route path="subjects" element={guard("/subjects", <Subjects />)} />
        <Route path="subjects/:id" element={guard("/subjects", <SubjectDetail />)} />
        <Route path="subjects/:id/syllabus" element={guard("/subjects", <Syllabus />)} />
        <Route path="timetable" element={guard("/timetable", <Timetable />)} />
        <Route path="settings" element={guard("/settings", <Settings />)} />
        <Route path="session-logs" element={guard("/session-logs", <SessionLogs />)} />
        <Route path="exam-readiness" element={<PhasePage />} />
        <Route path="reports" element={<PhasePage />} />
        <Route path="*" element={<PhasePage />} />
      </Route>
    </Routes>
  );
}
