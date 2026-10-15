import { BarChart3, CalendarDays, CalendarRange, ClipboardList, Clock, GraduationCap, LayoutDashboard, LibraryBig, Settings, ShieldCheck, type LucideIcon } from "lucide-react";

export type Role = "admin" | "campus_manager" | "faculty" | "student";

export const roleLabels: Record<Role, string> = {
  admin: "Admin",
  campus_manager: "Campus Manager",
  faculty: "Faculty",
  student: "Student",
};
export const roles = Object.keys(roleLabels) as Role[];

export type NavGroup = "Workspace" | "Academics" | "Teaching" | "Insights" | "System";

export interface NavItem {
  path: string;
  group: NavGroup;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  /** Phase in which the real feature ships; undefined = available now. */
  phase?: number;
  summary: string;
}

const all: Role[] = ["admin", "campus_manager", "faculty", "student"];

export const navItems: NavItem[] = [
  { path: "/", group: "Workspace", label: "Overview", icon: LayoutDashboard, roles: all, summary: "Progress, risks and today's teaching at a glance." },
  { path: "/calendar", group: "Workspace", label: "Academic Calendar", icon: CalendarDays, roles: all, summary: "Working days, holidays, events and exam periods." },
  { path: "/semesters", group: "Academics", label: "Semesters", icon: CalendarRange, roles: ["admin", "campus_manager", "faculty"], summary: "Semester dates, tracks and working-day rules." },
  { path: "/exams", group: "Academics", label: "Exam Schedule", icon: ShieldCheck, roles: all, summary: "Sessionals, mid-term, PUT and end-term dates." },
  { path: "/subjects", group: "Academics", label: "Subjects", icon: LibraryBig, roles: all, summary: "Subjects, faculty assignments and syllabus." },
  { path: "/timetable", group: "Academics", label: "Timetable", icon: Clock, roles: all, summary: "Weekly classes by batch or faculty." },
  { path: "/session-logs", group: "Teaching", label: "Session Logs", icon: ClipboardList, roles: ["admin", "campus_manager", "faculty"], summary: "Log what was taught, in under a minute, from a phone." },
  { path: "/exam-readiness", group: "Teaching", label: "Exam Readiness", icon: GraduationCap, roles: all, phase: 4, summary: "Which subjects can realistically finish before their exams." },
  { path: "/reports", group: "Insights", label: "Reports", icon: BarChart3, roles: ["admin", "campus_manager"], phase: 4, summary: "Cross-campus progression reports with CSV export." },
  { path: "/settings", group: "System", label: "Settings", icon: Settings, roles: ["admin", "campus_manager"], summary: "Batches, faculty, data status and access." },
];

export const navFor = (role: Role) => navItems.filter((n) => n.roles.includes(role));
export const canLogSessions = (role: Role) => role !== "student";

export const navGroupOrder: NavGroup[] = ["Workspace", "Academics", "Teaching", "Insights", "System"];
