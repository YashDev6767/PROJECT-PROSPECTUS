import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { trackLabels } from "../lib/labels";
import type { Semester } from "../lib/types";
import { Field, Select } from "./ui/forms";
import { EmptyState } from "./ui";
import { useResource, type Resource } from "./ui/Resource";
import { CalendarRange } from "lucide-react";

const storageKey = (campusId: string) => `prospectus.semester.${campusId}`;
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* optional */ } };

export interface SemesterChoice { res: Resource<{ semesters: Semester[] }>; semesters: Semester[]; semester: Semester | null; select: (id: string) => void }

/** Loads the campus's semesters and tracks which one a page is working on (remembered per campus). */
export function useSemesterChoice(campusId: string | null): SemesterChoice {
  const res = useResource<{ semesters: Semester[] }>(campusId ? `/api/semesters?campusId=${campusId}` : null);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => { setPicked(campusId ? read(storageKey(campusId)) : null); }, [campusId]);
  const semesters = useMemo(() => [...(res.data?.semesters ?? [])].sort((a, b) => Number(b.isActive) - Number(a.isActive) || b.startsOn.localeCompare(a.startsOn)), [res.data]);
  const semester = semesters.find((s) => s.id === picked) ?? semesters[0] ?? null;
  return { res, semesters, semester, select: (id) => { setPicked(id); if (campusId) write(storageKey(campusId), id); } };
}

export const semesterLabel = (s: Semester) => `${s.name} · ${trackLabels[s.track]} · ${s.academicYear}${s.status === "active" ? " (Active)" : s.status === "completed" ? " (Completed)" : ""}`;

export function SemesterSelect({ choice }: { choice: SemesterChoice }) {
  return (
    <div className="min-w-60">
      <Field label="Semester">
        <Select value={choice.semester?.id ?? ""} onChange={(e) => choice.select(e.target.value)} disabled={choice.semesters.length === 0}>
          {choice.semesters.map((s) => <option key={s.id} value={s.id}>{semesterLabel(s)}{s.isSample ? " — sample" : ""}</option>)}
        </Select>
      </Field>
    </div>
  );
}

export const NoSemesters = () => (
  <EmptyState icon={CalendarRange} title="No semesters for this campus yet">
    Create a semester first — batches, subjects, timetables and exams all belong to one. <Link className="font-semibold text-accent-text underline" to="/semesters">Go to Semesters</Link>
  </EmptyState>
);

