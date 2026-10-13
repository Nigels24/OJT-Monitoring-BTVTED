import { CONCERN_CATEGORY_LABEL, Concern } from "@/lib/api/concernApi";
import ConcernStatusBadge from "./ConcernStatusBadge";

interface ConcernCardProps {
  concern: Concern;
  /** Show who it is about and where — off inside one placement's own history. */
  showTrainee?: boolean;
  /** Show who raised it — off in the supervisor's own list. */
  showRaisedBy?: boolean;
  /** The coordinator's "Respond" button; omit for a read-only card. */
  action?: React.ReactNode;
}

/**
 * One concern: what was raised, its status, and the coordinator's response.
 * Shared by the supervisor's own list, the coordinator's page and the
 * per-placement history in the Student Details dialog.
 */
export default function ConcernCard({
  concern,
  showTrainee = true,
  showRaisedBy = true,
  action,
}: ConcernCardProps) {
  return (
    <li className="border border-gray-200 rounded-lg p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">
            {CONCERN_CATEGORY_LABEL[concern.category]} concern
            {showTrainee ? ` — ${concern.student.user.name}` : ""}
          </p>
          <p className="text-xs text-gray-500 break-words">
            {[
              showTrainee ? concern.student.studentIdNumber : null,
              showTrainee ? concern.trainingAssignment.establishment.name : null,
              showRaisedBy ? `raised by ${concern.raisedByName}` : null,
              new Date(concern.createdAt).toLocaleDateString(),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <ConcernStatusBadge status={concern.status} />
      </div>

      <p className="text-sm text-gray-700 whitespace-pre-wrap mt-2">
        {concern.description}
      </p>

      {(concern.coordinatorResponse || concern.respondedAt) && (
        <div className="mt-3 rounded-lg bg-gray-50 p-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Coordinator&apos;s response
          </p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap mt-1">
            {concern.coordinatorResponse || "No written response."}
          </p>
          {concern.respondedAt && (
            <p className="text-xs text-gray-500 mt-1">
              {concern.respondedBy ? `${concern.respondedBy.user.name} · ` : ""}
              {new Date(concern.respondedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {action && <div className="mt-3">{action}</div>}
    </li>
  );
}
