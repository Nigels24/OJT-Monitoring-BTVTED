import { useState } from "react";
import { Pencil } from "lucide-react";
import StatusBadge, { BadgeVariant } from "@/components/ui/StatusBadge";
import ProgressBar from "@/components/ui/ProgressBar";
import {
  useGetAssignmentsQuery,
  useUpdateAssignmentMutation,
  AssignmentStatus,
} from "@/lib/api/studentApi";
import { formatDateOnly } from "@/lib/format";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";
import CoordinatorGradeCard from "./CoordinatorGradeCard";
import PlacementWeeklyTasks from "@/features/weekly-tasks/components/PlacementWeeklyTasks";
import PlacementConcerns from "@/features/concerns/components/PlacementConcerns";
import CompletionChecklist from "@/features/reports/components/CompletionChecklist";
import ReportLinks from "@/features/reports/components/ReportLinks";

const STATUS_VARIANT: Record<AssignmentStatus, BadgeVariant> = {
  ACTIVE: "active",
  COMPLETED: "completed",
  TRANSFERRED: "neutral",
  CANCELLED: "declined",
};

const STATUS_LABEL: Record<AssignmentStatus, string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  TRANSFERRED: "Transferred",
  CANCELLED: "Cancelled",
};

const DAY_LABEL: Record<string, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

interface TrainingAssignmentsPanelProps {
  studentId: string;
}

/**
 * Every assignment a student has ever had, newest first — the placement
 * history the thesis requires stays visible rather than being overwritten:
 * a TRANSFERRED assignment keeps its own hours and progress forever, and
 * any PENDING hours still stranded on it (logged before the transfer, not
 * yet approved) are called out so they don't quietly go unapproved.
 */
export default function TrainingAssignmentsPanel({
  studentId,
}: TrainingAssignmentsPanelProps) {
  const { data: assignments, isLoading } = useGetAssignmentsQuery(studentId);
  const [updateAssignment] = useUpdateAssignmentMutation();
  const { showSuccess, showError } = useSnackbar();
  // One date editor open at a time: the placement's start or its end date.
  const [editing, setEditing] = useState<{
    id: string;
    field: "start" | "end";
  } | null>(null);
  const [dateDraft, setDateDraft] = useState("");
  const [editError, setEditError] = useState("");

  const openEditor = (id: string, field: "start" | "end", value: string) => {
    setEditing({ id, field });
    setDateDraft(value);
    setEditError("");
  };
  const closeEditor = () => {
    setEditing(null);
    setEditError("");
  };

  const handleStatusChange = async (
    id: string,
    status: "COMPLETED" | "CANCELLED",
  ) => {
    try {
      await updateAssignment({ id, status }).unwrap();
      showSuccess(
        `Assignment marked ${status === "COMPLETED" ? "Completed" : "Cancelled"}.`,
      );
    } catch (err: unknown) {
      showError(readError(err, "Failed to update assignment."));
    }
  };

  const handleSaveDate = async (id: string, field: "start" | "end") => {
    if (field === "start" && !dateDraft) {
      setEditError("Pick a start date.");
      return;
    }
    try {
      await updateAssignment(
        field === "start"
          ? // A calendar day; the server normalises it to UTC midnight.
            { id, startDate: dateDraft }
          : {
              id,
              endDate: dateDraft ? new Date(dateDraft).toISOString() : null,
            },
      ).unwrap();
      showSuccess(field === "start" ? "Start date updated." : "End date updated.");
      closeEditor();
    } catch (err: unknown) {
      // Shown beside the field too — e.g. "Attendance is already logged for
      // 11/9/2026. The start date can't be later than that."
      const message = readError(err, "Failed to update assignment.");
      setEditError(message);
      showError(message);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-gray-400">Loading assignments...</p>;
  }
  if (!assignments || assignments.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No training assignments yet. Use &quot;Record placement&quot; to start one.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {assignments.map((a) => (
        <div key={a.id} className="border border-gray-200 rounded-lg p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">
                {a.establishment.name}
              </span>
              <StatusBadge
                label={STATUS_LABEL[a.status]}
                variant={STATUS_VARIANT[a.status]}
              />
            </div>
            <div className="text-xs text-gray-500">
              {formatDateOnly(a.startDate)} –{" "}
              {a.endDate ? formatDateOnly(a.endDate) : "present"}
            </div>
          </div>

          <div className="text-xs text-gray-500 mb-2">
            Duty days: {a.dutyDays.map((d) => DAY_LABEL[d]).join(", ")}
          </div>

          <ProgressBar
            value={a.progress.approvedHours}
            max={a.progress.requiredHours || 1}
            variant="thin"
            showLabel
            colorByValue
          />

          {a.progress.pendingHours > 0 && (
            <p
              className={`text-xs mt-1.5 ${
                a.status !== "ACTIVE"
                  ? "text-amber-600 font-medium"
                  : "text-gray-500"
              }`}
            >
              {a.progress.pendingHours}h pending approval
              {a.status !== "ACTIVE"
                ? " — stranded on this transferred assignment, still awaiting the supervisor there"
                : ""}
            </p>
          )}

          {a.status === "ACTIVE" && (
            <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-gray-100">
              {editing?.id === a.id ? (
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-xs text-gray-600">
                      {editing.field === "start" ? "Start date" : "End date"}
                    </label>
                    <input
                      type="date"
                      value={dateDraft}
                      onChange={(e) => {
                        setDateDraft(e.target.value);
                        setEditError("");
                      }}
                      className="h-9 px-2 border border-gray-300 rounded-md text-sm text-gray-700"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveDate(a.id, editing.field)}
                      className="text-xs font-medium text-blue-600 hover:underline"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={closeEditor}
                      className="text-xs text-gray-500 hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                  {editError && (
                    <p className="text-xs text-red-600" role="alert">
                      {editError}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      openEditor(a.id, "start", a.startDate.slice(0, 10))
                    }
                    className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <Pencil size={12} /> Change start date
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      openEditor(
                        a.id,
                        "end",
                        a.endDate ? a.endDate.slice(0, 10) : "",
                      )
                    }
                    className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <Pencil size={12} /> Set end date
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => handleStatusChange(a.id, "COMPLETED")}
                className="text-xs font-medium text-green-600 hover:underline"
              >
                Mark Completed
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange(a.id, "CANCELLED")}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Cancel Assignment
              </button>
            </div>
          )}

          <CompletionChecklist
            checklist={a.completion}
            status={a.status}
            className="mt-3 pt-3 border-t border-gray-100"
          />
          <ReportLinks
            basePath="/coordinator/reports"
            assignmentId={a.id}
            className="mt-3 pt-3 border-t border-gray-100"
          />

          <CoordinatorGradeCard assignment={a} />
          <PlacementWeeklyTasks assignmentId={a.id} />
          <PlacementConcerns assignmentId={a.id} />
        </div>
      ))}
    </div>
  );
}

function readError(err: unknown, fallback: string): string {
  const data = (err as { data?: { message?: string | string[] } })?.data;
  if (Array.isArray(data?.message)) return data.message.join(", ");
  return data?.message ?? fallback;
}
