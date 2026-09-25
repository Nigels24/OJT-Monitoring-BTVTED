import type { BadgeVariant } from "@/components/ui/StatusBadge";
import type { JournalStatus } from "@/lib/api/journalApi";

/**
 * How a journal entry's status reads, in one place — the student's list, the
 * coordinator's queue and the supervisor's read-only view all show the same
 * three words for the same state.
 */
export const JOURNAL_STATUS_LABEL: Record<JournalStatus, string> = {
  SUBMITTED: "Submitted",
  ACCEPTED: "Accepted",
  RETURNED: "Returned",
};

export const JOURNAL_STATUS_VARIANT: Record<JournalStatus, BadgeVariant> = {
  SUBMITTED: "pending",
  ACCEPTED: "approved",
  RETURNED: "declined",
};

export const JOURNAL_STATUS_FILTER_OPTIONS = [
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Accepted", value: "ACCEPTED" },
  { label: "Returned", value: "RETURNED" },
  { label: "All Statuses", value: "" },
];
