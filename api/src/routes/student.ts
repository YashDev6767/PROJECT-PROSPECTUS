import { Router } from "express";
import { z } from "zod";
import { asyncHandler, callerBatch, callerRole, HttpError, needDb, notFound, parse, requireCapability } from "../http/errors.js";
import { buildStudentPortal } from "../services/studentPortal.js";
import type { Deps } from "./deps.js";
import { hideOutOfScope } from "../http/scope.js";

const query = z.object({ batchId: z.string().min(1).max(128).optional() });

export function studentRouter({ db, settings, today }: Deps): Router {
  const r = Router();
  /**
   * Read-only learning view for one batch.
   *  - A STUDENT is bound to the batch the server knows for them (signed session, or X-Demo-Batch in development demo mode). The batch is
   *    never taken from the request: asking for another batch is 403, and a student with no batch gets 409 rather than broad access.
   *  - Staff roles (already able to read everything) must name the batch to look at, e.g. to support a student.
   * There is deliberately no write endpoint under /student.
   */
  r.get("/student/portal", requireCapability("portal:read"), asyncHandler(async (req, res) => {
    const q = parse(query, req.query);
    const prisma = needDb(db);
    let batchId: string;
    if (callerRole(res) === "student") {
      const own = callerBatch(res);
      if (!own) throw new HttpError(409, "no_batch_assigned", "Your account is not linked to a batch yet, so there is nothing to show. Ask the administrator to link your account to your batch.");
      if (q.batchId && q.batchId !== own) throw new HttpError(403, "forbidden_batch", "You can only view your own batch.");
      batchId = own;
    } else {
      if (!q.batchId) throw new HttpError(400, "validation_failed", "The request has invalid fields", { issues: [{ path: "batchId", message: "Choose a batch" }] });
      batchId = q.batchId;
    }
    // the batch (whoever named it) must sit on a campus inside the caller's scope; otherwise it does not exist for them
    const owner = await prisma.batch.findUnique({ where: { id: batchId }, select: { semester: { select: { campusId: true } } } });
    if (!owner) throw notFound("Batch");
    hideOutOfScope(res, owner.semester.campusId, "Batch");
    const data = await buildStudentPortal(prisma, batchId, today(), settings);
    if (!data) throw notFound("Batch");
    res.json(data);
  }));
  return r;
}
