import type { PrismaClient } from "@prisma/client";
import type { UnitDraft } from "../domain/syllabus.js";
import { HttpError } from "../http/errors.js";

export async function loadSyllabus(prisma: PrismaClient, subjectId: string) {
  const units = await prisma.syllabusUnit.findMany({
    where: { subjectId }, orderBy: { position: "asc" },
    include: { topics: { orderBy: { position: "asc" } } },
  });
  return units.map((u) => ({ id: u.id, title: u.title, topics: u.topics.map((t) => ({ id: t.id, title: t.title, plannedHours: t.plannedHours, examScope: t.examScope })) }));
}

/**
 * Replaces a subject's syllabus with the given ordered draft in one transaction.
 * Items carrying an existing id keep that id (so Phase 3 progress can keep pointing at them); items without one are created;
 * anything missing from the draft is removed. Positions are renumbered from the array order.
 */
export async function saveSyllabus(prisma: PrismaClient, subjectId: string, units: UnitDraft[]) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.syllabusUnit.findMany({ where: { subjectId }, include: { topics: { select: { id: true } } } });
    const unitIds = new Set(existing.map((u) => u.id));
    const topicIds = new Set(existing.flatMap((u) => u.topics.map((t) => t.id)));
    for (const u of units) {
      if (u.id && !unitIds.has(u.id)) throw new HttpError(400, "validation_failed", "The request has invalid fields", { issues: [{ path: "units", message: `Unit ${u.id} does not belong to this subject` }] });
      for (const t of u.topics) if (t.id && !topicIds.has(t.id)) throw new HttpError(400, "validation_failed", "The request has invalid fields", { issues: [{ path: "units", message: `Topic ${t.id} does not belong to this subject` }] });
    }

    const keptUnits: string[] = [], keptTopics: string[] = [];
    for (const [ui, u] of units.entries()) {
      const unit = u.id
        ? await tx.syllabusUnit.update({ where: { id: u.id }, data: { title: u.title.trim(), position: ui } })
        : await tx.syllabusUnit.create({ data: { subjectId, title: u.title.trim(), position: ui } });
      keptUnits.push(unit.id);
      for (const [ti, t] of u.topics.entries()) {
        const data = { unitId: unit.id, title: t.title.trim(), position: ti, plannedHours: t.plannedHours, examScope: t.examScope };
        const topic = t.id ? await tx.syllabusTopic.update({ where: { id: t.id }, data }) : await tx.syllabusTopic.create({ data });
        keptTopics.push(topic.id);
      }
    }
    // Topics with session history are evidence for progress tracking: they may be marked Skipped, never silently deleted.
    const removing = [...topicIds].filter((id) => !keptTopics.includes(id));
    if (removing.length > 0) {
      const used = await tx.sessionTopicEntry.findMany({ where: { topicId: { in: removing } }, select: { topic: { select: { title: true } } }, distinct: ["topicId"] });
      if (used.length > 0) {
        throw new HttpError(409, "in_use", `${used.length} topic(s) already have session logs and cannot be removed (${used.slice(0, 3).map((u) => u.topic.title).join(", ")}${used.length > 3 ? "…" : ""}). Mark them as Skipped in a session log instead.`, { blockers: { topicsWithHistory: used.length } });
      }
    }
    await tx.syllabusTopic.deleteMany({ where: { unit: { subjectId }, id: { notIn: keptTopics } } });
    await tx.syllabusUnit.deleteMany({ where: { subjectId, id: { notIn: keptUnits } } });
  });
}

/** For CSV imports: reuse ids of existing units/topics with the same (case-insensitive) title so identity survives a re-import. */
export async function matchExistingIds(prisma: PrismaClient, subjectId: string, units: UnitDraft[]): Promise<UnitDraft[]> {
  const existing = await loadSyllabus(prisma, subjectId);
  return units.map((u) => {
    const eu = existing.find((x) => x.title.trim().toLowerCase() === u.title.toLowerCase());
    return {
      ...u, ...(eu ? { id: eu.id } : {}),
      topics: u.topics.map((t) => {
        const et = eu?.topics.find((x) => x.title.trim().toLowerCase() === t.title.toLowerCase());
        return { ...t, ...(et ? { id: et.id } : {}) };
      }),
    };
  });
}
