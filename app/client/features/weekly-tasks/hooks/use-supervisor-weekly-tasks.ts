import { useState } from "react";
import { useGetSupervisorStudentsQuery } from "@/lib/api/supervisorApi";
import {
  WeeklyTask,
  useCreateWeeklyTaskMutation,
  useDeleteWeeklyTaskMutation,
  useGetSupervisorWeekQuery,
  useRateWeeklyTaskMutation,
  useUpdateWeeklyTaskMutation,
} from "@/lib/api/weeklyTaskApi";
import { useSnackbar } from "@/lib/contexts/SnackbarContext";
import {
  manilaTodayKey,
  readApiError,
  shiftWeek,
  weekEndKey,
  weekStartKey,
} from "../week";

export interface TaskFormValues {
  title: string;
  description: string;
  dueDate: string;
}

const EMPTY_FORM: TaskFormValues = { title: "", description: "", dueDate: "" };

/**
 * The supervisor's Weekly Tasks page: pick a trainee and a week, assign and
 * edit tasks, rate the ones marked done.
 *
 * `initial` comes from the URL (a notification links straight to a trainee's
 * week). What each button may do is decided by the server; this only mirrors
 * the rules so the page does not offer what would be refused.
 */
export function useSupervisorWeeklyTasks(initial: {
  assignmentId: string | null;
  week: string | null;
}) {
  const { showSuccess, showError } = useSnackbar();
  const { data: students, isLoading: isRosterLoading } =
    useGetSupervisorStudentsQuery();

  const [pickedAssignmentId, setPickedAssignmentId] = useState(
    initial.assignmentId ?? "",
  );
  // Until a trainee is picked, the first one on the roster is shown.
  const assignmentId = pickedAssignmentId || students?.[0]?.assignmentId || "";

  const currentWeek = weekStartKey(manilaTodayKey());
  const [week, setWeek] = useState(() => weekStartKey(initial.week));

  const {
    data,
    isLoading,
    isFetching,
    error: loadErrorRaw,
  } = useGetSupervisorWeekQuery({ assignmentId, week }, { skip: !assignmentId });

  const [createTask, { isLoading: isCreating }] = useCreateWeeklyTaskMutation();
  const [updateTask, { isLoading: isUpdating }] = useUpdateWeeklyTaskMutation();
  const [deleteTask] = useDeleteWeeklyTaskMutation();
  const [rateTask, { isLoading: isRating }] = useRateWeeklyTaskMutation();

  /* ---- add / edit ---- */
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WeeklyTask | null>(null);
  const [form, setForm] = useState<TaskFormValues>(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  const openCreate = () => {
    setEditTarget(null);
    // Due at the end of the week by default; the supervisor can move it.
    setForm({ ...EMPTY_FORM, dueDate: weekEndKey(week) });
    setFormError("");
    setIsFormOpen(true);
  };

  const openEdit = (task: WeeklyTask) => {
    setEditTarget(task);
    setForm({
      title: task.title,
      description: task.description ?? "",
      dueDate: task.dueDate.slice(0, 10),
    });
    setFormError("");
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
  };

  const setFormField =
    (key: keyof TaskFormValues) => (e: { target: { value: string } }) => {
      setForm((current) => ({ ...current, [key]: e.target.value }));
    };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setFormError("Give the task a title.");
      return;
    }
    if (!form.dueDate) {
      setFormError("Pick a due date.");
      return;
    }
    if (form.dueDate < week) {
      setFormError("The due date cannot be before the task's week.");
      return;
    }
    setFormError("");
    try {
      if (editTarget) {
        await updateTask({
          id: editTarget.id,
          title: form.title.trim(),
          // Always sent: an emptied box has to clear the stored description.
          description: form.description.trim() || null,
          dueDate: form.dueDate,
        }).unwrap();
        showSuccess("Task updated.");
      } else {
        await createTask({
          assignmentId,
          weekStart: week,
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          dueDate: form.dueDate,
        }).unwrap();
        showSuccess("Task assigned. The trainee has been notified.");
      }
      setIsFormOpen(false);
    } catch (err: unknown) {
      const message = readApiError(err, "Failed to save the task.");
      setFormError(message);
      showError(message);
    }
  };

  /* ---- delete ---- */
  const [deleteTarget, setDeleteTarget] = useState<WeeklyTask | null>(null);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTask(deleteTarget.id).unwrap();
      showSuccess("Task deleted.");
    } catch (err: unknown) {
      showError(readApiError(err, "Failed to delete the task."));
    } finally {
      setDeleteTarget(null);
    }
  };

  /* ---- rate ---- */
  const [rateTarget, setRateTarget] = useState<WeeklyTask | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [rateError, setRateError] = useState("");

  const openRate = (task: WeeklyTask) => {
    setRateTarget(task);
    setRating(task.rating);
    setComment(task.ratingComment ?? "");
    setRateError("");
  };

  const closeRate = () => {
    setRateTarget(null);
  };

  const handleRateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateTarget) return;
    if (rating === null) {
      setRateError("Pick a rating from 1 to 5.");
      return;
    }
    setRateError("");
    try {
      await rateTask({
        id: rateTarget.id,
        rating,
        // Always sent, so clearing the box clears the stored comment.
        comment: comment.trim() || null,
      }).unwrap();
      showSuccess(
        rateTarget.status === "RATED"
          ? "Rating updated."
          : "Task rated. The trainee has been notified.",
      );
      setRateTarget(null);
    } catch (err: unknown) {
      const message = readApiError(err, "Failed to save the rating.");
      setRateError(message);
      showError(message);
    }
  };

  return {
    students: students ?? [],
    isRosterLoading,
    assignmentId,
    setAssignmentId: setPickedAssignmentId,

    week,
    isCurrentWeek: week === currentWeek,
    goPrevWeek: () => setWeek((current) => shiftWeek(current, -1)),
    goNextWeek: () => setWeek((current) => shiftWeek(current, 1)),
    goThisWeek: () => setWeek(currentWeek),

    data,
    isLoading: isLoading || isFetching,
    loadError: loadErrorRaw
      ? readApiError(loadErrorRaw, "Could not load this week's tasks.")
      : "",
    /** Tasks are assigned and changed only for an active placement. */
    canAssign: data?.assignment?.status === "ACTIVE",

    isFormOpen,
    isEditing: !!editTarget,
    form,
    formError,
    isSaving: isCreating || isUpdating,
    openCreate,
    openEdit,
    closeForm,
    setFormField,
    handleFormSubmit,

    deleteTarget,
    setDeleteTarget,
    handleDeleteConfirm,

    rateTarget,
    rating,
    comment,
    rateError,
    isRating,
    setRating,
    setComment,
    openRate,
    closeRate,
    handleRateSubmit,
  };
}
