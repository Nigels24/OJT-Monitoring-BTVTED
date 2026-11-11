import type { AttendanceChangeFields } from "@/lib/api/attendanceDeclines";
import type { AttendanceStatus } from "@/lib/api/studentPortalApi";
import { formatDateTime } from "@/lib/format";

/**
 * The small lines under an attendance log's remarks that say what changed:
 * "Declined: …" on a declined log, "Previously declined: …" on a log that was
 * declined and has since been resubmitted, and "Edited <when>" once the
 * student has corrected it. Shared by the student's history, the supervisor's
 * approval queue and the coordinator's overdue list, so all three read alike.
 */
export default function AttendanceChangeNote({
  status,
  declineReason,
  lastEditedAt,
  declines,
}: AttendanceChangeFields & {
  status: AttendanceStatus;
  declineReason: string | null;
}) {
  const latestDecline = declines.length
    ? declines[declines.length - 1]
    : null;
  // `declineReason` is the latest reason on the row; the trail is the fallback
  // for a row whose reason was later cleared.
  const latestReason = declineReason ?? latestDecline?.reason ?? null;

  return (
    <>
      {status === "DECLINED" && latestReason && (
        <p className="text-xs text-red-600 mt-1">
          <span className="font-medium">Declined:</span> {latestReason}
        </p>
      )}
      {status === "PENDING" && latestReason && (
        <p className="text-xs text-amber-700 mt-1">
          <span className="font-medium">
            Previously declined
            {declines.length > 1 ? ` (${declines.length} times)` : ""}:
          </span>{" "}
          {latestReason}
        </p>
      )}
      {lastEditedAt && (
        <p className="text-xs text-gray-500 mt-1">
          Edited {formatDateTime(lastEditedAt)}
        </p>
      )}
    </>
  );
}
