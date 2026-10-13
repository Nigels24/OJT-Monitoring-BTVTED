import { CalendarDays, ListChecks, PencilLine } from "lucide-react";
import FormDialog from "@/components/ui/FormDialog";
import TextField from "@/components/ui/TextField";
import TextArea from "@/components/ui/TextArea";
import Button from "@/components/ui/Button";
import type { TaskFormValues } from "../hooks/use-supervisor-weekly-tasks";
import { formatWeekRange, weekEndKey } from "../week";

interface TaskFormDialogProps {
  open: boolean;
  isEditing: boolean;
  traineeName: string;
  /** The Monday of the week the task belongs to. */
  weekStart: string;
  form: TaskFormValues;
  error: string;
  isSaving: boolean;
  setField: (
    key: keyof TaskFormValues,
  ) => (e: { target: { value: string } }) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

/** Assign a task for the week being viewed, or edit one not yet acted on. */
export default function TaskFormDialog({
  open,
  isEditing,
  traineeName,
  weekStart,
  form,
  error,
  isSaving,
  setField,
  onSubmit,
  onClose,
}: TaskFormDialogProps) {
  return (
    <FormDialog
      open={open}
      title={isEditing ? "Edit Task" : "Assign Task"}
      subtitle={`${traineeName} · week of ${formatWeekRange(weekStart, weekEndKey(weekStart))}`}
      icon={ListChecks}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <TextField
          label="Task"
          labelIcon={PencilLine}
          required
          maxLength={200}
          value={form.title}
          onChange={setField("title")}
          placeholder="e.g. Assemble and test two desktop units"
        />
        <TextArea
          label="Details (optional)"
          labelIcon={PencilLine}
          rows={4}
          maxLength={2000}
          value={form.description}
          onChange={setField("description")}
          placeholder="What is expected, and what counts as done."
        />
        <TextField
          label="Due date"
          labelIcon={CalendarDays}
          type="date"
          required
          // May fall after the week, never before it.
          min={weekStart}
          value={form.dueDate}
          onChange={setField("dueDate")}
        />

        {error && (
          <p
            role="alert"
            className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2"
          >
            {error}
          </p>
        )}

        <div className="sm:w-60">
          <Button type="submit" icon={ListChecks} loading={isSaving}>
            {isEditing ? "Save changes" : "Assign task"}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
