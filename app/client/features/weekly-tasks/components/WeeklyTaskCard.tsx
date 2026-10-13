import { CalendarDays, Star } from "lucide-react";
import StatusBadge, { BadgeVariant } from "@/components/ui/StatusBadge";
import type { WeeklyTask, WeeklyTaskStatus } from "@/lib/api/weeklyTaskApi";
import { MAX_TASK_RATING } from "@/lib/api/weeklyTaskApi";
import { formatDateOnly } from "@/lib/format";
import TaskPhotos from "./TaskPhotos";

export const TASK_STATUS_LABEL: Record<WeeklyTaskStatus, string> = {
  ASSIGNED: "Assigned",
  DONE: "Done — awaiting rating",
  RATED: "Rated",
};

const STATUS_VARIANT: Record<WeeklyTaskStatus, BadgeVariant> = {
  ASSIGNED: "pending",
  DONE: "onProgress",
  RATED: "approved",
};

interface WeeklyTaskCardProps {
  task: WeeklyTask;
  /** The buttons this role may use on this task; omit for a read-only card. */
  actions?: React.ReactNode;
}

/**
 * One weekly task as every role reads it: what was assigned and when it is
 * due, what the trainee submitted, and the supervisor's rating once given.
 *
 * Which buttons appear is the page's decision, passed in as `actions` — and
 * only a convenience: the server refuses anything the role or the task's
 * status does not allow.
 */
export default function WeeklyTaskCard({ task, actions }: WeeklyTaskCardProps) {
  return (
    <li className="border border-gray-200 rounded-lg p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 break-words">
            {task.title}
          </h3>
          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
            <CalendarDays size={12} />
            Due {formatDateOnly(task.dueDate)}
            {task.assignedBy ? ` · assigned by ${task.assignedBy.name}` : ""}
          </p>
        </div>
        <StatusBadge
          label={TASK_STATUS_LABEL[task.status]}
          variant={STATUS_VARIANT[task.status]}
        />
      </div>

      {task.description && (
        <p className="text-sm text-gray-700 whitespace-pre-wrap mt-2">
          {task.description}
        </p>
      )}

      {task.doneAt && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <p className="text-xs text-gray-500">
            Marked done on {new Date(task.doneAt).toLocaleDateString()}
          </p>
          {task.studentNote && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              <span className="font-medium text-gray-800">
                Trainee&apos;s note:
              </span>{" "}
              {task.studentNote}
            </p>
          )}
          <TaskPhotos photos={task.photos} />
        </div>
      )}

      {task.status === "RATED" && task.rating !== null && (
        <div className="mt-3 rounded-lg bg-gray-50 p-3">
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            <Star size={14} className="text-amber-500" />
            Rating: {task.rating} / {MAX_TASK_RATING}
          </p>
          {task.ratingComment && (
            <p className="text-sm text-gray-700 whitespace-pre-wrap mt-1">
              {task.ratingComment}
            </p>
          )}
          {task.ratedAt && (
            <p className="text-xs text-gray-500 mt-1">
              Rated on {new Date(task.ratedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {actions && (
        <div className="flex flex-wrap items-center gap-2 mt-3">{actions}</div>
      )}
    </li>
  );
}
