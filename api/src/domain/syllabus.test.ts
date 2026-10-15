import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv.js";
import { parseSyllabusCsv, syllabusToCsv, totalPlannedHours, validateSyllabus } from "./syllabus.js";

describe("csv", () => {
  it("handles quotes, commas, CRLF, BOM and escaped quotes", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
  });
  it("rejects an unterminated quote", () => expect(() => parseCsv('a,"b')).toThrow());
  it("writes round-trippable CSV and neutralises spreadsheet formulas", () => {
    const out = toCsv(["a", "b"], [['=SUM(1)', 'x,"y"'], [1.5, null]]);
    expect(out).toBe("a,b\r\n'=SUM(1),\"x,\"\"y\"\"\"\r\n1.5,\r\n");
    expect(parseCsv(out)[2]).toEqual(["1.5", ""]);
  });
});

describe("syllabus CSV import", () => {
  const good = "unit,topic,planned_hours,exam_scope\nIntro,Basics,2,SESSIONAL\nIntro,Types,1.5,\nTrees,AVL,3,mid-term\n";

  it("groups rows into ordered units and topics", () => {
    const r = parseSyllabusCsv(good);
    expect(r.errors).toEqual([]);
    expect(r.units.map((u) => [u.title, u.topics.map((t) => t.title)])).toEqual([["Intro", ["Basics", "Types"]], ["Trees", ["AVL"]]]);
    expect(r.units[1]!.topics[0]).toMatchObject({ plannedHours: 3, examScope: "MID_TERM" });
    expect(totalPlannedHours(r.units)).toBe(6.5);
  });

  it("reports every bad row with its file row number and field", () => {
    const csv = "unit,topic,planned_hours,exam_scope\n,No unit,2,\nA,,2,\nA,Zero,0,\nA,Text,abc,\nA,Scope,1,FINALS\nA,Fine,1,\nA,Fine,1,\n";
    const r = parseSyllabusCsv(csv);
    expect(r.errors.map((e) => `${e.row}:${e.field}`)).toEqual(["2:unit", "3:topic", "4:planned_hours", "5:planned_hours", "6:exam_scope", "8:topic"]);
    expect(r.rowCount).toBe(7);
    expect(r.units[0]!.topics.map((t) => t.title)).toEqual(["Fine"]); // preview only; the API refuses to commit when errors exist
  });

  it("explains missing headers, empty files and too many rows", () => {
    expect(parseSyllabusCsv("unit,topic\nA,B").errors[0]!.message).toMatch(/Missing column\(s\): planned_hours/);
    expect(parseSyllabusCsv("").errors[0]!.message).toMatch(/empty/);
    const huge = "unit,topic,planned_hours\n" + Array.from({ length: 2001 }, (_, i) => `U,T${i},1`).join("\n");
    expect(parseSyllabusCsv(huge).errors[0]!.message).toMatch(/Too many rows/);
    expect(parseSyllabusCsv('unit,topic,planned_hours\n"A,B,1').errors[0]!.message).toMatch(/Unterminated/);
  });

  it("round-trips through export", () => {
    const r = parseSyllabusCsv(good);
    expect(parseSyllabusCsv(syllabusToCsv(r.units)).units).toEqual(r.units);
  });
});

describe("validateSyllabus", () => {
  it("catches blank, duplicate and out-of-range entries", () => {
    const issues = validateSyllabus([
      { title: "A", topics: [{ title: "x", plannedHours: 1, examScope: null }, { title: "X", plannedHours: 1, examScope: null }, { title: "z", plannedHours: 0, examScope: null }] },
      { title: " a ", topics: [] },
      { title: "", topics: [] },
    ]);
    expect(issues.map((i) => i.message)).toEqual([
      'Duplicate topic "X" in unit "A"',
      'Topic "z" needs planned hours between 0 and 40',
      'Duplicate unit " a "',
      "Unit title is required",
    ]);
  });
  it("accepts a valid draft", () => expect(validateSyllabus([{ title: "A", topics: [{ title: "x", plannedHours: 2, examScope: "PUT" }] }])).toEqual([]));
});
