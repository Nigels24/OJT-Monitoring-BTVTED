import { useState } from "react";
import {
  TrainingAssignment,
  useSetAssignmentGradeMutation,
} from "@/lib/api/studentApi";
import { formatGrade } from "@/lib/format";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";

/** 0-100 with at most two decimals — the same bounds the server's DTO enforces. */
const GRADE_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

function parseGrade(value: string): number | null {
  const trimmed = value.trim();
  if (!GRADE_PATTERN.test(trimmed)) return null;
  const grade = Number(trimmed);
  return grade <= 100 ? grade : null;
}

/**
 * The coordinator's grade for one placement: the draft, and saving it.
 *
 * A placement with no grade yet shows the empty form straight away; one that
 * has a grade shows it, and `startEdit` copies it into the draft. Whether the
 * form is offered at all is the server's `grading.eligible` — this hook never
 * decides that, and the server refuses an ineligible save regardless.
 */
export function useCoordinatorGrade(assignment: TrainingAssignment) {
  const [isEditing, setIsEditing] = useState(false);
  const [grade, setGrade] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [setAssignmentGrade, { isLoading: isSaving }] =
    useSetAssignmentGradeMutation();
  const { showSuccess, showError } = useSnackbar();

  const hasGrade = assignment.coordinatorGrade !== null;

  const startEdit = () => {
    setGrade(formatGrade(assignment.coordinatorGrade, ""));
    setRemarks(assignment.coordinatorGradeRemarks ?? "");
    setError("");
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setError("");
    setIsEditing(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseGrade(grade);
    if (parsed === null) {
      setError(
        "Enter a grade from 0 to 100, with at most two decimal places.",
      );
      return;
    }
    setError("");
    try {
      await setAssignmentGrade({
        id: assignment.id,
        grade: parsed,
        // Always sent: an emptied box has to clear the stored remarks, and
        // omitting the key would leave them as they were.
        remarks: remarks.trim() || null,
      }).unwrap();
      showSuccess(
        hasGrade
          ? "Grade updated. The student has been notified."
          : "Grade recorded. The student has been notified.",
      );
      setIsEditing(false);
    } catch (err: unknown) {
      const message = readError(err, "Failed to save the grade.");
      setError(message);
      showError(message);
    }
  };

  return {
    hasGrade,
    /** The form is showing — a first grade, or a correction in progress. */
    showForm: assignment.grading.eligible && (!hasGrade || isEditing),
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
  };
}

function readError(err: unknown, fallback: string): string {
  const data = (err as { data?: { message?: string | string[] } })?.data;
  if (Array.isArray(data?.message)) return data.message.join(", ");
  return data?.message ?? fallback;
}
