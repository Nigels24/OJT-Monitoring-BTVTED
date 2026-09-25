import type { BadgeVariant } from "@/components/ui/StatusBadge";
import type { RequirementState } from "@/lib/api/studentPortalApi";

/**
 * How a requirement's state reads and colours, in one place — the student's
 * checklist and the coordinator's matrix say the same thing about the same
 * state.
 *
 * Grey outline for missing, amber for pending, green for approved, red for
 * returned; a per-assignment requirement with no placement yet is muted, because
 * it is not a gap the student can close.
 */
export const REQUIREMENT_STATE_LABEL: Record<RequirementState, string> = {
  MISSING: "Missing",
  PENDING: "Pending review",
  APPROVED: "Approved",
  DECLINED: "Returned",
  NOT_APPLICABLE: "Available after placement",
};

/** Short form for a matrix cell, where the column header names the requirement. */
export const REQUIREMENT_STATE_SHORT: Record<RequirementState, string> = {
  MISSING: "—",
  PENDING: "Pending",
  APPROVED: "Approved",
  DECLINED: "Returned",
  NOT_APPLICABLE: "n/a",
};

export const REQUIREMENT_STATE_BADGE: Record<RequirementState, BadgeVariant> = {
  MISSING: "neutral",
  PENDING: "pending",
  APPROVED: "approved",
  DECLINED: "declined",
  NOT_APPLICABLE: "neutral",
};

/** Cell styling for the coordinator's matrix. */
export const REQUIREMENT_STATE_CELL: Record<RequirementState, string> = {
  MISSING: "border border-dashed border-gray-300 text-gray-400 bg-white",
  PENDING: "border border-amber-200 bg-amber-50 text-amber-800",
  APPROVED: "border border-green-200 bg-green-50 text-green-800",
  DECLINED: "border border-red-200 bg-red-50 text-red-700",
  NOT_APPLICABLE: "border border-gray-100 bg-gray-50 text-gray-400",
};
