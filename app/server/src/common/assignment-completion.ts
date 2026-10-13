import { Prisma } from '../../generated/prisma/client';
import { computeProgress } from './assignment-progress';
import { manilaToday } from './dates';

type Client = Prisma.TransactionClient;

/** The Table 3 requirement that is the OJT portfolio report. */
export const PORTFOLIO_REQUIREMENT_CODE = 'PORTFOLIO';

/**
 * When a training assignment is complete. Four conditions, all required:
 *
 * 1. approved hours have reached the required hours;
 * 2. the OJT portfolio report (Table 3, `PORTFOLIO`) has been **accepted** —
 *    a `Document` in status APPROVED for this placement. Merely uploaded
 *    (PENDING) or returned (REJECTED) does not count: acceptance is modelled,
 *    so it is what is asked for;
 * 3. the supervisor's evaluation sheet exists for the placement;
 * 4. the coordinator's grade is recorded.
 *
 * One function decides it, for the checklist every role is shown and for the
 * status change alike, so the two can never disagree.
 */
export interface CompletionInputs {
  approvedHours: number;
  requiredHours: number;
  /** `Document.status` of this placement's portfolio, or `null` if none. */
  portfolioStatus: string | null;
  evaluationCount: number;
  coordinatorGrade: unknown;
}

export interface CompletionChecklist {
  hoursMet: boolean;
  portfolioAccepted: boolean;
  evaluationRecorded: boolean;
  gradeRecorded: boolean;
  /** All four. */
  complete: boolean;
}

export function completionChecklist(
  inputs: CompletionInputs,
): CompletionChecklist {
  const hoursMet =
    inputs.requiredHours > 0 && inputs.approvedHours >= inputs.requiredHours;
  const portfolioAccepted = inputs.portfolioStatus === 'APPROVED';
  const evaluationRecorded = inputs.evaluationCount > 0;
  const gradeRecorded =
    inputs.coordinatorGrade !== null && inputs.coordinatorGrade !== undefined;
  return {
    hoursMet,
    portfolioAccepted,
    evaluationRecorded,
    gradeRecorded,
    complete:
      hoursMet && portfolioAccepted && evaluationRecorded && gradeRecorded,
  };
}

/**
 * The status an assignment should move to, or `null` to leave it alone.
 *
 * The only automatic move is ACTIVE -> COMPLETED, when all four conditions
 * hold. Nothing is ever reversed or overridden:
 * - a COMPLETED assignment stays COMPLETED even if an input later changes
 *   (an evaluation deleted, say) — un-completing is a person's decision;
 * - CANCELLED and TRANSFERRED were set deliberately and are never touched,
 *   however complete their checklist looks.
 */
export function nextAssignmentStatus(
  currentStatus: string,
  checklist: CompletionChecklist,
): 'COMPLETED' | null {
  return currentStatus === 'ACTIVE' && checklist.complete ? 'COMPLETED' : null;
}

/** Reads the four inputs for one assignment and works out its checklist. */
export async function loadCompletionChecklist(
  client: Client,
  assignmentId: string,
): Promise<CompletionChecklist> {
  const progress = await computeProgress(client, assignmentId);
  const assignment = await client.trainingAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    select: {
      coordinatorGrade: true,
      _count: { select: { evaluations: true } },
    },
  });
  // The newest portfolio for this placement — a re-upload replaces the row in
  // place, so there is normally exactly one.
  const portfolio = await client.document.findFirst({
    where: {
      trainingAssignmentId: assignmentId,
      requirement: { code: PORTFOLIO_REQUIREMENT_CODE },
    },
    orderBy: { uploadedAt: 'desc' },
    select: { status: true },
  });

  return completionChecklist({
    approvedHours: progress.approvedHours,
    requiredHours: progress.requiredHours,
    portfolioStatus: portfolio?.status ?? null,
    evaluationCount: assignment._count.evaluations,
    coordinatorGrade: assignment.coordinatorGrade,
  });
}

/**
 * Marks an assignment COMPLETED if — and only if — it is ACTIVE and all four
 * conditions now hold. Call it after anything that can change one of them: an
 * attendance approval, a document review, an evaluation saved, a grade saved.
 *
 * Returns whether it completed the assignment. The update is conditional on
 * the status still being ACTIVE, so two inputs landing at once complete it
 * once, and a status someone set in the meantime is not overwritten.
 */
export async function syncAssignmentCompletion(
  client: Client,
  assignmentId: string | null | undefined,
): Promise<boolean> {
  if (!assignmentId) return false;
  const assignment = await client.trainingAssignment.findUnique({
    where: { id: assignmentId },
    select: { status: true, endDate: true },
  });
  if (!assignment) return false;

  const checklist = await loadCompletionChecklist(client, assignmentId);
  if (nextAssignmentStatus(assignment.status, checklist) !== 'COMPLETED') {
    return false;
  }

  const { count } = await client.trainingAssignment.updateMany({
    where: { id: assignmentId, status: 'ACTIVE' },
    data: {
      status: 'COMPLETED',
      // The day it was completed, unless an end date was already set.
      endDate: assignment.endDate ?? manilaToday(),
    },
  });
  return count > 0;
}
