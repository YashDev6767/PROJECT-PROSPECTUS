import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { HOUR_PX, TimetableGrid } from "../components/TimetableGrid";
import { Dialog } from "../components/ui/Dialog";
import { addDays, hourWindow, isoWeekday, layoutDay, monthsOf, rangeLabel, toMinutes, weekDates, weekStart } from "../lib/timetableLayout";
import type { TimetableEntry } from "../lib/types";

const entry = (over: Partial<TimetableEntry> = {}): TimetableEntry => ({
  id: "e1", subjectId: "s1", subjectCode: "SMP101", subjectName: "Database Concepts", batchId: "b1", batchName: "Mirai Batch A", facultyId: "f1", facultyName: "Dr Rao",
  weekday: 1, weekdayName: "Monday", startTime: "10:00", endTime: "11:00", room: null, hours: 1, isSample: false, ...over,
});

describe("timetable layout maths", () => {
  it("weeks start on Monday, including across month and year boundaries", () => {
    expect(isoWeekday("2026-10-18")).toBe(7);
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
    expect(weekDates("2026-12-30", 6)).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(monthsOf(weekDates("2026-12-30", 6))).toEqual(["2026-12", "2027-01"]);
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("labels a week range, adding the year to the start only when it differs", () => {
    expect(rangeLabel("2026-10-12", "2026-10-17")).toBe("12 Oct – 17 Oct 2026");
    expect(rangeLabel("2026-12-28", "2027-01-02")).toBe("28 Dec 2026 – 2 Jan 2027");
  });
  it("puts overlapping sessions in separate lanes and leaves sequential ones alone", () => {
    const placed = layoutDay([{ startTime: "09:00", endTime: "10:00" }, { startTime: "09:30", endTime: "10:30" }, { startTime: "10:30", endTime: "11:00" }]);
    expect(placed.map((p) => [p.lane, p.lanes])).toEqual([[0, 2], [1, 2], [0, 1]]);
  });
  it("widens the hour window to cover every session", () => {
    expect(hourWindow([])).toEqual({ from: 8, to: 16 });
    expect(hourWindow([{ startTime: "07:15", endTime: "18:20" }])).toEqual({ from: 7, to: 19 });
    expect(toMinutes("13:45")).toBe(825);
  });
});

describe("TimetableGrid", () => {
  const dates = ["2026-10-12", "2026-10-13"];
  it("derives top and height from the saved times, not from fixed positions", () => {
    render(<TimetableGrid entries={[entry({ startTime: "10:30", endTime: "12:00" })]} dates={dates} info={{}} today="2026-10-12" showBatch onOpen={null} />);
    const card = screen.getByRole("group", { name: /Database Concepts/ });
    expect(card.style.top).toBe(`${((10.5 * 60 - 8 * 60) / 60) * HOUR_PX + 1}px`);
    expect(card.style.height).toBe(`${1.5 * HOUR_PX - 2}px`);
    expect(card).toHaveTextContent("10:30 – 12:00");
    expect(card).toHaveTextContent("Mirai Batch A");
    expect(card).toHaveTextContent("Dr Rao");
  });
  it("shows overlapping sessions side by side and tolerates missing faculty/room", () => {
    render(<TimetableGrid entries={[entry(), entry({ id: "e2", subjectId: "s2", subjectName: "Maths", batchName: "Batch B", facultyName: null })]} dates={dates} info={{}} today="2026-10-12" showBatch onOpen={null} />);
    const a = screen.getByRole("group", { name: /Database Concepts/ }), b = screen.getByRole("group", { name: /Maths/ });
    expect(a.style.width).toBe("calc(50% - 4px)"); expect(b.style.width).toBe("calc(50% - 4px)");
    expect(a.style.left).not.toBe(b.style.left);
    expect(b).toHaveTextContent("No faculty assigned");
  });
  it("marks holidays, today and off days in the column headers and opens an entry on click", async () => {
    const opened: string[] = [];
    render(<TimetableGrid entries={[entry()]} dates={dates} today="2026-10-13" showBatch onOpen={(e) => opened.push(e.id)}
      info={{ "2026-10-12": { day: { date: "2026-10-12", weekday: 1, working: false, reason: "holiday", entryIds: [], examIds: [] }, note: "Dussehra" } }} />);
    expect(screen.getByText("Dussehra")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Edit Database Concepts/ }));
    expect(opened).toEqual(["e1"]);
  });
});

describe("Dialog structure", () => {
  function Host() { const [open, setOpen] = useState(false); return <div className="page-enter"><button onClick={() => setOpen(true)}>Open</button>{open && <Dialog title="Log a session" onClose={() => setOpen(false)}><p>Body</p></Dialog>}</div>; }
  it("renders in a portal on <body> with a fixed header and an independently scrolling body", async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    const dlg = screen.getByRole("dialog");
    expect(dlg.closest(".page-enter")).toBeNull();           // not trapped under a transformed ancestor
    expect(dlg.parentElement?.parentElement).toBe(document.body);
    expect(dlg.className).toMatch(/flex-col/); expect(dlg.className).toMatch(/overflow-hidden/); expect(dlg.className).toMatch(/dvh/);
    const body = dlg.querySelector("[data-dialog-body]") as HTMLElement;
    expect(body.className).toMatch(/min-h-0/); expect(body.className).toMatch(/overflow-y-auto/); expect(body.className).toMatch(/overscroll-contain/);
    expect(document.body.style.overflow).toBe("hidden");
    await userEvent.keyboard("{Escape}");
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });
});
