/**
 * The coordinator's student filters, as they appear in the URL. The Students
 * list and the program/block summary read the same keys, so a link from one
 * to the other carries the selection across unchanged.
 */
export const SUMMARY_FILTER_KEYS = [
  "scope",
  "courseId",
  "yearLevel",
  "blockId",
  "academicYear",
  "academicYearFrom",
  "academicYearTo",
  "establishmentId",
  "trainingStatus",
  "status",
] as const;

export type TrainingStatus = "ACTIVE" | "COMPLETED" | "ENDED" | "NONE";

export const TRAINING_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  ENDED: "Ended / Cancelled",
  NONE: "No placement",
};

export const TRAINING_STATUS_OPTIONS: TrainingStatus[] = [
  "ACTIVE",
  "COMPLETED",
  "ENDED",
  "NONE",
];
