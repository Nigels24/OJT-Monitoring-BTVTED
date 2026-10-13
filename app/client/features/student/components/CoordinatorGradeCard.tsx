import Link from "next/link";
import { Award, Pencil, Printer } from "lucide-react";
import { TrainingAssignment } from "@/lib/api/studentApi";
import { formatGrade } from "@/lib/format";
import { useCoordinatorGrade } from "../hooks/use-coordinator-grade";

interface CoordinatorGradeCardProps {
  assignment: TrainingAssignment;
}

/**
 * The two-part assessment for one placement, side by side: the supervisor's
 * evaluation sheet total (read-only here — it belongs to the supervisor) and
 * the coordinator's own grade for the OJT portfolio report and its
 * presentation, which is recorded and corrected here.
 *
 * The two are never combined into one figure: the sheet is a raw total out of
 * its own maximum, the grade is 0-100.
 */
export default function CoordinatorGradeCard({
  assignment,
}: CoordinatorGradeCardProps) {
  const {
    hasGrade,
    showForm,
    isEditing,
    grade,
    setGrade,
    remarks,
    setRemarks,
    error,
    isSaving,
    startEdit,
    cancelEdit,
    handleSubmit,
  } = useCoordinatorGrade(assignment);

  const [latestSheet, ...olderSheets] = assignment.evaluations;
  const gradeInputId = `grade-${assignment.id}`;
  const remarksInputId = `grade-remarks-${assignment.id}`;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
        <Award size={15} className="text-blue-600" />
        Coordinator Grade
      </h4>
      <p className="text-xs text-gray-500 mb-3">
        Based on the OJT portfolio report and its presentation. Separate from
        the supervisor&apos;s evaluation sheet.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Supervisor&apos;s evaluation sheet
          </p>
          {latestSheet ? (
            <>
              <p className="text-xl font-bold text-gray-900 tabular-nums">
                {latestSheet.totalRating}
                <span className="text-sm font-normal text-gray-500">
                  {" "}
                  / {latestSheet.maxTotalRating}
                </span>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Total rating
                {latestSheet.evaluatorName
                  ? `, by ${latestSheet.evaluatorName}`
                  : ""}{" "}
                on {new Date(latestSheet.createdAt).toLocaleDateString()}
                {olderSheets.length > 0
                  ? ` — latest of ${assignment.evaluations.length} sheets`
                  : ""}
              </p>
              <Link
                href={`/coordinator/evaluations/${latestSheet.id}/print`}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
              >
                <Printer size={12} /> View / print sheet
              </Link>
            </>
          ) : (
            <p className="text-sm text-gray-500">
              No evaluation sheet submitted for this placement yet.
            </p>
          )}
        </div>

        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Coordinator&apos;s grade
          </p>

          {showForm ? (
            <form onSubmit={handleSubmit} className="space-y-2">
              <div>
                <label
                  htmlFor={gradeInputId}
                  className="block text-xs font-medium text-gray-700 mb-1"
                >
                  Grade (0–100)
                </label>
                <input
                  id={gradeInputId}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step={0.01}
                  required
                  value={grade}
                  onChange={(e) => {
                    setGrade(e.target.value);
                  }}
                  placeholder="e.g. 92.50"
                  className="w-full h-9 px-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label
                  htmlFor={remarksInputId}
                  className="block text-xs font-medium text-gray-700 mb-1"
                >
                  Remarks (optional)
                </label>
                <textarea
                  id={remarksInputId}
                  rows={3}
                  maxLength={2000}
                  value={remarks}
                  onChange={(e) => {
                    setRemarks(e.target.value);
                  }}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 bg-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              {error && (
                <p role="alert" className="text-xs text-red-600">
                  {error}
                </p>
              )}
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="h-9 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-60"
                >
                  {isSaving
                    ? "Saving..."
                    : isEditing
                      ? "Save changes"
                      : "Record grade"}
                </button>
                {isEditing && (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="text-xs text-gray-500 hover:underline"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          ) : hasGrade ? (
            <>
              <p className="text-xl font-bold text-gray-900 tabular-nums">
                {formatGrade(assignment.coordinatorGrade)}
                <span className="text-sm font-normal text-gray-500">
                  {" "}
                  / 100
                </span>
              </p>
              {assignment.coordinatorGradeRemarks && (
                <p className="text-sm text-gray-700 whitespace-pre-wrap mt-1">
                  {assignment.coordinatorGradeRemarks}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Recorded
                {assignment.gradedBy
                  ? ` by ${assignment.gradedBy.user.name}`
                  : ""}
                {assignment.gradedAt
                  ? ` on ${new Date(assignment.gradedAt).toLocaleDateString()}`
                  : ""}
              </p>
              {assignment.grading.eligible ? (
                <button
                  type="button"
                  onClick={startEdit}
                  className="mt-2 text-xs font-medium text-blue-600 hover:underline flex items-center gap-1"
                >
                  <Pencil size={12} /> Edit grade
                </button>
              ) : (
                <p className="text-xs text-amber-600 mt-2">
                  {assignment.grading.reason}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">{assignment.grading.reason}</p>
          )}
        </div>
      </div>
    </div>
  );
}
